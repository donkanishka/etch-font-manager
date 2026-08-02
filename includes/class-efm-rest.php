<?php
/**
 * REST API used by the in-builder Fonts panel.
 *
 * @package EtchFontManager
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class EFM_Rest
 */
class EFM_Rest {

	const NAMESPACE_V1 = 'etch-font-manager/v1';

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * Capability required to manage fonts.
	 *
	 * @return string
	 */
	public static function capability() {
		/**
		 * Filter the capability required to manage fonts.
		 *
		 * @param string $capability Capability name.
		 */
		return apply_filters( 'efm_capability', 'manage_options' );
	}

	/**
	 * Permission callback.
	 *
	 * @return bool|WP_Error
	 */
	public static function can_manage() {
		if ( current_user_can( self::capability() ) ) {
			return true;
		}

		return new WP_Error(
			'efm_forbidden',
			__( 'You are not allowed to manage fonts.', 'etch-font-manager' ),
			array( 'status' => rest_authorization_required_code() )
		);
	}

	/**
	 * Register REST routes.
	 */
	public static function register_routes() {
		$auth = array( __CLASS__, 'can_manage' );

		register_rest_route(
			self::NAMESPACE_V1,
			'/state',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_state' ),
				'permission_callback' => $auth,
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/families',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'save_families' ),
				'permission_callback' => $auth,
				'args'                => array(
					'families' => array(
						'type'     => 'array',
						'required' => true,
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/settings',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'save_settings' ),
				'permission_callback' => $auth,
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/upload',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'upload' ),
				'permission_callback' => $auth,
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/files/delete',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'delete_file' ),
				'permission_callback' => $auth,
				'args'                => array(
					'filename' => array(
						'type'     => 'string',
						'required' => true,
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/google/search',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'google_search' ),
				'permission_callback' => $auth,
				'args'                => array(
					'query'    => array(
						'type'    => 'string',
						'default' => '',
					),
					'category' => array(
						'type'    => 'string',
						'default' => '',
					),
					'sort'     => array(
						'type'    => 'string',
						'default' => 'popularity',
						'enum'    => array( 'popularity', 'alphabetical' ),
					),
					'limit'    => array(
						'type'    => 'integer',
						'default' => 24,
					),
					'offset'   => array(
						'type'    => 'integer',
						'default' => 0,
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/google/install',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'google_install' ),
				'permission_callback' => $auth,
				'args'                => array(
					'family'  => array(
						'type'     => 'string',
						'required' => true,
					),
					'subsets'  => array(
						'type'    => 'array',
						'default' => array( 'latin' ),
						'items'   => array( 'type' => 'string' ),
					),
					'variable' => array(
						'type'    => 'boolean',
						'default' => false,
					),
				),
			)
		);
	}

	/**
	 * Build the payload the panel renders from.
	 *
	 * @return array
	 */
	public static function state() {
		return array(
			'families'   => EFM_Fonts::families(),
			'files'      => EFM_Fonts::files(),
			'settings'   => EFM_Fonts::settings(),
			'fontsUrl'   => EFM_Fonts::url(),
			'cssUrl'     => EFM_Fonts::css_url(),
			'cssVersion' => EFM_Fonts::css_version(),
			'acssActive' => EFM_Builder::acss_active(),
			'version'    => EFM_VERSION,
		);
	}

	/**
	 * GET /state
	 *
	 * @return WP_REST_Response
	 */
	public static function get_state() {
		return rest_ensure_response( self::state() );
	}

	/**
	 * POST /families
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function save_families( WP_REST_Request $request ) {
		EFM_Fonts::save_families( (array) $request->get_param( 'families' ) );

		return rest_ensure_response( self::state() );
	}

	/**
	 * POST /settings
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function save_settings( WP_REST_Request $request ) {
		EFM_Fonts::save_settings(
			array(
				'heading_font' => (string) $request->get_param( 'heading_font' ),
				'text_font'    => (string) $request->get_param( 'text_font' ),
				'acss_enabled' => (bool) $request->get_param( 'acss_enabled' ),
			)
		);

		return rest_ensure_response( self::state() );
	}

	/**
	 * POST /upload
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function upload( WP_REST_Request $request ) {
		$files = $request->get_file_params();
		$file  = $files['file'] ?? null;

		if ( empty( $file ) ) {
			return new WP_Error( 'efm_no_file', __( 'No file received.', 'etch-font-manager' ), array( 'status' => 400 ) );
		}

		$stored = EFM_Fonts::store_upload( $file );

		if ( is_wp_error( $stored ) ) {
			return $stored;
		}

		return rest_ensure_response(
			array(
				'file'  => $stored,
				'state' => self::state(),
			)
		);
	}

	/**
	 * POST /files/delete
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function delete_file( WP_REST_Request $request ) {
		$filename = (string) $request->get_param( 'filename' );
		$result   = EFM_Fonts::delete_file( $filename );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		// Drop variants that referenced the deleted file.
		$families = EFM_Fonts::families();
		$clean    = sanitize_file_name( $filename );

		foreach ( $families as $i => $family ) {
			if ( empty( $family['variants'] ) ) {
				continue;
			}

			$families[ $i ]['variants'] = array_values(
				array_filter(
					$family['variants'],
					static function ( $variant ) use ( $clean ) {
						return ( $variant['file'] ?? '' ) !== $clean;
					}
				)
			);
		}

		EFM_Fonts::save_families( $families );

		return rest_ensure_response( self::state() );
	}

	/**
	 * GET /google/search
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function google_search( WP_REST_Request $request ) {
		$results = EFM_Google_Fonts::search(
			(string) $request->get_param( 'query' ),
			array(
				'category' => (string) $request->get_param( 'category' ),
				'sort'     => (string) $request->get_param( 'sort' ),
				'limit'    => (int) $request->get_param( 'limit' ),
				'offset'   => (int) $request->get_param( 'offset' ),
			)
		);

		if ( is_wp_error( $results ) ) {
			return $results;
		}

		$results['categories'] = EFM_Google_Fonts::categories();

		return rest_ensure_response( $results );
	}

	/**
	 * POST /google/install
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function google_install( WP_REST_Request $request ) {
		$installed = EFM_Google_Fonts::install(
			(string) $request->get_param( 'family' ),
			(array) $request->get_param( 'subsets' ),
			(bool) $request->get_param( 'variable' )
		);

		if ( is_wp_error( $installed ) ) {
			return $installed;
		}

		return rest_ensure_response(
			array(
				'installed' => $installed,
				'state'     => self::state(),
			)
		);
	}
}
