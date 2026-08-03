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

	/*
	 * The cache key carries a shape version. Adding a field to the cached index
	 * must bump it, otherwise sites that upgrade keep serving the old shape
	 * until the transient expires.
	 */
	const TRANSIENT   = 'efm_google_fonts_index_v2';
	const TRANSIENT_LEGACY = 'efm_google_fonts_index';
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

			$subsets = array();
			foreach ( (array) ( $meta['subsets'] ?? array() ) as $subset ) {
				$subset = sanitize_key( $subset );
				if ( '' !== $subset && 'menu' !== $subset ) {
					$subsets[] = $subset;
				}
			}

			// A wght axis means the family has a variable cut, which installs as
			// one file per subset instead of one per weight.
			$wght = array();

			foreach ( (array) ( $meta['axes'] ?? array() ) as $axis ) {
				if ( 'wght' === ( $axis['tag'] ?? '' ) ) {
					$wght = array(
						'min' => (int) $axis['min'],
						'max' => (int) $axis['max'],
					);
				}
			}

			$fonts[] = array(
				'family'     => $meta['family'] ?? '',
				'category'   => $meta['category'] ?? '',
				'variants'   => $variants,
				'subsets'    => $subsets,
				'popularity' => (int) ( $meta['popularity'] ?? PHP_INT_MAX ),
				'wght'       => $wght,
			);
		}

		set_transient( self::TRANSIENT, $fonts, self::CACHE_TTL );

		return $fonts;
	}

	/**
	 * Search or browse the Google Fonts index.
	 *
	 * With no search term this browses the whole library, which is why the
	 * category filter, sort order and paging all live here rather than in the
	 * panel: the index is nearly two thousand families.
	 *
	 * @param string $query Search term.
	 * @param array  $args  category, sort, limit, offset.
	 * @return array|WP_Error
	 */
	public static function search( $query, $args = array() ) {
		$fonts = self::index();

		if ( is_wp_error( $fonts ) ) {
			return $fonts;
		}

		$args = wp_parse_args(
			$args,
			array(
				'category' => '',
				'sort'     => 'popularity',
				'limit'    => self::RESULTS_MAX,
				'offset'   => 0,
			)
		);

		$query    = trim( (string) $query );
		$needle   = strtolower( $query );
		$category = strtolower( trim( (string) $args['category'] ) );

		if ( '' !== $needle ) {
			$fonts = array_values(
				array_filter(
					$fonts,
					static function ( $font ) use ( $needle ) {
						return false !== strpos( strtolower( $font['family'] ), $needle );
					}
				)
			);
		}

		if ( '' !== $category ) {
			$fonts = array_values(
				array_filter(
					$fonts,
					static function ( $font ) use ( $category ) {
						return strtolower( (string) $font['category'] ) === $category;
					}
				)
			);
		}

		$alphabetical = 'alphabetical' === $args['sort'];

		usort(
			$fonts,
			static function ( $a, $b ) use ( $needle, $alphabetical ) {
				// However the list is sorted, an exact prefix match ranks first.
				if ( '' !== $needle ) {
					$pa = 0 === strpos( strtolower( $a['family'] ), $needle ) ? 0 : 1;
					$pb = 0 === strpos( strtolower( $b['family'] ), $needle ) ? 0 : 1;

					if ( $pa !== $pb ) {
						return $pa - $pb;
					}
				}

				if ( $alphabetical ) {
					return strcasecmp( $a['family'], $b['family'] );
				}

				return $a['popularity'] <=> $b['popularity'];
			}
		);

		$total  = count( $fonts );
		$limit  = max( 1, min( 60, (int) $args['limit'] ) );
		$offset = max( 0, (int) $args['offset'] );

		return array(
			'results' => array_slice( $fonts, $offset, $limit ),
			'total'   => $total,
			'offset'  => $offset,
			'limit'   => $limit,
		);
	}

	/**
	 * Categories present in the index.
	 *
	 * @return string[]
	 */
	public static function categories() {
		$fonts = self::index();

		if ( is_wp_error( $fonts ) ) {
			return array();
		}

		$categories = array();

		foreach ( $fonts as $font ) {
			if ( ! empty( $font['category'] ) && ! in_array( $font['category'], $categories, true ) ) {
				$categories[] = $font['category'];
			}
		}

		sort( $categories );

		return $categories;
	}

	/**
	 * Download a Google font locally and register it as a family.
	 *
	 * @param string   $family   Family name.
	 * @param string[] $subsets  Subsets to download. Defaults to latin.
	 * @param bool     $variable Install the variable cut when the family has one.
	 * @return array|WP_Error
	 */
	public static function install( $family, $subsets = array(), $variable = false ) {
		$family = EFM_Fonts::sanitize_family_name( $family );

		if ( '' === $family ) {
			return new WP_Error( 'efm_gf_no_family', __( 'No font family specified.', 'etch-font-manager' ), array( 'status' => 400 ) );
		}

		$subsets = array_values( array_filter( array_map( 'sanitize_key', (array) $subsets ) ) );

		if ( empty( $subsets ) ) {
			$subsets = array( 'latin' );
		}

		// The weight axis is read from the index rather than trusted from the
		// request, so a family without a variable cut cannot be forced into one.
		$axis = $variable ? self::weight_axis( $family ) : array();

		$specs = self::css_specs( $axis );
		$css   = '';

		foreach ( $specs as $spec ) {
			$response = wp_remote_get(
				add_query_arg(
					array(
						'family'  => rawurlencode( $family ) . $spec,
						'display' => 'swap',
					),
					self::CSS_API
				),
				array(
					'timeout'    => 20,
					'user-agent' => self::USER_AGENT,
				)
			);

			if ( is_wp_error( $response ) ) {
				return $response;
			}

			if ( 200 === (int) wp_remote_retrieve_response_code( $response ) ) {
				$css = wp_remote_retrieve_body( $response );

				if ( ! empty( $css ) ) {
					break;
				}
			}
		}

		if ( empty( $css ) ) {
			return new WP_Error( 'efm_gf_empty', __( 'Google Fonts returned an empty response.', 'etch-font-manager' ), array( 'status' => 502 ) );
		}

		$parsed = self::parse_css( $css, $subsets );

		if ( empty( $parsed ) ) {
			return new WP_Error( 'efm_gf_no_variants', __( 'No downloadable variants were found for the selected subsets.', 'etch-font-manager' ), array( 'status' => 502 ) );
		}

		EFM_Fonts::ensure_dir();

		$slug     = sanitize_file_name( strtolower( str_replace( ' ', '-', $family ) ) );
		$variants = array();

		foreach ( $parsed as $variant ) {
			$cut = false !== strpos( $variant['weight'], ' ' ) ? 'variable' : $variant['weight'];

			$filename = $slug . '-' . $cut
				. ( 'italic' === $variant['style'] ? 'i' : '' )
				. '-' . $variant['subset'] . '.woff2';

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
				'subset' => $variant['subset'],
				'range'  => $variant['range'],
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
			'subsets'  => $subsets,
			'variable' => ! empty( $axis ),
		);
	}

	/**
	 * The weight axis of a family, when it has a variable cut.
	 *
	 * @param string $family Family name.
	 * @return array{min:int,max:int}|array
	 */
	protected static function weight_axis( $family ) {
		$fonts = self::index();

		if ( is_wp_error( $fonts ) ) {
			return array();
		}

		foreach ( $fonts as $font ) {
			if ( 0 === strcasecmp( $font['family'], $family ) ) {
				return ! empty( $font['wght'] ) ? $font['wght'] : array();
			}
		}

		return array();
	}

	/**
	 * Family specs to try against the CSS API, best first.
	 *
	 * Not every family offers italics, and asking for one that does not exist
	 * returns an error, so each spec is tried until one responds.
	 *
	 * @param array $axis Weight axis, empty for a static install.
	 * @return string[]
	 */
	protected static function css_specs( $axis ) {
		if ( ! empty( $axis ) ) {
			$range = $axis['min'] . '..' . $axis['max'];

			return array(
				':ital,wght@0,' . $range . ';1,' . $range,
				':wght@' . $range,
			);
		}

		return array(
			':ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900',
			':wght@100;200;300;400;500;600;700;800;900',
		);
	}

	/**
	 * Extract woff2 URLs from a Google Fonts CSS payload.
	 *
	 * Google returns one @font-face block per Unicode subset, labelled with a
	 * comment such as "/* sinhala *\/". Every requested subset is kept, together
	 * with its unicode-range, so scripts other than latin actually render.
	 *
	 * @param string   $css     CSS payload.
	 * @param string[] $subsets Subsets to keep.
	 * @return array<int,array<string,string>>
	 */
	protected static function parse_css( $css, $subsets ) {
		$variants = array();
		$seen     = array();
		$chunks   = preg_split( '/\/\*\s*([\w-]+)\s*\*\//', $css, -1, PREG_SPLIT_DELIM_CAPTURE );

		if ( ! is_array( $chunks ) ) {
			return array();
		}

		$last = count( $chunks ) - 1;

		for ( $i = 1; $i < $last; $i += 2 ) {
			$subset = sanitize_key( trim( $chunks[ $i ] ) );

			if ( ! in_array( $subset, $subsets, true ) ) {
				continue;
			}

			$block  = $chunks[ $i + 1 ];
			$style = preg_match( '/font-style:\s*(italic|normal)/i', $block, $m ) ? strtolower( $m[1] ) : 'normal';

			// A variable cut declares a range, e.g. "font-weight: 100 900".
			$weight = preg_match( '/font-weight:\s*(\d+(?:\s+\d+)?)/i', $block, $m )
				? preg_replace( '/\s+/', ' ', trim( $m[1] ) )
				: '400';
			$range  = preg_match( '/unicode-range:\s*([^;}]+)/i', $block, $m ) ? EFM_Fonts::sanitize_unicode_range( $m[1] ) : '';
			$key    = $weight . '-' . $style . '-' . $subset;

			if ( isset( $seen[ $key ] ) ) {
				continue;
			}

			if ( preg_match( '/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/i', $block, $m ) ) {
				$variants[]   = array(
					'url'    => $m[1],
					'weight' => $weight,
					'style'  => $style,
					'subset' => $subset,
					'range'  => $range,
				);
				$seen[ $key ] = true;
			}
		}

		return $variants;
	}
}
