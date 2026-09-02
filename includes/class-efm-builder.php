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
		// Late, so Automatic.css has certainly registered its handle by now.
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'bridge_acss_tokens' ), PHP_INT_MAX );
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

		// Late, so everything a theme or plugin queued has already been added.
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'block_google_fonts' ), 100 );
		add_filter( 'wp_resource_hints', array( __CLASS__, 'filter_resource_hints' ), 10, 2 );
		add_filter( 'style_loader_tag', array( __CLASS__, 'filter_style_tag' ), 10, 4 );
		add_action( 'admin_notices', array( __CLASS__, 'etch_missing_notice' ) );
	}

	/**
	 * Whether the Etch builder is present.
	 *
	 * Etch defines this constant at file scope, so it is set on every request in
	 * which the plugin is active. An exact signal, unlike the Requires Plugins
	 * header this deliberately does not use: that one matches on folder name, and
	 * Etch ships as a paid zip that can be unpacked under any name -- a mismatch
	 * there would block activation of this plugin outright and point the reader at
	 * a wordpress.org listing that does not exist.
	 *
	 * @return bool
	 */
	public static function etch_active() {
		return defined( 'ETCH_PLUGIN_FILE' ) || class_exists( '\\Etch\\Plugin' );
	}

	/**
	 * Say so when the builder this plugin lives inside is not there.
	 *
	 * The panel opens from the Etch Settings Bar and nowhere else, so without Etch
	 * this plugin activates, keeps serving the fonts it has already generated, and
	 * offers no way in. Silence reads as a plugin that does not work; this names
	 * the reason and confirms the fonts are still loading.
	 *
	 * Only on the Plugins screen, which is where the reader is when they wonder
	 * where it went, and only for someone who could act on it.
	 */
	public static function etch_missing_notice() {
		if ( self::etch_active() || ! current_user_can( 'activate_plugins' ) ) {
			return;
		}

		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;

		if ( ! $screen || 'plugins' !== $screen->id ) {
			return;
		}

		echo '<div class="notice notice-warning"><p>' .
			esc_html__( 'Etch Font Manager needs the Etch builder. Its Font Manager panel opens from the Etch Settings Bar, so there is no way in without it. Fonts you have already installed keep loading on the site.', 'etch-font-manager' ) .
			'</p></div>';
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

		$settings = EFM_Fonts::settings();

		/*
		 * Inline delivery trades a cacheable file for one less render-blocking
		 * request. It is worth it on small font sets and a bad trade on large
		 * ones, so it is a choice rather than a default.
		 */
		if ( ! empty( $settings['inline_css'] ) ) {
			$css = EFM_Fonts::inline_css();

			if ( '' !== trim( (string) $css ) ) {
				wp_register_style( 'efm-fonts', false, array(), EFM_Fonts::css_version() );
				wp_enqueue_style( 'efm-fonts' );
				wp_add_inline_style( 'efm-fonts', $css );
			}

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
	 * Re-declare the typography tokens immediately after Automatic.css.
	 *
	 * The generated stylesheet already carries them, but it is enqueued before
	 * ACSS -- measured on a real install, efm-fonts sits at index 3 and
	 * automaticcss-core at index 4 -- so anything ACSS declares for the same
	 * token would win on order. Attaching the identical block to ACSS's own
	 * handle prints it directly after that stylesheet, which is how this wins
	 * without !important. The mapping removed in 0.17.0 used !important precisely
	 * because it had no way to be later.
	 *
	 * Same string from the same builder, so the two copies cannot drift, and a
	 * duplicate declaration of an identical value costs nothing.
	 *
	 * Does nothing when ACSS is absent: wp_add_inline_style() on an unregistered
	 * handle is a no-op, and without ACSS there is nothing to be later than.
	 */
	public static function bridge_acss_tokens() {
		$css = EFM_Fonts::token_css();

		if ( '' === trim( $css ) ) {
			return;
		}

		/**
		 * Filter the stylesheet handle the token block is attached to.
		 *
		 * Empty by default, which means the plugin prints the block on a handle of
		 * its own. Name a handle here to attach it to that stylesheet instead.
		 *
		 * @param string $handle Style handle.
		 */
		$handle = (string) apply_filters( 'efm_token_bridge_handle', '' );

		/*
		 * A handle of our own rather than Automatic.css's, because attaching to
		 * theirs did not work. Measured on a live site: the block was hooked at
		 * priority 99 and bailed on wp_style_is( 'automaticcss-core' ), leaving an
		 * empty <style id="automaticcss-core-inline-css"> and the tokens only in
		 * efm-fonts.css -- which loads at position 6 against ACSS at 12.
		 *
		 * That ordering matters now that the block carries the applying rules:
		 * ACSS sets body { font-family: system-ui } directly, so a body rule of
		 * ours printed earlier would lose. Registering with no src and enqueueing
		 * at the very end of wp_enqueue_scripts puts this last in the queue, which
		 * is what decides print order -- no dependency on another plugin's timing.
		 */
		if ( '' === $handle || ( ! wp_style_is( $handle, 'enqueued' ) && ! wp_style_is( $handle, 'registered' ) ) ) {
			$handle = 'efm-tokens';

			wp_register_style( $handle, false, array(), EFM_VERSION );
			wp_enqueue_style( $handle );
		}

		wp_add_inline_style( $handle, $css );
	}

	/**
	 * Dequeue Google Fonts stylesheets loaded by a theme or plugin.
	 *
	 * Runs late on the same hook so it sees everything already queued. Only
	 * stylesheets pointing at Google's font CDN are touched; the local files
	 * this plugin generates are unaffected.
	 */
	public static function block_google_fonts() {
		$settings = EFM_Fonts::settings();

		if ( empty( $settings['block_google'] ) ) {
			return;
		}

		$styles = wp_styles();

		if ( ! $styles || empty( $styles->registered ) ) {
			return;
		}

		foreach ( $styles->registered as $handle => $style ) {
			$src = is_object( $style ) && ! empty( $style->src ) ? (string) $style->src : '';

			if ( '' === $src ) {
				continue;
			}

			if ( false !== strpos( $src, 'fonts.googleapis.com' ) ) {
				wp_dequeue_style( $handle );
			}
		}
	}

	/**
	 * Drop any Google Fonts link tag that survived the dequeue.
	 *
	 * A stylesheet registered after the dequeue runs, or printed by code that
	 * bypasses the queue, still reaches this filter. It is a second net rather
	 * than the main one.
	 *
	 * @param string $tag    Link tag markup.
	 * @param string $handle Style handle.
	 * @param string $href   Stylesheet URL.
	 * @param string $media  Media attribute.
	 * @return string
	 */
	public static function filter_style_tag( $tag, $handle, $href, $media ) {
		unset( $handle, $media );

		$settings = EFM_Fonts::settings();

		if ( empty( $settings['block_google'] ) ) {
			return $tag;
		}

		if ( false !== strpos( (string) $href, 'fonts.googleapis.com' ) ) {
			return '';
		}

		return $tag;
	}

	/**
	 * Drop preconnect and dns-prefetch hints for Google's font hosts.
	 *
	 * Dequeuing the stylesheet but leaving the hint behind still tells the
	 * browser to open a connection to Google, which defeats the point.
	 *
	 * @param array  $urls          Hint URLs.
	 * @param string $relation_type Hint type.
	 * @return array
	 */
	public static function filter_resource_hints( $urls, $relation_type ) {
		$settings = EFM_Fonts::settings();

		if ( empty( $settings['block_google'] ) || ! is_array( $urls ) ) {
			return $urls;
		}

		if ( ! in_array( $relation_type, array( 'preconnect', 'dns-prefetch', 'preload' ), true ) ) {
			return $urls;
		}

		return array_values(
			array_filter(
				$urls,
				static function ( $url ) {
					$href = is_array( $url ) ? ( $url['href'] ?? '' ) : $url;
					$href = (string) $href;

					return false === strpos( $href, 'fonts.googleapis.com' )
						&& false === strpos( $href, 'fonts.gstatic.com' );
				}
			)
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
				// Directory the converter worker and its WASM binary live in. Left
				// empty when the binary has not been built, which turns the whole
				// converter off in the panel rather than failing at click time.
				'wasmUrl'   => file_exists( EFM_DIR . 'assets/wasm/woff2.wasm' ) ? esc_url_raw( EFM_URL . 'assets/wasm/' ) : '',
				// Where the font files themselves are, so the panel can read one back.
				// Reading a file it did not just receive is how a font installed before
				// the panel could open its format gets its axes without being uploaded
				// a second time.
				'filesUrl'  => esc_url_raw( EFM_Fonts::url() ),
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
			'fontManager'    => __( 'Font Manager', 'etch-font-manager' ),
			'backToBuilder'  => __( 'Back to Builder', 'etch-font-manager' ),
			'library'        => __( 'Font library', 'etch-font-manager' ),
			'settings'       => __( 'Settings', 'etch-font-manager' ),
			'backToLibrary'  => __( 'Back to the font library', 'etch-font-manager' ),
			'manageFamily'   => __( 'Manage', 'etch-font-manager' ),
			'familyLabel'    => __( 'family', 'etch-font-manager' ),
			'familiesLabel'  => __( 'families', 'etch-font-manager' ),
			'fileLabel'      => __( 'file', 'etch-font-manager' ),
			'filesLabel'     => __( 'files', 'etch-font-manager' ),
			'filterFamilies' => __( 'Filter families', 'etch-font-manager' ),
			'noResultsFor'   => __( 'No results for', 'etch-font-manager' ),
			'checkSpelling'  => __( 'Please check your spelling.', 'etch-font-manager' ),
			'dismiss'        => __( 'Dismiss', 'etch-font-manager' ),
			'copy'           => __( 'Copy', 'etch-font-manager' ),
			'copiedToken'    => __( 'CSS variable copied.', 'etch-font-manager' ),
			'copiedVariation' => __( 'Variable font settings copied.', 'etch-font-manager' ),
			'copiedImport'   => __( 'Stylesheet import line copied.', 'etch-font-manager' ),
			'copiedVariationToken' => __( 'Variation variable copied.', 'etch-font-manager' ),
			'copyFailed'     => __( 'Could not copy. Select the value and copy it.', 'etch-font-manager' ),
			'noVariants'     => __( 'No variants mapped yet.', 'etch-font-manager' ),
			'previewText'    => __( 'Preview text', 'etch-font-manager' ),
			'clearPreview'   => __( 'Clear preview text', 'etch-font-manager' ),
			'clearFilter'    => __( 'Clear filter', 'etch-font-manager' ),
			'clearSearch'    => __( 'Clear search', 'etch-font-manager' ),
			'previewSize'    => __( 'Preview size', 'etch-font-manager' ),
			'previewAuto'    => __( 'Each family in its own script', 'etch-font-manager' ),
			'sampleAuto'     => __( 'Auto', 'etch-font-manager' ),
			'sampleLatin'    => __( 'Latin', 'etch-font-manager' ),
			'sampleNumerals' => __( '123', 'etch-font-manager' ),
			'layout'         => __( 'Layout', 'etch-font-manager' ),
			'layoutRow'      => __( 'Row', 'etch-font-manager' ),
			'layoutGrid'     => __( 'Grid', 'etch-font-manager' ),
			'writingSystem'  => __( 'Writing system', 'etch-font-manager' ),
			'allScripts'     => __( 'Any writing system', 'etch-font-manager' ),
			'technology'     => __( 'Technology', 'etch-font-manager' ),
			'anyTech'        => __( 'Any technology', 'etch-font-manager' ),
			'variableOnly'   => __( 'Variable only', 'etch-font-manager' ),
			'staticOnly'     => __( 'Static only', 'etch-font-manager' ),
			'sortTrending'   => __( 'Trending', 'etch-font-manager' ),
			'sortNewest'     => __( 'Newest', 'etch-font-manager' ),
			'resetAll'       => __( 'Reset all', 'etch-font-manager' ),
			'ofLabel'        => __( 'of', 'etch-font-manager' ),
			'selected'       => __( 'selected', 'etch-font-manager' ),
			'selectAll'      => __( 'Select all', 'etch-font-manager' ),
			'clearSelection' => __( 'Clear', 'etch-font-manager' ),
			'installSelected' => __( 'Install selected', 'etch-font-manager' ),
			'selectFamily'   => __( 'Select', 'etch-font-manager' ),
			'familySizeHint' => __( 'Size of the whole family at Google. What you install depends on the subsets and weights chosen below.', 'etch-font-manager' ),
			'variableLabel'  => __( 'Variable', 'etch-font-manager' ),
			'axis'           => __( 'axis', 'etch-font-manager' ),
			'axes'           => __( 'axes', 'etch-font-manager' ),
			'styleSingular'  => __( 'style', 'etch-font-manager' ),
			'styles'         => __( 'styles', 'etch-font-manager' ),
			'familySingular' => __( 'family', 'etch-font-manager' ),
			'bulkDone'       => __( 'Installed', 'etch-font-manager' ),
			'bulkPartial'    => __( 'Installed', 'etch-font-manager' ),
			'bulkFailed'     => __( 'failed', 'etch-font-manager' ),
			'openDetail'     => __( 'Open the type tester', 'etch-font-manager' ),
			'backToGoogle'   => __( 'Back to Google Fonts', 'etch-font-manager' ),
			'addedOn'        => __( 'Added', 'etch-font-manager' ),
			'resetAxes'      => __( 'Reset axes', 'etch-font-manager' ),
			'variableAxes'   => __( 'Variable axes', 'etch-font-manager' ),
			'installOptions' => __( 'Install options', 'etch-font-manager' ),
			'noAxes'         => __( 'This family has no variable axes, so there is nothing to adjust.', 'etch-font-manager' ),
			'viewOnGoogle'   => __( 'View on Google Fonts', 'etch-font-manager' ),
			'variable'       => __( 'variable', 'etch-font-manager' ),
			'type'           => __( 'Type', 'etch-font-manager' ),
			'size'           => __( 'Size', 'etch-font-manager' ),
			'subsets'        => __( 'Subsets', 'etch-font-manager' ),
			'weights'        => __( 'Weights', 'etch-font-manager' ),
			'cutsAll'        => __( 'All', 'etch-font-manager' ),
			'cutsNone'       => __( 'None', 'etch-font-manager' ),
			'applyForce'     => __( 'Override theme styles', 'etch-font-manager' ),
			'applyForceHint' => __( 'Adds !important, for when a theme stylesheet loads later or wins on specificity.', 'etch-font-manager' ),
			'restoreAll'     => __( 'Restore all', 'etch-font-manager' ),
			'emptyTrash'     => __( 'Empty trash', 'etch-font-manager' ),
			'confirmEmptyTrash' => __( 'Delete every family in the trash for good? Their font files stay on the server and can be removed from Import & export.', 'etch-font-manager' ),
			'exportPick'     => __( 'Families', 'etch-font-manager' ),
			'exportBundle'   => __( 'Include the font files', 'etch-font-manager' ),
			'exportBundleHint' => __( 'Makes a much larger file that rebuilds anywhere. Without it, Google families are re-downloaded on import and hand-uploaded fonts have to be uploaded again.', 'etch-font-manager' ),
			'previewTitle'   => __( 'Nothing has been changed yet. This is what importing would do:', 'etch-font-manager' ),
			'previewAdded'   => __( 'Added', 'etch-font-manager' ),
			'previewUpdated' => __( 'Overwritten', 'etch-font-manager' ),
			'previewRemoved' => __( 'Removed', 'etch-font-manager' ),
			'previewBundled' => __( 'Font files included in the file', 'etch-font-manager' ),
			'previewMissing' => __( 'Font files that would still be missing afterwards', 'etch-font-manager' ),
			'previewConfirm' => __( 'Import now', 'etch-font-manager' ),
			'previewCancel'  => __( 'Cancel', 'etch-font-manager' ),
			'importRestored' => __( 'Font files written from the file', 'etch-font-manager' ),
			'importRejected' => __( 'Rejected, because they are not valid font files:', 'etch-font-manager' ),
			'stylesheet'     => __( 'Stylesheet', 'etch-font-manager' ),
			'cssBuilt'       => __( 'Last generated', 'etch-font-manager' ),
			'cssNever'       => __( 'The stylesheet has not been generated yet.', 'etch-font-manager' ),
			'inlineCss'      => __( 'Print the CSS inline', 'etch-font-manager' ),
			'inlineCssHint'  => __( 'Saves one request but the CSS cannot be cached separately. Worth it for a small font set, not for a large one.', 'etch-font-manager' ),
			'regenerate'     => __( 'Regenerate stylesheet', 'etch-font-manager' ),
			'regenerated'    => __( 'Stylesheet regenerated.', 'etch-font-manager' ),
			'privacy'        => __( 'Privacy', 'etch-font-manager' ),
			'blockGoogle'    => __( 'Block Google Fonts loaded by other plugins', 'etch-font-manager' ),
			'blockGoogleHint' => __( 'Stops theme and plugin stylesheets that point at fonts.googleapis.com, and removes the matching preconnect hints. It cannot reach an @import inside a theme stylesheet or a link tag printed straight into the page. Your own local fonts are unaffected.', 'etch-font-manager' ),
			'applyTo'        => __( 'Apply to', 'etch-font-manager' ),
			'applyToHint'    => __( 'Optional. A comma separated selector list this family is applied to, so you do not have to write the rule yourself.', 'etch-font-manager' ),
			'cssPreview'     => __( 'Generated CSS', 'etch-font-manager' ),
			'cssPreviewOff'  => __( 'This family is not loaded, so it contributes no CSS.', 'etch-font-manager' ),
			'cssPreviewEmpty' => __( 'No variants mapped yet, so this family contributes no CSS.', 'etch-font-manager' ),
			'recoverHint'    => __( 'These families came from Google Fonts, so their files can be fetched again with the same subsets and weights:', 'etch-font-manager' ),
			'recoverButton'  => __( 'Download missing Google fonts', 'etch-font-manager' ),
			'recovering'     => __( 'Downloading…', 'etch-font-manager' ),
			'recoverDone'    => __( 'Downloaded', 'etch-font-manager' ),
			'recoverFailed'  => __( 'Could not download:', 'etch-font-manager' ),
			'trash'          => __( 'Trash', 'etch-font-manager' ),
			'trashHint'      => __( 'These families are not loaded on the site. Their font files are still on the server, so restoring one brings it back exactly as it was.', 'etch-font-manager' ),
			'trashEmpty'     => __( 'The trash is empty', 'etch-font-manager' ),
			'trashEmptyHint' => __( 'Families you delete from the library wait here, and can be restored until you empty it.', 'etch-font-manager' ),
			'enableFamily'   => __( 'Enable', 'etch-font-manager' ),
			'disableFamily'  => __( 'Disable', 'etch-font-manager' ),
			'trashFamily'    => __( 'Move to trash', 'etch-font-manager' ),
			'restoreFamily'  => __( 'Restore', 'etch-font-manager' ),
			'deleteFamily'   => __( 'Delete permanently', 'etch-font-manager' ),
			'disabledNotice' => __( 'Disabled. Its files are kept, but it is not loaded on the site.', 'etch-font-manager' ),
			'missingLabel'   => __( 'Files missing', 'etch-font-manager' ),
			'missingNotice'  => __( 'These files are not on the server, so this family loads nothing. Upload them, or reinstall the family from Google Fonts.', 'etch-font-manager' ),
			'familyEnabled'  => __( 'Load this family on the site', 'etch-font-manager' ),
			'familyEnabledHint' => __( 'Turn off to stop the font loading without deleting anything. Files and weight mapping are kept.', 'etch-font-manager' ),
			'confirmDeleteFamily' => __( 'Delete this family for good? Its font files stay on the server and can be removed from Import & export.', 'etch-font-manager' ),
			'cssToken'       => __( 'CSS variable', 'etch-font-manager' ),
			'cssTokenHint'   => __( 'Use this anywhere a font family is expected. It already includes the fallback stack.', 'etch-font-manager' ),
			'googleSource'   => __( 'Google Fonts', 'etch-font-manager' ),
			'googleSubsets'  => __( 'Subsets', 'etch-font-manager' ),
			'applyCuts'      => __( 'Download selection', 'etch-font-manager' ),
			'variableNote'   => __( 'Installed as a variable font: one file per subset covering every weight.', 'etch-font-manager' ),
			'cleanupTitle'   => __( 'Unused files', 'etch-font-manager' ),

			'cleanupButton'  => __( 'Delete unused files', 'etch-font-manager' ),
			'cleanupConfirm' => __( 'Delete these font files from the server?', 'etch-font-manager' ),
			'cleanupDone'    => __( 'Deleted', 'etch-font-manager' ),
			'tools'          => __( 'Import & export', 'etch-font-manager' ),
			'exportTitle'    => __( 'Export', 'etch-font-manager' ),
			'exportHint'     => __( 'Download families, their variant mapping and assignments as a JSON file. Choose which families to include, and whether to bundle the font files with them.', 'etch-font-manager' ),
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
			'filters'        => __( 'Filters', 'etch-font-manager' ),
			'showAll'        => __( 'Show all', 'etch-font-manager' ),
			'showFewer'      => __( 'Show fewer', 'etch-font-manager' ),
			'disabledLabel'  => __( 'Disabled', 'etch-font-manager' ),
			'category'       => __( 'Category', 'etch-font-manager' ),
			'allCategories'  => __( 'All categories', 'etch-font-manager' ),
			'sortBy'         => __( 'Sort by', 'etch-font-manager' ),
			'sortPopular'    => __( 'Most popular', 'etch-font-manager' ),
			'sortAlpha'      => __( 'A to Z', 'etch-font-manager' ),
			'previous'       => __( 'Previous', 'etch-font-manager' ),
			'next'           => __( 'Next', 'etch-font-manager' ),
			'previousPage'   => __( 'Go to previous page', 'etch-font-manager' ),
			'nextPage'       => __( 'Go to next page', 'etch-font-manager' ),
			'goToPage'       => __( 'Go to page', 'etch-font-manager' ),
			'pagination'     => __( 'Pagination', 'etch-font-manager' ),
			'loading'        => __( 'Loading…', 'etch-font-manager' ),
			'variableCut'    => __( 'Variable', 'etch-font-manager' ),
			'variableHint'   => __( 'one file per subset instead of one per weight', 'etch-font-manager' ),
			'delivery'       => __( 'Delivery', 'etch-font-manager' ),
			'fontDisplay'    => __( 'Loading behaviour', 'etch-font-manager' ),
			'fontDisplayHint' => __( 'Swap shows a fallback until the font arrives. Optional skips the font entirely on slow connections, which removes layout shift.', 'etch-font-manager' ),
			'preload'        => __( 'Preload this family', 'etch-font-manager' ),
			'preloadHint'    => __( 'Fetches the regular weight early. Use it only for fonts visible above the fold; preloading everything slows the page down.', 'etch-font-manager' ),
			'fallbackStack'  => __( 'Fallback stack', 'etch-font-manager' ),
			'commonStacks'   => __( 'Common stacks', 'etch-font-manager' ),
			'fallbackHint'   => __( 'Shown while the font loads, and if it fails. A close match reduces layout shift.', 'etch-font-manager' ),
			'reinstall'      => __( 'Reinstall', 'etch-font-manager' ),
			'inUse'          => __( 'in use', 'etch-font-manager' ),
			'confirmDeleteUsed'         => __( 'It is mapped by:', 'etch-font-manager' ),
			'confirmDeleteUsedHint'     => __( 'Those variants will be removed too.', 'etch-font-manager' ),
			'noFamilies'     => __( 'No font families yet.', 'etch-font-manager' ),
			'noFamiliesHint' => __( 'Upload a font file or install one from Google Fonts.', 'etch-font-manager' ),
			'newFamily'      => __( 'New family', 'etch-font-manager' ),
			'familyName'     => __( 'Family name', 'etch-font-manager' ),
			'addVariant'     => __( 'Add variant', 'etch-font-manager' ),
			'removeVariant'  => __( 'Remove variant', 'etch-font-manager' ),
			'variants'       => __( 'variants', 'etch-font-manager' ),
			'variant'        => __( 'variant', 'etch-font-manager' ),
			'variantsTitle'  => __( 'Variants', 'etch-font-manager' ),
			'addedToLibrary' => __( 'added to the library', 'etch-font-manager' ),
			'mappedToFamily' => __( 'mapped to an existing family', 'etch-font-manager' ),
			'reviewAndSave'  => __( 'review and save', 'etch-font-manager' ),
			'selectorClash'  => __( 'Also applied by', 'etch-font-manager' ),
			'selectorClashHint' => __( 'Whichever comes last in the stylesheet wins.', 'etch-font-manager' ),
			'rolesTitle'     => __( 'Typography tokens', 'etch-font-manager' ),
			'rolesHint'      => __( 'Publish this family as the site\'s heading or body font. Etch documents both names and Automatic.css reads them, so a framework picks the family up without you writing a rule. Each one belongs to a single family.', 'etch-font-manager' ),
			'roleHeading'    => __( 'Use for headings', 'etch-font-manager' ),
			'roleText'       => __( 'Use for body text', 'etch-font-manager' ),
			'roleHeldBy'     => __( 'currently', 'etch-font-manager' ),
			'roleTakenFrom'  => __( 'Taken from', 'etch-font-manager' ),
			'roleCoversSelector' => __( 'Not applied:', 'etch-font-manager' ),
			'roleCoversHint' => __( 'The typography token above already answers for these.', 'etch-font-manager' ),
			'roleTakenHint'  => __( 'Unsaved: Discard puts it back.', 'etch-font-manager' ),
			'changeRoleSet'  => __( 'set as', 'etch-font-manager' ),
			'changeRoleCleared' => __( 'no longer', 'etch-font-manager' ),
			'roleHeadingChip' => __( 'Headings', 'etch-font-manager' ),
			'roleTextChip'   => __( 'Body text', 'etch-font-manager' ),
			'axesUnknown'    => __( 'Nothing has read this family\'s files yet, so the panel does not know whether the font has variable axes.', 'etch-font-manager' ),
			'readAxes'       => __( 'Read the files', 'etch-font-manager' ),
			'axesRead'       => __( 'Variable axes read from the file.', 'etch-font-manager' ),
			'axesNone'       => __( 'No variable axes in this family\'s files.', 'etch-font-manager' ),
			'axesReadFailed' => __( 'Could not read this family\'s files.', 'etch-font-manager' ),
			'axesHintApplied' => __( 'This family has an Apply to selector, so these change how it renders on the site as well as in this preview.', 'etch-font-manager' ),
			'axesHintUnapplied' => __( 'These change this preview only. To use the instance on the site, give the family an Apply to selector under Delivery, or use its variation variable in your own CSS.', 'etch-font-manager' ),
			'variationTokenHint' => __( 'The tuned instance, for font-variation-settings. Pair it with the family variable above.', 'etch-font-manager' ),
			'save'           => __( 'Save fonts', 'etch-font-manager' ),
			'savedBoth'      => __( 'Fonts and settings saved.', 'etch-font-manager' ),
			'unsavedChanges' => __( 'Unsaved changes', 'etch-font-manager' ),
			'cancel'         => __( 'Cancel', 'etch-font-manager' ),
			'continue'       => __( 'Continue', 'etch-font-manager' ),
			'deleteAction'   => __( 'Delete', 'etch-font-manager' ),
			'alsoDeleteFiles' => __( 'Also delete its font files', 'etch-font-manager' ),
			'fileSingular'   => __( 'file', 'etch-font-manager' ),
			'filesLower'     => __( 'files', 'etch-font-manager' ),
			'saving'         => __( 'Saving…', 'etch-font-manager' ),
			'saved'          => __( 'Fonts saved.', 'etch-font-manager' ),
			'discard'        => __( 'Discard', 'etch-font-manager' ),
			'moreLabel'      => __( 'more', 'etch-font-manager' ),
			'changeAdded'    => __( 'added', 'etch-font-manager' ),
			'changeRemoved'  => __( 'removed', 'etch-font-manager' ),
			'changeRenamed'  => __( 'renamed to', 'etch-font-manager' ),
			'changeEdited'   => __( 'edited', 'etch-font-manager' ),
			'changeEnabled'  => __( 'enabled', 'etch-font-manager' ),
			'changeDisabled' => __( 'disabled', 'etch-font-manager' ),
			'changeTrashed'  => __( 'moved to trash', 'etch-font-manager' ),
			'changeRestored' => __( 'restored', 'etch-font-manager' ),
			'changeGained'   => __( 'gained', 'etch-font-manager' ),
			'changeLost'     => __( 'lost', 'etch-font-manager' ),
			'upload'         => __( 'Upload font files', 'etch-font-manager' ),
			'fontFiles'      => __( 'Font files', 'etch-font-manager' ),
			'uploadHint'     => __( 'Drag files from your computer, or select them with the button below.', 'etch-font-manager' ),
			'uploadIntro'    => __( 'Font files live on your own server, and every family you build here is made from them.', 'etch-font-manager' ),
			'selectFiles'    => __( 'Select files', 'etch-font-manager' ),
			'supported'      => __( 'Supported:', 'etch-font-manager' ),
			'uploading'      => __( 'Uploading…', 'etch-font-manager' ),
			'uploaded'       => __( 'Uploaded', 'etch-font-manager' ),
			'convertUpload'  => __( 'Convert TTF, OTF and WOFF to WOFF2', 'etch-font-manager' ),
			'convertHint'    => __( 'Runs in your browser, so the font is never sent anywhere but your own site. WOFF2 is what every current browser prefers: normally 40 to 65% smaller than TTF or OTF, and around 20% smaller than WOFF. Only the container changes: glyphs, variable axes and OpenType features are untouched. It is not a subsetter, so a font that is large because of its character coverage stays large.', 'etch-font-manager' ),
			'convertFile'    => __( 'Convert to WOFF2', 'etch-font-manager' ),
			'convertedAlready' => __( 'Already converted to WOFF2', 'etch-font-manager' ),
			'converting'     => __( 'Converting to WOFF2…', 'etch-font-manager' ),
			'converted'      => __( 'Converted', 'etch-font-manager' ),
			'smaller'        => __( 'smaller', 'etch-font-manager' ),
			'convertFailed'  => __( 'Could not convert this font.', 'etch-font-manager' ),
			'convertTimeout' => __( 'Converting took too long and was stopped.', 'etch-font-manager' ),
			'convertBlocked' => __( 'The converter could not start in this browser.', 'etch-font-manager' ),
			'convertNoRead'  => __( 'Could not read the file from the fonts folder.', 'etch-font-manager' ),
			'convertBadWoff' => __( 'This WOFF file is damaged and could not be read.', 'etch-font-manager' ),
			'filesTitle'     => __( 'Font files', 'etch-font-manager' ),
			'groupUploaded'  => __( 'Uploaded', 'etch-font-manager' ),
			'groupUploadedHint' => __( 'Files you added here, mapped by a family. For a font you uploaded this may be the only copy on the site.', 'etch-font-manager' ),
			'groupGoogle'    => __( 'From Google Fonts', 'etch-font-manager' ),
			'groupGoogleHint' => __( 'Written by the Google Fonts screen. Deleting one can be undone by installing the family again.', 'etch-font-manager' ),
			'groupLoose'     => __( 'Not in the library', 'etch-font-manager' ),
			'groupLooseHint' => __( 'On the server, but no family maps them. Usually what is left after deselecting a weight, though Etch shares this folder so some may be its. Add them to the library, or delete them to free the space.', 'etch-font-manager' ),
			'noFiles'        => __( 'No font files on the server yet.', 'etch-font-manager' ),
			'deleteFile'     => __( 'Delete file', 'etch-font-manager' ),
			'googleFonts'    => __( 'Google Fonts', 'etch-font-manager' ),
			'searchGoogle'   => __( 'Search Google Fonts', 'etch-font-manager' ),
			'searching'      => __( 'Searching…', 'etch-font-manager' ),
			'noResults'      => __( 'No fonts found.', 'etch-font-manager' ),
			'install'        => __( 'Install', 'etch-font-manager' ),
			'installing'     => __( 'Installing…', 'etch-font-manager' ),
			'installed'      => __( 'Installed', 'etch-font-manager' ),
			'weight'         => __( 'Weight', 'etch-font-manager' ),
			'style'          => __( 'Style', 'etch-font-manager' ),
			'file'           => __( 'File', 'etch-font-manager' ),
			'normal'         => __( 'Normal', 'etch-font-manager' ),
			'italic'         => __( 'Italic', 'etch-font-manager' ),
			'confirmDelete'  => __( 'Delete this file from the fonts folder?', 'etch-font-manager' ),
			'confirmPermanent' => __( 'The Trash holds families, not files, so this cannot be undone.', 'etch-font-manager' ),
			'confirmEmpties' => __( 'That leaves nothing mapped by:', 'etch-font-manager' ),
			'alsoTrashEmptied' => __( 'Also move the emptied family to the trash', 'etch-font-manager' ),
			'alsoTrashEmptiedPlural' => __( 'Also move the emptied families to the trash', 'etch-font-manager' ),
			'emptyLabel'     => __( 'No files', 'etch-font-manager' ),
			'emptyNotice'    => __( 'This family maps no font files, so it loads nothing. Add a variant from Manage, or move the family to the trash.', 'etch-font-manager' ),
			'settingsSaved'  => __( 'Settings saved.', 'etch-font-manager' ),
			'failImport'     => __( 'Could not import that configuration. Your fonts are unchanged.', 'etch-font-manager' ),
			'failImportPreview' => __( 'Could not read that configuration. Nothing has been changed.', 'etch-font-manager' ),
			'failImportRead' => __( 'Could not read that file. It may be unreadable, or no longer where it was.', 'etch-font-manager' ),
			'failExport'     => __( 'Could not build the download. Your fonts are unchanged.', 'etch-font-manager' ),
			'failReload'     => __( 'Could not reload your fonts from the server, so what you see may be out of date.', 'etch-font-manager' ),
			'failSaveFonts'  => __( 'Could not save your fonts. Nothing was written to the server.', 'etch-font-manager' ),
			'failSaveSettings' => __( 'Could not save your settings. They are unchanged on the server.', 'etch-font-manager' ),
			'failUpload'     => __( 'Could not upload those fonts. Nothing was added to the library.', 'etch-font-manager' ),
			'failConvert'    => __( 'Could not convert that font. The original file is untouched.', 'etch-font-manager' ),
			'failPrune'      => __( 'Could not delete those files. They are still on the server.', 'etch-font-manager' ),
			'failDeleteFile' => __( 'Could not delete that file. It is still on the server.', 'etch-font-manager' ),
			'failSearch'     => __( 'Could not reach Google Fonts. Check the connection and try again.', 'etch-font-manager' ),
			'failPage'       => __( 'Could not load that page of results from Google Fonts.', 'etch-font-manager' ),
			'failInstall'    => __( 'Could not install that family. Nothing was written to the server.', 'etch-font-manager' ),
			'failRegenerate' => __( 'Could not regenerate the stylesheet. The existing one is unchanged.', 'etch-font-manager' ),
			'preview'        => __( 'The quick brown fox', 'etch-font-manager' ),
			'saveFirst'      => __( 'Save first', 'etch-font-manager' ),
			'confirmLeave'   => __( 'You have unsaved font changes.', 'etch-font-manager' ),
			'alreadyInstalled' => __( 'already installed', 'etch-font-manager' ),
			'duplicateSkipped' => __( 'Already installed', 'etch-font-manager' ),
			'duplicateSkippedAs' => __( 'Already installed as', 'etch-font-manager' ),
			'keepTitle'      => __( 'Keeping these fonts without the plugin', 'etch-font-manager' ),
			'keepHint'       => __( 'Deactivating or deleting the plugin stops this stylesheet being loaded, so every family falls back to its stack. The font files and the stylesheet are both left in wp-content/fonts, so this line keeps them working from a theme or from Automatic.css. It has to be the first rule in whichever stylesheet you paste it into.', 'etch-font-manager' ),
			'removal'        => __( 'Removal', 'etch-font-manager' ),
			'axesTitle'      => __( 'Variable axes', 'etch-font-manager' ),
			'originalFile'   => __( 'Original', 'etch-font-manager' ),
			'compressedFile' => __( 'Compressed', 'etch-font-manager' ),
			'conversion'     => __( 'Conversion', 'etch-font-manager' ),
			'deleteSource'   => __( 'Delete the original after converting it to WOFF2', 'etch-font-manager' ),
			'deleteSourceHint' => __( 'Off by default. Converting is one-way here, so the file it converted from cannot be rebuilt from the result, and for a font you uploaded it may be the only copy on the site. Left off, the original stays on the server and the Upload screen marks it unused, ready to remove whenever you choose. A source that another family still maps is never deleted either way.', 'etch-font-manager' ),
			'sourceDeleted'  => __( 'original deleted', 'etch-font-manager' ),
			'purgeFiles'     => __( 'Delete the font files when the plugin is deleted', 'etch-font-manager' ),
			'purgeFilesHint' => __( 'Off by default, so deleting the plugin by mistake leaves your typography standing. On, deleting the plugin from Plugins also removes the generated stylesheet and every font file your families map. Files nothing maps are left alone, and so is anything else in wp-content/fonts, because Etch shares that folder. Deactivating never deletes anything.', 'etch-font-manager' ),
			'unusedLabel'    => __( 'unused', 'etch-font-manager' ),
			'notLoaded'      => __( 'not loaded', 'etch-font-manager' ),
			'nowUnused'      => __( 'is now unused', 'etch-font-manager' ),
			'selectFile'     => __( 'Select', 'etch-font-manager' ),
			'searchFiles'    => __( 'Search font files', 'etch-font-manager' ),
			'selectAllIn'    => __( 'Select every file in', 'etch-font-manager' ),
			'formatLabel'    => __( 'Format', 'etch-font-manager' ),
			'trashSelected'  => __( 'Move selected to trash', 'etch-font-manager' ),
			'convertSelected' => __( 'Convert selected', 'etch-font-manager' ),
			'deleteSelected' => __( 'Delete selected', 'etch-font-manager' ),
			'restoreSelected' => __( 'Restore selected', 'etch-font-manager' ),
			'convertedCount' => __( 'Converted', 'etch-font-manager' ),
			'deletedCount'   => __( 'Deleted', 'etch-font-manager' ),
			'deleteFiles'    => __( 'Delete files', 'etch-font-manager' ),
			'confirmDeleteFiles' => __( 'Delete these files from the fonts folder?', 'etch-font-manager' ),
			'confirmDeleteFilesUsed' => __( 'of them are mapped by a family, and those variants will be removed too.', 'etch-font-manager' ),
			'deleteFamilies' => __( 'Delete permanently', 'etch-font-manager' ),
			'confirmDeleteFamilies' => __( 'Delete these families for good? Their font files stay on the server and can be removed from Import & export.', 'etch-font-manager' ),
			'confirmDeleteFamiliesGoogle' => __( 'Delete these families for good? Their font files can be downloaded from Google Fonts again.', 'etch-font-manager' ),
			'selectAllVariants' => __( 'Select every variant', 'etch-font-manager' ),
			'selectVariant'  => __( 'Select variant', 'etch-font-manager' ),
			'removeSelected' => __( 'Remove selected', 'etch-font-manager' ),
			'adoptFiles'     => __( 'Add the files already here', 'etch-font-manager' ),
			'addSelected'    => __( 'Add to library', 'etch-font-manager' ),
			'nothingToAdd'   => __( 'Those files are already in the library.', 'etch-font-manager' ),
			'noFamiliesFound' => __( 'There are font files on the server that no family uses yet. They can be taken into the library, or start fresh from Google Fonts.', 'etch-font-manager' ),
			'confirmInstallDirty' => __( 'Installing writes this family to the server, which replaces anything unsaved in the panel.', 'etch-font-manager' ),
			'confirmConvertDirty' => __( 'Converting writes the family mapping to the server, which replaces anything unsaved in the panel.', 'etch-font-manager' ),
			'cutsAllInstalled' => __( 'Every weight Google publishes for this family is installed.', 'etch-font-manager' ),
			'cutsUnchanged'  => __( 'Change the weights to download a different selection.', 'etch-font-manager' ),
			'sourceUpload'   => __( 'Uploaded', 'etch-font-manager' ),
			'confirmDeleteFamilyGoogle' => __( 'Delete this family for good? Its font files can be downloaded from Google Fonts again.', 'etch-font-manager' ),
			'confirmEmptyTrashGoogle' => __( 'Delete every family in the trash for good? Their font files can be downloaded from Google Fonts again.', 'etch-font-manager' ),
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
