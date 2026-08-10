<?php
/**
 * Plugin Name:       Etch Font Manager
 * Plugin URI:        https://github.com/donkanishka/etch-font-manager
 * Description:       Manage self-hosted custom fonts without leaving the Etch builder. Adds a native Fonts panel to the Etch Settings Bar for uploading font files, installing Google Fonts locally, mapping families and variants, and publishing each family as a reusable CSS variable.
 * Version:           1.21.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            donkanishka
 * Author URI:        https://github.com/donkanishka
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Update URI:        https://github.com/donkanishka/etch-font-manager
 * Text Domain:       etch-font-manager
 *
 * @package EtchFontManager
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'EFM_VERSION', '1.21.0' );
define( 'EFM_FILE', __FILE__ );
define( 'EFM_DIR', plugin_dir_path( __FILE__ ) );
define( 'EFM_URL', plugin_dir_url( __FILE__ ) );

require_once EFM_DIR . 'includes/class-efm-fonts.php';
require_once EFM_DIR . 'includes/class-efm-google-fonts.php';
require_once EFM_DIR . 'includes/class-efm-rest.php';
require_once EFM_DIR . 'includes/class-efm-builder.php';
require_once EFM_DIR . 'includes/class-efm-updater.php';

/**
 * Load translations.
 */
function efm_load_textdomain() {
	load_plugin_textdomain( 'etch-font-manager', false, dirname( plugin_basename( EFM_FILE ) ) . '/languages' );
}
add_action( 'init', 'efm_load_textdomain' );

/**
 * Boot the plugin.
 */
function efm_boot() {
	EFM_Fonts::init();
	EFM_Rest::init();
	EFM_Builder::init();
	EFM_Updater::init();
}
add_action( 'plugins_loaded', 'efm_boot' );

/**
 * Activation: create the fonts directory, import legacy data, write the stylesheet.
 */
function efm_activate() {
	require_once EFM_DIR . 'includes/class-efm-fonts.php';

	EFM_Fonts::ensure_dir();
	EFM_Fonts::maybe_import_legacy();
	EFM_Fonts::write_css_file();

	update_option( 'efm_version', EFM_VERSION, false );
}
register_activation_hook( __FILE__, 'efm_activate' );
