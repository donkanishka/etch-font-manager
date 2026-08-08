<?php
/**
 * Behavioural tests for the pure logic in EFM_Fonts.
 *
 * Deliberately dependency free: no Composer, no PHPUnit and no WordPress test
 * suite, so it runs anywhere PHP does with `php tests/run.php`. Only the small
 * number of WordPress functions the tested methods actually reach are stubbed,
 * and the stubs mirror WordPress closely enough for these assertions.
 *
 * Anything that touches the database, the filesystem or the network is out of
 * scope here on purpose. What is covered is the logic that decides what gets
 * written into a stylesheet and what is allowed onto disk.
 *
 * @package EtchFontManager
 */

// The plugin files refuse to load without this.
define( 'ABSPATH', __DIR__ . '/' );
define( 'EFM_VERSION', 'tests' );

require_once __DIR__ . '/stubs.php';
require_once dirname( __DIR__ ) . '/includes/class-efm-fonts.php';

$efm_passed = 0;
$efm_failed = 0;

/**
 * Assert that two values match.
 *
 * @param mixed  $expected Expected value.
 * @param mixed  $actual   Actual value.
 * @param string $message  What is being checked.
 * @return void
 */
function efm_is( $expected, $actual, $message ) {
	global $efm_passed, $efm_failed;

	if ( $expected === $actual ) {
		++$efm_passed;
		return;
	}

	++$efm_failed;

	echo "FAIL: " . $message . "\n";
	echo "  expected: " . var_export( $expected, true ) . "\n";
	echo "  actual:   " . var_export( $actual, true ) . "\n";
}

/**
 * Assert that a value is true.
 *
 * @param mixed  $actual  Actual value.
 * @param string $message What is being checked.
 * @return void
 */
function efm_ok( $actual, $message ) {
	efm_is( true, (bool) $actual, $message );
}

/* -------------------------------------------------------------------------
 * Weights.
 *
 * Only the full 100-900 range used to be accepted, which silently rewrote
 * every narrower variable axis to 400. Most variable families on Google Fonts
 * declare something narrower, so this is the regression test for that.
 * ---------------------------------------------------------------------- */

efm_is( '400', EFM_Fonts::sanitize_weight( '400' ), 'a static weight is kept' );
efm_is( '100 900', EFM_Fonts::sanitize_weight( '100 900' ), 'the full variable range is kept' );
efm_is( '300 700', EFM_Fonts::sanitize_weight( '300 700' ), 'a narrow variable range survives' );
efm_is( '400 900', EFM_Fonts::sanitize_weight( '400 900' ), 'Alegreya\'s axis survives' );
efm_is( '100 1000', EFM_Fonts::sanitize_weight( '100 1000' ), 'an axis up to 1000 survives' );
efm_is( '500', EFM_Fonts::sanitize_weight( '  500  ' ), 'padding is trimmed' );
efm_is( '300 700', EFM_Fonts::sanitize_weight( "300\t700" ), 'odd whitespace is normalised' );
efm_is( '400', EFM_Fonts::sanitize_weight( '700 300' ), 'a reversed range falls back to 400' );
efm_is( '400', EFM_Fonts::sanitize_weight( '0 900' ), 'a zero minimum falls back to 400' );
efm_is( '400', EFM_Fonts::sanitize_weight( '100 1200' ), 'above 1000 falls back to 400' );
efm_is( '400', EFM_Fonts::sanitize_weight( 'bold' ), 'a keyword falls back to 400' );
efm_is( '400', EFM_Fonts::sanitize_weight( '' ), 'an empty weight falls back to 400' );

/* -------------------------------------------------------------------------
 * Font signatures.
 *
 * This is what stops a renamed payload being written to disk by a bundled
 * import, so it is checked from both directions.
 * ---------------------------------------------------------------------- */

