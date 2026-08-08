<?php
/**
 * Font storage, validation and CSS generation.
 *
 * @package EtchFontManager
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class EFM_Fonts
 */
class EFM_Fonts {

	const OPTION_FAMILIES = 'efm_font_families';
	const OPTION_SETTINGS = 'efm_settings';
	const CSS_FILENAME    = 'efm-fonts.css';
	const MAX_FILE_SIZE   = 10485760; // 10 MB.

	/**
	 * Allowed font extensions mapped to their CSS format() value.
	 *
	 * @var array<string,string>
	 */
	const FORMATS = array(
		'woff2' => 'woff2',
		'woff'  => 'woff',
		'ttf'   => 'truetype',
		'otf'   => 'opentype',
	);

	/**
	 * Allowed font weights.
	 *
	 * @var string[]
	 */
	const WEIGHTS = array( '100', '200', '300', '400', '500', '600', '700', '800', '900', '100 900' );

	/**
	 * Allowed font-display values.
	 *
	 * @var string[]
	 */
	const DISPLAY_VALUES = array( 'auto', 'block', 'swap', 'fallback', 'optional' );

	/**
	 * Preloading more than a couple of files delays the rest of the page, so
	 * the number of preload hints is capped regardless of how many families
	 * ask for one.
	 */
	const MAX_PRELOADS = 4;

	/**
	 * Weight keywords used in font file names, longest first so that
	 * "extrabold" is matched before "bold".
	 *
	 * @var array<string,string>
	 */
	const WEIGHT_KEYWORDS = array(
		'extrablack'  => '900',
		'ultrablack'  => '900',
		'extrabold'   => '800',
		'ultrabold'   => '800',
		'extralight'  => '200',
		'ultralight'  => '200',
		'semibold'    => '600',
		'demibold'    => '600',
		'semilight'   => '300',
		'regular'     => '400',
		'medium'      => '500',
		'normal'      => '400',
		'black'       => '900',
		'heavy'       => '900',
		'light'       => '300',
		'thin'        => '100',
		'hairline'   => '100',
		'book'        => '400',
		'bold'        => '700',
	);

	/**
	 * Hook up nothing heavy; this class is mostly static helpers.
	 */
	public static function init() {
		add_action( 'init', array( __CLASS__, 'maybe_upgrade' ) );
	}

	/**
	 * Regenerate the stylesheet after a plugin update.
	 */
	public static function maybe_upgrade() {
		if ( get_option( 'efm_version' ) === EFM_VERSION ) {
			return;
		}

		self::write_css_file();

		// Cached remote data may predate the current index shape.
		delete_transient( EFM_Google_Fonts::TRANSIENT );
		delete_transient( EFM_Google_Fonts::TRANSIENT_LEGACY );

		update_option( 'efm_version', EFM_VERSION, false );
	}

	// Paths.

	/**
	 * Absolute path to the fonts directory (trailing slash).
	 *
	 * @return string
	 */
	public static function dir() {
		/**
		 * Filter the directory used to store font files.
		 *
		 * Etch Font Manager deliberately uses wp-content/fonts rather than
		 * wp_get_font_dir(). WordPress may resolve that API to uploads/fonts,
		 * while Etch and the legacy Etch Custom Fonts plugin use content/fonts.
		 * A stable shared path also makes legacy imports immediately usable.
		 *
		 * @param string $dir Absolute directory path.
		 */
		return trailingslashit( apply_filters( 'efm_fonts_dir', WP_CONTENT_DIR . '/fonts' ) );
	}

	/**
	 * Public URL of the fonts directory (trailing slash).
	 *
	 * @return string
	 */
	public static function url() {
		/**
		 * Filter the public URL corresponding to efm_fonts_dir.
		 *
		 * @param string $url Fonts directory URL.
		 */
		return trailingslashit( apply_filters( 'efm_fonts_url', content_url( '/fonts' ) ) );
	}

	/**
	 * Absolute path of the generated stylesheet.
	 *
	 * @return string
	 */
	public static function css_path() {
		return self::dir() . self::CSS_FILENAME;
	}

	/**
	 * Public URL of the generated stylesheet.
	 *
	 * @return string
	 */
	public static function css_url() {
		return self::url() . self::CSS_FILENAME;
	}

