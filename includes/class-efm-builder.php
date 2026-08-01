<?php
/**
 * Front-end delivery and Etch builder integration.
 *
 * @package EtchFontManager
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class EFM_Builder
 */
class EFM_Builder {

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue_fonts' ), 20 );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue_panel' ), 30 );
		add_action( 'enqueue_block_assets', array( __CLASS__, 'enqueue_fonts' ), 20 );

		/*
		 * Etch canvas iframe.
		 *
		 * Only the filter is used. Etch renders the canvas stylesheet list with a
		 * keyed each block keyed by `id`, and it also collects styles enqueued on
		 * `etch/canvas/enqueue_assets` into that same list using the style handle
		 * as the id. Registering through both paths puts two entries with the id
		 * `efm-fonts` into the list, which throws svelte `each_key_duplicate` and
		 * takes down the whole builder canvas.
		 */
		add_filter( 'etch/canvas/additional_stylesheets', array( __CLASS__, 'canvas_stylesheets' ) );

		// Expose families to the block editor font pickers (names only, no duplicate @font-face).
		add_filter( 'wp_theme_json_data_theme', array( __CLASS__, 'register_theme_json_fonts' ) );
	}

	/**
	 * Is the current request the Etch builder shell?
	 *
	 * @return bool
	 */
	public static function is_builder_request() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$etch = isset( $_GET['etch'] ) ? sanitize_text_field( wp_unslash( $_GET['etch'] ) ) : '';

		return 'magic' === $etch;
	}

	/**
	 * Is Automatic.css active?
	 *
	 * @return bool
	 */
	public static function acss_active() {
		return defined( 'ACSS_VERSION' ) || defined( 'AUTOMATIC_CSS_VERSION' ) || class_exists( 'Automatic_CSS\Plugin' );
	}

	/**
	 * Enqueue the generated font stylesheet.
	 */
	public static function enqueue_fonts() {
		if ( ! file_exists( EFM_Fonts::css_path() ) ) {
			return;
		}

		wp_enqueue_style(
			'efm-fonts',
			EFM_Fonts::css_url(),
			array(),
			EFM_Fonts::css_version()
		);
	}

	/**
	 * Enqueue the in-builder Fonts panel for capable users.
	 */
	public static function enqueue_panel() {
		if ( ! self::is_builder_request() || ! current_user_can( EFM_Rest::capability() ) ) {
			return;
		}

		$panel_css = EFM_DIR . 'assets/panel.css';
		$panel_js  = EFM_DIR . 'assets/panel.js';

		wp_enqueue_style(
			'efm-panel',
			EFM_URL . 'assets/panel.css',
			array(),
			file_exists( $panel_css ) ? filemtime( $panel_css ) : EFM_VERSION
		);
		wp_enqueue_script(
			'efm-panel',
			EFM_URL . 'assets/panel.js',
			array(),
			file_exists( $panel_js ) ? filemtime( $panel_js ) : EFM_VERSION,
			true
		);

		/**
		 * Filter where the Fonts control is placed in the Etch Settings Bar.
		 *
		 * Accepted values: after-dark-mode, top-start, top-end, center-start,
		 * center-end, bottom-start, bottom-end.
		 *
		 * @param string $placement Placement key.
		 */
		$placement = apply_filters( 'efm_control_placement', 'after-dark-mode' );

		/**
		 * Filter the Iconify icon used for the Fonts control.
		 *
		 * @param string $icon Iconify icon name.
		 */
		$icon = apply_filters( 'efm_control_icon', 'ph:text-aa-duotone' );

		wp_localize_script(
			'efm-panel',
			'efmConfig',
			array(
				'root'      => esc_url_raw( rest_url( EFM_Rest::NAMESPACE_V1 ) ),
				'nonce'     => wp_create_nonce( 'wp_rest' ),
				'placement' => $placement,
				'icon'      => $icon,
				'state'     => EFM_Rest::state(),
				'i18n'      => self::strings(),
			)
		);
	}

	/**
	 * Translatable strings for the panel.
	 *
	 * @return array<string,string>
	 */
	protected static function strings() {
		return array(
			'fonts'          => __( 'Fonts', 'etch-font-manager' ),
			'library'        => __( 'Library', 'etch-font-manager' ),
			'add'            => __( 'Add', 'etch-font-manager' ),
			'theme'          => __( 'Theme', 'etch-font-manager' ),
			'close'          => __( 'Close', 'etch-font-manager' ),
			'noFamilies'     => __( 'No font families yet.', 'etch-font-manager' ),
			'noFamiliesHint' => __( 'Upload a font file or install one from Google Fonts.', 'etch-font-manager' ),
			'newFamily'      => __( 'New family', 'etch-font-manager' ),
			'familyName'     => __( 'Family name', 'etch-font-manager' ),
			'addVariant'     => __( 'Add variant', 'etch-font-manager' ),
			'removeFamily'   => __( 'Remove family', 'etch-font-manager' ),
			'removeVariant'  => __( 'Remove variant', 'etch-font-manager' ),
			'variants'       => __( 'variants', 'etch-font-manager' ),
			'variant'        => __( 'variant', 'etch-font-manager' ),
			'save'           => __( 'Save changes', 'etch-font-manager' ),
			'saving'         => __( 'Saving…', 'etch-font-manager' ),
			'saved'          => __( 'Fonts saved.', 'etch-font-manager' ),
			'discard'        => __( 'Discard', 'etch-font-manager' ),
			'upload'         => __( 'Upload font files', 'etch-font-manager' ),
			'uploadHint'     => __( 'Drop woff2, woff, ttf or otf files here, or click to browse.', 'etch-font-manager' ),
			'uploading'      => __( 'Uploading…', 'etch-font-manager' ),
			'uploaded'       => __( 'Uploaded', 'etch-font-manager' ),
			'files'          => __( 'Uploaded files', 'etch-font-manager' ),
			'noFiles'        => __( 'No files uploaded yet.', 'etch-font-manager' ),
			'deleteFile'     => __( 'Delete file', 'etch-font-manager' ),
			'googleFonts'    => __( 'Google Fonts', 'etch-font-manager' ),
			'searchGoogle'   => __( 'Search Google Fonts', 'etch-font-manager' ),
			'searching'      => __( 'Searching…', 'etch-font-manager' ),
			'noResults'      => __( 'No fonts found.', 'etch-font-manager' ),
			'install'        => __( 'Install', 'etch-font-manager' ),
			'installing'     => __( 'Installing…', 'etch-font-manager' ),
			'installed'      => __( 'Installed', 'etch-font-manager' ),
			'headingFont'    => __( 'Heading font', 'etch-font-manager' ),
			'textFont'       => __( 'Text font', 'etch-font-manager' ),
			'acssMapping'    => __( 'Automatic.css mapping', 'etch-font-manager' ),
			'acssHint'       => __( 'Maps the selected families to --heading-font-family and --text-font-family.', 'etch-font-manager' ),
			'acssMissing'    => __( 'Automatic.css was not detected. The variables are still written, so any framework using them will pick them up.', 'etch-font-manager' ),
			'none'           => __( 'None', 'etch-font-manager' ),
			'weight'         => __( 'Weight', 'etch-font-manager' ),
			'style'          => __( 'Style', 'etch-font-manager' ),
			'file'           => __( 'File', 'etch-font-manager' ),
			'normal'         => __( 'Normal', 'etch-font-manager' ),
			'italic'         => __( 'Italic', 'etch-font-manager' ),
			'confirmDelete'  => __( 'Delete this file from the fonts folder?', 'etch-font-manager' ),
			'error'          => __( 'Something went wrong.', 'etch-font-manager' ),
			'unsaved'        => __( 'Unsaved changes', 'etch-font-manager' ),
			'preview'        => __( 'The quick brown fox', 'etch-font-manager' ),
		);
	}

	/**
	 * Add the generated stylesheet to the Etch canvas iframe.
	 *
	 * @param array $stylesheets Registered stylesheets.
	 * @return array
	 */
	public static function canvas_stylesheets( $stylesheets ) {
		if ( ! is_array( $stylesheets ) || ! file_exists( EFM_Fonts::css_path() ) ) {
			return $stylesheets;
		}

		$css_url = EFM_Fonts::css_url();

		// The list is rendered by a keyed each block; never register twice.
		foreach ( $stylesheets as $stylesheet ) {
			$existing_id  = is_array( $stylesheet ) ? ( $stylesheet['id'] ?? '' ) : '';
			$existing_url = is_array( $stylesheet ) ? ( $stylesheet['url'] ?? '' ) : '';

			if ( 'efm-fonts' === $existing_id || ( $existing_url && false !== strpos( $existing_url, EFM_Fonts::CSS_FILENAME ) ) ) {
				return $stylesheets;
			}
		}

		$stylesheets[] = array(
			'id'  => 'efm-fonts',
			'url' => add_query_arg( 'ver', EFM_Fonts::css_version(), $css_url ),
		);

		return $stylesheets;
	}

	/**
	 * Register font family names in theme.json so block editor pickers list them.
	 *
	 * No fontFace/src is provided, so WordPress will not emit duplicate
	 * @font-face rules; this plugin's stylesheet already loads the files.
	 *
	 * @param WP_Theme_JSON_Data $theme_json Theme JSON data.
	 * @return WP_Theme_JSON_Data
	 */
	public static function register_theme_json_fonts( $theme_json ) {
		$families = EFM_Fonts::families();

		if ( empty( $families ) || ! is_object( $theme_json ) || ! method_exists( $theme_json, 'update_with' ) ) {
			return $theme_json;
		}

		$entries = array();

		foreach ( $families as $family ) {
			if ( empty( $family['name'] ) ) {
				continue;
			}

			$entries[] = array(
				'fontFamily' => '"' . $family['name'] . '"',
				'name'       => $family['name'],
				'slug'       => sanitize_title( $family['name'] ),
			);
		}

		if ( empty( $entries ) ) {
			return $theme_json;
		}

		return $theme_json->update_with(
			array(
				'version'  => 2,
				'settings' => array(
					'typography' => array(
						'fontFamilies' => $entries,
					),
				),
			)
		);
	}
}
