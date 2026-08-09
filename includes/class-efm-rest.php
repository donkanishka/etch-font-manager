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
			'/css/regenerate',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'regenerate_css' ),
				'permission_callback' => $auth,
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/files/prune',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'prune_files' ),
				'permission_callback' => $auth,
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/export',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'export' ),
				'permission_callback' => $auth,
				'args'                => array(
					'families' => array(
						'type'    => 'array',
						'default' => array(),
						'items'   => array( 'type' => 'string' ),
					),
					'bundle'   => array(
						'type'    => 'boolean',
						'default' => false,
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/import',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'import' ),
				'permission_callback' => $auth,
				'args'                => array(
					'data' => array(
						'type'     => 'object',
						'required' => true,
					),
					'mode'    => array(
						'type'    => 'string',
						'default' => 'replace',
						'enum'    => array( 'replace', 'merge' ),
					),
					'preview' => array(
						'type'    => 'boolean',
						'default' => false,
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
					'subset'   => array(
						'type'    => 'string',
						'default' => '',
					),

					/*
					 * Tri-state, so it cannot be a boolean: '' means "do not filter",
					 * which a boolean would collapse into false and silently hide
					 * every variable family.
					 */
					'variable' => array(
						'type'    => 'string',
						'default' => '',
						'enum'    => array( '', '0', '1' ),
					),
					'sort'     => array(
						'type'    => 'string',
						'default' => 'popularity',
						'enum'    => array( 'popularity', 'alphabetical', 'trending', 'newest' ),
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
					'cuts'     => array(
						'type'    => 'array',
						'default' => array(),
						'items'   => array( 'type' => 'string' ),
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
		// The slug is derived, not stored. Sending it keeps the panel from having
		// to reimplement sanitize_title() and drift from the generated CSS.
		$families = array_map(
			static function ( $family ) {
				$family['slug'] = EFM_Fonts::family_slug( $family['name'] ?? '' );

				return $family;
			},
			EFM_Fonts::families()
		);

		return array(
			'families'   => $families,
			'files'      => EFM_Fonts::files(),
			'settings'   => EFM_Fonts::settings(),
			'fontsUrl'   => EFM_Fonts::url(),
			'cssUrl'     => EFM_Fonts::css_url(),
			'cssVersion' => EFM_Fonts::css_version(),
			'cssBuilt'   => EFM_Fonts::css_generated(),
			'version'    => EFM_VERSION,
			'unused'     => EFM_Fonts::unused_files(),
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
				'inline_css'   => (bool) $request->get_param( 'inline_css' ),
				'block_google' => (bool) $request->get_param( 'block_google' ),
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
	 * POST /css/regenerate
	 *
	 * @return WP_REST_Response|WP_Error
	 */
	public static function regenerate_css() {
		if ( ! EFM_Fonts::write_css_file() ) {
			return new WP_Error(
				'efm_css_write_failed',
				__( 'Could not write the stylesheet. Check that the fonts folder is writable.', 'etch-font-manager' ),
				array( 'status' => 500 )
			);
		}

		return rest_ensure_response( self::state() );
	}

	/**
	 * POST /files/prune
	 *
	 * @return WP_REST_Response
	 */
	public static function prune_files() {
		$report = EFM_Fonts::prune_files();

		return rest_ensure_response(
			array(
				'pruned' => $report,
				'state'  => self::state(),
			)
		);
	}

	/**
	 * GET /export
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function export( WP_REST_Request $request ) {
		return rest_ensure_response(
			EFM_Fonts::export_payload(
				(array) $request->get_param( 'families' ),
				(bool) $request->get_param( 'bundle' )
			)
		);
	}

	/**
	 * POST /import
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function import( WP_REST_Request $request ) {
		$report = EFM_Fonts::import_payload(
			(array) $request->get_param( 'data' ),
			(string) $request->get_param( 'mode' ),
			(bool) $request->get_param( 'preview' )
		);

		if ( is_wp_error( $report ) ) {
			return $report;
		}

		return rest_ensure_response(
			array(
				'report' => $report,
				'state'  => self::state(),
			)
		);
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
				'subset'   => (string) $request->get_param( 'subset' ),
				'variable' => (string) $request->get_param( 'variable' ),
				'sort'     => (string) $request->get_param( 'sort' ),
				'limit'    => (int) $request->get_param( 'limit' ),
				'offset'   => (int) $request->get_param( 'offset' ),
			)
		);

		if ( is_wp_error( $results ) ) {
			return $results;
		}

		$results['categories'] = EFM_Google_Fonts::categories();
		$results['subsetList'] = EFM_Google_Fonts::subsets();
		$results['axisNames']  = EFM_Google_Fonts::axis_registry();

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
			(bool) $request->get_param( 'variable' ),
			(array) $request->get_param( 'cuts' )
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
