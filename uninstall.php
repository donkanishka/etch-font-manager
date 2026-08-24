<?php
/**
 * Uninstall routine.
 *
 * Removes plugin options. By default everything in wp-content/fonts is left in
 * place -- the uploaded font files and the stylesheet that declares them -- so a
 * site does not lose its typography on an accidental uninstall.
 *
 * Settings carries the opt-out: with "Delete font files too" ticked, the files
 * the stored families map are removed along with the stylesheet. Only those,
 * because the folder is shared with Etch and emptying it would take another
 * plugin's fonts with it.
 *
 * Keeping the files while deleting the stylesheet used to defeat that: the fonts
 * survived and nothing declared them, which is the same outcome as losing them.
 * The stylesheet references its files relatively, so it keeps working from where
 * it sits and one @import in a theme or in Automatic.css is enough to carry the
 * typography without the plugin. Import & export shows that line.
 *
 * @package EtchFontManager
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

/*
 * Read before anything is deleted, and read from the option directly: the
 * plugin's classes are not loaded during an uninstall, so this file cannot call
 * EFM_Fonts::settings() to ask.
 */
$efm_settings = get_option( 'efm_settings', array() );
$efm_purge    = is_array( $efm_settings ) && ! empty( $efm_settings['purge_files'] );

/*
 * The files, while the family records that name them still exist. Collected up
 * front for the same reason: once the option is gone there is no way to tell
 * which of the fonts in a shared folder belonged to this plugin.
 */
$efm_doomed = array();

if ( $efm_purge ) {
	/*
	 * Loaded by hand. WordPress does not boot a plugin to uninstall it, so the
	 * class is not there unless this file requires it -- a class_exists() guard
	 * here would simply never be true and the purge would silently do nothing.
	 * Safe to load on its own: owned_files() reaches only css_path(), dir(),
	 * families() and path_is_inside(), none of which touch the EFM_ constants the
	 * main plugin file defines.
	 */
	require_once __DIR__ . '/includes/class-efm-fonts.php';

	if ( class_exists( 'EFM_Fonts' ) ) {
		$efm_doomed = EFM_Fonts::owned_files();
	}
}

delete_option( 'efm_font_families' );
delete_option( 'efm_settings' );
delete_option( 'efm_version' );
delete_transient( 'efm_google_fonts_index' );
delete_transient( 'efm_google_fonts_index_v2' );
delete_transient( 'efm_inline_css' );

foreach ( $efm_doomed as $efm_file ) {
	if ( file_exists( $efm_file ) ) {
		wp_delete_file( $efm_file );
	}
}
