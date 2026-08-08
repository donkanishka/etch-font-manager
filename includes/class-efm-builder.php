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
		add_action( 'wp_head', array( __CLASS__, 'print_preloads' ), 1 );
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
	 * Print preload hints for families that asked for one.
	 *
	 * Runs early in wp_head so the browser can start the font request before it
	 * discovers the stylesheet. Fonts are always fetched in CORS mode, so the
	 * crossorigin attribute is required even though the file is same-origin.
	 */
	public static function print_preloads() {
		if ( is_admin() || self::is_builder_request() ) {
			return;
		}

		$types = array(
			'woff2' => 'font/woff2',
			'woff'  => 'font/woff',
			'ttf'   => 'font/ttf',
			'otf'   => 'font/otf',
		);

		foreach ( EFM_Fonts::preload_files() as $file ) {
			$type = $types[ $file['ext'] ] ?? 'font/woff2';

			printf(
				'<link rel="preload" href="%1$s" as="font" type="%2$s" crossorigin>' . "\n",
				esc_url( $file['url'] ),
				esc_attr( $type )
			);
		}
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
		 * Accepted values: top-start, top-end, center-start, center-end,
		 * bottom-start, bottom-end. Defaults to top-end, which appends the
		 * control to Etch's manager group (Content Hub, Templates, Asset
		 * Manager, Style Manager, Loop Manager).
		 *
		 * @param string $placement Placement key.
		 */
		$placement = apply_filters( 'efm_control_placement', 'top-end' );

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
			'back'           => __( 'Back', 'etch-font-manager' ),
			'manage'         => __( 'Manage', 'etch-font-manager' ),
			'manageFamily'   => __( 'Manage', 'etch-font-manager' ),
			'familyLabel'    => __( 'family', 'etch-font-manager' ),
			'familiesLabel'  => __( 'families', 'etch-font-manager' ),
			'fileLabel'      => __( 'file', 'etch-font-manager' ),
			'filesLabel'     => __( 'files', 'etch-font-manager' ),
			'filterFamilies' => __( 'Filter families', 'etch-font-manager' ),
			'noMatches'      => __( 'No families match that filter.', 'etch-font-manager' ),
			'noVariants'     => __( 'No variants mapped yet.', 'etch-font-manager' ),
			'previewText'    => __( 'Preview text', 'etch-font-manager' ),
			'previewSize'    => __( 'Preview size', 'etch-font-manager' ),
			'variable'       => __( 'variable', 'etch-font-manager' ),
			'type'           => __( 'Type', 'etch-font-manager' ),
			'size'           => __( 'Size', 'etch-font-manager' ),
			'googleHint'     => __( 'Search the Google Fonts library. Files are downloaded to your server, so visitors never call Google.', 'etch-font-manager' ),
			'subsets'        => __( 'Subsets', 'etch-font-manager' ),
			'weights'        => __( 'Weights', 'etch-font-manager' ),
			'cutsAll'        => __( 'All', 'etch-font-manager' ),
			'cutsNone'       => __( 'None', 'etch-font-manager' ),
			'recoverHint'    => __( 'These families came from Google Fonts, so their files can be fetched again with the same subsets and weights:', 'etch-font-manager' ),
			'recoverButton'  => __( 'Download missing Google fonts', 'etch-font-manager' ),
			'recovering'     => __( 'Downloading…', 'etch-font-manager' ),
			'recoverDone'    => __( 'Downloaded', 'etch-font-manager' ),
			'recoverFailed'  => __( 'Could not download:', 'etch-font-manager' ),
			'trash'          => __( 'Trash', 'etch-font-manager' ),
			'trashHint'      => __( 'These families are not loaded on the site. Their font files are still on the server, so restoring one brings it back exactly as it was.', 'etch-font-manager' ),
			'enableFamily'   => __( 'Enable', 'etch-font-manager' ),
			'disableFamily'  => __( 'Disable', 'etch-font-manager' ),
			'trashFamily'    => __( 'Move to trash', 'etch-font-manager' ),
			'restoreFamily'  => __( 'Restore', 'etch-font-manager' ),
			'deleteFamily'   => __( 'Delete permanently', 'etch-font-manager' ),
			'disabledNotice' => __( 'Disabled. Its files are kept, but it is not loaded on the site.', 'etch-font-manager' ),
			'familyEnabled'  => __( 'Load this family on the site', 'etch-font-manager' ),
			'familyEnabledHint' => __( 'Turn off to stop the font loading without deleting anything. Files and weight mapping are kept.', 'etch-font-manager' ),
			'confirmDeleteFamily' => __( 'Delete this family for good? Its font files stay on the server and can be removed from Import & export.', 'etch-font-manager' ),
			'confirmDisableAssigned' => __( 'This family is assigned as:', 'etch-font-manager' ),
			'confirmDisableAssignedHint' => __( 'Disabling it means that text falls back to another font. Continue?', 'etch-font-manager' ),
			'confirmTrashAssigned' => __( 'This family is assigned as:', 'etch-font-manager' ),
			'confirmTrashAssignedHint' => __( 'Moving it to the trash means that text falls back to another font. The assignment returns if you restore it. Continue?', 'etch-font-manager' ),
			'cssToken'       => __( 'CSS variable', 'etch-font-manager' ),
			'cssTokenHint'   => __( 'Use this anywhere a font family is expected. It already includes the fallback stack.', 'etch-font-manager' ),
			'googleSource'   => __( 'Google Fonts', 'etch-font-manager' ),
			'googleSubsets'  => __( 'Subsets', 'etch-font-manager' ),
			'applyCuts'      => __( 'Download selection', 'etch-font-manager' ),
			'variableNote'   => __( 'Installed as a variable font: one file per subset covering every weight.', 'etch-font-manager' ),
			'cleanupTitle'   => __( 'Unused files', 'etch-font-manager' ),
			'cleanupHint'    => __( 'These font files are on the server but no family uses them, usually from deselecting a weight. Deleting them frees space; the weight can be downloaded again at any time.', 'etch-font-manager' ),
			'cleanupNone'    => __( 'Every font file on the server is in use.', 'etch-font-manager' ),
			'cleanupButton'  => __( 'Delete unused files', 'etch-font-manager' ),
			'cleanupConfirm' => __( 'Delete these font files from the server?', 'etch-font-manager' ),
			'cleanupDone'    => __( 'Deleted', 'etch-font-manager' ),
			'tools'          => __( 'Import & export', 'etch-font-manager' ),
			'exportTitle'    => __( 'Export', 'etch-font-manager' ),
			'exportHint'     => __( 'Download every family, variant mapping and assignment as a JSON file. Font files are not included; a family installed from Google can be reinstalled on the other site.', 'etch-font-manager' ),
			'exportButton'   => __( 'Download configuration', 'etch-font-manager' ),
			'exported'       => __( 'Configuration downloaded.', 'etch-font-manager' ),
			'importTitle'    => __( 'Import', 'etch-font-manager' ),
			'importHint'     => __( 'Load a configuration exported from another site.', 'etch-font-manager' ),
			'importButton'   => __( 'Choose a file…', 'etch-font-manager' ),
			'importMode'     => __( 'Import mode', 'etch-font-manager' ),
			'importReplace'  => __( 'Replace everything', 'etch-font-manager' ),
			'importMerge'    => __( 'Merge with existing families', 'etch-font-manager' ),
			'importInvalid'  => __( 'That file is not valid JSON.', 'etch-font-manager' ),
			'importMissing'  => __( 'These files are referenced but not present in the fonts folder. Upload them, or reinstall the family from Google Fonts:', 'etch-font-manager' ),
			'imported'       => __( 'imported', 'etch-font-manager' ),
			'category'       => __( 'Category', 'etch-font-manager' ),
			'allCategories'  => __( 'All categories', 'etch-font-manager' ),
			'sortBy'         => __( 'Sort by', 'etch-font-manager' ),
			'sortPopular'    => __( 'Most popular', 'etch-font-manager' ),
			'sortAlpha'      => __( 'A to Z', 'etch-font-manager' ),
			'loadMore'       => __( 'Load more', 'etch-font-manager' ),
			'loading'        => __( 'Loading…', 'etch-font-manager' ),
			'variableCut'    => __( 'Variable', 'etch-font-manager' ),
			'variableHint'   => __( 'one file per subset instead of one per weight', 'etch-font-manager' ),
			'delivery'       => __( 'Delivery', 'etch-font-manager' ),
			'fontDisplay'    => __( 'Loading behaviour', 'etch-font-manager' ),
			'fontDisplayHint' => __( 'swap shows a fallback until the font arrives. optional skips the font entirely on slow connections, which removes layout shift.', 'etch-font-manager' ),
			'preload'        => __( 'Preload this family', 'etch-font-manager' ),
			'preloadHint'    => __( 'Fetches the regular weight early. Use it only for fonts visible above the fold; preloading everything slows the page down.', 'etch-font-manager' ),
			'fallbackStack'  => __( 'Fallback stack', 'etch-font-manager' ),
			'fallbackHint'   => __( 'Shown while the font loads, and if it fails. A close match reduces layout shift.', 'etch-font-manager' ),
			'reinstall'      => __( 'Reinstall', 'etch-font-manager' ),
			'inUse'          => __( 'in use', 'etch-font-manager' ),
			'confirmDiscard' => __( 'You have unsaved font changes. Close and discard them?', 'etch-font-manager' ),
			'confirmRemoveAssigned'     => __( 'This family is assigned as:', 'etch-font-manager' ),
			'confirmRemoveAssignedHint' => __( 'Removing it will clear that assignment. Continue?', 'etch-font-manager' ),
			'confirmDeleteUsed'         => __( 'It is mapped by:', 'etch-font-manager' ),
			'confirmDeleteUsedHint'     => __( 'Those variants will be removed too.', 'etch-font-manager' ),
			'sampleHeading'  => __( 'Typography that ships', 'etch-font-manager' ),
			'sampleBody'     => __( 'Body copy renders in the text family. Upload a font or install one from Google Fonts, map its weights, then assign it here.', 'etch-font-manager' ),
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
			'upload'         => __( 'Upload fonts', 'etch-font-manager' ),
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
	 * font face rules; this plugin's stylesheet already loads the files.
	 *
	 * @param WP_Theme_JSON_Data $theme_json Theme JSON data.
	 * @return WP_Theme_JSON_Data
	 */
	public static function register_theme_json_fonts( $theme_json ) {
		$families = EFM_Fonts::active_families();

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