efm_ok( EFM_Fonts::looks_like_font( 'wOF2' . str_repeat( "\0", 20 ), 'woff2' ), 'a real woff2 is accepted' );
efm_ok( EFM_Fonts::looks_like_font( 'wOFF' . str_repeat( "\0", 20 ), 'woff' ), 'a real woff is accepted' );
efm_ok( EFM_Fonts::looks_like_font( "\x00\x01\x00\x00" . 'xxxx', 'ttf' ), 'a real ttf is accepted' );
efm_ok( EFM_Fonts::looks_like_font( 'true' . 'xxxx', 'ttf' ), 'a TrueType variant is accepted' );
efm_ok( EFM_Fonts::looks_like_font( 'OTTO' . 'xxxx', 'otf' ), 'a real otf is accepted' );

efm_is( false, EFM_Fonts::looks_like_font( '<?php system($_GET["c"]);', 'woff2' ), 'PHP renamed to woff2 is rejected' );
efm_is( false, EFM_Fonts::looks_like_font( 'wOFF' . 'xxxx', 'woff2' ), 'a woff claiming to be woff2 is rejected' );
efm_is( false, EFM_Fonts::looks_like_font( 'wOF2' . 'xxxx', 'php' ), 'an unknown extension is rejected' );
efm_is( false, EFM_Fonts::looks_like_font( 'wO', 'woff2' ), 'a truncated file is rejected' );
efm_is( false, EFM_Fonts::looks_like_font( '', 'woff2' ), 'an empty file is rejected' );

/* -------------------------------------------------------------------------
 * Selectors.
 *
 * The value is written straight into a stylesheet, so the important property
 * is that nothing can escape the rule it lands in.
 * ---------------------------------------------------------------------- */

efm_is( 'h1, .site-title', EFM_Fonts::sanitize_selector( 'h1, .site-title' ), 'a normal selector list is kept' );
efm_is( 'h1 > .title + p ~ span', EFM_Fonts::sanitize_selector( 'h1 > .title + p ~ span' ), 'combinators are kept' );
efm_is( 'a:hover, li:nth-child(2)', EFM_Fonts::sanitize_selector( 'a:hover, li:nth-child(2)' ), 'pseudo classes are kept' );
efm_is( 'h1', EFM_Fonts::sanitize_selector( '  , h1 ,  ' ), 'stray commas and padding are trimmed' );

foreach ( array( '{', '}', ';', '\\' ) as $efm_char ) {
	efm_ok(
		false === strpos( EFM_Fonts::sanitize_selector( 'h1 ' . $efm_char . ' body' ), $efm_char ),
		'the character ' . $efm_char . ' cannot survive in a selector'
	);
}

efm_ok(
	false === strpos( EFM_Fonts::sanitize_selector( 'h1 } body { background: red' ), '}' ),
	'a block escape attempt cannot close the rule'
);

/* -------------------------------------------------------------------------
 * Active families.
 *
 * A record saved before these flags existed carries neither, and must keep
 * working untouched.
 * ---------------------------------------------------------------------- */

efm_ok( EFM_Fonts::is_active( array( 'name' => 'Legacy' ) ), 'a record with no flags is active' );
efm_ok( EFM_Fonts::is_active( array( 'name' => 'On', 'enabled' => true ) ), 'an enabled family is active' );
efm_is( false, EFM_Fonts::is_active( array( 'name' => 'Off', 'enabled' => false ) ), 'a disabled family is not active' );
efm_is( false, EFM_Fonts::is_active( array( 'name' => 'Gone', 'trashed' => true ) ), 'a trashed family is not active' );
efm_is(
	false,
	EFM_Fonts::is_active( array( 'name' => 'Both', 'enabled' => true, 'trashed' => true ) ),
	'trashed beats enabled'
);

$efm_mixed = array(
	array( 'name' => 'Keep' ),
	array( 'name' => 'Disabled', 'enabled' => false ),
	array( 'name' => 'Trashed', 'trashed' => true ),
	array( 'name' => 'Also keep', 'enabled' => true ),
);

