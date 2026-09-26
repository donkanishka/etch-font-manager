<?php
/**
 * The stylesheet write, and what the panel is told about it.
 *
 * Included by run.php after storage.php, which supplies the WordPress stubs, a
 * writable fonts directory and a $wp_filesystem double.
 *
 * Two things are covered. The write falls back to a direct write when
 * WP_Filesystem cannot do it, which is the case on a host where FS_METHOD
 * resolves to ftpext or ssh2 and no credentials are available to a REST
 * request. And the outcome is remembered, so a save can report a stylesheet
 * that did not land instead of an unqualified success.
 *
 * @package EtchFontManager
 */

/**
 * A filesystem that refuses every write, the way an unconnected FTP one does.
 */
class EFM_Css_Test_Refusing_Filesystem {

	/**
	 * Refuse the write.
	 *
	 * @param string $path    Path.
	 * @param string $content Content.
	 * @param int    $mode    Mode.
	 * @return bool
	 */
	public function put_contents( $path, $content, $mode ) {
		return false;
	}
}

$efm_css_root = sys_get_temp_dir() . '/efm-css-' . bin2hex( random_bytes( 8 ) );
mkdir( $efm_css_root );

// Single site, so the write is the plain one rather than the namespaced path
// storage.php leaves behind.
$efm_test_multisite = false;
$efm_test_filters   = array( 'efm_fonts_dir' => $efm_css_root );
$efm_test_blog      = 1;

try {
	$efm_css_kept = $GLOBALS['wp_filesystem'];

	/* -------------------------------------------------------------------------
	 * A user-named variable is an alias; the generated one never disappears.
	 * ---------------------------------------------------------------------- */

	file_put_contents( $efm_css_root . '/inter-regular.woff2', 'font' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents

	$efm_named_family = array(
		'name'         => 'Inter',
		'variants'     => array( array( 'file' => 'inter-regular.woff2', 'weight' => '400' ) ),
		'fallback'     => 'sans-serif',
		'css_variable' => '--sans',
	);
	$efm_named_css = EFM_Fonts::build_css( array( $efm_named_family ), true );
	efm_ok( false !== strpos( $efm_named_css, '--efm-family-inter: "Inter", sans-serif;' ), 'the generated family variable stays available' );
	efm_ok( false !== strpos( $efm_named_css, '--sans: var(--efm-family-inter);' ), 'a custom variable points at the same font stack' );
	efm_ok( false === strpos( EFM_Fonts::build_css( array( array_merge( $efm_named_family, array( 'enabled' => false ) ) ), true ), '--sans:' ), 'a disabled family publishes no alias' );
	efm_ok( false === strpos( EFM_Fonts::build_css( array( array_merge( $efm_named_family, array( 'css_variable' => '--bad; color: red' ) ) ), true ), '--bad;' ), 'an invalid alias never enters CSS' );
	$efm_two_aliases = EFM_Fonts::build_css(
		array(
			$efm_named_family,
			array_merge( $efm_named_family, array( 'name' => 'Roboto' ) ),
		),
		true
	);
	efm_is( 1, substr_count( $efm_two_aliases, '--sans:' ), 'a duplicate alias is emitted only once, first family wins' );

	$efm_previous_families = get_option( EFM_Fonts::OPTION_FAMILIES, array() );
	update_option( EFM_Fonts::OPTION_FAMILIES, array( $efm_named_family ) );
	$efm_import_collision = EFM_Fonts::import_payload(
		array( 'families' => array( array_merge( $efm_named_family, array( 'name' => 'Roboto' ) ) ) ),
		'merge',
		true
	);
	efm_ok( is_wp_error( $efm_import_collision ), 'merge preview rejects an alias already used by an existing family' );
	efm_is( array( $efm_named_family ), EFM_Fonts::families(), 'a rejected merge leaves existing names unchanged' );
	$efm_incoming_collision = EFM_Fonts::import_payload(
		array( 'families' => array( $efm_named_family, array_merge( $efm_named_family, array( 'name' => 'Roboto' ) ) ) ),
		'replace',
		true
	);
	efm_ok( is_wp_error( $efm_incoming_collision ), 'import preview rejects duplicate aliases inside the uploaded file' );
	update_option( EFM_Fonts::OPTION_FAMILIES, $efm_previous_families );

	/* -------------------------------------------------------------------------
	 * The ordinary case still works and is reported as a success.
	 * ---------------------------------------------------------------------- */

	efm_ok( EFM_Fonts::write_css_file(), 'the stylesheet is written normally' );
	efm_is( false, EFM_Fonts::css_write_failed(), 'a successful write is not reported as a failure' );
	efm_ok( file_exists( EFM_Fonts::dir() . EFM_Fonts::CSS_FILENAME ), 'the file is on disk' );

	/* -------------------------------------------------------------------------
	 * WP_Filesystem refuses, so the direct write takes over.
	 * ---------------------------------------------------------------------- */

	wp_delete_file( EFM_Fonts::dir() . EFM_Fonts::CSS_FILENAME );

	$GLOBALS['wp_filesystem'] = new EFM_Css_Test_Refusing_Filesystem();

	efm_ok( EFM_Fonts::write_css_file(), 'a refused WP_Filesystem write falls back to a direct write' );
	efm_is( false, EFM_Fonts::css_write_failed(), 'the fallback counts as a success' );
	efm_ok(
		file_exists( EFM_Fonts::dir() . EFM_Fonts::CSS_FILENAME ),
		'the fallback actually put the stylesheet on disk'
	);

	/* -------------------------------------------------------------------------
	 * Neither can write, which is the case the panel has to report.
	 * ---------------------------------------------------------------------- */

	$efm_css_blocked          = $efm_css_root . '/blocked';
	$efm_test_filters         = array( 'efm_fonts_dir' => $efm_css_blocked );

	// A file where the directory should be, so no write beneath it can succeed.
	file_put_contents( $efm_css_blocked, 'not a directory' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents

	efm_is( false, EFM_Fonts::write_css_file(), 'a write nothing can complete fails' );
	efm_ok( EFM_Fonts::css_write_failed(), 'and the failure is remembered for the save to report' );

	$GLOBALS['wp_filesystem'] = $efm_css_kept;
	$efm_test_filters         = array( 'efm_fonts_dir' => $efm_css_root );

	efm_ok( EFM_Fonts::write_css_file(), 'a later success clears the flag' );
	efm_is( false, EFM_Fonts::css_write_failed(), 'so one failure does not stick to every save after it' );
} finally {
	$efm_test_filters = array();
	efm_storage_cleanup( $efm_css_root );
}
