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
	 * Ten minutes is a good default for a small number of sites. GitHub allows
	 * 60 unauthenticated requests an hour per IP, so raise this with the
	 * efm_release_cache_ttl filter when many sites share an outbound IP.
	 */
	const CACHE_TTL = 600; // 10 minutes.
	const BACKOFF   = 900; // 15 minutes after a failed lookup.

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
		 * @param int $ttl Seconds. Default 600.
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
		if ( ! $force ) {
			$cached = get_transient( self::CACHE_KEY );

			if ( is_array( $cached ) ) {
				return $cached;
			}
		}

		$response = wp_remote_get(
			'https://api.github.com/repos/' . self::repo() . '/releases/latest',
			array(
				'timeout' => 15,
				'headers' => array(
					'Accept'     => 'application/vnd.github+json',
					'User-Agent' => 'EtchFontManager/' . EFM_VERSION . '; ' . home_url( '/' ),
				),
			)
		);

		if ( is_wp_error( $response ) || 200 !== (int) wp_remote_retrieve_response_code( $response ) ) {
			set_transient( self::CACHE_KEY, array(), self::BACKOFF );

			return array();
		}

		$data = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( empty( $data['tag_name'] ) ) {
			set_transient( self::CACHE_KEY, array(), self::BACKOFF );

			return array();
		}

		$release = array(
			'version' => ltrim( (string) $data['tag_name'], 'vV' ),
			'package' => self::package_url( $data ),
			'url'     => (string) ( $data['html_url'] ?? '' ),
			'notes'   => (string) ( $data['body'] ?? '' ),
			'date'    => (string) ( $data['published_at'] ?? '' ),
		);

		set_transient( self::CACHE_KEY, $release, self::cache_ttl() );

		return $release;
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
