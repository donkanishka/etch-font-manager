<?php
/**
 * Dependency-free updater regression tests, included by run.php.
 *
 * Only the manual check's wording is covered here, because that is where a
 * failed lookup used to be indistinguishable from good news. Everything else
 * in the updater talks to the network or to transients and is out of scope for
 * a suite that runs anywhere PHP does.
 *
 * @package EtchFontManager
 */

require_once dirname( __DIR__ ) . '/includes/class-efm-updater.php';

/* -------------------------------------------------------------------------
 * A lookup that returned nothing is a failure, not a clean bill of health.
 * ---------------------------------------------------------------------- */

$efm_failed_check = EFM_Updater::check_message( array(), '1.0.11' );

efm_is( 'warning', $efm_failed_check['type'], 'a failed lookup is reported as a warning' );
efm_ok(
	false === strpos( $efm_failed_check['message'], 'up to date' ) || false !== strpos( $efm_failed_check['message'], 'does not confirm' ),
	'a failed lookup never claims the plugin is up to date'
);
efm_ok(
	false !== strpos( $efm_failed_check['message'], 'could not check' ),
	'a failed lookup says it could not check'
);

/*
 * The same shape the updater actually hands over when the cache holds a failed
 * lookup: release() returns an empty array rather than false.
 */
$efm_no_version = EFM_Updater::check_message( array( 'package' => 'https://example.test/x.zip' ), '1.0.11' );

efm_is( 'warning', $efm_no_version['type'], 'release data with no version counts as a failure' );

/* -------------------------------------------------------------------------
 * A successful lookup keeps both of the answers it always gave.
 * ---------------------------------------------------------------------- */

$efm_available = EFM_Updater::check_message( array( 'version' => '1.0.12' ), '1.0.11' );

efm_is( 'info', $efm_available['type'], 'an available update is informational' );
efm_ok( false !== strpos( $efm_available['message'], '1.0.12' ), 'an available update names the version' );

$efm_current = EFM_Updater::check_message( array( 'version' => '1.0.11' ), '1.0.11' );

efm_is( 'info', $efm_current['type'], 'a matching version is informational' );
efm_ok( false !== strpos( $efm_current['message'], 'up to date' ), 'a matching version reports up to date' );

$efm_behind = EFM_Updater::check_message( array( 'version' => '1.0.10' ), '1.0.11' );

efm_ok(
	false !== strpos( $efm_behind['message'], 'up to date' ),
	'a release older than the installed build still reports up to date'
);
