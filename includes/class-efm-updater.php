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
	const CACHE_TTL = 21600; // 6 hours.
	const BACKOFF   = 1800;  // 30 minutes after a failed lookup.

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
		add_filter( 'plugins_api', array( __CLASS__, 'plugin_details' ), 20, 3 );
		add_filter( 'upgrader_source_selection', array( __CLASS__, 'rename_source' ), 10, 4 );
		add_action( 'upgrader_process_complete', array( __CLASS__, 'flush_cache' ), 10, 0 );
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

		set_transient( self::CACHE_KEY, $release, self::CACHE_TTL );

		return $release;
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

		$release = self::release();

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

		if ( version_compare( $release['version'], EFM_VERSION, '>' ) ) {
			$transient->response[ $file ] = $item;

			if ( isset( $transient->no_update[ $file ] ) ) {
				unset( $transient->no_update[ $file ] );
			}

			return $transient;
		}

		$item->new_version            = EFM_VERSION;
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
	}
}