	/**
	 * Cache-busting version for the generated stylesheet.
	 *
	 * @return string
	 */
	public static function css_version() {
		$path = self::css_path();

		return file_exists( $path ) ? (string) filemtime( $path ) : EFM_VERSION;
	}

	/**
	 * Create the fonts directory and protect it from listing.
	 */
	public static function ensure_dir() {
		$dir = self::dir();

		if ( ! file_exists( $dir ) ) {
			wp_mkdir_p( $dir );
		}

		$index = $dir . 'index.php';
		if ( ! file_exists( $index ) ) {
			self::write_file( $index, '<?php // Silence is golden.' );
		}
	}

	/**
	 * Write a file using WP_Filesystem when available.
	 *
	 * @param string $path    Absolute path.
	 * @param string $content File contents.
	 * @return bool
	 */
	protected static function write_file( $path, $content ) {
		global $wp_filesystem;

		if ( ! $wp_filesystem ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			WP_Filesystem();
		}

		if ( $wp_filesystem ) {
			return (bool) $wp_filesystem->put_contents( $path, $content, FS_CHMOD_FILE );
		}

		return false !== file_put_contents( $path, $content ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
	}

	/**
	 * Ensure a path resolves inside the fonts directory.
	 *
	 * @param string $path Absolute path to test.
	 * @return bool
	 */
	public static function path_is_inside( $path ) {
		$base = realpath( self::dir() );
		if ( false === $base ) {
			return false;
		}

		$real = realpath( $path );

		if ( false === $real ) {
			// File does not exist yet: validate the parent directory instead.
			$parent = realpath( dirname( $path ) );

			return false !== $parent && 0 === strpos( $parent . DIRECTORY_SEPARATOR, $base . DIRECTORY_SEPARATOR );
		}

		return 0 === strpos( $real, $base . DIRECTORY_SEPARATOR );
	}

	// Data.

	/**
	 * Get stored font families.
	 *
	 * @return array
	 */
	public static function families() {
		$families = get_option( self::OPTION_FAMILIES, array() );

		return is_array( $families ) ? $families : array();
	}

	/**
	 * Persist font families and regenerate the stylesheet.
	 *
	 * @param array $families Raw families.
	 * @return array Sanitized families.
	 */
	public static function save_families( $families ) {
		$clean = self::sanitize_families( $families );

		update_option( self::OPTION_FAMILIES, $clean, false );
		self::prune_settings( $clean );
		self::write_css_file();

		/**
		 * Fires after font families change.
		 *
		 * @param array $clean Sanitized families.
		 */
		do_action( 'efm_families_saved', $clean );

		return $clean;
	}

	/**
	 * Clear font assignments that point at a family which no longer exists, so
	 * the generated CSS never references a missing family.
	 *
	 * @param array $families Current families.
	 */
	protected static function prune_settings( $families ) {
		$settings = self::settings();
		$names    = array_map(
			static function ( $family ) {
				return strtolower( $family['name'] ?? '' );
			},
			$families
		);

		$changed = false;

		foreach ( array( 'heading_font', 'text_font' ) as $key ) {
			if ( ! empty( $settings[ $key ] ) && ! in_array( strtolower( $settings[ $key ] ), $names, true ) ) {
				$settings[ $key ] = '';
				$changed          = true;
			}
		}

		if ( $changed ) {
			update_option( self::OPTION_SETTINGS, $settings, false );
		}
	}

	/**
	 * Get plugin settings.
	 *
	 * @return array
	 */
	public static function settings() {
		$defaults = array(
			'heading_font' => '',
			'text_font'    => '',
			'acss_enabled' => true,
		);

		$settings = get_option( self::OPTION_SETTINGS, array() );
		$settings = is_array( $settings ) ? $settings : array();

		return wp_parse_args( $settings, $defaults );
	}

	/**
	 * Persist settings and regenerate the stylesheet.
	 *
	 * @param array $input Raw settings.
	 * @return array Sanitized settings.
	 */
	public static function save_settings( $input ) {
		$current = self::settings();

		$clean = array(
			'heading_font' => self::sanitize_family_name( $input['heading_font'] ?? $current['heading_font'] ),
			'text_font'    => self::sanitize_family_name( $input['text_font'] ?? $current['text_font'] ),
			'acss_enabled' => ! empty( $input['acss_enabled'] ),
		);

		update_option( self::OPTION_SETTINGS, $clean, false );
		self::write_css_file();

		return $clean;
	}

	/**
	 * The whole font configuration, for moving between sites.
	 *
	 * Font files are not included: they can be large, and a family installed
	 * from Google can simply be reinstalled on the destination.
	 *
	 * @return array
	 */
	public static function export_payload() {
		return array(
			'plugin'   => 'etch-font-manager',
			'version'  => EFM_VERSION,
			'exported' => gmdate( 'c' ),
			'site'     => home_url( '/' ),
			'families' => self::families(),
			'settings' => self::settings(),
			'files'    => wp_list_pluck( self::files(), 'name' ),
		);
	}

	/**
	 * Restore a configuration produced by export_payload().
	 *
	 * @param array  $data Decoded payload.
	 * @param string $mode replace or merge.
	 * @return array|WP_Error Report of what was imported.
	 */
	public static function import_payload( $data, $mode = 'replace' ) {
		if ( ! is_array( $data ) || ! isset( $data['families'] ) || ! is_array( $data['families'] ) ) {
			return new WP_Error(
				'efm_import_invalid',
				__( 'That file does not look like an Etch Font Manager export.', 'etch-font-manager' ),
				array( 'status' => 400 )
			);
		}

		$incoming = self::sanitize_families( $data['families'] );

		if ( 'merge' === $mode ) {
			$by_name = array();

			foreach ( self::families() as $family ) {
				$by_name[ strtolower( $family['name'] ) ] = $family;
			}

			// A family of the same name in the import wins.
			foreach ( $incoming as $family ) {
				$by_name[ strtolower( $family['name'] ) ] = $family;
			}

			$families = array_values( $by_name );
		} else {
			$families = $incoming;
		}

		// Families first: saving settings prunes assignments whose family is gone.
		self::save_families( $families );

		if ( ! empty( $data['settings'] ) && is_array( $data['settings'] ) ) {
			self::save_settings( $data['settings'] );
		}

		$present = wp_list_pluck( self::files(), 'name' );
		$missing = array();

		foreach ( $families as $family ) {
			foreach ( (array) $family['variants'] as $variant ) {
				if ( ! empty( $variant['file'] ) && ! in_array( $variant['file'], $present, true ) ) {
					$missing[] = $variant['file'];
				}
			}
		}

		return array(
			'families' => count( $families ),
			'missing'  => array_values( array_unique( $missing ) ),
		);
	}

	/**
	 * Import data from the legacy "Etch Custom Fonts" plugin, if present.
	 */
	public static function maybe_import_legacy() {
		if ( ! empty( get_option( self::OPTION_FAMILIES, array() ) ) ) {
			return;
		}

		$legacy_families = get_option( 'ecf_font_families', array() );
		if ( empty( $legacy_families ) || ! is_array( $legacy_families ) ) {
			return;
		}

		$legacy_settings = get_option( 'ecf_acss_settings', array() );
		$legacy_settings = is_array( $legacy_settings ) ? $legacy_settings : array();

		update_option( self::OPTION_FAMILIES, self::sanitize_families( $legacy_families ), false );
		update_option(
			self::OPTION_SETTINGS,
			array(
				'heading_font' => self::sanitize_family_name( $legacy_settings['heading_font'] ?? '' ),
				'text_font'    => self::sanitize_family_name( $legacy_settings['text_font'] ?? '' ),
				'acss_enabled' => true,
			),
			false
		);
	}

	// Sanitizing.

	/**
	 * Sanitize a font family name for safe use inside CSS.
	 *
	 * @param string $name Raw name.
	 * @return string
	 */
	/**
	 * Validate a unicode-range value before it is written into CSS.
	 *
	 * @param string $range Raw range, e.g. "U+0D80-0DFF, U+200C-200D".
	 * @return string Empty string when the value is not a valid range list.
	 */
	public static function sanitize_unicode_range( $range ) {
		$range = trim( (string) $range );

		if ( '' === $range ) {
			return '';
		}

		if ( ! preg_match( '/^[Uu]\+[0-9A-Fa-f?]+(-[0-9A-Fa-f]+)?(\s*,\s*[Uu]\+[0-9A-Fa-f?]+(-[0-9A-Fa-f]+)?)*$/', $range ) ) {
			return '';
		}

		return $range;
	}

	/**
	 * Guess a weight and style from a font file name.
	 *
	 * Recognises numeric weights (Roboto-300.woff2), keywords
	 * (Inter-SemiBoldItalic.woff2) and variable fonts (Inter[wght].woff2).
	 *
	 * @param string $filename Font file name.
	 * @return array{weight:string,style:string}
	 */
	public static function guess_variant( $filename ) {
		$name   = strtolower( pathinfo( (string) $filename, PATHINFO_FILENAME ) );
		$narrow = preg_replace( '/[^a-z0-9]/', '', $name );

		$style = ( false !== strpos( $narrow, 'italic' ) || false !== strpos( $narrow, 'oblique' ) ) ? 'italic' : 'normal';

		// Variable fonts expose an axis rather than a single weight.
		if ( false !== strpos( $narrow, 'variablefont' ) || false !== strpos( $narrow, 'wght' ) ) {
			return array(
				'weight' => '100 900',
				'style'  => $style,
			);
		}

		if ( preg_match( '/(?<!\d)([1-9]00)(?!\d)/', $name, $matches ) ) {
			return array(
				'weight' => $matches[1],
				'style'  => $style,
			);
		}

		/*
		 * Match on the keyword that ends last, preferring the longest on a tie.
		 * The weight is normally the suffix, so "Blackout-Bold" resolves to bold
		 * rather than black, while "SemiBold" still beats the "bold" inside it.
		 */
		$best_weight = '';
		$best_end    = -1;
		$best_length = 0;

		foreach ( self::WEIGHT_KEYWORDS as $keyword => $weight ) {
			$position = strrpos( $narrow, $keyword );

			if ( false === $position ) {
				continue;
			}

			$length = strlen( $keyword );
			$end    = $position + $length;

			if ( $end > $best_end || ( $end === $best_end && $length > $best_length ) ) {
				$best_weight = $weight;
				$best_end    = $end;
				$best_length = $length;
			}
		}

		if ( '' !== $best_weight ) {
			return array(
				'weight' => $best_weight,
				'style'  => $style,
			);
		}

		return array(
			'weight' => '400',
			'style'  => $style,
		);
	}

	/**
	 * Sanitize a CSS font stack used as a fallback.
	 *
	 * Only the characters a font stack legitimately needs are kept, so the
	 * value can never terminate the declaration it is written into.
	 *
	 * @param string $stack Raw stack, e.g. "Georgia, 'Times New Roman', serif".
	 * @return string
	 */
	public static function sanitize_font_stack( $stack ) {
		$stack = sanitize_text_field( (string) $stack );
		$stack = preg_replace( '/[^A-Za-z0-9 ,\'"_-]/', '', $stack );
		$stack = preg_replace( '/\s+/', ' ', (string) $stack );

		return trim( (string) $stack, " ,\t\n" );
	}

	/**
	 * The font stack a family should fall back to.
	 *
	 * @param array $family Family record.
	 * @return string
	 */
	public static function family_stack( $family ) {
		$name     = $family['name'] ?? '';
		$fallback = self::sanitize_font_stack( $family['fallback'] ?? '' );

		if ( '' === $name ) {
			return $fallback;
		}

		return '' === $fallback ? '"' . $name . '"' : '"' . $name . '", ' . $fallback;
	}

	/**
	 * The slug used in a family's CSS custom property.
	 *
	 * "Noto Sans Sinhala" becomes "noto-sans-sinhala", so the family is
	 * available as var(--efm-family-noto-sans-sinhala).
	 *
	 * @param string $name Family name.
	 * @return string
	 */
	public static function family_slug( $name ) {
		return sanitize_title( (string) $name );
	}

	/**
	 * Files that should be preloaded.
	 *
	 * Only one file per opted-in family is returned: the regular upright
	 * weight, preferring the latin subset, because that is the cut a page
	 * almost always needs first.
	 *
	 * @return array<int,array{url:string,ext:string}>
	 */
	public static function preload_files() {
		$preloads = array();

		foreach ( self::families() as $family ) {
			if ( empty( $family['preload'] ) || empty( $family['variants'] ) ) {
				continue;
			}

			$chosen = null;

			foreach ( $family['variants'] as $variant ) {
				if ( empty( $variant['file'] ) || 'italic' === ( $variant['style'] ?? 'normal' ) ) {
					continue;
				}

				$is_regular = in_array( (string) ( $variant['weight'] ?? '400' ), array( '400', '100 900' ), true );
				$is_latin   = ! isset( $variant['subset'] ) || 'latin' === $variant['subset'];

				if ( $is_regular && $is_latin ) {
					$chosen = $variant;
					break;
				}

				if ( null === $chosen && $is_regular ) {
					$chosen = $variant;
				}
			}

			if ( null === $chosen ) {
				continue;
			}

			$preloads[] = array(
				'url' => self::url() . $chosen['file'],
				'ext' => strtolower( pathinfo( $chosen['file'], PATHINFO_EXTENSION ) ),
			);

			if ( count( $preloads ) >= self::MAX_PRELOADS ) {
				break;
			}
		}

		return $preloads;
	}

	/**
	 * Sanitize a font family name for safe use inside CSS.
	 *
	 * @param string $name Raw name.
	 * @return string
	 */
	public static function sanitize_family_name( $name ) {
		$name = sanitize_text_field( (string) $name );
		$name = preg_replace( '/["\'\{\};\\\\\/\(\)<>]/', '', $name );

		return trim( (string) $name );
	}

	/**
	 * Sanitize the full families structure.
	 *
	 * @param array $input Raw families.
	 * @return array
	 */
	public static function sanitize_families( $input ) {
		if ( ! is_array( $input ) ) {
			return array();
		}

		$clean = array();

		foreach ( $input as $family ) {
			if ( empty( $family['name'] ) ) {
				continue;
			}

			$name = self::sanitize_family_name( $family['name'] );
			if ( '' === $name ) {
				continue;
			}

			$variants = array();

			if ( ! empty( $family['variants'] ) && is_array( $family['variants'] ) ) {
				foreach ( $family['variants'] as $variant ) {
					$file = sanitize_file_name( $variant['file'] ?? '' );
					if ( '' === $file ) {
						continue;
					}

					$ext = strtolower( pathinfo( $file, PATHINFO_EXTENSION ) );
					if ( ! isset( self::FORMATS[ $ext ] ) ) {
						continue;
					}

					$weight = sanitize_text_field( (string) ( $variant['weight'] ?? '400' ) );
					$style  = strtolower( sanitize_text_field( (string) ( $variant['style'] ?? 'normal' ) ) );

					$clean_variant = array(
						'file'   => $file,
						'weight' => self::sanitize_weight( $weight ),
						'style'  => in_array( $style, array( 'normal', 'italic' ), true ) ? $style : 'normal',
					);

					$subset = sanitize_key( $variant['subset'] ?? '' );
					if ( '' !== $subset ) {
						$clean_variant['subset'] = $subset;
					}

					$range = self::sanitize_unicode_range( $variant['range'] ?? '' );
					if ( '' !== $range ) {
						$clean_variant['range'] = $range;
					}

					$variants[] = $clean_variant;
				}
			}

			$display = strtolower( sanitize_text_field( (string) ( $family['display'] ?? 'swap' ) ) );

			$entry = array(
				'name'     => $name,
				'variants' => $variants,
				'display'  => in_array( $display, self::DISPLAY_VALUES, true ) ? $display : 'swap',
				'preload'  => ! empty( $family['preload'] ),
				'fallback' => self::sanitize_font_stack( $family['fallback'] ?? '' ),
			);

			$google = self::sanitize_google_block( $family['google'] ?? array() );

			if ( ! empty( $google ) ) {
				$entry['google'] = $google;
			}

			$clean[] = $entry;
		}

		return $clean;
	}

	/**
	 * Sanitize a font weight.
	 *
	 * A variable cut carries a range rather than a single weight, for example
	 * "300 700". Only the full 100-900 range used to be accepted, which silently
	 * rewrote every narrower axis to 400 — most variable families on Google
	 * Fonts declare something narrower than 100-900.
	 *
	 * @param string $weight Raw weight.
	 * @return string
	 */
	public static function sanitize_weight( $weight ) {
		$weight = preg_replace( '/\s+/', ' ', trim( (string) $weight ) );

		if ( in_array( $weight, self::WEIGHTS, true ) ) {
			return $weight;
		}

		if ( preg_match( '/^(\d{1,4}) (\d{1,4})$/', $weight, $m ) ) {
			$min = (int) $m[1];
			$max = (int) $m[2];

			if ( $min >= 1 && $max <= 1000 && $min <= $max ) {
				return $min . ' ' . $max;
			}
		}

		return '400';
	}

	/**
	 * Sanitize the Google Fonts block kept on a family.
	 *
	 * Recording where a family came from, which subsets were chosen and which
	 * cuts the family offers is what lets the editor re-install a different
	 * selection later without searching the library again.
	 *
	 * @param mixed $google Raw block.
	 * @return array
	 */
	protected static function sanitize_google_block( $google ) {
		if ( ! is_array( $google ) || empty( $google ) ) {
			return array();
		}

		$subsets = array();

		foreach ( (array) ( $google['subsets'] ?? array() ) as $subset ) {
			$subset = sanitize_key( $subset );

			if ( '' !== $subset && ! in_array( $subset, $subsets, true ) ) {
				$subsets[] = $subset;
			}
		}

		$cuts = array();

		foreach ( (array) ( $google['cuts'] ?? array() ) as $cut ) {
			$cut = strtolower( trim( (string) $cut ) );

			if ( preg_match( '/^[1-9]00i?$/', $cut ) && ! in_array( $cut, $cuts, true ) ) {
				$cuts[] = $cut;
			}
		}

		$clean = array(
			'subsets'  => $subsets,
			'cuts'     => $cuts,
			'variable' => ! empty( $google['variable'] ),
		);

		$min = (int) ( $google['axis']['min'] ?? 0 );
		$max = (int) ( $google['axis']['max'] ?? 0 );

		if ( $min >= 1 && $max <= 1000 && $min <= $max ) {
			$clean['axis'] = array(
				'min' => $min,
				'max' => $max,
			);
		}

		return $clean;
	}

	// Files.

	/**
	 * List uploaded font files.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public static function files() {
		$dir = self::dir();

		if ( ! is_dir( $dir ) ) {
			return array();
		}

		$files = array();

		foreach ( new DirectoryIterator( $dir ) as $file ) {
			if ( $file->isDot() || $file->isDir() ) {
				continue;
			}

			$ext = strtolower( $file->getExtension() );
			if ( ! isset( self::FORMATS[ $ext ] ) ) {
				continue;
			}

			$guess = self::guess_variant( $file->getFilename() );

			$files[] = array(
				'name'   => $file->getFilename(),
				'ext'    => $ext,
				'size'   => $file->getSize(),
				'url'    => self::url() . $file->getFilename(),
				'weight' => $guess['weight'],
				'style'  => $guess['style'],
			);
		}

		usort(
			$files,
			static function ( $a, $b ) {
				return strcasecmp( $a['name'], $b['name'] );
			}
		);

		return $files;
	}

	/**
	 * Validate that a file's magic bytes match its claimed extension.
	 *
	 * @param string $path Absolute path to the file.
	 * @param string $ext  Claimed extension.
	 * @return bool
	 */
	public static function validate_magic_bytes( $path, $ext ) {
		$handle = fopen( $path, 'rb' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		if ( ! $handle ) {
			return false;
		}

		$header = fread( $handle, 8 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
		fclose( $handle ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose

		if ( strlen( (string) $header ) < 4 ) {
			return false;
		}

		$signature = substr( $header, 0, 4 );

		switch ( $ext ) {
			case 'woff2':
				return 'wOF2' === $signature;
			case 'woff':
				return 'wOFF' === $signature;
			case 'ttf':
				return "\x00\x01\x00\x00" === $signature || 'true' === $signature;
			case 'otf':
				return 'OTTO' === $signature;
			default:
				return false;
		}
	}

	/**
	 * Store an uploaded font file.
	 *
	 * @param array $file Entry from $_FILES.
	 * @return array|WP_Error
	 */
	public static function store_upload( $file ) {
		if ( empty( $file ) || ! isset( $file['tmp_name'] ) ) {
			return new WP_Error( 'efm_no_file', __( 'No file received.', 'etch-font-manager' ), array( 'status' => 400 ) );
		}

		if ( ! empty( $file['error'] ) && UPLOAD_ERR_OK !== (int) $file['error'] ) {
			return new WP_Error(
				'efm_upload_error',
				sprintf( /* translators: %d: PHP upload error code. */ __( 'Upload failed (error %d).', 'etch-font-manager' ), (int) $file['error'] ),
				array( 'status' => 400 )
			);
		}

		if ( (int) $file['size'] > self::MAX_FILE_SIZE ) {
			return new WP_Error( 'efm_too_large', __( 'File is larger than the 10 MB limit.', 'etch-font-manager' ), array( 'status' => 400 ) );
		}

		$ext = strtolower( pathinfo( $file['name'], PATHINFO_EXTENSION ) );
		if ( ! isset( self::FORMATS[ $ext ] ) ) {
			return new WP_Error( 'efm_bad_type', __( 'Only woff2, woff, ttf and otf files are allowed.', 'etch-font-manager' ), array( 'status' => 400 ) );
		}

		if ( ! self::validate_magic_bytes( $file['tmp_name'], $ext ) ) {
			return new WP_Error( 'efm_bad_contents', __( 'File contents do not match the font type.', 'etch-font-manager' ), array( 'status' => 400 ) );
		}

		self::ensure_dir();

		$filename    = sanitize_file_name( $file['name'] );
		$destination = self::dir() . $filename;

		if ( file_exists( $destination ) ) {
			$filename    = pathinfo( $filename, PATHINFO_FILENAME ) . '-' . substr( wp_generate_uuid4(), 0, 8 ) . '.' . $ext;
			$destination = self::dir() . $filename;
		}

		if ( ! self::path_is_inside( $destination ) ) {
			return new WP_Error( 'efm_bad_path', __( 'Invalid destination path.', 'etch-font-manager' ), array( 'status' => 400 ) );
		}

		if ( is_uploaded_file( $file['tmp_name'] ) ) {
			$moved = move_uploaded_file( $file['tmp_name'], $destination ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_move_uploaded_file
		} else {
			// Not a real upload, e.g. a file handed over by another plugin.
			global $wp_filesystem;

			if ( ! $wp_filesystem ) {
				require_once ABSPATH . 'wp-admin/includes/file.php';
				WP_Filesystem();
			}

			$moved = $wp_filesystem ? $wp_filesystem->move( $file['tmp_name'], $destination, true ) : false;
		}

		if ( ! $moved ) {
			return new WP_Error( 'efm_move_failed', __( 'Could not save the uploaded file.', 'etch-font-manager' ), array( 'status' => 500 ) );
		}

		$guess = self::guess_variant( $filename );

		return array(
			'name'   => $filename,
			'ext'    => $ext,
			'size'   => filesize( $destination ),
			'url'    => self::url() . $filename,
			'weight' => $guess['weight'],
			'style'  => $guess['style'],
		);
	}

	/**
	 * Delete a font file from the fonts directory.
	 *
	 * @param string $filename File name.
	 * @return true|WP_Error
	 */
	public static function delete_file( $filename ) {
		$filename = sanitize_file_name( $filename );

		if ( '' === $filename ) {
			return new WP_Error( 'efm_no_filename', __( 'No file name provided.', 'etch-font-manager' ), array( 'status' => 400 ) );
		}

		$path = self::dir() . $filename;

		if ( ! self::path_is_inside( $path ) ) {
			return new WP_Error( 'efm_bad_path', __( 'Invalid file path.', 'etch-font-manager' ), array( 'status' => 400 ) );
		}

		if ( ! file_exists( $path ) ) {
			return new WP_Error( 'efm_not_found', __( 'File not found.', 'etch-font-manager' ), array( 'status' => 404 ) );
		}

		wp_delete_file( $path );

		return true;
	}

	/**
	 * Font files on disk that no family refers to.
	 *
	 * Deselecting a variant leaves its file in place on purpose, so enabling it
	 * again costs nothing. This lists what that has left behind.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public static function unused_files() {
		$used = array();

		foreach ( self::families() as $family ) {
			foreach ( (array) ( $family['variants'] ?? array() ) as $variant ) {
				if ( ! empty( $variant['file'] ) ) {
					$used[ $variant['file'] ] = true;
				}
			}
		}

		return array_values(
			array_filter(
				self::files(),
				static function ( $file ) use ( $used ) {
					return ! isset( $used[ $file['name'] ] );
				}
			)
		);
	}

	/**
	 * Delete every font file no family refers to.
	 *
	 * @return array{deleted:string[],failed:string[],bytes:int}
	 */
	public static function prune_files() {
		$deleted = array();
		$failed  = array();
		$bytes   = 0;

		foreach ( self::unused_files() as $file ) {
			$result = self::delete_file( $file['name'] );

			if ( is_wp_error( $result ) ) {
				$failed[] = $file['name'];
				continue;
			}

			$deleted[] = $file['name'];
			$bytes    += (int) $file['size'];
		}

		return array(
			'deleted' => $deleted,
			'failed'  => $failed,
			'bytes'   => $bytes,
		);
	}

	// CSS.

	/**
	 * Build the @font-face CSS.
	 *
	 * @param array|null $families Optional families. Defaults to stored data.
	 * @param bool       $relative Use relative file URLs (for the static stylesheet).
	 * @return string
	 */
	public static function build_css( $families = null, $relative = false ) {
		if ( null === $families ) {
			$families = self::families();
		}

		$settings = self::settings();
		$css      = '/* Generated by Etch Font Manager v' . EFM_VERSION . " — do not edit, changes are overwritten. */\n\n";

		foreach ( $families as $family ) {
			if ( empty( $family['name'] ) || empty( $family['variants'] ) ) {
				continue;
			}

			foreach ( $family['variants'] as $variant ) {
				if ( empty( $variant['file'] ) ) {
					continue;
				}

				$ext    = strtolower( pathinfo( $variant['file'], PATHINFO_EXTENSION ) );
				$format = self::FORMATS[ $ext ] ?? 'woff2';
				$src    = $relative ? rawurlencode( $variant['file'] ) : esc_url_raw( self::url() . $variant['file'] );
				$weight = $variant['weight'] ?? '400';
				$style  = $variant['style'] ?? 'normal';

				$css .= "@font-face {\n";
				$css .= "\tfont-family: \"{$family['name']}\";\n";
				$css .= "\tsrc: url(\"{$src}\") format(\"{$format}\");\n";
				$display = strtolower( (string) ( $family['display'] ?? 'swap' ) );
				$display = in_array( $display, self::DISPLAY_VALUES, true ) ? $display : 'swap';

				$css .= "\tfont-weight: {$weight};\n";
				$css .= "\tfont-style: {$style};\n";
				$css .= "\tfont-display: {$display};\n";

				$range = self::sanitize_unicode_range( $variant['range'] ?? '' );
				if ( '' !== $range ) {
					$css .= "\tunicode-range: {$range};\n";
				}

				$css .= "}\n\n";
			}
		}

		$tokens = '';
		$seen   = array();

		foreach ( $families as $family ) {
			if ( empty( $family['name'] ) || empty( $family['variants'] ) ) {
				continue;
			}

			$slug = self::family_slug( $family['name'] );

			// Two names can reduce to the same slug. The first one wins rather
			// than the last silently overwriting it.
			if ( '' === $slug || isset( $seen[ $slug ] ) ) {
				continue;
			}

			$seen[ $slug ] = true;
			$tokens       .= "\t--efm-family-{$slug}: " . self::family_stack( $family ) . ";\n";
		}

		if ( '' !== $tokens ) {
			$css .= "/* One custom property per family, so a family can be used as var(--efm-family-slug) */\n:root {\n" . $tokens . "}\n\n";
		}

		if ( ! empty( $settings['acss_enabled'] ) && ( ! empty( $settings['heading_font'] ) || ! empty( $settings['text_font'] ) ) ) {
			$css .= "/* Automatic.css font variable mapping */\n:root {\n";

			if ( ! empty( $settings['heading_font'] ) ) {
				$stack = self::stack_for_name( $settings['heading_font'], $families );
				$css  .= "\t--heading-font-family: {$stack} !important;\n";
			}

			if ( ! empty( $settings['text_font'] ) ) {
				$stack = self::stack_for_name( $settings['text_font'], $families );
				$css  .= "\t--text-font-family: {$stack} !important;\n";
			}

			$css .= "}\n";
		}

		/**
		 * Filter the generated font CSS.
		 *
		 * @param string $css      Generated CSS.
		 * @param array  $families Font families.
		 */
		return apply_filters( 'efm_font_css', $css, $families );
	}

	/**
	 * Resolve a family name to its full stack, including any fallback.
	 *
	 * @param string $name     Family name.
	 * @param array  $families Families to search.
	 * @return string
	 */
	protected static function stack_for_name( $name, $families ) {
		foreach ( $families as $family ) {
			if ( isset( $family['name'] ) && 0 === strcasecmp( $family['name'], $name ) ) {
				return self::family_stack( $family );
			}
		}

		return '"' . $name . '"';
	}

	/**
	 * Write the static stylesheet using relative URLs (iframe/CORS safe).
	 *
	 * @return bool
	 */
	public static function write_css_file() {
		self::ensure_dir();

		return self::write_file( self::css_path(), self::build_css( null, true ) );
	}
}
