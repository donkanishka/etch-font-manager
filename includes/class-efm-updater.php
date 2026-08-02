<?php
/**
 * Updates delivered from GitHub releases.
 *
 * The plugin is distributed outside wordpress.org, so it plugs into the normal
 * update pipeline itself: it reports the latest published release, serves the
 * details modal, and renames the extracted folder so WordPress updates the
 * existing installation instead of creating a second copy.
 *
 * @package EtchFontManager
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class EFM_Updater
 */
class EFM_Updater {

	const CACHE_KEY = 'efm_github_release';

	/*
	 * WordPress asks plugins for update information on its own schedule:
	 * roughly hourly on the Plugins screen, about every minute on the Updates
	 * screen, and twice daily on cron. This cache only applies when WordPress
	 * asks, so a short window mainly benefits the Updates screen.
	 *
	 * Six hours is a deliberately conservative default for public use: the
	 * routine check reads a manifest from the raw CDN, and both the manual
	 * check and a forced check bypass this cache, so an active check is always
	 * live. Lower it with efm_release_cache_ttl on sites you control.
	 */
	const CACHE_TTL = 21600; // 6 hours.
	const BACKOFF   = 900;   // 15 minutes after a failed lookup.

	/**
	 * Seconds to wait before retrying, when the API reported a rate limit.
	 *
	 * @var int
	 */
	protected static $retry_after = 0;

	/**
	 * Register hooks.
	 */
	public static function init() {
		/**
		 * Filter whether GitHub updates are offered at all.
		 *
		 * @param bool $enabled Default true.
		 */
		if ( ! apply_filters( 'efm_enable_updates', true ) ) {
			return;
		}

		add_filter( 'pre_set_site_transient_update_plugins', array( __CLASS__, 'inject_update' ) );
		add_filter( 'site_transient_update_plugins', array( __CLASS__, 'correct_stale_update' ) );
		add_filter( 'plugins_api', array( __CLASS__, 'plugin_details' ), 20, 3 );
		add_filter( 'upgrader_source_selection', array( __CLASS__, 'rename_source' ), 10, 4 );
		add_action( 'upgrader_process_complete', array( __CLASS__, 'flush_cache' ), 10, 0 );
		add_filter( 'plugin_action_links_' . self::plugin_file(), array( __CLASS__, 'action_links' ) );
		add_action( 'admin_post_efm_check_updates', array( __CLASS__, 'handle_manual_check' ) );
		add_action( 'admin_notices', array( __CLASS__, 'checked_notice' ) );
	}

	/**
	 * Add a manual check to the plugin row.
	 *
	 * This is deliberately kept even though the Updates screen has its own
	 * "Check again". In testing, a forced core check did not always reach this
	 * plugin with a fresh lookup, while this action reliably clears both the
	 * release cache and the WordPress update transient before re-checking.
	 *
	 * @param string[] $links Row action links.
	 * @return string[]
	 */
	public static function action_links( $links ) {
		if ( ! current_user_can( 'update_plugins' ) ) {
			return $links;
		}

		$url = wp_nonce_url( admin_url( 'admin-post.php?action=efm_check_updates' ), 'efm_check_updates' );

		$links[] = '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Check for updates', 'etch-font-manager' ) . '</a>';

