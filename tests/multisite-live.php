<?php
/** Run only via WP-CLI in a disposable multisite installation. */
if ( ! defined( 'WP_CLI' ) || ! WP_CLI || ! is_multisite() || '1' !== getenv( 'EFM_DISPOSABLE_TEST' ) ) {
	throw new RuntimeException( 'Disposable multisite test environment required.' );
}
$passed = 0;
function efm_live_assert( $value, $message ) {
	global $passed;
	if ( ! $value ) { throw new RuntimeException( $message ); }
	++$passed;
	WP_CLI::log( 'PASS ' . $message );
}
function efm_live_family( $name ) {
	return array( array( 'name' => 'Fixture', 'variants' => array( array( 'file' => $name, 'weight' => '400', 'style' => 'normal' ) ) ) );
}
function efm_live_post( $route, $params = array() ) {
	$request = new WP_REST_Request( 'POST', '/etch-font-manager/v1/' . $route );
	$request->set_body_params( $params );
	return rest_do_request( $request );
}
$main = get_current_blog_id();
$second = wpmu_create_blog( 'example.test', '/second/', 'Second', 1 );
efm_live_assert( ! is_wp_error( $second ), 'second real WordPress site created' );
$admin = wp_create_user( 'site-admin', wp_generate_password(), 'site-admin@example.test' );
efm_live_assert( ! is_wp_error( $admin ), 'ordinary site administrator created' );
add_user_to_blog( $main, $admin, 'administrator' );
$shared = WP_CONTENT_DIR . '/fonts/';
wp_mkdir_p( $shared );
$font = 'wOF2' . str_repeat( 'x', 32 );
file_put_contents( $shared . 'shared.woff2', $font );
file_put_contents( $shared . 'foreign.woff2', $font . 'foreign' );
file_put_contents( $shared . 'efm-fonts.css', 'LEGACY SHARED CSS' );
foreach ( array( $main, $second ) as $blog ) {
	switch_to_blog( $blog );
	delete_option( EFM_Fonts::OPTION_STORAGE );
	update_option( EFM_Fonts::OPTION_FAMILIES, efm_live_family( 'shared.woff2' ) );
	update_option( 'efm_version', EFM_VERSION );
	EFM_Fonts::maybe_upgrade();
	efm_live_assert( file_get_contents( EFM_Fonts::dir() . 'shared.woff2' ) === $font, 'legacy reference copied for blog ' . $blog );
	efm_live_assert( strpos( EFM_Fonts::dir(), '/efm-sites/' . $blog . '/' ) !== false, 'blog-specific path ' . $blog );
	efm_live_assert( strpos( EFM_Fonts::url(), '/efm-sites/' . $blog . '/' ) !== false, 'matching URL ' . $blog );
	if ( $blog === $second ) {
		$other_dir = EFM_Fonts::dir();
		file_put_contents( $other_dir . 'foreign.woff2', $font . 'foreign' );
		$other_css = file_get_contents( EFM_Fonts::css_path() );
	}
	restore_current_blog();
}
efm_live_assert( file_get_contents( $shared . 'efm-fonts.css' ) === 'LEGACY SHARED CSS', 'migration preserves shared CSS' );
wp_set_current_user( $admin );
efm_live_assert( current_user_can( 'manage_options' ) && ! is_super_admin(), 'attacker has site capability but not network authority' );
$response = efm_live_post( 'files/delete', array( 'filename' => 'foreign.woff2' ) );
efm_live_assert( $response->get_status() === 404, 'foreign-only basename cannot be deleted' );
efm_live_assert( file_exists( $other_dir . 'foreign.woff2' ) && file_exists( $shared . 'foreign.woff2' ), 'foreign and shared files survive direct deletion' );
$response = efm_live_post( 'files/delete', array( 'filename' => 'shared.woff2' ) );
efm_live_assert( $response->get_status() === 200, 'ordinary admin can delete own migrated copy' );
efm_live_assert( file_exists( $other_dir . 'shared.woff2' ) && file_exists( $shared . 'shared.woff2' ), 'same-name foreign and shared files survive' );
$response = efm_live_post( 'files/prune' );
efm_live_assert( $response->get_status() === 200 && file_exists( $other_dir . 'foreign.woff2' ), 'prune cannot reach another site' );
$response = efm_live_post( 'css/regenerate' );
efm_live_assert( $response->get_status() === 200, 'site admin can regenerate own CSS' );
efm_live_assert( file_get_contents( $other_dir . 'efm-fonts.css' ) === $other_css, 'another site CSS is byte-identical after mutations' );
efm_live_assert( file_get_contents( $shared . 'efm-fonts.css' ) === 'LEGACY SHARED CSS', 'shared CSS is byte-identical after mutations' );
switch_to_blog( $second );
efm_live_assert( ! current_user_can( 'manage_options' ), 'site admin has no capability on unrelated site' );
efm_live_assert( efm_live_post( 'css/regenerate' )->get_status() === 403, 'REST denies unrelated site administration' );
restore_current_blog();
wp_set_current_user( 0 );
efm_live_assert( efm_live_post( 'files/prune' )->get_status() >= 400, 'anonymous mutation denied' );
wp_set_current_user( 1 );
update_option( EFM_Fonts::OPTION_SETTINGS, array( 'purge_files' => true ) );
define( 'WP_UNINSTALL_PLUGIN', true );
require WP_PLUGIN_DIR . '/etch-font-manager/uninstall.php';
efm_live_assert( file_exists( $other_dir . 'shared.woff2' ) && file_exists( $shared . 'shared.woff2' ), 'opt-in uninstall preserves other site and legacy fonts' );
efm_live_assert( file_get_contents( $other_dir . 'efm-fonts.css' ) === $other_css && file_get_contents( $shared . 'efm-fonts.css' ) === 'LEGACY SHARED CSS', 'uninstall preserves other site and legacy CSS' );
WP_CLI::success( $passed . ' real multisite assertions passed.' );
