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
		'hairline'    => '100',
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

	/* --------------------------------------------------------------------- */
	/* Paths                                                                  */
	/* --------------------------------------------------------------------- */

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

	/* --------------------------------------------------------------------- */
	/* Data                                                                   */
	/* --------------------------------------------------------------------- */

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

	/* --------------------------------------------------------------------- */
	/* Sanitizing                                                             */
	/* --------------------------------------------------------------------- */

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
						'weight' => in_array( $weight, self::WEIGHTS, true ) ? $weight : '400',
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

			$clean[] = array(
				'name'     => $name,
				'variants' => $variants,
			);
		}

		return $clean;
	}

	/* --------------------------------------------------------------------- */
	/* Files                                                                  */
	/* --------------------------------------------------------------------- */

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

		$moved = is_uploaded_file( $file['tmp_name'] )
			? move_uploaded_file( $file['tmp_name'], $destination ) // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_move_uploaded_file
			: rename( $file['tmp_name'], $destination ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_rename

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

	/* --------------------------------------------------------------------- */
	/* CSS                                                                    */
	/* --------------------------------------------------------------------- */

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
				$css .= "\tfont-weight: {$weight};\n";
				$css .= "\tfont-style: {$style};\n";
				$css .= "\tfont-display: swap;\n";

				$range = self::sanitize_unicode_range( $variant['range'] ?? '' );
				if ( '' !== $range ) {
					$css .= "\tunicode-range: {$range};\n";
				}

				$css .= "}\n\n";
			}
		}

		if ( ! empty( $settings['acss_enabled'] ) && ( ! empty( $settings['heading_font'] ) || ! empty( $settings['text_font'] ) ) ) {
			$css .= "/* Automatic.css font variable mapping */\n:root {\n";

			if ( ! empty( $settings['heading_font'] ) ) {
				$css .= "\t--heading-font-family: \"{$settings['heading_font']}\" !important;\n";
			}

			if ( ! empty( $settings['text_font'] ) ) {
				$css .= "\t--text-font-family: \"{$settings['text_font']}\" !important;\n";
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
	 * Write the static stylesheet using relative URLs (iframe/CORS safe).
	 *
	 * @return bool
	 */
	public static function write_css_file() {
		self::ensure_dir();

		return self::write_file( self::css_path(), self::build_css( null, true ) );
	}
}
