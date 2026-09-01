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
	const TRANSIENT   = 'efm_google_fonts_index_v3';
	const TRANSIENT_LEGACY = 'efm_google_fonts_index';
	const TRANSIENT_AXES   = 'efm_google_axis_registry_v1';
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

		/*
		 * The axis registry rides along in the same payload, so it is stored here
		 * rather than costing a second request. It is what turns a raw tag like
		 * "YTLC" into "Lowercase Height" and supplies the slider step, since a
		 * precision of -1 means the axis moves in tenths and not whole units.
		 */
		if ( ! empty( $data['axisRegistry'] ) && is_array( $data['axisRegistry'] ) ) {
			$registry = array();

			foreach ( $data['axisRegistry'] as $axis ) {
				$tag = isset( $axis['tag'] ) ? (string) $axis['tag'] : '';

				if ( '' === $tag ) {
					continue;
				}

				$registry[ $tag ] = array(
					'name'      => sanitize_text_field( (string) ( $axis['displayName'] ?? $tag ) ),
					'precision' => (int) ( $axis['precision'] ?? 0 ),
				);
			}

			set_transient( self::TRANSIENT_AXES, $registry, self::CACHE_TTL );
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
			$axes = array();

			foreach ( (array) ( $meta['axes'] ?? array() ) as $axis ) {
				$tag = isset( $axis['tag'] ) ? (string) $axis['tag'] : '';

				if ( '' === $tag ) {
					continue;
				}

				// Kept as floats: opsz and slnt are fractional on some families,
				// and casting to int silently collapses their range to nothing.
				$axes[] = array(
					'tag' => $tag,
					'min' => (float) ( $axis['min'] ?? 0 ),
					'max' => (float) ( $axis['max'] ?? 0 ),
					'def' => (float) ( $axis['defaultValue'] ?? 0 ),
				);

				if ( 'wght' === $tag ) {
					$wght = array(
						'min' => (int) $axis['min'],
						'max' => (int) $axis['max'],
					);
				}
			}

			$designers = array();
			foreach ( (array) ( $meta['designers'] ?? array() ) as $designer ) {
				$designer = sanitize_text_field( (string) $designer );
				if ( '' !== $designer ) {
					$designers[] = $designer;
				}
			}

			$classifications = array();
			foreach ( (array) ( $meta['classifications'] ?? array() ) as $classification ) {
				$classification = sanitize_text_field( (string) $classification );
				if ( '' !== $classification ) {
					$classifications[] = $classification;
				}
			}

			/*
			 * Google sorts ascending on popularity and trending, so 1 is the top
			 * of the list. A missing value must sort last, not first, which is why
			 * the fallback is PHP_INT_MAX rather than 0.
			 */
			$fonts[] = array(
				'family'      => $meta['family'] ?? '',
				'category'    => $meta['category'] ?? '',
				'variants'    => $variants,
				'subsets'     => $subsets,
				'popularity'  => (int) ( $meta['popularity'] ?? PHP_INT_MAX ),
				'wght'        => $wght,
				'axes'        => $axes,
				'designers'   => $designers,
				'classes'     => $classifications,
				'stroke'      => sanitize_text_field( (string) ( $meta['stroke'] ?? '' ) ),
				'size'        => (int) ( $meta['size'] ?? 0 ),
				'added'       => sanitize_text_field( (string) ( $meta['dateAdded'] ?? '' ) ),
				'modified'    => sanitize_text_field( (string) ( $meta['lastModified'] ?? '' ) ),
				'trending'    => (int) ( $meta['trending'] ?? PHP_INT_MAX ),
				'script'      => sanitize_text_field( (string) ( $meta['primaryScript'] ?? '' ) ),
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
	 * @param array  $args  category, subset, variable, sort, limit, offset.
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
				'subset'   => '',
				'variable' => '',
				'limit'    => self::RESULTS_MAX,
				'sort'     => 'popularity',
				'offset'   => 0,
			)
		);

		$query    = trim( (string) $query );
		$needle   = strtolower( $query );
		$category = strtolower( trim( (string) $args['category'] ) );
		$subset   = sanitize_key( (string) $args['subset'] );
		$variable = (string) $args['variable'];

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

		/*
		 * Writing-system filter. The subset list is what Google actually ships
		 * glyphs for, so this is the only honest way to answer "which families
		 * can set Sinhala" — the category and name tell you nothing.
		 */
		if ( '' !== $subset ) {
			$fonts = array_values(
				array_filter(
					$fonts,
					static function ( $font ) use ( $subset ) {
						return in_array( $subset, (array) $font['subsets'], true );
					}
				)
			);
		}

		// Tri-state: '' is any, '1' only variable families, '0' only static ones.
		if ( '1' === $variable || '0' === $variable ) {
			$want  = '1' === $variable;
			$fonts = array_values(
				array_filter(
					$fonts,
					static function ( $font ) use ( $want ) {
						return ( ! empty( $font['axes'] ) || ! empty( $font['wght'] ) ) === $want;
					}
				)
			);
		}

		$sort = (string) $args['sort'];

		usort(
			$fonts,
			static function ( $a, $b ) use ( $needle, $sort ) {
				// However the list is sorted, an exact prefix match ranks first.
				if ( '' !== $needle ) {
					$pa = 0 === strpos( strtolower( $a['family'] ), $needle ) ? 0 : 1;
					$pb = 0 === strpos( strtolower( $b['family'] ), $needle ) ? 0 : 1;

					if ( $pa !== $pb ) {
						return $pa - $pb;
					}
				}

				if ( 'alphabetical' === $sort ) {
					return strcasecmp( $a['family'], $b['family'] );
				}

				/*
				 * Fallbacks are load-bearing. A site holding a pre-v3 cached index
				 * has no trending or added key at all, and an undefined-index
				 * warning inside usort() would surface as a broken search rather
				 * than a mis-sorted one.
				 */
				if ( 'trending' === $sort ) {
					return ( $a['trending'] ?? PHP_INT_MAX ) <=> ( $b['trending'] ?? PHP_INT_MAX );
				}

				// Newest first, so the comparison is deliberately reversed. Dates
				// are ISO yyyy-mm-dd, which sorts correctly as a plain string.
				if ( 'newest' === $sort ) {
					return strcmp( (string) ( $b['added'] ?? '' ), (string) ( $a['added'] ?? '' ) );
				}

				return ( $a['popularity'] ?? PHP_INT_MAX ) <=> ( $b['popularity'] ?? PHP_INT_MAX );
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
	 * Human names and step precision for the variable axes.
	 *
	 * Keyed by tag. Populated as a side effect of index(), which is why this
	 * primes the index when the transient is cold rather than fetching anything
	 * of its own.
	 *
	 * @return array[]
	 */
	public static function axis_registry() {
		$registry = get_transient( self::TRANSIENT_AXES );

		if ( is_array( $registry ) && ! empty( $registry ) ) {
			return $registry;
		}

		$fonts = self::index();

		if ( is_wp_error( $fonts ) ) {
			return array();
		}

		$registry = get_transient( self::TRANSIENT_AXES );

		return is_array( $registry ) ? $registry : array();
	}

	/**
	 * The axis registry, but only if it is already cached.
	 *
	 * The uncached path in axis_registry() primes the whole Google index, which is
	 * the right trade on the Google Fonts screen and the wrong one in the state
	 * payload: that is read every time the builder loads, and a cold cache would
	 * hold the panel open on a network round trip nobody asked for.
	 *
	 * @return array Registry keyed by axis tag, or an empty array when uncached.
	 */
	public static function cached_axis_registry() {
		$registry = get_transient( self::TRANSIENT_AXES );

		return is_array( $registry ) ? $registry : array();
	}

	/**
	 * Subsets present in the index, with how many families offer each.
	 *
	 * Powers the writing-system filter. The count is worth returning because it
	 * is the honest answer to "how much choice do I have in this script" — for
	 * Sinhala it is single digits, and a bare dropdown entry would hide that.
	 *
	 * @return array[] List of arrays with subset and count keys, most families first.
	 */
	public static function subsets() {
		$fonts = self::index();

		if ( is_wp_error( $fonts ) ) {
			return array();
		}

		$counts = array();

		foreach ( $fonts as $font ) {
			foreach ( (array) $font['subsets'] as $subset ) {
				if ( ! isset( $counts[ $subset ] ) ) {
					$counts[ $subset ] = 0;
				}
				++$counts[ $subset ];
			}
		}

		arsort( $counts );

		$out = array();

		foreach ( $counts as $subset => $count ) {
			$out[] = array(
				'subset' => (string) $subset,
				'count'  => (int) $count,
			);
		}

		return $out;
	}

	/**
	 * Download a Google font locally and register it as a family.
	 *
	 * @param string   $family   Family name.
	 * @param string[] $subsets  Subsets to download. Defaults to latin.
	 * @param bool     $variable Install the variable cut when the family has one.
	 * @param string[] $cuts     Weight/style cuts to install, e.g. "400", "700i".
	 *                           Empty installs every cut the family offers.
	 * @return array|WP_Error
	 */
	public static function install( $family, $subsets = array(), $variable = false, $cuts = array() ) {
		$family = EFM_Fonts::sanitize_family_name( $family );

		if ( '' === $family ) {
			return new WP_Error( 'efm_gf_no_family', __( 'No font family specified.', 'etch-font-manager' ), array( 'status' => 400 ) );
		}

		$subsets = array_values( array_filter( array_map( 'sanitize_key', (array) $subsets ) ) );

		if ( empty( $subsets ) ) {
			$subsets = array( 'latin' );
		}

		$cuts = self::sanitize_cuts( $cuts );

		// The weight axis is read from the index rather than trusted from the
		// request, so a family without a variable cut cannot be forced into one.
		$axis = $variable ? self::weight_axis( $family ) : array();

		$specs = self::css_specs( $axis, $cuts );
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

		/*
		 * The request already asks for the chosen cuts, but Google is free to
		 * return more than was asked for, so the selection is enforced again
		 * here. A variable cut carries a weight range rather than a single
		 * weight, so those are never filtered.
		 */
		if ( empty( $axis ) && ! empty( $cuts ) ) {
			$parsed = array_values(
				array_filter(
					$parsed,
					static function ( $variant ) use ( $cuts ) {
						$key = $variant['weight'] . ( 'italic' === $variant['style'] ? 'i' : '' );

						return in_array( $key, $cuts, true );
					}
				)
			);
		}

		if ( empty( $parsed ) ) {
			return new WP_Error( 'efm_gf_no_variants', __( 'No downloadable variants were found for the selected subsets.', 'etch-font-manager' ), array( 'status' => 502 ) );
		}

		EFM_Fonts::ensure_dir();

		$slug      = sanitize_file_name( strtolower( str_replace( ' ', '-', $family ) ) );
		$installed = array();

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

			$installed[] = array(
				'file'   => $filename,
				'weight' => $variant['weight'],
				'style'  => $variant['style'],
				'subset' => $variant['subset'],
				'range'  => $variant['range'],
			);
		}

		if ( empty( $installed ) ) {
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

		$meta      = self::family_meta( $family );
		$available = array();

		foreach ( (array) ( $meta['variants'] ?? array() ) as $variant ) {
			$available[] = $variant['weight'] . ( 'italic' === $variant['style'] ? 'i' : '' );
		}

		$google = array(
			'subsets'  => $subsets,
			'cuts'     => $available,
			'variable' => ! empty( $axis ),
		);

		if ( ! empty( $axis ) ) {
			$google['axis'] = $axis;
		}

		/*
		 * The whole axis list, not just the weight range above. The catalogue
		 * already parsed it and the install threw it away, which left the panel able
		 * to offer a type tester before an install and nothing at all afterwards --
		 * the axes were only ever in the search results, and those are cleared on
		 * leaving the Google view. Recorded here, a family can be retuned any time.
		 */
		if ( ! empty( $meta['axes'] ) ) {
			$google['axes'] = $meta['axes'];
		}

		if ( null === $index ) {
			$families[] = array(
				'name'     => $family,
				'variants' => $installed,
				'source'   => 'google',
				'google'   => $google,
			);
		} else {
			$families[ $index ]['variants'] = $installed;
			$families[ $index ]['source']   = 'google';
			$families[ $index ]['google']   = $google;
		}

		EFM_Fonts::save_families( $families );

		return array(
			'family'   => $family,
			'variants' => $installed,
			'subsets'  => $subsets,
			'variable' => ! empty( $axis ),
			'cuts'     => $cuts,
		);
	}

	/**
	 * Normalise a list of weight/style cuts.
	 *
	 * Accepts Google's own notation, where an "i" suffix marks an italic, so
	 * "400" is regular and "700i" is bold italic. Anything else is discarded.
	 *
	 * @param mixed $cuts Raw selection.
	 * @return string[]
	 */
	protected static function sanitize_cuts( $cuts ) {
		$clean = array();

		foreach ( (array) $cuts as $cut ) {
			$cut = strtolower( trim( (string) $cut ) );

			if ( ! preg_match( '/^([1-9]00)(i?)$/', $cut, $m ) ) {
				continue;
			}

			$key = $m[1] . $m[2];

			if ( ! in_array( $key, $clean, true ) ) {
				$clean[] = $key;
			}
		}

		return $clean;
	}

	/**
	 * The cached index entry for a family.
	 *
	 * @param string $family Family name.
	 * @return array
	 */
	public static function family_meta( $family ) {
		$fonts = self::index();

		if ( is_wp_error( $fonts ) ) {
			return array();
		}

		foreach ( $fonts as $font ) {
			if ( 0 === strcasecmp( $font['family'], $family ) ) {
				return $font;
			}
		}

		return array();
	}

	/**
	 * The weight axis of a family, when it has a variable cut.
	 *
	 * @param string $family Family name.
	 * @return array{min:int,max:int}|array
	 */
	protected static function weight_axis( $family ) {
		$meta = self::family_meta( $family );

		return ! empty( $meta['wght'] ) ? $meta['wght'] : array();
	}


	/**
	 * Family specs to try against the CSS API, best first.
	 *
	 * Not every family offers italics, and asking for one that does not exist
	 * returns an error, so each spec is tried until one responds.
	 *
	 * @param array    $axis Weight axis, empty for a static install.
	 * @param string[] $cuts Chosen cuts, empty for every cut the family offers.
	 * @return string[]
	 */
	protected static function css_specs( $axis, $cuts = array() ) {
		if ( ! empty( $axis ) ) {
			$range = $axis['min'] . '..' . $axis['max'];

			return array(
				':ital,wght@0,' . $range . ';1,' . $range,
				':wght@' . $range,
			);
		}

		$chosen = self::cut_specs( $cuts );

		if ( ! empty( $chosen ) ) {
			return $chosen;
		}

		return array(
			':ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900',
			':wght@100;200;300;400;500;600;700;800;900',
		);
	}

	/**
	 * Family specs for an explicit selection of cuts, best first.
	 *
	 * The CSS API rejects a spec whose axis tuples are not in ascending order,
	 * so both the ital group and the weights inside it are sorted. When the
	 * selection includes italics a plain weight spec is kept as a fallback, for
	 * families that turn out not to offer them.
	 *
	 * @param string[] $cuts Chosen cuts.
	 * @return string[]
	 */
	protected static function cut_specs( $cuts ) {
		if ( empty( $cuts ) ) {
			return array();
		}

		$normal = array();
		$italic = array();

		foreach ( $cuts as $cut ) {
			if ( 'i' === substr( $cut, -1 ) ) {
				$italic[] = (int) rtrim( $cut, 'i' );
			} else {
				$normal[] = (int) $cut;
			}
		}

		sort( $normal );
		sort( $italic );

		$specs = array();

		if ( ! empty( $italic ) ) {
			$pairs = array();

			foreach ( $normal as $weight ) {
				$pairs[] = '0,' . $weight;
			}

			foreach ( $italic as $weight ) {
				$pairs[] = '1,' . $weight;
			}

			$specs[] = ':ital,wght@' . implode( ';', $pairs );
		}

		if ( ! empty( $normal ) ) {
			$specs[] = ':wght@' . implode( ';', $normal );
		}

		return $specs;
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
