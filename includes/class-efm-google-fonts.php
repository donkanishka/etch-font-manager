<?php
/**
 * Google Fonts search and local installation.
 *
 * @package EtchFontManager
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class EFM_Google_Fonts
 */
class EFM_Google_Fonts {

	const TRANSIENT   = 'efm_google_fonts_index';
	const METADATA    = 'https://fonts.google.com/metadata/fonts';
	const CSS_API     = 'https://fonts.googleapis.com/css2';
	const USER_AGENT  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
	const CACHE_TTL   = WEEK_IN_SECONDS;
	const RESULTS_MAX = 24;

	/**
	 * Fetch (and cache) the Google Fonts index.
	 *
	 * @param bool $force Bypass the cache.
	 * @return array|WP_Error
	 */
	public static function index( $force = false ) {
		if ( ! $force ) {
			$cached = get_transient( self::TRANSIENT );
			if ( is_array( $cached ) && ! empty( $cached ) ) {
				return $cached;
			}
		}

		$response = wp_remote_get(
			self::METADATA,
			array(
				'timeout' => 15,
				'headers' => array( 'Accept' => 'application/json' ),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$body = wp_remote_retrieve_body( $response );

		// Google prefixes the JSON payload with )]}' to prevent JSON hijacking.
		$body = preg_replace( '/^\)\]\}\'\s*\n?/', '', $body );
		$data = json_decode( $body, true );

		if ( empty( $data['familyMetadataList'] ) ) {
			return new WP_Error(
				'efm_gf_parse',
				__( 'Could not read the Google Fonts index.', 'etch-font-manager' ),
				array( 'status' => 502 )
			);
		}

		$fonts = array();

		foreach ( $data['familyMetadataList'] as $meta ) {
			$variants = array();

			foreach ( array_keys( $meta['fonts'] ?? array() ) as $key ) {
				$key      = (string) $key;
				$italic   = 'i' === substr( $key, -1 );
				$variants[] = array(
					'weight' => rtrim( $key, 'i' ),
					'style'  => $italic ? 'italic' : 'normal',
				);
			}

			$fonts[] = array(
				'family'   => $meta['family'] ?? '',
				'category' => $meta['category'] ?? '',
				'variants' => $variants,
			);
		}

		set_transient( self::TRANSIENT, $fonts, self::CACHE_TTL );

		return $fonts;
	}

	/**
	 * Search the Google Fonts index.
	 *
	 * @param string $query Search term.
	 * @param int    $limit Maximum results.
	 * @return array|WP_Error
	 */
	public static function search( $query, $limit = self::RESULTS_MAX ) {
		$fonts = self::index();

		if ( is_wp_error( $fonts ) ) {
			return $fonts;
		}

		$query = trim( (string) $query );

		if ( '' !== $query ) {
			$needle = strtolower( $query );

			$fonts = array_values(
				array_filter(
					$fonts,
					static function ( $font ) use ( $needle ) {
						return false !== strpos( strtolower( $font['family'] ), $needle );
					}
				)
			);

			// Prefix matches first.
			usort(
				$fonts,
				static function ( $a, $b ) use ( $needle ) {
					$pa = 0 === strpos( strtolower( $a['family'] ), $needle ) ? 0 : 1;
					$pb = 0 === strpos( strtolower( $b['family'] ), $needle ) ? 0 : 1;

					return $pa === $pb ? strcasecmp( $a['family'], $b['family'] ) : $pa - $pb;
				}
			);
		}

		return array_slice( $fonts, 0, max( 1, (int) $limit ) );
	}

	/**
	 * Download a Google font locally and register it as a family.
	 *
	 * @param string $family Family name.
	 * @return array|WP_Error
	 */
	public static function install( $family ) {
		$family = EFM_Fonts::sanitize_family_name( $family );

		if ( '' === $family ) {
			return new WP_Error( 'efm_gf_no_family', __( 'No font family specified.', 'etch-font-manager' ), array( 'status' => 400 ) );
		}

		$url = add_query_arg(
			array(
				'family'  => rawurlencode( $family ) . ':ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900',
				'display' => 'swap',
			),
			self::CSS_API
		);

		$response = wp_remote_get(
			$url,
			array(
				'timeout'    => 20,
				'user-agent' => self::USER_AGENT,
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$css = wp_remote_retrieve_body( $response );

		if ( empty( $css ) ) {
			return new WP_Error( 'efm_gf_empty', __( 'Google Fonts returned an empty response.', 'etch-font-manager' ), array( 'status' => 502 ) );
		}

		$parsed = self::parse_css( $css );

		if ( empty( $parsed ) ) {
			return new WP_Error( 'efm_gf_no_variants', __( 'No downloadable variants were found for this font.', 'etch-font-manager' ), array( 'status' => 502 ) );
		}

		EFM_Fonts::ensure_dir();

		$slug     = sanitize_file_name( strtolower( str_replace( ' ', '-', $family ) ) );
		$variants = array();

		foreach ( $parsed as $variant ) {
			$filename    = $slug . '-' . $variant['weight'] . ( 'italic' === $variant['style'] ? 'i' : '' ) . '.woff2';
			$destination = EFM_Fonts::dir() . $filename;

			if ( ! EFM_Fonts::path_is_inside( $destination ) ) {
				continue;
			}

			if ( ! file_exists( $destination ) ) {
				$download = wp_remote_get(
					$variant['url'],
					array(
						'timeout'  => 30,
						'stream'   => true,
						'filename' => $destination,
					)
				);

				if ( is_wp_error( $download ) || 200 !== (int) wp_remote_retrieve_response_code( $download ) ) {
					if ( file_exists( $destination ) ) {
						wp_delete_file( $destination );
					}
					continue;
				}
			}

			$variants[] = array(
				'file'   => $filename,
				'weight' => $variant['weight'],
				'style'  => $variant['style'],
			);
		}

		if ( empty( $variants ) ) {
			return new WP_Error( 'efm_gf_download_failed', __( 'Could not download any font files.', 'etch-font-manager' ), array( 'status' => 502 ) );
		}

		$families = EFM_Fonts::families();
		$index    = null;

		foreach ( $families as $i => $existing ) {
			if ( 0 === strcasecmp( $existing['name'] ?? '', $family ) ) {
				$index = $i;
				break;
			}
		}

		if ( null === $index ) {
			$families[] = array(
				'name'     => $family,
				'variants' => $variants,
			);
		} else {
			$families[ $index ]['variants'] = $variants;
		}

		EFM_Fonts::save_families( $families );

		return array(
			'family'   => $family,
			'variants' => $variants,
		);
	}

	/**
	 * Extract one woff2 URL per weight/style from a Google Fonts CSS payload.
	 *
	 * Google returns one @font-face block per Unicode subset; only the "latin"
	 * subset is kept so each variant downloads a single file.
	 *
	 * @param string $css CSS payload.
	 * @return array<int,array<string,string>>
	 */
	protected static function parse_css( $css ) {
		$variants = array();
		$seen     = array();
		$chunks   = preg_split( '/\/\*\s*([\w-]+)\s*\*\//', $css, -1, PREG_SPLIT_DELIM_CAPTURE );

		if ( ! is_array( $chunks ) ) {
			return array();
		}

		for ( $i = 1; $i < count( $chunks ) - 1; $i += 2 ) {
			if ( 'latin' !== trim( $chunks[ $i ] ) ) {
				continue;
			}

			$block  = $chunks[ $i + 1 ];
			$style  = preg_match( '/font-style:\s*(italic|normal)/i', $block, $m ) ? strtolower( $m[1] ) : 'normal';
			$weight = preg_match( '/font-weight:\s*(\d+)/i', $block, $m ) ? $m[1] : '400';
			$key    = $weight . '-' . $style;

			if ( isset( $seen[ $key ] ) ) {
				continue;
			}

			if ( preg_match( '/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/i', $block, $m ) ) {
				$variants[]   = array(
					'url'    => $m[1],
					'weight' => $weight,
					'style'  => $style,
				);
				$seen[ $key ] = true;
			}
		}

		return $variants;
	}
}
