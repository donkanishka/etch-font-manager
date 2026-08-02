<?php
/**
 * Uninstall routine.
 *
 * Removes plugin options and the generated stylesheet. Uploaded font files are
 * intentionally left in place so sites do not lose typography on an accidental
 * uninstall.
 *
 * @package EtchFontManager
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'efm_font_families' );
delete_option( 'efm_settings' );
delete_option( 'efm_version' );
delete_transient( 'efm_google_fonts_index' );
delete_transient( 'efm_google_fonts_index_v2' );

$efm_css = trailingslashit( WP_CONTENT_DIR . '/fonts' ) . 'efm-fonts.css';

if ( file_exists( $efm_css ) ) {
	wp_delete_file( $efm_css );
}