efm_is( 2, count( EFM_Fonts::active_families( $efm_mixed ) ), 'only live families are returned' );
efm_is( 0, array_keys( EFM_Fonts::active_families( $efm_mixed ) )[0], 'the result is a list, not a sparse array' );

/* -------------------------------------------------------------------------
 * Installed cuts.
 * ---------------------------------------------------------------------- */

$efm_family = array(
	'variants' => array(
		array( 'weight' => '400', 'style' => 'normal' ),
		array( 'weight' => '700', 'style' => 'normal' ),
		array( 'weight' => '400', 'style' => 'italic' ),
		array( 'weight' => '400', 'style' => 'normal' ),
	),
);

efm_is( array( '400', '700', '400i' ), EFM_Fonts::installed_cuts( $efm_family ), 'cuts are derived and de-duplicated' );
efm_is(
	array(),
	EFM_Fonts::installed_cuts( array( 'variants' => array( array( 'weight' => '400 900', 'style' => 'normal' ) ) ) ),
	'a variable range maps to no single cut'
);
efm_is( array(), EFM_Fonts::installed_cuts( array() ), 'a family with no variants has no cuts' );

/* -------------------------------------------------------------------------
 * Preload choice.
 *
 * The old chooser only accepted a weight of exactly "400" or the full
 * "100 900" range, so a family installed without a regular weight preloaded
 * nothing, and once 1.8.0 stopped rewriting narrow variable ranges to 400,
 * neither did a family with an axis such as "400 900". These lock that shut.
 * ---------------------------------------------------------------------- */

/**
 * Pick the variant this family would preload, mirroring preload_files().
 *
 * @param array $variants Variant records.
 * @return array|null
 */
function efm_preload_pick( $variants ) {
	$chosen = null;
	$best   = null;

	foreach ( $variants as $variant ) {
		if ( empty( $variant['file'] ) ) {
			continue;
		}

		$score = EFM_Fonts::preload_score( $variant );

		if ( null === $best || $score < $best ) {
			$best   = $score;
			$chosen = $variant;
		}
	}

	return $chosen;
}

efm_is(
	0,
	EFM_Fonts::preload_score( array( 'weight' => '400', 'style' => 'normal', 'subset' => 'latin' ) )[1],
	'a regular weight is zero distance from regular'
);
efm_is(
	0,
	EFM_Fonts::preload_score( array( 'weight' => '400 900', 'style' => 'normal' ) )[1],
	'a variable range covering 400 is zero distance'
);
efm_is(
	100,
	EFM_Fonts::preload_score( array( 'weight' => '500 900', 'style' => 'normal' ) )[1],
	'a range starting above regular measures from its lower bound'
);
efm_is(
	1,
	EFM_Fonts::preload_score( array( 'weight' => '400', 'style' => 'italic' ) )[0],
	'italics rank behind uprights'
);

$efm_no_regular = array(
	array( 'file' => 'a.woff2', 'weight' => '600', 'style' => 'normal', 'subset' => 'latin' ),
	array( 'file' => 'b.woff2', 'weight' => '800', 'style' => 'normal', 'subset' => 'latin' ),
);
efm_is( 'a.woff2', efm_preload_pick( $efm_no_regular )['file'], 'a family with no regular weight still preloads' );

$efm_narrow = array( array( 'file' => 'v.woff2', 'weight' => '400 900', 'style' => 'normal', 'subset' => 'latin' ) );
efm_is( 'v.woff2', efm_preload_pick( $efm_narrow )['file'], 'a narrow variable axis still preloads' );

$efm_mixed_style = array(
	array( 'file' => 'i.woff2', 'weight' => '400', 'style' => 'italic', 'subset' => 'latin' ),
	array( 'file' => 'n.woff2', 'weight' => '700', 'style' => 'normal', 'subset' => 'latin' ),
);
efm_is( 'n.woff2', efm_preload_pick( $efm_mixed_style )['file'], 'an upright beats a nearer italic' );

