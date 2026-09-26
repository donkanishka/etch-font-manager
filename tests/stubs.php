<?php
/**
 * The few WordPress functions the tested methods actually reach.
 *
 * These mirror WordPress closely enough for the assertions in run.php. They are
 * not a general purpose shim, and nothing that talks to the database, the
 * filesystem or the network is stubbed, because none of it is under test here.
 *
 * @package EtchFontManager
 */

if ( ! function_exists( 'sanitize_text_field' ) ) {
	/**
	 * Strip tags and control characters, and collapse whitespace.
	 *
	 * @param string $str Raw value.
	 * @return string
	 */
	function sanitize_text_field( $str ) {
		$str = (string) $str;
		$str = wp_strip_all_tags( $str );
		$str = preg_replace( '/[\r\n\t ]+/', ' ', $str );
		$str = preg_replace( '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', (string) $str );

		return trim( (string) $str );
	}
}

if ( ! function_exists( 'wp_strip_all_tags' ) ) {
	/**
	 * Remove markup.
	 *
	 * @param string $string Raw value.
	 * @return string
	 */
	function wp_strip_all_tags( $string ) {
		return strip_tags( (string) $string );
	}
}

if ( ! function_exists( 'sanitize_title' ) ) {
	/**
	 * Lowercase, strip accents and reduce to a dash separated slug.
	 *
	 * @param string $title Raw value.
	 * @return string
	 */
	function sanitize_title( $title ) {
		$title = strtolower( (string) $title );
		$title = preg_replace( '/[^a-z0-9\s\-]/', '', $title );
		$title = preg_replace( '/[\s\-]+/', '-', (string) $title );

		return trim( (string) $title, '-' );
	}
}

if ( ! function_exists( 'sanitize_key' ) ) {
	/**
	 * Lowercase alphanumerics, dashes and underscores only.
	 *
	 * @param string $key Raw value.
	 * @return string
	 */
	function sanitize_key( $key ) {
		return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $key ) );
	}
}

if ( ! function_exists( 'sanitize_file_name' ) ) {
	/**
	 * Reduce a name to something safe to write to disk.
	 *
	 * @param string $filename Raw value.
	 * @return string
	 */
	function sanitize_file_name( $filename ) {
		$filename = (string) $filename;
		$filename = str_replace( array( '/', '\\', DIRECTORY_SEPARATOR ), '', $filename );
		$filename = preg_replace( '/[^a-zA-Z0-9_\-. ]/', '', $filename );
		$filename = preg_replace( '/\.{2,}/', '.', (string) $filename );

		return trim( (string) $filename, '.- ' );
	}
}

if ( ! function_exists( 'do_action' ) ) {
	/**
	 * Accept hooks in dependency-free tests.
	 *
	 * @param string $hook Hook name.
	 * @return void
	 */
	function do_action( $hook ) {
		unset( $hook );
	}
}

if ( ! function_exists( 'wp_list_pluck' ) ) {
	/**
	 * Pull one field from every record in a list.
	 *
	 * @param array  $input List of arrays or objects.
	 * @param string $field Field to return.
	 * @return array
	 */
	function wp_list_pluck( $input, $field ) {
		return array_map(
			static function ( $item ) use ( $field ) {
				return is_object( $item ) ? $item->{$field} : $item[ $field ];
			},
			(array) $input
		);
	}
}

if ( ! function_exists( 'home_url' ) ) {
	/**
	 * Return the fixed site URL used by export metadata in these tests.
	 *
	 * @param string $path Optional path beneath the site root.
	 * @return string
	 */
	function home_url( $path = '' ) {
		return 'https://example.test/' . ltrim( (string) $path, '/' );
	}
}

if ( ! function_exists( 'apply_filters' ) ) {
	/**
	 * Return the value untouched; no hooks exist in these tests.
	 *
	 * @param string $hook_name Hook name.
	 * @param mixed  $value     Value to filter.
	 * @return mixed
	 */
	function apply_filters( $hook_name, $value ) {
		return $GLOBALS['efm_test_filters'][ $hook_name ] ?? $value;
	}
}
