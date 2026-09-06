<?php
/** Dependency-free storage regression tests, included by run.php. */
$efm_test_multisite = false;
$efm_test_blog = 1;
$efm_test_options = array();
$efm_test_filters = array();
$efm_test_hooks = array();
$efm_test_root = sys_get_temp_dir() . '/efm-storage-' . bin2hex( random_bytes( 8 ) );
mkdir( $efm_test_root );
define( 'WP_CONTENT_DIR', $efm_test_root );
define( 'FS_CHMOD_FILE', 0644 );
define( 'WEEK_IN_SECONDS', 604800 );
function is_multisite() { return $GLOBALS['efm_test_multisite']; }
function doing_action( $hook ) { return ( $GLOBALS['efm_test_active_action'] ?? '' ) === $hook; }
function get_current_blog_id() { return $GLOBALS['efm_test_blog']; }
function trailingslashit( $s ) { return rtrim( $s, '/\\' ) . '/'; }
function content_url( $s = '' ) { return 'https://example.test/wp-content' . $s; }
function get_option( $k, $default = false ) { return $GLOBALS['efm_test_options'][get_current_blog_id()][$k] ?? $default; }
function update_option( $k, $v, $autoload = null ) { $GLOBALS['efm_test_options'][get_current_blog_id()][$k] = $v; return true; }
function add_option( $k, $v, $deprecated = '', $autoload = null ) { if ( null !== get_option( $k, null ) ) { return false; } return update_option( $k, $v ); }
function delete_option( $k ) { unset( $GLOBALS['efm_test_options'][get_current_blog_id()][$k] ); }
function delete_transient( $k ) { return true; }
function wp_parse_args( $a, $b ) { return array_merge( $b, $a ); }
function wp_mkdir_p( $p ) { return is_dir( $p ) || mkdir( $p, 0777, true ); }
function wp_delete_file( $p ) { return unlink( $p ); }
function esc_url_raw( $s ) { return $s; }
function __( $s, $domain = '' ) { return $s; }
function is_wp_error( $v ) { return $v instanceof WP_Error; }
function add_action( $hook, $callback ) { $GLOBALS['efm_test_hooks'][$hook][] = $callback; }
class WP_Error { public function __construct( $code, $message = '', $data = array() ) {} }
class EFM_Storage_Test_Filesystem {
 public function put_contents( $p, $s, $mode ) { return false !== file_put_contents( $p, $s ); }
}
$wp_filesystem = new EFM_Storage_Test_Filesystem();
class EFM_Storage_Test_Publisher extends EFM_Fonts {
 public static function publish( $source, $target ) { return parent::publish_migration_file( $source, $target ); }
}
class EFM_Storage_Test_Failed_Writer extends EFM_Storage_Test_Publisher {
 protected static function write_migration_bytes( $handle, $bytes ) { fwrite( $handle, substr( $bytes, 0, 2 ) ); fflush( $handle ); return false; }
}
function efm_storage_family( $file ) { return array( array( 'name' => 'Shared', 'variants' => array( array( 'file' => $file, 'weight' => '400', 'style' => 'normal' ) ) ) ); }
function efm_storage_cleanup( $p ) {
 if ( is_link( $p ) || ! is_dir( $p ) ) { unlink( $p ); return; }
 foreach ( new DirectoryIterator( $p ) as $f ) { if ( ! $f->isDot() ) { efm_storage_cleanup( $f->getPathname() ); } }
 rmdir( $p );
}
try {
 efm_is( $efm_test_root . '/fonts/', EFM_Fonts::dir(), 'single-site default directory unchanged' );
 efm_is( 'https://example.test/wp-content/fonts/', EFM_Fonts::url(), 'single-site default URL unchanged' );
 EFM_Fonts::ensure_dir();
 $shared = EFM_Fonts::dir();
 file_put_contents( $shared . 'shared.woff2', 'wOF2' . str_repeat( 'x', 32 ) );
 file_put_contents( $shared . 'unmapped.woff2', 'wOF2' . str_repeat( 'y', 32 ) );
 file_put_contents( $shared . 'efm-fonts.css', 'SHARED CSS MUST SURVIVE' );
 $efm_test_multisite = true;
 EFM_Fonts::init();
 efm_ok( in_array( array( 'EFM_Fonts', 'maybe_upgrade' ), $efm_test_hooks['switch_blog'], true ), 'switch_blog runs storage upgrade' );
 update_option( EFM_Fonts::OPTION_FAMILIES, efm_storage_family( 'shared.woff2' ) );
 update_option( 'efm_version', EFM_VERSION );
 foreach ( array( 'wp_insert_site', 'wp_initialize_site' ) as $action ) {
  $efm_test_active_action = $action;
  EFM_Fonts::maybe_upgrade();
  efm_is( false, get_option( EFM_Fonts::OPTION_STORAGE ), 'migration defers during ' . $action );
  efm_ok( ! is_dir( EFM_Fonts::dir() ), 'no storage writes during ' . $action );
 }
 $efm_test_active_action = '';
 EFM_Fonts::maybe_upgrade();
 $site1 = EFM_Fonts::dir();
 efm_is( $shared . 'efm-sites/1/', $site1, 'main network site is isolated too' );
 efm_is( 'https://example.test/wp-content/fonts/efm-sites/1/', EFM_Fonts::url(), 'URL matches site namespace' );
 efm_ok( file_exists( $site1 . 'shared.woff2' ), 'automatic upgrade copies even at unchanged version' );
 efm_is( file_get_contents( $shared . 'shared.woff2' ), file_get_contents( $site1 . 'shared.woff2' ), 'migration copy is byte identical' );
 efm_ok( ! file_exists( $site1 . 'unmapped.woff2' ), 'unmapped shared files are not adopted' );
 efm_is( 'SHARED CSS MUST SURVIVE', file_get_contents( $shared . 'efm-fonts.css' ), 'upgrade never overwrites shared CSS' );
 efm_ok( false !== strpos( file_get_contents( EFM_Fonts::css_path() ), 'shared.woff2' ), 'isolated CSS declares copied file' );
 $efm_test_blog = 2;
 update_option( EFM_Fonts::OPTION_FAMILIES, efm_storage_family( 'shared.woff2' ) );
 efm_ok( EFM_Fonts::migrate_multisite_storage(), 'second site migration completes' );
 $site2 = EFM_Fonts::dir();
 efm_is( $shared . 'efm-sites/2/', $site2, 'site switching resolves current site without cached paths' );
 efm_is( false, EFM_Fonts::path_is_inside( $site1 . 'shared.woff2' ), 'other site paths fail containment' );
 efm_is( true, EFM_Fonts::delete_file( 'shared.woff2' ), 'delete succeeds on private copy' );
 efm_ok( file_exists( $site1 . 'shared.woff2' ) && file_exists( $shared . 'shared.woff2' ), 'deleting a copy preserves other site and shared original' );
 update_option( EFM_Fonts::OPTION_FAMILIES, efm_storage_family( 'unmapped.woff2' ) );
 EFM_Fonts::migrate_multisite_storage();
 efm_ok( ! file_exists( $site2 . 'unmapped.woff2' ), 'later mutable records do not restart migration' );
 efm_ok( ! file_exists( $site2 . 'shared.woff2' ), 'deleted copies are not resurrected' );
 $efm_test_blog = 3;
 EFM_Fonts::ensure_dir();
 file_put_contents( EFM_Fonts::dir() . 'shared.woff2', 'existing site file' );
 update_option( EFM_Fonts::OPTION_FAMILIES, efm_storage_family( 'shared.woff2' ) );
 EFM_Fonts::migrate_multisite_storage();
 efm_is( 'existing site file', file_get_contents( EFM_Fonts::dir() . 'shared.woff2' ), 'migration never overwrites destination files' );
 $efm_test_filters['efm_fonts_dir'] = $efm_test_root . '/custom';
 $efm_test_filters['efm_fonts_url'] = 'https://cdn.test/custom';
 efm_is( $efm_test_root . '/custom/efm-sites/3/', EFM_Fonts::dir(), 'filtered base cannot strip namespace' );
 efm_is( 'https://cdn.test/custom/efm-sites/3/', EFM_Fonts::url(), 'filtered URL receives same namespace' );
 $efm_test_filters = array();
 if ( function_exists( 'symlink' ) ) {
  $efm_test_blog = 4;
  symlink( $shared, rtrim( EFM_Fonts::dir(), '/' ) );
  update_option( EFM_Fonts::OPTION_FAMILIES, efm_storage_family( 'shared.woff2' ) );
  efm_is( false, EFM_Fonts::migrate_multisite_storage(), 'linked site directory blocks migration' );
  efm_is( false, EFM_Fonts::write_css_file(), 'linked site directory blocks CSS writes' );
  efm_ok( is_wp_error( EFM_Fonts::delete_file( 'shared.woff2' ) ), 'linked site directory blocks deletes' );
  efm_is( array(), EFM_Fonts::owned_files(), 'linked site directory cannot supply uninstall purge paths' );
  update_option( EFM_Fonts::OPTION_FAMILIES, efm_storage_family( 'unmapped.woff2' ) );
  unlink( rtrim( EFM_Fonts::dir(), '/' ) );
  efm_ok( EFM_Fonts::migrate_multisite_storage(), 'migration retries once linked directory is fixed' );
  efm_ok( file_exists( EFM_Fonts::dir() . 'shared.woff2' ) && ! file_exists( EFM_Fonts::dir() . 'unmapped.woff2' ), 'retry uses original snapshot rather than changed records' );
  symlink( $shared . 'efm-fonts.css', EFM_Fonts::dir() . 'linked.woff2' );
  efm_is( false, EFM_Fonts::file_present( 'linked.woff2' ), 'file symlink cannot be treated as owned font' );
  efm_ok( is_wp_error( EFM_Fonts::delete_file( 'linked.woff2' ) ), 'file symlink cannot be deleted through API' );
  symlink( $shared . 'missing.woff2', EFM_Fonts::dir() . 'broken.woff2' );
  efm_is( false, EFM_Fonts::path_is_inside( EFM_Fonts::dir() . 'broken.woff2' ), 'broken symlink cannot become a write destination' );
  if ( function_exists( 'link' ) ) {
   link( $shared . 'shared.woff2', EFM_Fonts::dir() . 'hard.woff2' );
   clearstatcache();
   efm_is( false, EFM_Fonts::path_is_inside( EFM_Fonts::dir() . 'hard.woff2' ), 'hard-linked multisite file cannot be mutated' );
  }
  unlink( EFM_Fonts::css_path() );
  symlink( $shared . 'efm-fonts.css', EFM_Fonts::css_path() );
  efm_is( false, EFM_Fonts::write_css_file(), 'CSS symlink cannot overwrite shared stylesheet' );
 }
 $efm_test_blog = 5;
 EFM_Fonts::ensure_dir();
 $target = EFM_Fonts::dir() . 'shared.woff2';
 $staging = EFM_Fonts::dir() . '.efm-migrate-' . hash( 'sha256', 'shared.woff2' ) . '.tmp';
 efm_is( false, EFM_Storage_Test_Failed_Writer::publish( $shared . 'shared.woff2', $target ), 'failed staging write does not succeed' );
 efm_ok( ! file_exists( $target ), 'failed staging write never exposes partial final font' );
 efm_ok( EFM_Storage_Test_Publisher::publish( $shared . 'shared.woff2', $target ), 'retry replaces interrupted partial staging bytes' );
 efm_is( file_get_contents( $shared . 'shared.woff2' ), file_get_contents( $target ), 'retry publishes full byte-identical font' );
 efm_ok( ! file_exists( $staging ), 'successful publication removes staging name' );
 unlink( $target );
 file_put_contents( $staging, 'partial' );
 $locked = fopen( $staging, 'c+b' );
 flock( $locked, LOCK_EX );
 efm_is( false, EFM_Storage_Test_Publisher::publish( $shared . 'shared.woff2', $target ), 'concurrent request refuses active staging lock' );
 efm_ok( ! file_exists( $target ), 'concurrent request cannot publish partial staging bytes' );
 fclose( $locked );
 efm_ok( EFM_Storage_Test_Publisher::publish( $shared . 'shared.woff2', $target ), 'migration resumes after writer lock is released' );
 unlink( $target );
 file_put_contents( $staging, file_get_contents( $shared . 'shared.woff2' ) );
 link( $staging, $target );
 clearstatcache();
 efm_ok( EFM_Storage_Test_Publisher::publish( $shared . 'shared.woff2', $target ), 'retry recovers interruption after atomic link before staging unlink' );
 efm_ok( ! file_exists( $staging ) && EFM_Fonts::path_is_inside( $target ), 'recovery leaves a single-link private font' );
 efm_is( file_get_contents( $shared . 'shared.woff2' ), file_get_contents( $target ), 'post-link recovery preserves complete font bytes' );
 $efm_test_filters['efm_fonts_dir'] = $efm_test_root . '/linked-root';
 wp_mkdir_p( $efm_test_filters['efm_fonts_dir'] );
 if ( function_exists( 'symlink' ) ) {
  symlink( $shared, $efm_test_filters['efm_fonts_dir'] . '/efm-sites' );
  efm_is( false, EFM_Fonts::write_css_file(), 'linked namespace parent blocks writes' );
 }
 $efm_test_filters = array();
 $efm_test_blog = 1;
 update_option( EFM_Fonts::OPTION_SETTINGS, array( 'purge_files' => true ) );
 define( 'WP_UNINSTALL_PLUGIN', true );
 require dirname( __DIR__ ) . '/uninstall.php';
 efm_ok( ! file_exists( $site1 . 'shared.woff2' ), 'uninstall purges current site copy when opted in' );
 efm_ok( file_exists( $shared . 'shared.woff2' ), 'uninstall leaves shared original intact' );
 efm_is( 'SHARED CSS MUST SURVIVE', file_get_contents( $shared . 'efm-fonts.css' ), 'uninstall leaves shared CSS intact' );
 efm_ok( null !== get_option( EFM_Fonts::OPTION_STORAGE, null ), 'migration marker survives uninstall to prevent re-adoption' );
 $efm_test_blog = 3;
 efm_ok( file_exists( EFM_Fonts::dir() . 'shared.woff2' ), 'uninstall does not purge another site' );
} finally {
 efm_storage_cleanup( $efm_test_root );
}