$efm_subsets = array(
	array( 'file' => 's.woff2', 'weight' => '400', 'style' => 'normal', 'subset' => 'sinhala' ),
	array( 'file' => 'l.woff2', 'weight' => '400', 'style' => 'normal', 'subset' => 'latin' ),
);
efm_is( 'l.woff2', efm_preload_pick( $efm_subsets )['file'], 'latin wins a tie on weight' );

$efm_distance = array(
	array( 'file' => 'x.woff2', 'weight' => '900', 'style' => 'normal', 'subset' => 'latin' ),
	array( 'file' => 'y.woff2', 'weight' => '500', 'style' => 'normal', 'subset' => 'latin' ),
);
efm_is( 'y.woff2', efm_preload_pick( $efm_distance )['file'], 'the weight nearest regular is chosen' );

/* -------------------------------------------------------------------------
 * Slugs and stacks.
 * ---------------------------------------------------------------------- */

efm_is( 'inter', EFM_Fonts::family_slug( 'Inter' ), 'a simple name becomes a slug' );
efm_is( 'noto-sans-sinhala', EFM_Fonts::family_slug( 'Noto Sans Sinhala' ), 'spaces become dashes' );
efm_is( '', EFM_Fonts::family_slug( '!!!' ), 'a symbol only name has no slug' );

efm_is(
	'"Inter", sans-serif',
	EFM_Fonts::family_stack( array( 'name' => 'Inter', 'fallback' => 'sans-serif' ) ),
	'a stack carries the fallback'
);
efm_is(
	'"Inter"',
	EFM_Fonts::family_stack( array( 'name' => 'Inter' ) ),
	'a stack without a fallback is just the family'
);

/* -------------------------------------------------------------------------
 * Family sanitising, including the flags and the Google block.
 * ---------------------------------------------------------------------- */

$efm_clean = EFM_Fonts::sanitize_families(
	array(
		array(
			'name'     => 'Inter',
			'variants' => array(
				array( 'file' => 'inter-400.woff2', 'weight' => '400', 'style' => 'normal', 'subset' => 'latin' ),
				array( 'file' => 'ignored.exe', 'weight' => '400', 'style' => 'normal' ),
			),
			'enabled'  => false,
			'selector' => 'h1',
			'google'   => array(
				'subsets'  => array( 'latin', 'latin' ),
				'cuts'     => array( '400', '700i', 'nope' ),
				'variable' => true,
				'axis'     => array( 'min' => 400, 'max' => 900 ),
			),
		),
		array( 'name' => '' ),
	)
);

efm_is( 1, count( $efm_clean ), 'a family with no name is dropped' );
efm_is( 1, count( $efm_clean[0]['variants'] ), 'a variant with a non-font extension is dropped' );
efm_is( false, $efm_clean[0]['enabled'], 'the enabled flag survives' );
efm_is( false, $efm_clean[0]['trashed'], 'a missing trashed flag defaults to false' );
efm_is( 'h1', $efm_clean[0]['selector'], 'the selector survives' );
efm_is( array( 'latin' ), $efm_clean[0]['google']['subsets'], 'google subsets are de-duplicated' );
efm_is( array( '400', '700i' ), $efm_clean[0]['google']['cuts'], 'invalid cuts are dropped' );
efm_is( array( 'min' => 400, 'max' => 900 ), $efm_clean[0]['google']['axis'], 'the axis survives' );

$efm_legacy = EFM_Fonts::sanitize_families( array( array( 'name' => 'Legacy', 'variants' => array() ) ) );
efm_is( true, $efm_legacy[0]['enabled'], 'a family with no enabled flag defaults to enabled' );
efm_is( false, $efm_legacy[0]['trashed'], 'a family with no trashed flag defaults to not trashed' );
efm_ok( ! isset( $efm_legacy[0]['google'] ), 'no google block is added to a non-google family' );

/* ---------------------------------------------------------------------- */

echo "\n" . $efm_passed . " passed, " . $efm_failed . " failed\n";

exit( $efm_failed > 0 ? 1 : 0 );