		return $links;
	}

	/**
	 * Drop the cached release and let WordPress rebuild the update list.
	 */
	public static function handle_manual_check() {
		if ( ! current_user_can( 'update_plugins' ) ) {
			wp_die( esc_html__( 'You are not allowed to check for updates.', 'etch-font-manager' ) );
		}

		check_admin_referer( 'efm_check_updates' );

		self::flush_cache();
		delete_site_transient( 'update_plugins' );
		wp_update_plugins();

		wp_safe_redirect( admin_url( 'plugins.php?efm-checked=1' ) );
		exit;
	}

	/**
	 * Confirm the manual check ran.
	 */
	public static function checked_notice() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( empty( $_GET['efm-checked'] ) ) {
			return;
		}

		$release = self::release();
		$message = ! empty( $release['version'] ) && version_compare( $release['version'], self::installed_version(), '>' )
			/* translators: %s: version number. */
			? sprintf( __( 'Etch Font Manager %s is available.', 'etch-font-manager' ), $release['version'] )
			: __( 'Etch Font Manager is up to date.', 'etch-font-manager' );

		echo '<div class="notice notice-info is-dismissible"><p>' . esc_html( $message ) . '</p></div>';
	}

	/**
	 * How long a release lookup stays cached, in seconds.
	 *
	 * @return int
	 */
	protected static function cache_ttl() {
		/**
		 * Filter the release cache lifetime in seconds.
		 *
		 * Raise this on hosts where many sites share an outbound IP, to stay
		 * inside GitHub's unauthenticated rate limit.
		 *
		 * @param int $ttl Seconds. Default 21600.
		 */
		$ttl = (int) apply_filters( 'efm_release_cache_ttl', self::CACHE_TTL );

		return max( 60, $ttl );
	}

	/**
	 * Repository the releases are read from.
	 *
	 * @return string owner/repo
	 */
	public static function repo() {
		/**
		 * Filter the GitHub repository used for updates.
		 *
		 * @param string $repo In owner/repo form.
		 */
		return (string) apply_filters( 'efm_updater_repo', 'donkanishka/etch-font-manager' );
	}

	/**
	 * Plugin basename, e.g. etch-font-manager/etch-font-manager.php.
	 *
	 * @return string
	 */
	public static function plugin_file() {
		return plugin_basename( EFM_FILE );
	}

	/**
	 * Installed directory name, which is also the slug WordPress uses.
	 *
	 * @return string
	 */
	public static function slug() {
		return dirname( self::plugin_file() );
	}

	/**
	 * Fetch (and cache) the latest published release.
	 *
	 * @param bool $force Bypass the cache.
	 * @return array Empty array when no usable release is available.
	 */
	public static function release( $force = false ) {
		$cached = get_transient( self::CACHE_KEY );

		// An existing transient is respected even when empty, so a failing
		// lookup is not repeated on every admin page load.
		if ( ! $force && false !== $cached ) {
			return is_array( $cached ) ? $cached : array();
		}

		self::$retry_after = 0;

		// The manifest is served by the raw CDN, which has no API rate limit.
		$release = self::fetch_manifest();

		if ( empty( $release['version'] ) ) {
			$release = self::fetch_api();
		}

		if ( empty( $release['version'] ) ) {
			/*
			 * A failed lookup must never discard a release we already know
			 * about. On a shared host that has exhausted the API rate limit
			 * that would silently hide an available update.
			 */
			$fallback = ( is_array( $cached ) && ! empty( $cached['version'] ) ) ? $cached : array();

			set_transient( self::CACHE_KEY, $fallback, self::backoff() );

			return $fallback;
		}

		set_transient( self::CACHE_KEY, $release, self::cache_ttl() );

		return $release;
	}

	/**
	 * Branch the update manifest is read from.
	 *
	 * @return string
	 */
	protected static function branch() {
		/**
		 * Filter the branch holding update.json.
		 *
		 * @param string $branch Branch name.
		 */
		return (string) apply_filters( 'efm_updater_branch', 'main' );
	}

	/**
	 * Read update.json from the raw CDN.
	 *
	 * GitHub's REST API allows only 60 unauthenticated requests an hour per IP,
	 * which is shared by every site behind that address. The raw CDN carries no
	 * such limit, so the routine check uses it and the API is only a fallback.
	 *
	 * @return array
	 */
	protected static function fetch_manifest() {
		$response = wp_remote_get(
			'https://raw.githubusercontent.com/' . self::repo() . '/' . self::branch() . '/update.json',
			array(
				'timeout' => 12,
				'headers' => array(
					'Accept'     => 'application/json',
					'User-Agent' => self::user_agent(),
				),
			)
		);

		if ( is_wp_error( $response ) || 200 !== (int) wp_remote_retrieve_response_code( $response ) ) {
			return array();
		}

		$data = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( empty( $data['version'] ) || empty( $data['package'] ) ) {
			return array();
		}

		$package = esc_url_raw( (string) $data['package'] );

		if ( ! self::is_trusted_package( $package ) ) {
			return array();
		}

		return array(
			'version' => sanitize_text_field( (string) $data['version'] ),
			'package' => $package,
			'url'     => esc_url_raw( (string) ( $data['url'] ?? '' ) ),
			'notes'   => (string) ( $data['notes'] ?? '' ),
			'date'    => sanitize_text_field( (string) ( $data['date'] ?? '' ) ),
		);
	}

	/**
	 * Read the latest release from the REST API.
	 *
	 * @return array
	 */
	protected static function fetch_api() {
		$response = wp_remote_get(
			'https://api.github.com/repos/' . self::repo() . '/releases/latest',
			array(
				'timeout' => 15,
				'headers' => array(
					'Accept'     => 'application/vnd.github+json',
					'User-Agent' => self::user_agent(),
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			return array();
		}

		$code = (int) wp_remote_retrieve_response_code( $response );

		if ( 200 !== $code ) {
			self::note_rate_limit( $response );

			return array();
		}

		$data = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( empty( $data['tag_name'] ) ) {
			return array();
		}

		$package = self::package_url( $data );

		if ( ! self::is_trusted_package( $package ) ) {
			return array();
		}

		return array(
			'version' => ltrim( (string) $data['tag_name'], 'vV' ),
			'package' => $package,
			'url'     => (string) ( $data['html_url'] ?? '' ),
			'notes'   => (string) ( $data['body'] ?? '' ),
			'date'    => (string) ( $data['published_at'] ?? '' ),
		);
	}

	/**
	 * User agent sent with update lookups.
	 *
	 * @return string
	 */
	protected static function user_agent() {
		return 'EtchFontManager/' . EFM_VERSION . '; ' . home_url( '/' );
	}

	/**
	 * Only ever hand WordPress a package from this repository's releases.
	 *
	 * @param string $package Package URL.
	 * @return bool
	 */
	protected static function is_trusted_package( $package ) {
		if ( empty( $package ) ) {
			return false;
		}

		$prefixes = array(
			'https://github.com/' . self::repo() . '/releases/download/',
			'https://api.github.com/repos/' . self::repo() . '/zipball/',
			'https://github.com/' . self::repo() . '/archive/',
		);

		foreach ( $prefixes as $prefix ) {
			if ( 0 === strpos( $package, $prefix ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Remember when the API said the rate limit resets.
	 *
	 * @param array $response HTTP response.
	 */
	protected static function note_rate_limit( $response ) {
		if ( '0' !== (string) wp_remote_retrieve_header( $response, 'x-ratelimit-remaining' ) ) {
			return;
		}

		$reset = (int) wp_remote_retrieve_header( $response, 'x-ratelimit-reset' );

		if ( $reset > time() ) {
			self::$retry_after = min( DAY_IN_SECONDS, $reset - time() + 60 );
		}
	}

	/**
	 * How long to wait after a failed lookup.
	 *
	 * @return int
	 */
	protected static function backoff() {
		return self::$retry_after > 0 ? self::$retry_after : self::BACKOFF;
	}

	/**
	 * Version currently on disk.
	 *
	 * EFM_VERSION is the constant defined by the copy of the plugin that was
	 * loaded at the start of the request. Immediately after an update the files
	 * on disk are newer than that constant, and comparing against the stale
	 * value makes WordPress believe the update still needs installing. Reading
	 * the header from disk avoids that.
	 *
	 * @return string
	 */
	public static function installed_version() {
		$data = get_file_data( EFM_FILE, array( 'Version' => 'Version' ) );

		return ! empty( $data['Version'] ) ? $data['Version'] : EFM_VERSION;
	}

	/**
	 * Drop a stored update entry that the installed version already satisfies.
	 *
	 * @param mixed $transient Update transient.
	 * @return mixed
	 */
	public static function correct_stale_update( $transient ) {
		if ( ! is_object( $transient ) || empty( $transient->response ) ) {
			return $transient;
		}

		$file = self::plugin_file();

		if ( ! isset( $transient->response[ $file ] ) ) {
			return $transient;
		}

		$offered = $transient->response[ $file ];

		if ( empty( $offered->new_version ) || version_compare( $offered->new_version, self::installed_version(), '>' ) ) {
			return $transient;
		}

		unset( $transient->response[ $file ] );

		if ( ! isset( $transient->no_update ) || ! is_array( $transient->no_update ) ) {
			$transient->no_update = array();
		}

		$transient->no_update[ $file ] = $offered;

		return $transient;
	}

	/**
	 * Is this an explicit "check again" request?
	 *
	 * WordPress clears its own update transient on force-check, so the plugin
	 * bypasses its release cache too. Without this a release published inside
	 * the six hour window stays invisible even when the user asks to re-check.
	 *
	 * @return bool
	 */
	protected static function is_forced_check() {
		if ( defined( 'WP_CLI' ) && WP_CLI ) {
			return true;
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		return isset( $_GET['force-check'] ) && current_user_can( 'update_plugins' );
	}

	/**
	 * Prefer an uploaded release asset over the generated source zipball.
	 *
	 * @param array $data Release payload.
	 * @return string
	 */
	protected static function package_url( $data ) {
		foreach ( (array) ( $data['assets'] ?? array() ) as $asset ) {
			$name = (string) ( $asset['name'] ?? '' );

			if ( ! empty( $asset['browser_download_url'] ) && '.zip' === strtolower( substr( $name, -4 ) ) ) {
				return (string) $asset['browser_download_url'];
			}
		}

		return (string) ( $data['zipball_url'] ?? '' );
	}

	/**
	 * Report the release to the WordPress update system.
	 *
	 * @param mixed $transient Update transient.
	 * @return mixed
	 */
	public static function inject_update( $transient ) {
		if ( ! is_object( $transient ) ) {
			return $transient;
		}

		$release = self::release( self::is_forced_check() );

		if ( empty( $release['version'] ) || empty( $release['package'] ) ) {
			return $transient;
		}

		$file = self::plugin_file();
		$item = (object) array(
			'id'           => 'github.com/' . self::repo(),
			'slug'         => self::slug(),
			'plugin'       => $file,
			'new_version'  => $release['version'],
			'url'          => $release['url'],
			'package'      => $release['package'],
			'tested'       => get_bloginfo( 'version' ),
			'requires_php' => '7.4',
			'icons'        => array(),
			'banners'      => array(),
			'banners_rtl'  => array(),
		);

		$installed = self::installed_version();

		if ( version_compare( $release['version'], $installed, '>' ) ) {
			$transient->response[ $file ] = $item;

			if ( isset( $transient->no_update[ $file ] ) ) {
				unset( $transient->no_update[ $file ] );
			}

			return $transient;
		}

		$item->new_version = $installed;

		if ( isset( $transient->response[ $file ] ) ) {
			unset( $transient->response[ $file ] );
		}

		$transient->no_update[ $file ] = $item;

		return $transient;
	}

	/**
	 * Serve the "View details" modal.
	 *
	 * @param mixed  $result Result from the plugins API.
	 * @param string $action Requested action.
	 * @param object $args   Request arguments.
	 * @return mixed
	 */
	public static function plugin_details( $result, $action, $args ) {
		if ( 'plugin_information' !== $action || empty( $args->slug ) || self::slug() !== $args->slug ) {
			return $result;
		}

		$release = self::release();

		if ( empty( $release['version'] ) ) {
			return $result;
		}

		$notes = trim( (string) $release['notes'] );

		return (object) array(
			'name'           => 'Etch Font Manager',
			'slug'           => self::slug(),
			'version'        => $release['version'],
			'author'         => '<a href="https://github.com/donkanishka">donkanishka</a>',
			'homepage'       => 'https://github.com/' . self::repo(),
			'download_link'  => $release['package'],
			'trunk'          => $release['package'],
			'requires'       => '6.0',
			'requires_php'   => '7.4',
			'tested'         => get_bloginfo( 'version' ),
			'last_updated'   => $release['date'],
			'sections'       => array(
				'description' => esc_html__( 'Manage self-hosted custom fonts without leaving the Etch builder.', 'etch-font-manager' ),
				'changelog'   => '' === $notes ? esc_html__( 'See the GitHub release notes.', 'etch-font-manager' ) : wpautop( wp_kses_post( $notes ) ),
			),
		);
	}

	/**
	 * Rename the extracted folder to the installed directory name.
	 *
	 * GitHub source zips extract to "owner-repo-hash", and release assets carry
	 * whatever folder they were built with, so without this WordPress would
	 * install a second copy alongside the active one.
	 *
	 * @param string $source        Extracted folder.
	 * @param string $remote_source Parent temporary folder.
	 * @param object $upgrader      Upgrader instance.
	 * @param array  $extra         Hook extras.
	 * @return string|WP_Error
	 */
	public static function rename_source( $source, $remote_source, $upgrader = null, $extra = array() ) {
		if ( empty( $extra['plugin'] ) || self::plugin_file() !== $extra['plugin'] ) {
			return $source;
		}

		global $wp_filesystem;

		$desired = trailingslashit( $remote_source ) . self::slug();

		if ( trailingslashit( $source ) === trailingslashit( $desired ) ) {
			return $source;
		}

		if ( ! $wp_filesystem || ! $wp_filesystem->move( $source, $desired, true ) ) {
			return $source;
		}

		return trailingslashit( $desired );
	}

	/**
	 * Drop the cached release after any upgrade run.
	 */
	public static function flush_cache() {
		delete_transient( self::CACHE_KEY );

		// Remove any entry the just-replaced copy left behind.
		$transient = get_site_transient( 'update_plugins' );

		if ( is_object( $transient ) && isset( $transient->response[ self::plugin_file() ] ) ) {
			unset( $transient->response[ self::plugin_file() ] );
			set_site_transient( 'update_plugins', $transient );
		}
	}
}
