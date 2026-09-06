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
	const OPTION_STORAGE = 'efm_multisite_storage_v1';

	/*
	 * Variable axes read out of a font file, keyed by the name it was stored
	 * under. Kept beside the files rather than on the family because axes are a
	 * fact about the file: two families mapping the same variable font describe
	 * the same axes, and a family assembled from several files inherits them from
	 * whichever of its variants is variable.
	 *
	 * Written by the panel, which reads fvar in the browser at upload -- the only
	 * moment the original bytes exist, since converting to WOFF2 happens before
	 * anything is sent and the encoder has no decoder to undo it.
	 */
	const OPTION_AXES = 'efm_file_axes';
	const CSS_FILENAME    = 'efm-fonts.css';
	const TRANSIENT_INLINE = 'efm_inline_css';
	const MAX_FILE_SIZE   = 10485760; // 10 MB.

	/*
	 * A bundled import arrives as one JSON request, so the whole thing has to
	 * fit in memory and inside the server's upload limits. Refusing a payload
	 * that is plainly too large gives a clear message instead of an opaque
	 * failure somewhere further down.
	 */
	const MAX_BUNDLE_SIZE = 52428800; // 50 MB of decoded font data.

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
	 * Where a family's font files came from.
	 *
	 * @var string[]
	 */
	const SOURCES = array( 'google', 'upload' );

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
		add_action( 'switch_blog', array( __CLASS__, 'maybe_upgrade' ) );
	}

	/**
	 * Whether this site has ever stored a library.
	 *
	 * A missing option and an empty one mean different things. A site that deleted
	 * its last family holds an empty array, and its stylesheet should be rewritten
	 * empty to match. A site with no option at all has either never had one or has
	 * just had it removed by an uninstall -- and in that second case a stylesheet
	 * from the previous install may still be on disk doing its job.
	 *
	 * @return bool True when a library exists, however empty.
	 */
	protected static function has_library() {
		return null !== get_option( self::OPTION_FAMILIES, null );
	}

	/**
	 * Write the stylesheet unless doing so would destroy a better one.
	 *
	 * Deleting the plugin without ticking "Delete the font files too" leaves the
	 * stylesheet in place on purpose, so the site keeps its typography. Reinstalling
	 * then arrived with no library and regenerated that file from nothing, which is
	 * exactly what keeping it was meant to prevent.
	 *
	 * A fresh install still gets its file, since there is nothing there to lose.
	 *
	 * @return bool Whether the existing stylesheet was kept or a write succeeded.
	 */
	public static function write_css_unless_kept() {
		if ( self::has_library() || ! file_exists( self::css_path() ) ) {
			return self::write_css_file();
		}

		return true;
	}

	/**
	 * Regenerate the stylesheet after a plugin update.
	 */
	public static function maybe_upgrade() {
		// Site creation switches blogs before their options tables exist.
		// Defer migration until the site's first normal request or later switch.
		if ( is_multisite() && ( doing_action( 'wp_insert_site' ) || doing_action( 'wp_initialize_site' ) ) ) {
			return;
		}

		// Storage upgrades must run even when the plugin version has not changed.
		if ( ! self::migrate_multisite_storage() ) {
			return;
		}

		if ( get_option( 'efm_version' ) === EFM_VERSION ) {
			return;
		}

		self::write_css_unless_kept();

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
		 * Single-site paths remain unchanged. On multisite this filter selects
		 * a base; efm-sites/{blog_id}/ is appended after filtering.
		 *
		 * @param string $dir Absolute directory path.
		 */
		return self::storage_root() . self::site_suffix();
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
		return trailingslashit( apply_filters( 'efm_fonts_url', content_url( '/fonts' ) ) ) . self::site_suffix();
	}

	/**
	 * Filters choose the base; multisite isolation is always appended afterwards.
	 *
	 * @return string
	 */
	protected static function storage_root() {
		return trailingslashit( apply_filters( 'efm_fonts_dir', WP_CONTENT_DIR . '/fonts' ) );
	}

	/**
	 * Resolve the current blog on every call, including switch_to_blog().
	 *
	 * @return string
	 */
	protected static function site_suffix() {
		return is_multisite() ? 'efm-sites/' . get_current_blog_id() . '/' : '';
	}

	/**
	 * A symlink must not turn a site's namespace back into shared storage.
	 * The filtered base itself is trusted configuration and may be a mount/link.
	 *
	 * @return bool
	 */
	protected static function storage_is_safe() {
		if ( ! is_multisite() ) {
			return true;
		}

		$root = self::storage_root();
		foreach ( array( $root . 'efm-sites', rtrim( self::dir(), '/\\' ) ) as $path ) {
			if ( is_link( $path ) || ( file_exists( $path ) && ! is_dir( $path ) ) ) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Copy a snapshot of legacy references into this site's isolated directory.
	 * Records prove a reference, never exclusive ownership: shared originals and
	 * shared CSS are never changed. Missing/invalid files remain visibly missing.
	 * Failed copies retry from the saved snapshot, not later mutable records.
	 *
	 * @return bool Whether all eligible copies have completed.
	 */
	public static function migrate_multisite_storage() {
		if ( ! is_multisite() ) {
			return true;
		}

		$state = get_option( self::OPTION_STORAGE, null );
		if ( null === $state ) {
			$pending = array();
			foreach ( self::sanitize_families( self::families() ) as $family ) {
				foreach ( $family['variants'] as $variant ) {
					$pending[] = $variant['file'];
				}
			}
			$state = array( 'pending' => array_values( array_unique( $pending ) ) );
			// First writer wins if two requests encounter an automatic upgrade.
			add_option( self::OPTION_STORAGE, $state, '', false );
			$state = get_option( self::OPTION_STORAGE );
		}
		if ( ! empty( $state['done'] ) ) {
			return true;
		}
		if ( ! self::storage_is_safe() ) {
			return false;
		}

		self::ensure_dir();
		$root = realpath( self::storage_root() );
		$pending = array();
		foreach ( (array) ( $state['pending'] ?? array() ) as $name ) {
			if ( sanitize_file_name( $name ) !== $name || ! isset( self::FORMATS[ strtolower( pathinfo( $name, PATHINFO_EXTENSION ) ) ] ) ) {
				continue;
			}
			$source = self::storage_root() . $name;
			$target = self::dir() . $name;
			if ( is_link( $source ) || ! is_file( $source ) || false === $root || dirname( realpath( $source ) ) !== $root || filesize( $source ) > self::MAX_FILE_SIZE || ! self::validate_magic_bytes( $source, strtolower( pathinfo( $name, PATHINFO_EXTENSION ) ) ) ) {
				continue;
			}
			if ( ! self::publish_migration_file( $source, $target ) ) {
				$pending[] = $name;
			}
		}
		$done = empty( $pending ) && is_dir( self::dir() );
		if ( $done ) {
			$done = self::write_css_unless_kept();
		}
		update_option(
			self::OPTION_STORAGE,
			array(
				'pending' => $pending,
				'done'    => $done,
			),
			false
		);

		return $done;
	}

	/**
	 * Publish a fully validated private copy without replacing a destination.
	 * The deterministic staging name and lock also recover a killed writer,
	 * including a kill between link() and unlink(). Shared sources are read-only.
	 *
	 * @param string $source Shared source file.
	 * @param string $target Site-isolated destination file.
	 * @return bool Whether a safe destination exists.
	 */
	protected static function publish_migration_file( $source, $target ) {
		$temp = self::dir() . '.efm-migrate-' . hash( 'sha256', basename( $target ) ) . '.tmp';
		if ( ! self::storage_is_safe() || is_link( $temp ) || is_link( $target ) || realpath( dirname( $target ) ) !== realpath( self::dir() ) ) {
			return false;
		}
		$handle = @fopen( $temp, 'c+b' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen, WordPress.PHP.NoSilencedErrors.Discouraged
		if ( false === $handle ) {
			return false;
		}
		try {
			if ( ! flock( $handle, LOCK_EX | LOCK_NB ) ) {
				return false;
			}
			clearstatcache();
			$staged = fstat( $handle );
			$named = is_file( $temp ) && ! is_link( $temp ) ? stat( $temp ) : false;
			$dest = is_file( $target ) && ! is_link( $target ) ? stat( $target ) : false;

			// Only the exact staged inode with exactly two links can be recovered.
			// An arbitrary hard-linked target remains forbidden by path_is_inside().
			if ( $named && $dest && $staged && $named['ino'] === $staged['ino'] && $named['dev'] === $staged['dev'] && $dest['ino'] === $staged['ino'] && $dest['dev'] === $staged['dev'] && 2 === $staged['nlink'] ) {
				wp_delete_file( $temp );
				clearstatcache();

				return self::path_is_inside( $target );
			}
			if ( file_exists( $target ) || is_link( $target ) ) {
				return self::path_is_inside( $target );
			}
			if ( ! $named || ! $staged || $named['ino'] !== $staged['ino'] || $named['dev'] !== $staged['dev'] || 1 !== $staged['nlink'] || ! self::path_is_inside( $temp ) || ! self::path_is_inside( $target ) ) {
				return false;
			}
			$bytes = file_get_contents( $source, false, null, 0, self::MAX_FILE_SIZE + 1 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$ext = strtolower( pathinfo( $target, PATHINFO_EXTENSION ) );
			if ( false === $bytes || strlen( $bytes ) > self::MAX_FILE_SIZE || ! self::looks_like_font( $bytes, $ext ) || ! static::write_migration_bytes( $handle, $bytes ) || hash( 'sha256', $bytes ) !== hash_file( 'sha256', $temp ) ) {
				return false;
			}

			// link() is atomic and refuses an existing name; rename() would overwrite it.
			if ( ! @link( $temp, $target ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
				return file_exists( $target ) && self::path_is_inside( $target );
			}
			wp_delete_file( $temp );
			clearstatcache();

			return self::path_is_inside( $target );
		} finally {
			fclose( $handle ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		}
	}

	/**
	 * Replace and flush staging bytes; a short/failed write must never publish.
	 *
	 * @param resource $handle Locked staging handle.
	 * @param string   $bytes  Complete font contents.
	 * @return bool Whether every byte was written and flushed.
	 */
	protected static function write_migration_bytes( $handle, $bytes ) {
		return ftruncate( $handle, 0 ) && rewind( $handle ) && strlen( $bytes ) === fwrite( $handle, $bytes ) && fflush( $handle ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite
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
	 * When the stylesheet was last written, as a Unix timestamp.
	 *
	 * @return int Zero when it has never been generated.
	 */
	public static function css_generated() {
		$path = self::css_path();

		return file_exists( $path ) ? (int) filemtime( $path ) : 0;
	}

	/**
	 * The stylesheet as it should be printed inline, cached.
	 *
	 * The generated file cannot simply be inlined: it is written with relative
	 * `src` URLs, which resolve against the stylesheet when it is a file and
	 * against the page when it is inline, so inlining it would break every font
	 * URL. The absolute-URL build is therefore kept in its own cache, keyed to
	 * the file's modification time so it is rebuilt whenever the fonts change.
	 *
	 * @return string
	 */
	public static function inline_css() {
		$version = self::css_version();
		$cached  = get_transient( self::TRANSIENT_INLINE );

		if ( is_array( $cached ) && isset( $cached['version'], $cached['css'] ) && $cached['version'] === $version ) {
			return (string) $cached['css'];
		}

		$css = self::build_css();

		set_transient(
			self::TRANSIENT_INLINE,
			array(
				'version' => $version,
				'css'     => $css,
			),
			WEEK_IN_SECONDS
		);

		return $css;
	}

	/**
	 * Sanitize a list of CSS selectors a family should be applied to.
	 *
	 * Deliberately narrow: selectors, combinators and commas only. Anything that
	 * could close a declaration block and inject rules is stripped.
	 *
	 * @param string $selector Raw selector list.
	 * @return string
	 */
	public static function sanitize_selector( $selector ) {
		$selector = sanitize_text_field( (string) $selector );
		$selector = preg_replace( '/[^A-Za-z0-9 ,.#:_\-\[\]="\'>+~()*]/', '', $selector );
		$selector = preg_replace( '/\s+/', ' ', (string) $selector );

		return trim( (string) $selector, " ,\t\n" );
	}

	/**
	 * Create the fonts directory and protect it from listing.
	 */
	public static function ensure_dir() {
		if ( ! self::storage_is_safe() ) {
			return;
		}

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
		if ( ! self::path_is_inside( $path ) ) {
			return false;
		}

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
		if ( ! self::storage_is_safe() || ( is_multisite() && is_link( $path ) ) ) {
			return false;
		}
		if ( is_multisite() && is_file( $path ) ) {
			$stat = stat( $path );
			if ( false === $stat || $stat['nlink'] > 1 ) {
				return false;
			}
		}

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

		if ( ! is_array( $families ) ) {
			return array();
		}

		/*
		 * Records stored before the origin existed are filled in here rather
		 * than by a one-off upgrade routine. The answer is derived from what
		 * the record already holds, so it is the same every time it is asked
		 * and there is no migration flag to keep track of. The next save
		 * writes it back.
		 */
		foreach ( $families as $index => $family ) {
			if ( is_array( $family ) && empty( $family['source'] ) ) {
				$families[ $index ]['source'] = self::derive_source( $family );
			}
		}

		return $families;
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
	 * Get plugin settings.
	 *
	 * @return array
	 */
	public static function settings() {
		$defaults = array(
			'inline_css'   => false,
			'block_google' => false,

			/*
			 * Off, because the opposite of this setting is unrecoverable and the
			 * safe default for an accidental delete is to leave the typography
			 * standing. A site that wants a clean removal opts into it.
			 */
			'purge_files'  => false,

			/*
			 * Off for a related reason. Converting to WOFF2 is one-way here: this
			 * plugin carries an encoder and no decoder, so the file it converted
			 * from cannot be rebuilt from the result, and for an uploaded font it
			 * may be the only copy on the site. Keeping it costs disk and nothing
			 * else, and the Upload screen marks it unused, so the site decides.
			 */
			'delete_source_on_convert' => false,
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
			'inline_css'   => ! empty( $input['inline_css'] ?? $current['inline_css'] ),
			'block_google' => ! empty( $input['block_google'] ?? $current['block_google'] ),
			'purge_files'  => ! empty( $input['purge_files'] ?? $current['purge_files'] ),
			'delete_source_on_convert' => ! empty( $input['delete_source_on_convert'] ?? $current['delete_source_on_convert'] ),
		);

		update_option( self::OPTION_SETTINGS, $clean, false );
		self::write_css_file();

		return $clean;
	}

	/**
	 * The font configuration, for moving between sites.
	 *
	 * Font files are left out by default: they can be large, and a family
	 * installed from Google can simply be fetched again on the destination.
	 * Bundling them is for fonts that were uploaded by hand, which cannot.
	 *
	 * @param string[] $names  Family names to include. Empty exports them all.
	 * @param bool     $bundle Embed the font files in the payload.
	 * @return array
	 */
	public static function export_payload( $names = array(), $bundle = false ) {
		$families = self::families();
		$names    = array_filter( array_map( 'strval', (array) $names ) );

		/*
		 * A family in the trash is one the site has deleted, so it has no business
		 * travelling to another site. It used to: the filter below only narrows the
		 * list when names are given, and the panel omits the names entirely when
		 * every family is picked -- which is the default -- so a plain export
		 * carried the trash with it and importing it recreated the records.
		 *
		 * Trashed only, not active_families(), because a disabled family is one the
		 * site is keeping on purpose and has every reason to take along.
		 */
		$families = array_values(
			array_filter(
				$families,
				static function ( $family ) {
					return empty( $family['trashed'] );
				}
			)
		);

		if ( ! empty( $names ) ) {
			$wanted = array_map( 'strtolower', $names );

			$families = array_values(
				array_filter(
					$families,
					static function ( $family ) use ( $wanted ) {
						return in_array( strtolower( $family['name'] ?? '' ), $wanted, true );
					}
				)
			);
		}

		$payload = array(
			'plugin'   => 'etch-font-manager',
			'version'  => EFM_VERSION,
			'schema'   => 2,
			'exported' => gmdate( 'c' ),
			'site'     => home_url( '/' ),
			'families' => $families,
			'settings' => self::settings(),
			'files'    => wp_list_pluck( self::files(), 'name' ),
		);

		if ( $bundle ) {
			$payload['bundle'] = self::bundle_files( $families );
		}

		return $payload;
	}

	/**
	 * Base64 the font files the given families refer to.
	 *
	 * Only worth doing for fonts that cannot simply be fetched again, but the
	 * caller decides that: a bundle is always complete for the families asked
	 * for, so an export either rebuilds everywhere or it does not.
	 *
	 * @param array $families Families to collect files for.
	 * @return array<string,string> Filename to base64 contents.
	 */
	protected static function bundle_files( $families ) {
		$bundle = array();

		foreach ( $families as $family ) {
			foreach ( (array) ( $family['variants'] ?? array() ) as $variant ) {
				$file = $variant['file'] ?? '';

				if ( '' === $file || isset( $bundle[ $file ] ) ) {
					continue;
				}

				$path = self::dir() . $file;

				if ( ! self::path_is_inside( $path ) || ! file_exists( $path ) ) {
					continue;
				}

				if ( filesize( $path ) > self::MAX_FILE_SIZE ) {
					continue;
				}

				$contents = file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents

				if ( false !== $contents ) {
					$bundle[ $file ] = base64_encode( $contents ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
				}
			}
		}

		return $bundle;
	}

	/**
	 * Write the font files carried in an import payload.
	 *
	 * Every file is checked before it lands: the name is sanitised, the
	 * extension must be a font format, the destination must resolve inside the
	 * fonts directory, the decoded size must be within the upload limit, and the
	 * bytes must actually start with that format's signature. A payload cannot
	 * be used to drop arbitrary content into the site.
	 *
	 * @param mixed $bundle Filename to base64 map.
	 * @return array{written:string[],rejected:string[]}
	 */
	protected static function restore_bundle( $bundle ) {
		$written  = array();
		$rejected = array();
		$total    = 0;

		if ( ! is_array( $bundle ) || empty( $bundle ) ) {
			return array(
				'written'  => $written,
				'rejected' => $rejected,
			);
		}

		self::ensure_dir();

		foreach ( $bundle as $name => $encoded ) {
			$file = sanitize_file_name( (string) $name );
			$ext  = strtolower( pathinfo( $file, PATHINFO_EXTENSION ) );

			if ( '' === $file || ! isset( self::FORMATS[ $ext ] ) ) {
				$rejected[] = (string) $name;
				continue;
			}

			$path = self::dir() . $file;

			if ( ! self::path_is_inside( $path ) ) {
				$rejected[] = $file;
				continue;
			}

			if ( file_exists( $path ) ) {
				continue;
			}

			$raw = base64_decode( (string) $encoded, true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode

			if ( false === $raw || '' === $raw || strlen( $raw ) > self::MAX_FILE_SIZE ) {
				$rejected[] = $file;
				continue;
			}

			if ( ! self::looks_like_font( $raw, $ext ) ) {
				$rejected[] = $file;
				continue;
			}

			$total += strlen( $raw );

			if ( $total > self::MAX_BUNDLE_SIZE ) {
				$rejected[] = $file;
				continue;
			}

			if ( self::write_file( $path, $raw ) ) {
				$written[] = $file;
			} else {
				$rejected[] = $file;
			}
		}

		return array(
			'written'  => $written,
			'rejected' => $rejected,
		);
	}

	/**
	 * Restore a configuration produced by export_payload().
	 *
	 * @param array  $data    Decoded payload.
	 * @param string $mode    replace or merge.
	 * @param bool   $dry_run Report what would happen without writing anything.
	 * @return array|WP_Error Report of what was imported.
	 */
	public static function import_payload( $data, $mode = 'replace', $dry_run = false ) {
		if ( ! is_array( $data ) || ! isset( $data['families'] ) || ! is_array( $data['families'] ) ) {
			return new WP_Error(
				'efm_import_invalid',
				__( 'That file does not look like an Etch Font Manager export.', 'etch-font-manager' ),
				array( 'status' => 400 )
			);
		}

		if ( isset( $data['bundle'] ) && ! is_array( $data['bundle'] ) ) {
			return new WP_Error(
				'efm_import_bundle',
				__( 'The bundled font data in that file is not readable.', 'etch-font-manager' ),
				array( 'status' => 400 )
			);
		}

		$incoming = self::sanitize_families( $data['families'] );
		$existing = self::families();
		$current  = array();

		foreach ( $existing as $family ) {
			$current[ strtolower( $family['name'] ) ] = true;
		}

		$added   = array();
		$updated = array();

		foreach ( $incoming as $family ) {
			if ( isset( $current[ strtolower( $family['name'] ) ] ) ) {
				$updated[] = $family['name'];
			} else {
				$added[] = $family['name'];
			}
		}

		if ( 'merge' === $mode ) {
			$by_name = array();

			foreach ( $existing as $family ) {
				$by_name[ strtolower( $family['name'] ) ] = $family;
			}

			// A family of the same name in the import wins.
			foreach ( $incoming as $family ) {
				$by_name[ strtolower( $family['name'] ) ] = $family;
			}

			$families = array_values( $by_name );
			$removed  = array();
		} else {
			$families = $incoming;

			$keep = array();

			foreach ( $incoming as $family ) {
				$keep[ strtolower( $family['name'] ) ] = true;
			}

			$removed = array();

			foreach ( $existing as $family ) {
				if ( ! isset( $keep[ strtolower( $family['name'] ) ] ) ) {
					$removed[] = $family['name'];
				}
			}
		}

		$bundled = array_keys( is_array( $data['bundle'] ?? null ) ? $data['bundle'] : array() );

		if ( $dry_run ) {
			$present_now = wp_list_pluck( self::files(), 'name' );
			$would_miss  = array();

			foreach ( $families as $family ) {
				foreach ( (array) $family['variants'] as $variant ) {
					$file = $variant['file'] ?? '';

					if ( '' !== $file && ! in_array( $file, $present_now, true ) && ! in_array( $file, $bundled, true ) ) {
						$would_miss[] = $file;
					}
				}
			}

			return array(
				'preview'  => true,
				'mode'     => $mode,
				'families' => count( $families ),
				'added'    => $added,
				'updated'  => $updated,
				'removed'  => $removed,
				'bundled'  => count( $bundled ),
				'missing'  => array_values( array_unique( $would_miss ) ),
			);
		}

		// Files first, so the missing-file report reflects what the bundle restored.
		$restored = self::restore_bundle( $data['bundle'] ?? array() );

		// Families next: saving settings prunes assignments whose family is gone.
		self::save_families( $families );

		if ( ! empty( $data['settings'] ) && is_array( $data['settings'] ) ) {
			self::save_settings( $data['settings'] );
		}

		$present     = wp_list_pluck( self::files(), 'name' );
		$missing     = array();
		$recoverable = array();

		foreach ( $families as $family ) {
			$absent = array();

			foreach ( (array) $family['variants'] as $variant ) {
				if ( ! empty( $variant['file'] ) && ! in_array( $variant['file'], $present, true ) ) {
					$missing[] = $variant['file'];
					$absent[]  = $variant['file'];
				}
			}

			/*
			 * A family installed from Google carries the family name, the chosen
			 * subsets and the chosen cuts, which is everything needed to fetch
			 * the files again. Reporting that turns a config-only export into
			 * something that actually rebuilds on the destination site.
			 */
			if ( empty( $absent ) || empty( $family['google'] ) ) {
				continue;
			}

			$recoverable[] = array(
				'name'     => $family['name'],
				'subsets'  => $family['google']['subsets'] ?? array( 'latin' ),
				'cuts'     => self::installed_cuts( $family ),
				'variable' => ! empty( $family['google']['variable'] ),
				'files'    => $absent,
			);
		}

		return array(
			'families'    => count( $families ),
			'added'       => $added,
			'updated'     => $updated,
			'removed'     => $removed,
			'restored'    => $restored['written'],
			'rejected'    => $restored['rejected'],
			'missing'     => array_values( array_unique( $missing ) ),
			'recoverable' => $recoverable,
		);
	}

	/**
	 * The weight/style cuts a family currently maps, in Google's notation.
	 *
	 * A variable cut spans a weight range rather than one weight, so it maps to
	 * no single cut and is skipped.
	 *
	 * @param array $family Family record.
	 * @return string[]
	 */
	public static function installed_cuts( $family ) {
		$cuts = array();

		foreach ( (array) ( $family['variants'] ?? array() ) as $variant ) {
			$weight = (string) ( $variant['weight'] ?? '400' );

			if ( false !== strpos( $weight, ' ' ) ) {
				continue;
			}

			$cut = $weight . ( 'italic' === ( $variant['style'] ?? 'normal' ) ? 'i' : '' );

			if ( ! in_array( $cut, $cuts, true ) ) {
				$cuts[] = $cut;
			}
		}

		return $cuts;
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

		// Only the families carry over. The legacy plugin's own ACSS variable
		// mapping has no counterpart here any more, so ecf_acss_settings is
		// deliberately ignored rather than half-imported.
		update_option( self::OPTION_FAMILIES, self::sanitize_families( $legacy_families ), false );
	}

	// Sanitizing.

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
	 * Whether a family should be delivered to the front end.
	 *
	 * A disabled or trashed family keeps its record and its files — only its
	 * output stops — so turning it back on costs nothing.
	 *
	 * @param array $family Family record.
	 * @return bool
	 */
	public static function is_active( $family ) {
		if ( ! empty( $family['trashed'] ) ) {
			return false;
		}

		return ! array_key_exists( 'enabled', $family ) || ! empty( $family['enabled'] );
	}

	/**
	 * Families that are neither disabled nor trashed.
	 *
	 * @param array|null $families Optional families. Defaults to stored data.
	 * @return array
	 */
	public static function active_families( $families = null ) {
		if ( null === $families ) {
			$families = self::families();
		}

		return array_values( array_filter( $families, array( __CLASS__, 'is_active' ) ) );
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

		$stack = '"' . $name . '"';

		/*
		 * The metric-matched face goes between the real font and whatever the
		 * reader named, because it is only useful while the real font is still
		 * arriving. It is a local face carrying this font's vertical metrics, so
		 * the line boxes do not change height when the swap happens.
		 */
		if ( self::sanitize_metrics( $family['metrics'] ?? array() ) ) {
			$stack .= ', "' . $name . ' ' . self::FALLBACK_SUFFIX . '"';
		}

		return '' === $fallback ? $stack : $stack . ', ' . $fallback;
	}

	/**
	 * Name of the metric-matched face generated for a family.
	 *
	 * A suffix rather than a separate naming scheme, so the relationship is
	 * obvious in devtools and in the generated stylesheet.
	 */
	const FALLBACK_SUFFIX = 'fallback';

	/**
	 * Local faces the metric-matched fallback is drawn from.
	 *
	 * Three rather than one, because there is no single sans-serif present on
	 * every platform: Arial on Windows and macOS, Helvetica Neue on older macOS,
	 * Liberation Sans on most Linux distributions. The browser takes the first it
	 * has. Which one it lands on barely matters, because the overrides below
	 * replace its vertical metrics anyway -- what matters is that something
	 * resolves without a network request.
	 */
	const FALLBACK_LOCALS = array( 'Arial', 'Helvetica Neue', 'Liberation Sans' );

	/**
	 * Sanitize the metric overrides read out of a font file.
	 *
	 * Percentages, stored as plain numbers. Anything outside a sane range is
	 * dropped rather than clamped: a bad number here would silently reshape every
	 * line of body text, and no override at all is the safer failure.
	 *
	 * @param mixed $metrics Raw metrics.
	 * @return array Empty when there is nothing usable.
	 */
	public static function sanitize_metrics( $metrics ) {
		if ( ! is_array( $metrics ) ) {
			return array();
		}

		$clean = array();

		foreach ( array( 'ascent', 'descent', 'gap' ) as $key ) {
			if ( ! isset( $metrics[ $key ] ) || ! is_numeric( $metrics[ $key ] ) ) {
				return array();
			}

			$value = round( (float) $metrics[ $key ], 2 );

			if ( $value < 0 || $value > 400 ) {
				return array();
			}

			$clean[ $key ] = $value;
		}

		// An ascent of zero would collapse every line box to nothing.
		if ( $clean['ascent'] <= 0 ) {
			return array();
		}

		return $clean;
	}

	/**
	 * The metric-matched @font-face for one family.
	 *
	 * @param array $family Family record.
	 * @return string CSS, empty when the family has no stored metrics.
	 */
	public static function fallback_face_css( $family ) {
		$metrics = self::sanitize_metrics( $family['metrics'] ?? array() );
		$name    = $family['name'] ?? '';

		if ( ! $metrics || '' === $name ) {
			return '';
		}

		$sources = array();

		foreach ( self::FALLBACK_LOCALS as $local ) {
			$sources[] = 'local("' . $local . '")';
		}

		return '@font-face {' . "\n" .
			"\tfont-family: \"" . $name . ' ' . self::FALLBACK_SUFFIX . "\";\n" .
			"\tsrc: " . implode( ', ', $sources ) . ";\n" .
			"\tascent-override: " . $metrics['ascent'] . "%;\n" .
			"\tdescent-override: " . $metrics['descent'] . "%;\n" .
			"\tline-gap-override: " . $metrics['gap'] . "%;\n" .
			"}\n\n";
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

		foreach ( self::active_families() as $family ) {
			if ( empty( $family['preload'] ) || empty( $family['variants'] ) ) {
				continue;
			}

			$chosen = null;
			$best   = null;

			foreach ( $family['variants'] as $variant ) {
				if ( empty( $variant['file'] ) || ! self::file_present( $variant['file'] ) ) {
					continue;
				}

				$score = self::preload_score( $variant );

				if ( null === $best || $score < $best ) {
					$best   = $score;
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
	 * How suitable a variant is for preloading. Lower is better.
	 *
	 * Preload should fetch the cut a page is most likely to render first, which
	 * is the upright weight nearest regular, preferring latin. The previous
	 * version only accepted a weight of exactly "400" or the full "100 900"
	 * range, so a family installed without a regular weight preloaded nothing at
	 * all — and once narrow variable ranges stopped being rewritten to 400 in
	 * 0.8.0, neither did any variable family with an axis such as "400 900".
	 *
	 * @param array $variant Variant record.
	 * @return array Sort key: upright first, then distance from regular, then latin.
	 */
	public static function preload_score( $variant ) {
		$weight = (string) ( $variant['weight'] ?? '400' );

		if ( false !== strpos( $weight, ' ' ) ) {
			$bounds = array_map( 'intval', explode( ' ', $weight, 2 ) );
			$min    = $bounds[0];
			$max    = isset( $bounds[1] ) ? $bounds[1] : $bounds[0];

			// A range covering regular is as good as a regular file.
			$distance = ( 400 >= $min && 400 <= $max ) ? 0 : min( abs( $min - 400 ), abs( $max - 400 ) );
		} else {
			$distance = abs( (int) $weight - 400 );
		}

		return array(
			'italic' === ( $variant['style'] ?? 'normal' ) ? 1 : 0,
			$distance,
			( ! isset( $variant['subset'] ) || 'latin' === $variant['subset'] ) ? 0 : 1,
		);
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
	 * The typography tokens a family can be mapped to.
	 *
	 * The two names Etch's own documentation tells people to declare, and the two
	 * Automatic.css consumes. Neither is invented here: ACSS's stylesheet reads
	 * --text-font-family without ever declaring it, which is precisely the gap
	 * this fills.
	 */
	const ROLES = array( 'heading', 'text' );

	/**
	 * What each role already answers for.
	 *
	 * A role publishes --{role}-font-family, and Automatic.css turns that into a
	 * rule for these selectors once its Typography section is configured. A family
	 * naming one of them in Apply to as well would have this plugin write a second
	 * rule for the same element, settled by source order rather than by intent, so
	 * the role wins and the duplicate is dropped.
	 *
	 * Tags only, and matched whole. Whether ".card h1" overlaps "h1" is a cascade
	 * question rather than a string one, which is the same line the panel's own
	 * clash check already draws.
	 *
	 * The two lists are the selectors the generated rules actually carry:
	 *
	 *     h1,h2,h3,h4,h5,h6 { font-family: var(--heading-font-family); }
	 *     body, p, li, a, button { font-family: var(--text-font-family); }
	 *
	 * Body text is five tags rather than body alone: p, li, a and button all set a
	 * font of their own somewhere up the cascade, so the rule names them instead of
	 * relying on inheritance -- and each one is therefore a selector this plugin
	 * must not write a second time.
	 */
	const ROLE_SELECTORS = array(
		'heading' => array( 'h1', 'h2', 'h3', 'h4', 'h5', 'h6' ),
		'text'    => array( 'body', 'p', 'li', 'a', 'button' ),
	);

	/**
	 * Every selector a typography token already answers for, across the library.
	 *
	 * Whichever family holds the role. A token and a plain selector aiming at the
	 * same element is a fight the selector wins, so the two features are kept from
	 * overlapping at all: the tokens own these tags, and Apply to owns everything
	 * they do not. Asking only about the family being written would have let a
	 * second family quietly take h1 away from whoever holds the heading token.
	 *
	 * @param array|null $families Optional families. Defaults to stored data.
	 * @return string[] Lowercase selectors.
	 */
	public static function role_selectors( $families = null ) {
		if ( null === $families ) {
			$families = self::families();
		}

		$covered = array();

		foreach ( self::ROLES as $role ) {
			foreach ( $families as $family ) {
				if ( ! in_array( $role, (array) ( $family['roles'] ?? array() ), true ) ) {
					continue;
				}

				if ( empty( $family['variants'] ) || empty( $family['enabled'] ) || ! empty( $family['trashed'] ) ) {
					continue;
				}

				$covered = array_merge( $covered, self::ROLE_SELECTORS[ $role ] );
				break;
			}
		}

		return $covered;
	}

	/**
	 * A family's Apply to list with anything a typography token already covers
	 * removed.
	 *
	 * @param array      $family   Family record.
	 * @param array|null $families Optional families, for the token check. Defaults
	 *                             to stored data.
	 * @return string Selector list, empty when the tokens cover all of it.
	 */
	public static function applied_selector( $family, $families = null ) {
		$selector = self::sanitize_selector( $family['selector'] ?? '' );

		if ( '' === $selector ) {
			return '';
		}

		$covered = self::role_selectors( $families );

		if ( ! $covered ) {
			return $selector;
		}

		$kept = array();

		foreach ( explode( ',', $selector ) as $part ) {
			$part = trim( $part );

			if ( '' === $part || in_array( strtolower( $part ), $covered, true ) ) {
				continue;
			}

			$kept[] = $part;
		}

		return implode( ', ', $kept );
	}

	/**
	 * Sanitise a family's token roles.
	 *
	 * @param mixed $roles Candidate roles.
	 * @return array
	 */
	protected static function sanitize_roles( $roles ) {
		$clean = array();

		foreach ( (array) $roles as $role ) {
			$role = strtolower( sanitize_key( (string) $role ) );

			if ( in_array( $role, self::ROLES, true ) && ! in_array( $role, $clean, true ) ) {
				$clean[] = $role;
			}
		}

		// Sorted, so the order a role happened to be ticked in never reads as a
		// change when the panel compares what it holds against what was saved.
		sort( $clean );

		return $clean;
	}

	/**
	 * Leave each role with at most one family holding it.
	 *
	 * A token has one value, so two families claiming it is not a preference to
	 * be honoured but a conflict to be resolved -- and resolved the same way
	 * every time, or the stylesheet changes under a save that touched neither
	 * family. The first live claimant in stored order keeps it.
	 *
	 * Disabled and trashed families are stripped outright: they contribute no
	 * font-face rule, so pointing a token at them would name a font the page
	 * never loads.
	 *
	 * @param array $families Sanitised families.
	 * @return array
	 */
	protected static function resolve_roles( $families ) {
		$taken = array();

		foreach ( $families as $index => $family ) {
			$live = empty( $family['trashed'] ) && ! empty( $family['enabled'] );
			$kept = array();

			foreach ( (array) ( $family['roles'] ?? array() ) as $role ) {
				if ( $live && ! isset( $taken[ $role ] ) ) {
					$taken[ $role ] = true;
					$kept[]         = $role;
				}
			}

			$families[ $index ]['roles'] = $kept;
		}

		return $families;
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

			/*
			 * Absent flags mean enabled and not trashed, so families stored before
			 * these existed keep working untouched after an upgrade.
			 */
			$enabled = array_key_exists( 'enabled', $family ) ? (bool) $family['enabled'] : true;

			$google = self::sanitize_google_block( $family['google'] ?? array() );

			$entry = array(
				'name'     => $name,
				'variants' => $variants,
				'source'   => self::sanitize_source( $family, ! empty( $google ) ),
				'display'  => in_array( $display, self::DISPLAY_VALUES, true ) ? $display : 'swap',
				'preload'  => ! empty( $family['preload'] ),
				'fallback' => self::sanitize_font_stack( $family['fallback'] ?? '' ),
				'selector' => self::sanitize_selector( $family['selector'] ?? '' ),
				'force'    => ! empty( $family['force'] ),
				'enabled'  => $enabled,
				'trashed'  => ! empty( $family['trashed'] ),
				'variation' => self::sanitize_variation( $family['variation'] ?? '' ),
				'roles'    => self::sanitize_roles( $family['roles'] ?? array() ),
				'metrics'  => self::sanitize_metrics( $family['metrics'] ?? array() ),
			);

			if ( ! empty( $google ) ) {
				$entry['google'] = $google;
			}

			$clean[] = $entry;
		}

		return self::resolve_roles( $clean );
	}

	/**
	 * The typography token block, mapping each role to the family that holds it.
	 *
	 * One source for two consumers: the generated stylesheet, so a site without
	 * Automatic.css still gets the tokens Etch's own docs ask for, and the inline
	 * style printed after ACSS, so a site with it wins on order rather than on
	 * !important. The mapping that was removed in 0.17.0 wrote !important because
	 * it loaded first and had no other way through.
	 *
	 * Points at var(--efm-family-slug) rather than repeating the stack, so the
	 * fallbacks and any tuned instance stay defined in exactly one place.
	 *
	 * @param array|null $families Optional families. Defaults to stored data.
	 * @return string CSS, empty when no family holds a role.
	 */
	public static function token_css( $families = null ) {
		if ( null === $families ) {
			$families = self::families();
		}

		$lines = '';
		$rules = '';

		foreach ( self::ROLES as $role ) {
			foreach ( $families as $family ) {
				if ( ! in_array( $role, (array) ( $family['roles'] ?? array() ), true ) ) {
					continue;
				}

				if ( empty( $family['variants'] ) || empty( $family['enabled'] ) || ! empty( $family['trashed'] ) ) {
					continue;
				}

				$slug = self::family_slug( $family['name'] ?? '' );

				if ( '' === $slug ) {
					continue;
				}

				$lines .= "\t--{$role}-font-family: var(--efm-family-{$slug});\n";

				/*
				 * The rule that makes the token mean something. Declaring the custom
				 * property alone was the whole feature until now, and measured on a
				 * live site nothing read it: Automatic.css only emits its own rule
				 * once its Typography section is configured, and a site without ACSS
				 * has nobody to read it at all. "Use for headings" was a switch that
				 * changed no pixels.
				 *
				 * These are the same selectors Automatic.css uses, so on a configured
				 * ACSS site the two rules agree and the duplicate is inert.
				 */
				$rules .= implode( ', ', self::ROLE_SELECTORS[ $role ] ) .
					" {\n\tfont-family: var(--{$role}-font-family);\n}\n\n";
				break;
			}
		}

		if ( '' === $lines ) {
			return '';
		}

		return "/* Typography tokens, as Etch documents them and Automatic.css reads them */\n:root {\n" . $lines . "}\n\n" . $rules;
	}

	/**
	 * Sanitize the origin recorded on a family.
	 *
	 * An unrecognised value is discarded and derived instead, so a record can
	 * never claim an origin the plugin does not know how to act on.
	 *
	 * @param array $family     Raw family.
	 * @param bool  $has_google Whether the sanitized Google block is non-empty.
	 * @return string One of self::SOURCES.
	 */
	public static function sanitize_source( $family, $has_google = false ) {
		$source = strtolower( sanitize_key( $family['source'] ?? '' ) );

		if ( in_array( $source, self::SOURCES, true ) ) {
			return $source;
		}

		return self::derive_source( $family, $has_google );
	}

	/**
	 * Work out where a family's files came from.
	 *
	 * The Google block is the reliable signal: the installer writes the chosen
	 * subsets, the available cuts and the axis onto every family it downloads,
	 * and nothing else ever writes one. An earlier note in this project said
	 * origin could only be guessed from the file name, which is true only for
	 * records older than that block.
	 *
	 * Everything else is treated as an upload, because the uploader and a
	 * bundled import are the only other ways a file reaches the fonts folder.
	 * That is also the conservative answer: "upload" is what leaves the offer
	 * to delete the files switched off.
	 *
	 * @param array $family     Raw family.
	 * @param bool  $has_google Whether the sanitized Google block is non-empty.
	 * @return string One of self::SOURCES.
	 */
	public static function derive_source( $family, $has_google = false ) {
		if ( $has_google || ! empty( $family['google'] ) ) {
			return 'google';
		}

		return 'upload';
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
	 * Sanitize a font-variation-settings value.
	 *
	 * Rebuilt from what is recognised rather than filtered, because this string is
	 * printed into a stylesheet: anything not matching a quoted four-character tag
	 * followed by a number is dropped rather than escaped, so no brace, semicolon
	 * or comment marker can reach the file through it.
	 *
	 * @param mixed $value Raw value.
	 * @return string Normalised value, or an empty string.
	 */
	protected static function sanitize_variation( $value ) {
		$value = trim( (string) $value );

		if ( '' === $value ) {
			return '';
		}

		$parts = array();
		$seen  = array();

		foreach ( explode( ',', $value ) as $piece ) {
			if ( ! preg_match( '/^\s*"([A-Za-z0-9]{4})"\s+(-?\d+(?:\.\d+)?)\s*$/', $piece, $found ) ) {
				continue;
			}

			$tag = $found[1];

			if ( isset( $seen[ $tag ] ) ) {
				continue;
			}

			$number = $found[2];

			/*
			 * Trailing zeros go only when there is a decimal point to lose them
			 * after. Trimming unconditionally turns 100 into 1.
			 */
			if ( false !== strpos( $number, '.' ) ) {
				$number = rtrim( rtrim( $number, '0' ), '.' );
			}

			$seen[ $tag ] = true;
			$parts[]      = '"' . $tag . '" ' . $number;
		}

		return implode( ', ', $parts );
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

		/*
		 * The family's variation axes, kept so the panel can offer the same sliders
		 * after an install that the type tester offered before one. 'axis' below
		 * records only the weight range, which is what the cut list needs; a face
		 * can also carry optical size, slant, width and anything else its designer
		 * drew, and none of that survived the install.
		 *
		 * Only Google installs can fill this. An uploaded font would have to be read
		 * back off disk to find its fvar table, and the panel converts to WOFF2
		 * without being able to convert back, so an installed file is closed to it.
		 */
		$axes = array();

		foreach ( (array) ( $google['axes'] ?? array() ) as $axis ) {
			$tag = preg_replace( '/[^A-Za-z0-9]/', '', (string) ( $axis['tag'] ?? '' ) );

			if ( 4 !== strlen( (string) $tag ) ) {
				continue;
			}

			$axes[] = array(
				'tag' => $tag,
				'min' => (float) ( $axis['min'] ?? 0 ),
				'max' => (float) ( $axis['max'] ?? 0 ),
				'def' => (float) ( $axis['def'] ?? 0 ),
			);
		}

		if ( ! empty( $axes ) ) {
			$clean['axes'] = $axes;
		}

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
	 * Axes known for every stored file, keyed by file name.
	 *
	 * @return array
	 */
	public static function file_axes() {
		$stored = get_option( self::OPTION_AXES, array() );

		return is_array( $stored ) ? $stored : array();
	}

	/**
	 * Record the axes read from one file.
	 *
	 * An empty list is stored rather than dropped: it is the difference between
	 * "this font has no axes" and "nobody has looked", and the family editor says
	 * something different for each.
	 *
	 * @param string $filename Stored file name.
	 * @param array  $axes     Axis records.
	 * @return array The stored list.
	 */
	public static function set_file_axes( $filename, $axes ) {
		$name = sanitize_file_name( (string) $filename );

		if ( '' === $name ) {
			return array();
		}

		$stored          = self::file_axes();
		$clean           = self::sanitize_axes( $axes );
		$stored[ $name ] = $clean;

		update_option( self::OPTION_AXES, $stored, false );

		return $clean;
	}

	/**
	 * Forget the axes recorded for a file.
	 *
	 * @param string $filename Stored file name.
	 */
	public static function forget_file_axes( $filename ) {
		$name   = sanitize_file_name( (string) $filename );
		$stored = self::file_axes();

		if ( ! array_key_exists( $name, $stored ) ) {
			return;
		}

		unset( $stored[ $name ] );
		update_option( self::OPTION_AXES, $stored, false );
	}

	/**
	 * Sanitise a list of axis records.
	 *
	 * The panel reads these out of a font file in the browser, so they arrive as
	 * user input and are treated as such. Floats throughout: opsz and wdth are
	 * fractional on real families -- Noto Sans opens at wdth 62.5 -- and an int
	 * cast would quietly shrink the range.
	 *
	 * @param mixed $axes Candidate records.
	 * @return array
	 */
	protected static function sanitize_axes( $axes ) {
		$clean = array();

		foreach ( (array) $axes as $axis ) {
			if ( ! is_array( $axis ) ) {
				continue;
			}

			$tag = isset( $axis['tag'] ) ? (string) $axis['tag'] : '';

			// A tag is four characters by definition, and only ever printable ASCII.
			if ( ! preg_match( '/^[ -~]{4}$/', $tag ) ) {
				continue;
			}

			$clean[] = array(
				'tag' => $tag,
				'min' => (float) ( $axis['min'] ?? 0 ),
				'max' => (float) ( $axis['max'] ?? 0 ),
				'def' => (float) ( $axis['def'] ?? 0 ),
			);
		}

		return $clean;
	}

	/**
	 * List every font file in the folder.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public static function files() {
		$dir = self::dir();

		if ( ! self::storage_is_safe() || ! is_dir( $dir ) ) {
			return array();
		}

		$axes  = self::file_axes();
		$files = array();

		foreach ( new DirectoryIterator( $dir ) as $file ) {
			if ( $file->isDot() || $file->isDir() || ! self::path_is_inside( $file->getPathname() ) ) {
				continue;
			}

			$ext = strtolower( $file->getExtension() );
			if ( ! isset( self::FORMATS[ $ext ] ) ) {
				continue;
			}

			$guess = self::guess_variant( $file->getFilename() );

			$record = array(
				'name'   => $file->getFilename(),
				'ext'    => $ext,
				'size'   => $file->getSize(),
				'url'    => self::url() . $file->getFilename(),
				'weight' => $guess['weight'],
				'style'  => $guess['style'],
			);

			// Present only once something has looked, so the panel can tell an
			// unread file from one that genuinely has no axes.
			if ( array_key_exists( $record['name'], $axes ) ) {
				$record['axes'] = $axes[ $record['name'] ];
			}

			$files[] = $record;
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

		return self::looks_like_font( (string) $header, $ext );
	}

	/**
	 * Does a run of bytes start with the signature for this font format?
	 *
	 * Used for bundled import data, which never touches disk until it has been
	 * checked, as well as for files already written.
	 *
	 * @param string $bytes Leading bytes of the file.
	 * @param string $ext   Expected extension.
	 * @return bool
	 */
	public static function looks_like_font( $bytes, $ext ) {
		if ( strlen( (string) $bytes ) < 4 ) {
			return false;
		}

		$signature = substr( $bytes, 0, 4 );

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

		/*
		 * A font already on disk is not uploaded again. The same file used to land
		 * beside itself under a random suffix, so uploading a folder twice doubled
		 * the library and left the Upload screen listing several names for one face
		 * with no way to tell which a family was mapped to.
		 *
		 * Matched on contents rather than on file name, because the name is the part
		 * that varies: the same face arrives as Inter-Regular.woff2 from one source
		 * and inter-regular.woff2 from another, and a converted TTF is renamed by the
		 * converter before it ever gets here.
		 */
		$twin = self::file_with_contents( $file['tmp_name'], (int) $file['size'] );

		if ( '' !== $twin ) {
			$existing = self::describe_file( $twin );

			$existing['duplicate'] = true;

			return $existing;
		}

		$filename    = sanitize_file_name( $file['name'] );
		$destination = self::dir() . $filename;

		/*
		 * A different font under a name already taken still gets the suffix. Only an
		 * identical file is refused, and that case has already returned above.
		 */
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
	 * A file already in the fonts folder holding exactly these bytes.
	 *
	 * Size first, hash second: fonts are hundreds of kilobytes and a library can
	 * hold a hundred of them, so reading every one on every upload would be work
	 * done to answer a question the file size settles for nearly all of them.
	 * Only same-size candidates are hashed, and a hash match on equal sizes is the
	 * duplicate.
	 *
	 * @param string $path Path to the incoming file.
	 * @param int    $size Its size in bytes.
	 * @return string Existing file name, or '' when there is no twin.
	 */
	protected static function file_with_contents( $path, $size ) {
		if ( ! is_readable( $path ) || $size <= 0 ) {
			return '';
		}

		$hash = '';

		foreach ( self::files() as $file ) {
			if ( (int) $file['size'] !== $size ) {
				continue;
			}

			// Deferred until a candidate exists, so a library of unique sizes never
			// hashes the incoming file at all.
			if ( '' === $hash ) {
				$hash = (string) md5_file( $path );

				if ( '' === $hash ) {
					return '';
				}
			}

			$twin = self::dir() . $file['name'];

			if ( self::path_is_inside( $twin ) && (string) md5_file( $twin ) === $hash ) {
				return $file['name'];
			}
		}

		return '';
	}

	/**
	 * One file described the way files() describes it.
	 *
	 * @param string $filename File name, already known to be in the folder.
	 * @return array<string,mixed> Entry, or an empty array when it is gone.
	 */
	public static function describe_file( $filename ) {
		foreach ( self::files() as $file ) {
			if ( $file['name'] === $filename ) {
				return $file;
			}
		}

		return array();
	}

	/**
	 * The files this plugin can prove are its own.
	 *
	 * The fonts folder is shared on purpose -- Etch and the legacy Etch Custom
	 * Fonts plugin both use it, which is what makes a legacy import work without
	 * moving anything. So a full removal cannot simply empty the folder: it would
	 * take another plugin's typography with it.
	 *
	 * On multisite only isolated site copies are eligible; mapping a shared
	 * original never proves exclusive ownership. Anything else in there
	 * may be ours, may be Etch's, and there is no way to tell from the outside, so
	 * it stays. Unused uploads are cleared from Import & export instead, where the
	 * list is on screen and the choice is deliberate.
	 *
	 * @return string[] Absolute paths, the generated stylesheet included.
	 */
	public static function owned_files() {
		$paths = self::path_is_inside( self::css_path() ) ? array( self::css_path() ) : array();

		foreach ( self::families() as $family ) {
			foreach ( (array) ( $family['variants'] ?? array() ) as $variant ) {
				$name = sanitize_file_name( $variant['file'] ?? '' );

				if ( '' === $name ) {
					continue;
				}

				$path = self::dir() . $name;

				if ( self::path_is_inside( $path ) && ! in_array( $path, $paths, true ) ) {
					$paths[] = $path;
				}
			}
		}

		return $paths;
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
	 * Whether a variant's file is actually on disk.
	 *
	 * A record can outlive its file. An export without the font files bundled in
	 * carries the mapping and none of the bytes, so importing it writes families
	 * that reference names nothing has ever written.
	 *
	 * @param string $file Stored file name.
	 * @return bool
	 */
	public static function file_present( $file ) {
		$file = (string) $file;

		if ( '' === $file ) {
			return false;
		}

		$path = self::dir() . $file;

		return self::path_is_inside( $path ) && file_exists( $path );
	}

	/**
	 * File names referenced by a family but absent from the fonts folder.
	 *
	 * @param array|null $families Optional families. Defaults to stored data.
	 * @return array List of file names.
	 */
	public static function missing_files( $families = null ) {
		if ( null === $families ) {
			$families = self::families();
		}

		$missing = array();

		foreach ( $families as $family ) {
			foreach ( (array) ( $family['variants'] ?? array() ) as $variant ) {
				$file = (string) ( $variant['file'] ?? '' );

				if ( '' === $file || isset( $missing[ $file ] ) ) {
					continue;
				}

				if ( ! self::file_present( $file ) ) {
					$missing[ $file ] = true;
				}
			}
		}

		return array_keys( $missing );
	}

	/**
	 * Build the @font-face CSS.
	 *
	 * @param array|null $families   Optional families. Defaults to stored data.
	 * @param bool       $relative   Use relative file URLs (for the static stylesheet).
	 * @param bool       $faces_only Stop after the font declarations, leaving out
	 *                               everything that styles a page. For the builder
	 *                               shell and the block editor, which are interfaces
	 *                               rather than pages.
	 * @return string
	 */
	public static function build_css( $families = null, $relative = false, $faces_only = false ) {
		if ( null === $families ) {
			$families = self::families();
		}

		$settings = self::settings();
		$css      = '/* Generated by Etch Font Manager v' . EFM_VERSION . " — do not edit, changes are overwritten. */\n\n";

		// Disabled and trashed families keep their records and files but produce
		// no output at all: no @font-face, no custom property, no preload.
		$families = self::active_families( $families );

		foreach ( $families as $family ) {
			if ( empty( $family['name'] ) || empty( $family['variants'] ) ) {
				continue;
			}

			/*
			 * Before the real faces, because it is the one that renders first. A
			 * local face carrying this font's vertical metrics, so the line boxes are
			 * already the right height while the web font is still downloading and
			 * nothing moves when it arrives.
			 */
			$css .= self::fallback_face_css( $family );

			foreach ( $family['variants'] as $variant ) {
				if ( empty( $variant['file'] ) ) {
					continue;
				}

				/*
				 * A rule pointing at a file that is not there is worse than no rule.
				 * It declares the family, so the browser accepts font-family and then
				 * falls back silently when the request 404s, which is why an import
				 * without bundled files looked installed in a browser already holding
				 * the face and rendered as the fallback in a clean one.
				 */
				if ( ! self::file_present( $variant['file'] ) ) {
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

			/*
			 * A second token beside the stack, so an instance can be applied wherever
			 * the family already is. Without it the tuning would only reach the
			 * family's own selector, and every site using var(--efm-family-slug) in a
			 * rule of its own would silently get the default instance instead.
			 */
			$variation = self::sanitize_variation( $family['variation'] ?? '' );

			if ( '' !== $variation ) {
				$tokens .= "\t--efm-family-{$slug}-variation: {$variation};\n";
			}
		}

		if ( '' !== $tokens ) {
			$css .= "/* One custom property per family, so a family can be used as var(--efm-family-slug) */\n:root {\n" . $tokens . "}\n\n";
		}

		/*
		 * Everything above declares fonts. Everything below styles a page with them,
		 * and that is the difference this flag draws.
		 *
		 * The Etch builder shell is a front-end request, so this stylesheet loads
		 * there like anywhere else -- and once the typography tokens started writing
		 * a real rule, "body, p, li, a, button" reached straight into Etch's own
		 * interface and restyled it. The same was quietly true of any Apply to that
		 * named a bare element. The canvas iframe and the real front end still get
		 * the lot, because both are the page; the builder chrome and the block
		 * editor get the faces and the family variables and nothing that paints.
		 */
		if ( $faces_only ) {

			/**
			 * Filter the generated font CSS.
			 *
			 * @param string $css      Generated CSS.
			 * @param array  $families Font families.
			 */
			return apply_filters( 'efm_font_css', $css, $families );
		}

		$css .= self::token_css( $families );

		$applied = '';

		foreach ( $families as $family ) {
			if ( empty( $family['name'] ) || empty( $family['variants'] ) || empty( $family['selector'] ) ) {
				continue;
			}

			$selector = self::applied_selector( $family, $families );

			if ( '' === $selector ) {
				continue;
			}

			// An escape hatch, so a rule does not lose to a theme silently.
			$important = empty( $family['force'] ) ? '' : ' !important';

			$applied .= $selector . " {\n\tfont-family: " . self::family_stack( $family ) . $important . ";\n";

			/*
			 * Here rather than in the @font-face rule above, which is where it looks
			 * like it belongs and where it does nothing. Measured in Chrome against a
			 * real variable face: a @font-face carrying font-variation-settings
			 * "wght" 900 rendered identically to one carrying none, at the same
			 * 229.29px, while genuine weight 900 measured 240.05px. Declared on the
			 * element the instance actually applies.
			 */
			$variation = self::sanitize_variation( $family['variation'] ?? '' );

			if ( '' !== $variation ) {
				$applied .= "\tfont-variation-settings: {$variation}{$important};\n";
			}

			$applied .= "}\n\n";
		}

		if ( '' !== $applied ) {
			$css .= "/* Families applied to their own selectors */\n" . $applied;
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

		// The inline copy is keyed on the file's timestamp, but deleting it here
		// means a rewrite within the same second cannot serve a stale build.
		delete_transient( self::TRANSIENT_INLINE );

		return self::write_file( self::css_path(), self::build_css( null, true ) );
	}
}
