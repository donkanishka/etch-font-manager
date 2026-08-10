/**
 * Etch Font Manager — full-screen font manager for the Etch builder.
 *
 * Registers a control in the Etch Settings Bar through the official
 * window.etchControls API and opens a full-screen manager that follows Etch's
 * own manager conventions: takeover surface beside the settings bar, a 40px
 * header and a 256px inner navigation column.
 *
 * The manager is mounted on document.body and never inserts nodes into Etch's
 * own Svelte-managed DOM.
 */
(function () {
	'use strict';

	var cfg = window.efmConfig;
	if (!cfg || window.__efmBooted) {
		return;
	}
	window.__efmBooted = true;

	var t = cfg.i18n || {};
	var CONTROL_ID = 'efm-fonts';

	function s(key, fallback) {
		return t[key] || fallback;
	}

	var state = {
		families: (cfg.state && cfg.state.families) || [],
		files: (cfg.state && cfg.state.files) || [],
		settings: (cfg.state && cfg.state.settings) || {},
		cssUrl: (cfg.state && cfg.state.cssUrl) || '',
		cssVersion: (cfg.state && cfg.state.cssVersion) || '',
		view: 'library',
		editing: null,
		// Transient: whether the Google Fonts filter popover is open. Not saved.
		filtersOpen: false,
		// Transient: which collapsed chip rows the user has expanded. Not saved.
		chipsOpen: {},
		filter: '',
		query: '',
		results: [],
		searching: false,
		category: '',
		sort: 'popularity',
		categories: [],
		total: 0,
		loadingMore: false,
		variable: {},
		importMode: 'replace',
		importReport: null,
		busy: '',
		status: null,
		dirty: false,
		subsets: {},
		cuts: {},
		pruning: false,
		recovering: '',
		exportPick: [],
		exportBundle: false,
		importPreview: null,
		importPayload: null,
		unused: (cfg.state && cfg.state.unused) || [],
		cssBuilt: (cfg.state && cfg.state.cssBuilt) || 0,
		previewText: s('preview', 'The quick brown fox'),
		previewSize: 30,
		// Empty means "no custom text", which is what lets each card fall back to
		// a sample in its own script instead of Latin.
		previewCustom: '',
		layout: 'grid',
		subset: '',
		variableOnly: '',
		subsetList: [],
		picked: [],
		detail: null,
		axisValues: {},
		axisNames: {},
		subsetTouched: {},
		// Convert TTF and OTF to WOFF2 on upload. On by default because there is
		// no reason to serve an uncompressed sfnt to a browser in 2026.
		convert: true,
		convertLog: [],
		converting: ''
	};

	// Families whose variable face has been aliased and injected.
	var vfLoaded = {};

	/* --------------------------------------------------------------------- */
	/* Preferences                                                            */
	/* --------------------------------------------------------------------- */

	var PREFS_KEY = 'efm.prefs.v1';
	var LAYOUTS = ['row', 'grid', 'compact'];

	/*
	 * How many chips a collapsed row shows. Six fills roughly one line of a card
	 * at the grid's 340px minimum, which is the width the layout is built around.
	 */
	var CHIP_LIMIT = 6;

	/**
	 * Read the saved browse preferences.
	 *
	 * Wrapped because localStorage throws outright in some privacy modes, and a
	 * cosmetic preference must never be able to stop the manager from opening.
	 */
	function loadPrefs() {
		var raw;

		try {
			raw = window.localStorage.getItem(PREFS_KEY);
		} catch (e) {
			return;
		}

		if (!raw) {
			return;
		}

		var saved;

		try {
			saved = JSON.parse(raw);
		} catch (e) {
			return;
		}

		if (!saved || typeof saved !== 'object') {
			return;
		}

		if (LAYOUTS.indexOf(saved.layout) !== -1) {
			state.layout = saved.layout;
		}

		if (typeof saved.previewSize === 'number' && saved.previewSize >= 14 && saved.previewSize <= 72) {
			state.previewSize = saved.previewSize;
		}

		if (typeof saved.previewCustom === 'string') {
			state.previewCustom = saved.previewCustom;
		}

		if (typeof saved.convert === 'boolean') {
			state.convert = saved.convert;
		}
	}

	function savePrefs() {
		try {
			window.localStorage.setItem(PREFS_KEY, JSON.stringify({
				layout: state.layout,
				previewSize: state.previewSize,
				previewCustom: state.previewCustom,
				convert: state.convert
			}));
		} catch (e) {
			// A refused write is not worth surfacing; the session still works.
		}
	}

	/*
	 * Sample text per subset.
	 *
	 * The point is gotcha #4: a Latin pangram renders identically whether or not
	 * a family actually carries Sinhala glyphs, because the browser silently
	 * falls back. Showing each family text in its own script makes a missing
	 * subset visible instantly instead of at install time.
	 */
	var SAMPLES = {
		sinhala: 'අයහිමිකම් සියළු මනුෂ්‍යයන්',
		tamil: 'அனைத்து மனிதர்களும் சுதந்திரமாகவே',
		devanagari: 'सभी मनुष्यों को गौरव और अधिकार',
		arabic: 'يولد جميع الناس أحرارًا',
		hebrew: 'כל בני האדם נולדו בני חורין',
		thai: 'มนุษย์ทั้งหลายเกิดมามีอิสระ',
		greek: 'Όλοι οι άνθρωποι γεννιούνται ελεύθεροι',
		cyrillic: 'Все люди рождаются свободными',
		korean: '모든 인간은 태어날 떄부터 자유롭고',
		japanese: 'すべての人間は、生まれながらにして自由であり',
		chinese: '人人生而自由，在尊严和权利上一律平等',
		bengali: 'সমস্ত মানুষ স্বাধীনভাবে সমান মর্যাদায়',
		armenian: 'Բոլոր մարդիկ ծնվում են ազատ',
		georgian: 'ყველა ადამიანი იბადება თავისუფალი'
	};

	/**
	 * Digits and punctuation, which is the one sample every subset can render and
	 * the fastest way to spot a family with no usable numerals.
	 */
	var NUMERALS = '0123456789 — £$€ · (“A”) 12/34';

	/*
	 * ISO 15924 script code to subset, for the index's primaryScript field.
	 *
	 * This mapping is why the sample is correct rather than merely non-Latin.
	 * Picking the first non-latin subset instead looks reasonable and is wrong:
	 * Roboto lists cyrillic before latin, so it would preview in Russian, while
	 * Google itself shows it in Latin. An empty primaryScript — 1,352 of the
	 * 1,942 families — means Latin.
	 */
	var SCRIPT_SUBSET = {
		Sinh: 'sinhala',
		Taml: 'tamil',
		Deva: 'devanagari',
		Arab: 'arabic',
		Hebr: 'hebrew',
		Thai: 'thai',
		Grek: 'greek',
		Cyrl: 'cyrillic',
		Kore: 'korean',
		Hang: 'korean',
		Jpan: 'japanese',
		Hira: 'japanese',
		Kana: 'japanese',
		Hans: 'chinese',
		Hant: 'chinese',
		Beng: 'bengali',
		Armn: 'armenian',
		Geor: 'georgian'
	};

	/**
	 * Sample text for one family.
	 *
	 * Custom text always wins. Without it the family's own subsets choose the
	 * script, so a Sinhala family previews in Sinhala without the user having to
	 * find Sinhala text to paste.
	 *
	 * @param {object} font Index record or family record.
	 * @return {string}
	 */
	function sampleFor(font) {
		if (state.previewCustom) {
			return state.previewCustom;
		}

		var subsets = (font && font.subsets) || [];
		var mapped;

		/*
		 * An active writing-system filter wins. Without this a family that also
		 * carries another script previews in that one instead: filtering to
		 * Sinhala and being shown Armenian is worse than useless, because it
		 * looks like the Sinhala glyphs are missing.
		 */
		if (state.subset && SAMPLES[state.subset] && subsets.indexOf(state.subset) !== -1) {
			return SAMPLES[state.subset];
		}

		// The family's own primary script, which is the script it exists to set.
		mapped = SCRIPT_SUBSET[(font && font.script) || ''];

		if (mapped && SAMPLES[mapped]) {
			return SAMPLES[mapped];
		}

		return s('preview', 'The quick brown fox');
	}

	/* --------------------------------------------------------------------- */
	/* DOM helpers                                                            */
	/* --------------------------------------------------------------------- */

	function el(tag, attrs, children) {
		var node = document.createElement(tag);

		Object.keys(attrs || {}).forEach(function (key) {
			var value = attrs[key];
			if (value === null || value === undefined || value === false) {
				return;
			}
			if (key === 'class') {
				node.className = value;
			} else if (key === 'text') {
				node.textContent = value;
			} else if (key.indexOf('on') === 0 && typeof value === 'function') {
				node.addEventListener(key.slice(2).toLowerCase(), value);
			} else if (key === 'style' && typeof value === 'object') {
				Object.keys(value).forEach(function (prop) {
					node.style.setProperty(prop, value[prop]);
				});
			} else {
				node.setAttribute(key, value === true ? '' : value);
			}
		});

		(children || []).forEach(function (child) {
			if (child === null || child === undefined || child === false) {
				return;
			}
			node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
		});

		return node;
	}

	/**
	 * Icon set.
	 *
	 * Drawn on the same grid Etch uses for its own interface icons: a 24x24
	 * viewBox, 1.5 stroke, round caps and joins, no fill, colour inherited from
	 * the parent. The set this replaced was drawn on a 16x16 grid at the same
	 * stroke width, which made every stroke 2.25x heavier relative to the grid
	 * and read as noticeably cruder beside Etch's own panels.
	 *
	 * Paths come from Iconoir (MIT), whose regular set is authored to exactly
	 * that spec, so no per-icon stroke correction is needed. They are inlined
	 * rather than fetched: the manager has to render with no network request
	 * and the plugin has no build step.
	 */
	var PATHS = {
		back: '<path d="M15 6L9 12L15 18"/>',
		plus: '<path d="M6 12H12M18 12H12M12 12V6M12 12V18"/>',
		check: '<path d="M5 13L9 17L19 7"/>',
		close: '<path d="M6.75827 17.2426L12.0009 12M17.2435 6.75736L12.0009 12M12.0009 12L6.75827 6.75736M12.0009 12L17.2435 17.2426"/>',
		search: '<path d="M17 17L21 21"/><path d="M3 11C3 15.4183 6.58172 19 11 19C13.213 19 15.2161 18.1015 16.6644 16.6493C18.1077 15.2022 19 13.2053 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11Z"/>',
		filter: '<path d="M3.99961 3H19.9997C20.552 3 20.9997 3.44764 20.9997 3.99987L20.9999 5.58569C21 5.85097 20.8946 6.10538 20.707 6.29295L14.2925 12.7071C14.105 12.8946 13.9996 13.149 13.9996 13.4142L13.9996 19.7192C13.9996 20.3698 13.3882 20.8472 12.7571 20.6894L10.7571 20.1894C10.3119 20.0781 9.99961 19.6781 9.99961 19.2192L9.99961 13.4142C9.99961 13.149 9.89425 12.8946 9.70672 12.7071L3.2925 6.29289C3.10496 6.10536 2.99961 5.851 2.99961 5.58579V4C2.99961 3.44772 3.44732 3 3.99961 3Z"/>',
		refresh: '<path d="M21.8883 13.5C21.1645 18.3113 17.013 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C16.1006 2 19.6248 4.46819 21.1679 8"/><path d="M17 8H21.4C21.7314 8 22 7.73137 22 7.4V3"/>',
		undo: '<path d="M4.5 8C8.5 8 11 8 15 8C15 8 15 8 15 8C15 8 20 8 20 12.7059C20 18 15 18 15 18C11.5714 18 9.71429 18 6.28571 18"/><path d="M7.5 11.5C6.13317 10.1332 5.36683 9.36683 4 8C5.36683 6.63317 6.13317 5.86683 7.5 4.5"/>',
		edit: '<path d="M14.3632 5.65156L15.8431 4.17157C16.6242 3.39052 17.8905 3.39052 18.6716 4.17157L20.0858 5.58579C20.8668 6.36683 20.8668 7.63316 20.0858 8.41421L18.6058 9.8942M14.3632 5.65156L4.74749 15.2672C4.41542 15.5993 4.21079 16.0376 4.16947 16.5054L3.92738 19.2459C3.87261 19.8659 4.39148 20.3848 5.0115 20.33L7.75191 20.0879C8.21972 20.0466 8.65806 19.8419 8.99013 19.5099L18.6058 9.8942M14.3632 5.65156L18.6058 9.8942"/>',
		trash: '<path d="M20 9L18.005 20.3463C17.8369 21.3026 17.0062 22 16.0353 22H7.96474C6.99379 22 6.1631 21.3026 5.99496 20.3463L4 9"/><path d="M21 6L15.375 6M3 6L8.625 6M8.625 6V4C8.625 2.89543 9.52043 2 10.625 2H13.375C14.4796 2 15.375 2.89543 15.375 4V6M8.625 6L15.375 6"/>',
		library: '<path d="M21 3.6V20.4C21 20.7314 20.7314 21 20.4 21H3.6C3.26863 21 3 20.7314 3 20.4V3.6C3 3.26863 3.26863 3 3.6 3H20.4C20.7314 3 21 3.26863 21 3.6Z"/><path d="M7 9V7L17 7V9"/><path d="M12 7V17M12 17H10M12 17H14"/>',
		upload: '<path d="M6 20L18 20"/><path d="M12 16V4M12 4L15.5 7.5M12 4L8.5 7.5"/>',
		cloudUpload: '<path d="M12 22V13M12 13L15.5 16.5M12 13L8.5 16.5"/><path d="M20 17.6073C21.4937 17.0221 23 15.6889 23 13C23 9 19.6667 8 18 8C18 6 18 2 12 2C6 2 6 6 6 8C4.33333 8 1 9 1 13C1 15.6889 2.50628 17.0221 4 17.6073"/>',
		google: '<path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"/><path d="M2.5 12.5L8 14.5L7 18L8 21"/><path d="M17 20.5L16.5 18L14 17V13.5L17 12.5L21.5 13"/><path d="M19 5.5L18.5 7L15 7.5V10.5L17.5 9.5H19.5L21.5 10.5"/><path d="M2.5 10.5L5 8.5L7.5 8L9.5 5L8.5 3"/>',
		settings: '<path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"/><path d="M19.6224 10.3954L18.5247 7.7448L20 6L18 4L16.2647 5.48295L13.5578 4.36974L12.9353 2H10.981L10.3491 4.40113L7.70441 5.51596L6 4L4 6L5.45337 7.78885L4.3725 10.4463L2 11V13L4.40111 13.6555L5.51575 16.2997L4 18L6 20L7.79116 18.5403L10.397 19.6123L11 22H13L13.6045 19.6132L16.2551 18.5155C16.6969 18.8313 18 20 18 20L20 18L18.5159 16.2494L19.6139 13.598L21.9999 12.9772L22 11L19.6224 10.3954Z"/>',
		transfer: '<path d="M17 20V4M17 4L20 7M17 4L14 7"/><path d="M7 4V20M7 20L10 17M7 20L4 17"/>',
		layoutRow: '<path d="M3 5H21"/><path d="M3 12H21"/><path d="M3 19H21"/>',
		layoutGrid: '<path d="M14 20.4V14.6C14 14.2686 14.2686 14 14.6 14H20.4C20.7314 14 21 14.2686 21 14.6V20.4C21 20.7314 20.7314 21 20.4 21H14.6C14.2686 21 14 20.7314 14 20.4Z"/><path d="M3 20.4V14.6C3 14.2686 3.26863 14 3.6 14H9.4C9.73137 14 10 14.2686 10 14.6V20.4C10 20.7314 9.73137 21 9.4 21H3.6C3.26863 21 3 20.7314 3 20.4Z"/><path d="M14 9.4V3.6C14 3.26863 14.2686 3 14.6 3H20.4C20.7314 3 21 3.26863 21 3.6V9.4C21 9.73137 20.7314 10 20.4 10H14.6C14.2686 10 14 9.73137 14 9.4Z"/><path d="M3 9.4V3.6C3 3.26863 3.26863 3 3.6 3H9.4C9.73137 3 10 3.26863 10 3.6V9.4C10 9.73137 9.73137 10 9.4 10H3.6C3.26863 10 3 9.73137 3 9.4Z"/>',
		layoutCompact: '<path d="M8 6L20 6"/><path d="M4 6.01L4.01 5.99889"/><path d="M4 12.01L4.01 11.9989"/><path d="M4 18.01L4.01 17.9989"/><path d="M8 12L20 12"/><path d="M8 18L20 18"/>',
		textSize: '<path d="M3 7L3 5L17 5V7"/><path d="M10 5L10 19M10 19H12M10 19H8"/><path d="M13 14L13 12H21V14"/><path d="M17 12V19M17 19H15.5M17 19H18.5"/>',
		page: '<path d="M4 21.4V2.6C4 2.26863 4.26863 2 4.6 2H16.2515C16.4106 2 16.5632 2.06321 16.6757 2.17574L19.8243 5.32426C19.9368 5.43679 20 5.5894 20 5.74853V21.4C20 21.7314 19.7314 22 19.4 22H4.6C4.26863 22 4 21.7314 4 21.4Z"/><path d="M8 10L16 10"/><path d="M8 18L16 18"/><path d="M8 14L12 14"/><path d="M16 2V5.4C16 5.73137 16.2686 6 16.6 6H20"/>',
		compress: '<path d="M18 12L6 12"/><path d="M12 22V16M12 16L15 19M12 16L9 19"/><path d="M12 2V8M12 8L15 5M12 8L9 5"/>'
	};

	var ICON_SIZES = { sm: 14, md: 16, lg: 32 };

	/**
	 * Build an icon element.
	 *
	 * @param {string} name   Key in PATHS.
	 * @param {string} [size] One of ICON_SIZES. Defaults to 'md'.
	 * @return {SVGElement} Decorative icon, hidden from assistive technology.
	 */
	function icon(name, size) {
		var variant = ICON_SIZES[size] ? size : 'md';
		var markup = PATHS[name];
		var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

		if (!markup && window.console && window.console.warn) {
			window.console.warn('Etch Font Manager: no icon named "' + name + '".');
		}

		svg.setAttribute('class', variant === 'md' ? 'efm-icon' : 'efm-icon efm-icon--' + variant);
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('width', ICON_SIZES[variant]);
		svg.setAttribute('height', ICON_SIZES[variant]);
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', 'currentColor');
		svg.setAttribute('stroke-width', '1.5');
		svg.setAttribute('stroke-linecap', 'round');
		svg.setAttribute('stroke-linejoin', 'round');
		svg.setAttribute('aria-hidden', 'true');
		svg.setAttribute('focusable', 'false');
		svg.innerHTML = markup || '';

		return svg;
	}

	function debounce(fn, wait) {
		var timer;
		return function () {
			var args = arguments;
			var self = this;
			clearTimeout(timer);
			timer = setTimeout(function () {
				fn.apply(self, args);
			}, wait);
		};
	}

	function formatSize(bytes) {
		if (!bytes) {
			return '';
		}
		return bytes > 1048576
			? (bytes / 1048576).toFixed(1) + ' MB'
			: Math.max(1, Math.round(bytes / 1024)) + ' KB';
	}

	function plural(count, one, many) {
		return count === 1 ? one : many;
	}

	function familyStack(name) {
		return name ? '"' + name + '", sans-serif' : 'inherit';
	}

	/**
	 * Families that map a given file, so deleting it can warn first.
	 *
	 * @param {string} filename File name.
	 * @return {string[]} Family names.
	 */
	function fileUsedBy(filename) {
		return state.families.filter(function (family) {
			return (family.variants || []).some(function (variant) {
				return variant.file === filename;
			});
		}).map(function (family) {
			return family.name;
		});
	}

	/* --------------------------------------------------------------------- */
	/* REST                                                                   */
	/* --------------------------------------------------------------------- */

	function request(path, options) {
		options = options || {};

		var headers = { 'X-WP-Nonce': cfg.nonce };
		var body = options.body;

		if (body && !(body instanceof FormData)) {
			headers['Content-Type'] = 'application/json';
			body = JSON.stringify(body);
		}

		return fetch(cfg.root + path, {
			method: options.method || 'GET',
			credentials: 'same-origin',
			headers: headers,
			body: body
		}).then(function (response) {
			return response.json().catch(function () {
				return null;
			}).then(function (data) {
				if (!response.ok) {
					throw new Error((data && data.message) || s('error', 'Something went wrong.'));
				}
				return data;
			});
		});
	}

	function applyState(next) {
		if (!next) {
			return;
		}
		state.families = next.families || [];
		state.files = next.files || [];
		state.settings = next.settings || {};
		state.cssUrl = next.cssUrl || state.cssUrl;
		state.cssVersion = next.cssVersion || state.cssVersion;
		state.unused = next.unused || [];
		state.cssBuilt = next.cssBuilt || 0;
		state.dirty = false;
		refreshFontCss();
	}

	/* --------------------------------------------------------------------- */
	/* Stylesheet refresh                                                     */
	/* --------------------------------------------------------------------- */

	function collectDocuments() {
		var docs = [document];

		Array.prototype.forEach.call(document.querySelectorAll('iframe'), function (frame) {
			var doc = null;
			try {
				doc = frame.contentDocument;
			} catch (error) {
				doc = null;
			}
			if (doc && doc.head) {
				docs.push(doc);
			}
		});

		return docs;
	}

	/**
	 * Etch renders the canvas stylesheet list from a keyed each block, so the
	 * link element it owns is only ever updated in place (href only) and is
	 * never replaced or renamed.
	 */
	function refreshFontCss() {
		if (!state.cssUrl) {
			return;
		}

		var href = state.cssUrl + '?ver=' + encodeURIComponent(state.cssVersion || Date.now());

		collectDocuments().forEach(function (doc) {
			var owned = doc.getElementById('efm-fonts-live');

			var etchOwned = Array.prototype.filter.call(
				doc.querySelectorAll('link[rel="stylesheet"]'),
				function (node) {
					return node !== owned && node.href && node.href.indexOf('efm-fonts.css') !== -1;
				}
			)[0];

			if (etchOwned) {
				etchOwned.href = href;
				return;
			}

			if (owned) {
				owned.href = href;
				return;
			}

			var created = doc.createElement('link');
			created.id = 'efm-fonts-live';
			created.rel = 'stylesheet';
			created.href = href;
			doc.head.appendChild(created);
		});
	}

	/* --------------------------------------------------------------------- */
	/* Shell                                                                  */
	/* --------------------------------------------------------------------- */

	var manager = null;
	var contentEl = null;
	var navEl = null;
	var headerActionsEl = null;
	var statusEl = null;
	var controlButton = null;
	var isOpen = false;
	var lastFocus = null;
	var barObserver = null;

	/*
	 * count is optional and only set where a number means something. Etch badges
	 * its asset collections but not its tools, so Google Fonts, Settings and
	 * Import & export carry no badge.
	 */
	var VIEWS = [
		{ key: 'library', icon: 'library', label: function () { return s('library', 'Library'); }, count: function () { return liveFamilies().length; } },
		{ key: 'upload', icon: 'upload', label: function () { return s('upload', 'Upload fonts'); }, count: function () { return state.files.length; } },
		{ key: 'google', icon: 'google', label: function () { return s('googleFonts', 'Google Fonts'); } },
		{ key: 'settings', icon: 'settings', label: function () { return s('settings', 'Settings'); } },
		{ key: 'tools', icon: 'transfer', label: function () { return s('tools', 'Import & export'); } }
	];

	/**
	 * A family is live unless it has been disabled or moved to the trash.
	 * Absent flags mean live, so families stored before these existed are
	 * unaffected.
	 *
	 * @param {object} family Family record.
	 * @return {boolean}
	 */
	function isEnabled(family) {
		return family.enabled === undefined || !!family.enabled;
	}

	function isTrashed(family) {
		return !!family.trashed;
	}

	function liveFamilies() {
		return state.families.filter(function (family) { return !isTrashed(family); });
	}

	function trashedFamilies() {
		return state.families.filter(isTrashed);
	}

	function build() {
		navEl = el('nav', { class: 'efm-nav', 'aria-label': s('fontManager', 'Font Manager') });
		contentEl = el('div', { class: 'efm-content' });
		headerActionsEl = el('div', { class: 'efm-header__actions' });
		statusEl = el('span', { class: 'efm-status', role: 'status', 'aria-live': 'polite' });

		manager = el('section', {
			class: 'efm-manager',
			id: 'efm-manager',
			role: 'dialog',
			'aria-label': s('fontManager', 'Font Manager'),
			hidden: true
		}, [
			el('header', { class: 'efm-header' }, [
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--outline efm-btn--icon efm-tooltip',
					'aria-label': s('backToBuilder', 'Back to Builder'),
					// Not `title`: that yields the slow OS tooltip, and alongside the
					// styled one below it would show twice. Etch labels its own back
					// button "Back to Builder" too.
					'data-efm-tooltip': s('backToBuilder', 'Back to Builder'),
					onclick: function (event) {
						// A click generated by the keyboard reports detail 0. Only then
						// is focus sent back to the control; see close().
						close(!event.detail);
					}
				}, [icon('back')]),
				el('h1', { class: 'efm-header__title', text: s('fontManager', 'Font Manager') }),
				statusEl,
				headerActionsEl
			]),
			el('div', { class: 'efm-body' }, [navEl, contentEl])
		]);

		manager.addEventListener('keydown', function (event) {
			if (event.key === 'Escape') {
				event.stopPropagation();

				// A popover is the innermost layer, so it takes Escape first.
				if (state.filtersOpen) {
					closeFilters(true);
					return;
				}

				close(true);
				return;
			}

			if (event.key !== 'Tab') {
				return;
			}

			// The manager covers the builder, so keyboard focus stays inside it.
			var focusable = Array.prototype.filter.call(
				manager.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
				function (node) {
					return node.offsetParent !== null;
				}
			);

			if (!focusable.length) {
				return;
			}

			var first = focusable[0];
			var last = focusable[focusable.length - 1];

			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		});

		/*
		 * Dismiss the filters popover on a press anywhere outside it. Bound to the
		 * manager rather than the document because the manager already covers the
		 * builder, and pointerdown rather than click so the popover is gone before
		 * whatever was pressed reacts.
		 */
		manager.addEventListener('pointerdown', function (event) {
			if (!state.filtersOpen || event.target.closest('.efm-filters')) {
				return;
			}

			closeFilters(false);
		});

		window.addEventListener('resize', function () {
			if (isOpen) {
				syncBounds();
			}
		});

		document.body.appendChild(manager);
	}

	/**
	 * Etch's managers stop above the element bar at the bottom of the builder.
	 * The gap is measured from the settings bar so the manager lines up with
	 * whatever chrome Etch is currently showing.
	 */
	function syncBounds() {
		if (!manager) {
			return;
		}

		var bar = document.querySelector('.settings-bar');
		var gap = 48;

		if (bar) {
			gap = Math.max(0, Math.round(window.innerHeight - bar.getBoundingClientRect().bottom));
		}

		manager.style.setProperty('--efm-inset-bottom', gap + 'px');
	}

	function open() {
		if (!manager) {
			build();
		}

		lastFocus = document.activeElement;
		closeOtherManagers();
		isOpen = true;
		manager.hidden = false;
		manager.classList.add('is-open');
		syncBounds();

		if (controlButton) {
			controlButton.setAttribute('aria-expanded', 'true');
			controlButton.setAttribute('selected', 'true');
		}

		render();
		refreshFontCss();

		var focusable = manager.querySelector('.efm-nav__item');
		if (focusable) {
			focusable.focus({ preventScroll: true });
		}
	}

	/**
	 * Shut whichever Settings Bar manager is currently open.
	 *
	 * Etch keeps its own managers mutually exclusive but does not apply that to
	 * a control registered through the API, so opening this one left the
	 * previous manager selected and still rendered underneath — two highlighted
	 * buttons for one visible panel.
	 *
	 * This clicks Etch's own button, which is a user-level action on a control
	 * Etch owns. It is deliberately not DOM surgery: nothing is inserted, moved
	 * or rewritten inside Etch's tree. Only buttons that are currently selected
	 * are touched, so a click can never open something instead.
	 */
	function closeOtherManagers() {
		var bar = document.querySelector('.settings-bar');

		if (!bar) {
			return;
		}

		Array.prototype.forEach.call(bar.querySelectorAll('button[selected="true"]'), function (button) {
			if (button !== controlButton) {
				button.click();
			}
		});
	}

	/**
	 * Close the manager.
	 *
	 * @param {boolean} restoreFocus Return focus to the Settings Bar control.
	 *
	 * Focus is only returned when the close came from the keyboard. Etch styles
	 * its Settings Bar buttons on plain `:focus`, not `:focus-visible`, and its
	 * tooltips open on focus as well — so focusing the control after a mouse
	 * click left it looking active and popped its "Font Manager" tooltip over
	 * the builder, both while another manager was open. Keyboard users still get
	 * focus back, which is the case that actually needs it.
	 */
	function close(restoreFocus) {
		if (state.dirty && !window.confirm(s('confirmDiscard', 'You have unsaved font changes. Close and discard them?'))) {
			return;
		}

		if (state.dirty) {
			state.dirty = false;
			reload();
		}

		isOpen = false;

		if (manager) {
			manager.classList.remove('is-open');
			manager.hidden = true;
		}

		if (controlButton) {
			controlButton.setAttribute('aria-expanded', 'false');
			controlButton.setAttribute('selected', 'false');
		}

		if (restoreFocus && lastFocus && lastFocus.focus) {
			lastFocus.focus({ preventScroll: true });
		}
	}

	function toggle() {
		if (isOpen) {
			close();
		} else {
			open();
		}
	}

	/**
	 * Close when another Settings Bar manager opens.
	 *
	 * Etch's own managers are mutually exclusive — opening one deselects the
	 * rest — but it has no way to know about a panel this plugin renders and
	 * positions itself. Without this the manager stayed on top of whatever the
	 * user opened next, with two controls selected at once.
	 *
	 * The selected attribute is watched rather than clicks, so keyboard
	 * activation and anything Etch opens on its own are covered too.
	 */
	function watchSettingsBar() {
		var bar = document.querySelector('.settings-bar');

		if (!bar || barObserver) {
			return;
		}

		barObserver = new MutationObserver(function (mutations) {
			if (!isOpen) {
				return;
			}

			var opened = mutations.some(function (mutation) {
				return mutation.target !== controlButton &&
					'true' === mutation.target.getAttribute('selected');
			});

			// close() still asks about unsaved edits. Someone who cancels keeps
			// the manager open on top, which is the same answer the close button
			// gives and is better than discarding their work to get out of the way.
			if (opened) {
				close();
			}
		});

		barObserver.observe(bar, {
			attributes: true,
			attributeFilter: ['selected'],
			subtree: true
		});
	}

	function setStatus(message, type) {
		state.status = message ? { message: message, type: type || 'info' } : null;
		renderStatus();

		// Always cancel a pending clear. A timer left over from an earlier
		// transient message used to fire on top of whatever replaced it, wiping
		// an error or a progress line that should have stayed.
		window.clearTimeout(setStatus._timer);

		// 'progress' stays put: a long conversion would otherwise clear the only
		// sign that anything is still happening.
		if (message && type !== 'error' && type !== 'progress') {
			setStatus._timer = window.setTimeout(function () {
				state.status = null;
				renderStatus();
			}, 4000);
		}
	}

	function renderStatus() {
		if (!statusEl) {
			return;
		}
		statusEl.textContent = state.status ? state.status.message : '';
		statusEl.classList.toggle('is-error', !!state.status && state.status.type === 'error');
	}

	function fail(error) {
		setStatus((error && error.message) || s('error', 'Something went wrong.'), 'error');
	}

	function go(view) {
		state.filtersOpen = false;

		state.view = view;
		state.editing = null;
		render();

		// Opening Google Fonts browses the library straight away rather than
		// waiting for a search term.
		if ('google' === view && !state.results.length && !state.searching) {
			searchGoogle();
		}
	}

	/* --------------------------------------------------------------------- */
	/* Render                                                                 */
	/* --------------------------------------------------------------------- */

	function render() {
		if (!manager) {
			return;
		}

		renderNav();
		renderHeaderActions();
		renderStatus();

		contentEl.innerHTML = '';

		// Restoring or purging the last trashed family leaves that view empty.
		if (state.view === 'trash' && !trashedFamilies().length) {
			state.view = 'library';
		}

		if (state.editing !== null && state.families[state.editing]) {
			renderFamilyEditor(state.editing);
		} else if (state.view === 'library') {
			renderLibrary();
		} else if (state.view === 'trash') {
			renderTrash();
		} else if (state.view === 'upload') {
			renderUpload();
		} else if (state.view === 'google') {
			renderGoogle();
		} else if (state.view === 'tools') {
			renderTools();
		} else {
			renderSettings();
		}
	}

	function renderNav() {
		navEl.innerHTML = '';
		navEl.appendChild(el('span', { class: 'efm-nav__label', text: s('manage', 'Manage') }));

		var trashed = trashedFamilies();
		var views = VIEWS.slice();

		// The trash only appears once something is in it.
		if (trashed.length) {
			views.push({
				key: 'trash',
				icon: 'trash',
				label: function () { return s('trash', 'Trash'); },
				count: function () { return trashed.length; }
			});
		}

		views.forEach(function (view) {
			var active = state.view === view.key && state.editing === null;
			var children = [icon(view.icon), el('span', { text: view.label() })];
			var count = view.count ? view.count() : null;

			// The badge is a plain span rather than aria-hidden decoration, so the
			// count is part of the button's accessible name.
			if (count !== null) {
				children.push(el('span', { class: 'efm-nav__count', text: String(count) }));
			}

			navEl.appendChild(
				el('button', {
					type: 'button',
					class: 'efm-nav__item' + (active ? ' is-active' : ''),
					'aria-current': active ? 'true' : 'false',
					onclick: function () {
						go(view.key);
					}
				}, children)
			);
		});

		var live = liveFamilies();
		var variantCount = live.reduce(function (total, family) {
			return total + (family.variants || []).length;
		}, 0);

		/*
		 * Etch closes its Asset Manager sidebar with stat cards rather than a run
		 * of text: a bold value over a label on a raised fill, with a muted icon
		 * opposite. Stacked one per row rather than Etch's two across, because
		 * this column is 256px against its 300px and three cards carrying icons
		 * will not sit side by side in it.
		 *
		 * The families card reuses the Library icon on purpose, so the number and
		 * the section it counts are visibly the same thing.
		 */
		function stat(value, label, glyph) {
			return el('div', { class: 'efm-stat' }, [
				el('span', { class: 'efm-stat__text' }, [
					el('span', { class: 'efm-stat__value', text: String(value) }),
					el('span', { class: 'efm-stat__label', text: label })
				]),
				icon(glyph)
			]);
		}

		navEl.appendChild(
			el('div', { class: 'efm-nav__meta' }, [
				stat(live.length, plural(live.length, s('familyLabel', 'family'), s('familiesLabel', 'families')), 'library'),
				stat(variantCount, plural(variantCount, s('variant', 'variant'), s('variants', 'variants')), 'textSize'),
				stat(state.files.length, plural(state.files.length, s('fileLabel', 'file'), s('filesLabel', 'files')), 'page')
			])
		);
	}

	function renderHeaderActions() {
		headerActionsEl.innerHTML = '';

		if (!state.dirty) {
			return;
		}

		headerActionsEl.appendChild(
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--outline',
				text: s('discard', 'Discard'),
				onclick: reload
			})
		);
		headerActionsEl.appendChild(
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--primary',
				text: state.busy === 'save' ? s('saving', 'Saving…') : s('save', 'Save changes'),
				disabled: state.busy === 'save',
				onclick: saveFamilies
			})
		);
	}

	/* ------------------------------ Toolbar ------------------------------ */

	/**
	 * Repaint every specimen in place.
	 *
	 * Deliberately not a re-render: the preview text and size change on every
	 * keystroke and drag, and rebuilding the grid would drop scroll position and
	 * re-run the IntersectionObserver on each one.
	 */
	function repaintSpecimens() {
		Array.prototype.forEach.call(contentEl.querySelectorAll('[data-efm-specimen]'), function (node) {
			var subsets = (node.getAttribute('data-efm-subsets') || '').split(',').filter(Boolean);

			node.textContent = sampleFor({
				subsets: subsets,
				script: node.getAttribute('data-efm-script') || ''
			});
			node.style.fontSize = state.previewSize + 'px';
		});
	}

	/**
	 * Preset preview strings.
	 *
	 * "Auto" is the important one and the default: it hands each card back to
	 * sampleFor(), so a mixed result set previews every family in its own script
	 * rather than forcing one script onto all of them.
	 */
	function previewPresets() {
		return [
			{ id: 'auto', label: s('sampleAuto', 'Auto'), text: '' },
			{ id: 'latin', label: s('sampleLatin', 'Latin'), text: s('preview', 'The quick brown fox') },
			{ id: 'sinhala', label: 'සිංහල', text: SAMPLES.sinhala },
			{ id: 'tamil', label: 'தமிழ்', text: SAMPLES.tamil },
			{ id: 'numerals', label: s('sampleNumerals', '123'), text: NUMERALS }
		];
	}

	function previewToolbar(lead) {
		var sizeLabel = el('span', { class: 'efm-toolbar__size', text: state.previewSize + 'px' });

		var textInput = el('input', {
			type: 'text',
			class: 'efm-input',
			value: state.previewCustom,
			'aria-label': s('previewText', 'Preview text'),
			placeholder: s('previewAuto', 'Each family in its own script'),
			oninput: debounce(function (event) {
				state.previewCustom = event.target.value;
				savePrefs();
				repaintSpecimens();
				syncPresetChips();
			}, 160)
		});

		var chips = el('div', { class: 'efm-chips efm-chips--presets' }, previewPresets().map(function (preset) {
			return el('button', {
				type: 'button',
				class: 'efm-chip efm-chip--toggle',
				'data-efm-preset': preset.id,
				'aria-pressed': state.previewCustom === preset.text ? 'true' : 'false',
				text: preset.label,
				onclick: function () {
					state.previewCustom = preset.text;
					textInput.value = preset.text;
					savePrefs();
					repaintSpecimens();
					syncPresetChips();
				}
			});
		}));

		function syncPresetChips() {
			var presets = previewPresets();

			Array.prototype.forEach.call(chips.querySelectorAll('[data-efm-preset]'), function (node, i) {
				var on = state.previewCustom === presets[i].text;

				node.setAttribute('aria-pressed', on ? 'true' : 'false');
				node.classList.toggle('is-on', on);
			});
		}

		syncPresetChips();

		var size = el('input', {
			type: 'range',
			class: 'efm-range',
			min: '14',
			max: '72',
			step: '1',
			value: String(state.previewSize),
			'aria-label': s('previewSize', 'Preview size'),
			oninput: function (event) {
				state.previewSize = parseInt(event.target.value, 10);
				sizeLabel.textContent = state.previewSize + 'px';
				savePrefs();
				repaintSpecimens();
			}
		});

		return el('div', { class: 'efm-toolbar' }, [
			lead || null,
			el('div', { class: 'efm-toolbar__preview' }, [textInput, chips, size, sizeLabel])
		]);
	}

	/**
	 * Placeholder cards shown while the catalogue is loading.
	 *
	 * Swapping the grid for a line of text collapses the pane and then reflows it
	 * when results land. Blocks of the same shape hold the layout still and show
	 * roughly how much is coming.
	 *
	 * The grid itself is hidden from assistive technology; the live region beside
	 * it carries the announcement, so a screen reader hears "Searching" once
	 * rather than a description of six empty boxes.
	 */
	function skeletonGrid(count) {
		var grid = el('div', { class: gridClass(), 'aria-hidden': 'true' });
		var i;

		for (i = 0; i < count; i += 1) {
			grid.appendChild(el('div', { class: 'efm-card efm-skeleton' }, [
				el('span', { class: 'efm-skeleton__bar efm-skeleton__bar--title' }),
				el('span', { class: 'efm-skeleton__bar efm-skeleton__bar--specimen' }),
				el('span', { class: 'efm-skeleton__bar efm-skeleton__bar--meta' })
			]));
		}

		return grid;
	}

	/**
	 * A titled box grouping related controls.
	 *
	 * Settings and Import & export were flat runs of headings, checkboxes and
	 * buttons on one surface, so nothing showed where one concern ended and the
	 * next began. A raised box per concern is the same device Etch uses for its
	 * own grouped controls.
	 */
	function section(title, children) {
		return el('section', { class: 'efm-section' }, [
			el('h3', { class: 'efm-section-title', text: title })
		].concat(children.filter(Boolean)));
	}

	/**
	 * Wrap each run of nodes following a section heading in a section box.
	 *
	 * Import & export builds its three tools by appending straight to the pane in
	 * one long sequence. Rewriting that into nested nodes would be a large change
	 * for a purely visual one, so the grouping is done in a single pass afterwards
	 * using the headings as boundaries. Anything before the first heading is left
	 * where it is.
	 */
	function groupSections(root) {
		var nodes = Array.prototype.slice.call(root.childNodes);
		var current = null;

		nodes.forEach(function (node) {
			if (1 === node.nodeType && node.classList.contains('efm-section-title')) {
				current = el('section', { class: 'efm-section' });
				root.insertBefore(current, node);
			}

			if (current) {
				current.appendChild(node);
			}
		});
	}

	/**
	 * A row of toggle chips that collapses past a limit.
	 *
	 * Some families carry twenty-five subsets or eighteen weights. Rendered in
	 * full that turns a card into a wall of chips, and because the grid stretches
	 * a row to its tallest card, one such family leaves every neighbour half
	 * empty. Only the first few are shown by default.
	 *
	 * Any chip that is currently on stays visible regardless of where it falls in
	 * the list, so a selection can never end up hidden behind the disclosure.
	 *
	 * @param {string}   key    Identity for the expanded flag, unique per card and row.
	 * @param {string}   label  Row label.
	 * @param {Array}    items  { label, on, onclick } for each chip.
	 * @param {number}   limit  How many to show while collapsed.
	 * @param {Array}    [tail] Extra chips always pinned after the list.
	 */
	function chipWall(key, label, items, limit, tail) {
		var open = !!state.chipsOpen[key];
		var shown = open ? items : items.filter(function (item, i) {
			return i < limit || item.on;
		});
		var hidden = items.length - shown.length;

		var chips = shown.map(function (item) {
			return el('button', {
				type: 'button',
				class: 'efm-chip efm-chip--toggle' + (item.on ? ' is-on' : ''),
				'aria-pressed': item.on ? 'true' : 'false',
				text: item.label,
				onclick: item.onclick
			});
		});

		if (hidden > 0) {
			chips.push(el('button', {
				type: 'button',
				class: 'efm-chip efm-chip--more',
				'aria-expanded': 'false',
				'aria-label': s('showAll', 'Show all') + ' (' + items.length + ')',
				text: '+' + hidden,
				onclick: function () {
					state.chipsOpen[key] = true;
					render();
				}
			}));
		} else if (open && items.length > limit) {
			chips.push(el('button', {
				type: 'button',
				class: 'efm-chip efm-chip--more',
				'aria-expanded': 'true',
				text: s('showFewer', 'Show fewer'),
				onclick: function () {
					state.chipsOpen[key] = false;
					render();
				}
			}));
		}

		return el('div', { class: 'efm-subsets' }, [
			el('span', { class: 'efm-subsets__label', text: label }),
			el('div', { class: 'efm-chips' }, chips.concat(tail || []))
		]);
	}

	/**
	 * Filters popover for the Google Fonts browser.
	 *
	 * Category, writing system, technology and sort all narrow the same list and
	 * are typically set once and then left alone, so they sit behind a button
	 * rather than occupying a second toolbar row. Search, layout, preview text
	 * and preview size stay on the surface because they are adjusted constantly.
	 *
	 * The open flag lives in state because changing any filter re-renders the
	 * whole view, which would otherwise snap the popover shut on first use.
	 */
	/**
	 * Close the filters popover.
	 *
	 * refocus matters more than it looks: render() destroys whatever was focused
	 * inside the popover, and if focus lands on document.body then the manager's
	 * own keydown listener stops receiving anything, so a second Escape would no
	 * longer close the manager. Pointer dismissals pass false, because focus
	 * belongs wherever the user just pressed.
	 */
	function closeFilters(refocus) {
		if (!state.filtersOpen) {
			return;
		}

		state.filtersOpen = false;
		render();

		if (refocus) {
			var trigger = manager.querySelector('.efm-filters button');

			if (trigger) {
				trigger.focus();
			}
		}
	}

	function filterPopover(fields) {
		var count = hiddenFilterCount();
		var open = state.filtersOpen;

		var trigger = el('button', {
			type: 'button',
			class: 'efm-btn efm-btn--outline efm-btn--sm',
			'aria-expanded': open ? 'true' : 'false',
			'aria-controls': 'efm-filters',
			onclick: function () {
				if (state.filtersOpen) {
					closeFilters(true);
					return;
				}

				state.filtersOpen = true;
				render();

				var next = manager.querySelector('.efm-filters button');

				if (next) {
					next.focus();
				}
			}
		}, [
			icon('filter', 'sm'),
			el('span', { text: s('filters', 'Filters') }),
			count ? el('span', { class: 'efm-filters__count', text: String(count) }) : null
		]);

		var panel = el('div', {
			class: 'efm-popover',
			id: 'efm-filters',
			role: 'group',
			'aria-label': s('filters', 'Filters'),
			hidden: !open
		}, fields.concat([
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--ghost efm-btn--sm efm-btn--block',
				disabled: !googleFiltered(),
				onclick: resetGoogleFilters
			}, [icon('refresh', 'sm'), el('span', { text: s('resetAll', 'Reset all') })])
		]));

		return el('div', { class: 'efm-filters' }, [trigger, panel]);
	}

	/**
	 * A labelled control for the filters popover. The selects carry aria-labels
	 * of their own for when they appear outside this context.
	 */
	function filterField(labelText, control) {
		return el('label', { class: 'efm-field' }, [
			el('span', { class: 'efm-field__label', text: labelText }),
			control
		]);
	}

	/**
	 * Row / Grid / Compact switch.
	 *
	 * Row is for judging a face at reading length, grid for scanning the
	 * catalogue, compact for finding a known name in a long list. The choice only
	 * caps density: the grid itself is container-driven, so a narrow panel still
	 * collapses to one column whatever is selected here.
	 */
	function layoutToggle() {
		var labels = {
			row: s('layoutRow', 'Row'),
			grid: s('layoutGrid', 'Grid'),
			compact: s('layoutCompact', 'Compact')
		};

		/*
		 * Icon and label together, not icon alone: the three layouts are not
		 * self-evident from a glyph, and dropping the labels would trade
		 * discoverability for a few pixels of toolbar width.
		 */
		var glyphs = {
			row: 'layoutRow',
			grid: 'layoutGrid',
			compact: 'layoutCompact'
		};

		return el('div', {
			class: 'efm-segmented',
			role: 'radiogroup',
			'aria-label': s('layout', 'Layout')
		}, LAYOUTS.map(function (name) {
			var on = state.layout === name;

			return el('button', {
				type: 'button',
				role: 'radio',
				class: 'efm-segmented__item' + (on ? ' is-on' : ''),
				'aria-checked': on ? 'true' : 'false',
				onclick: function () {
					if (state.layout === name) {
						return;
					}

					state.layout = name;
					savePrefs();
					render();
				}
			}, [icon(glyphs[name], 'sm'), el('span', { text: labels[name] })]);
		}));
	}

	function gridClass() {
		return 'efm-grid efm-grid--' + state.layout;
	}

	/**
	 * @param {string}   family  Family name.
	 * @param {string[]} subsets Subsets the family carries, for the script sample.
	 * @param {string}   script  ISO 15924 primary script code, when known.
	 * @return {HTMLElement}
	 */
	function specimen(family, subsets, script) {
		return el('p', {
			class: 'efm-specimen',
			'data-efm-specimen': 'true',
			'data-efm-subsets': (subsets || []).join(','),
			'data-efm-script': script || '',
			text: sampleFor({ subsets: subsets || [], script: script || '' }),
			style: { 'font-family': familyStack(family), 'font-size': state.previewSize + 'px' }
		});
	}

	function emptyState(title, hint, cta, onCta) {
		return el('div', { class: 'efm-empty' }, [
			el('p', { class: 'efm-empty__title', text: title }),
			hint ? el('p', { class: 'efm-empty__hint', text: hint }) : null,
			cta ? el('button', { type: 'button', class: 'efm-btn efm-btn--primary', text: cta, onclick: onCta }) : null
		]);
	}

	/* ------------------------------ Library ------------------------------ */

	/**
	 * Turn a family's output on or off. Files and mapping are untouched, so this
	 * is always reversible.
	 *
	 * @param {number} index   Family index.
	 * @param {boolean} enabled Next state.
	 */
	function setFamilyEnabled(index, enabled) {
		var family = state.families[index];

		family.enabled = enabled;
		state.dirty = true;
		render();
	}

	/**
	 * Move a family to the trash. The record and every file stay put; only the
	 * output stops, so restoring costs nothing.
	 *
	 * @param {number} index Family index.
	 */
	function trashFamily(index) {
		var family = state.families[index];

		family.trashed = true;
		state.editing = null;
		state.dirty = true;
		render();
	}

	/**
	 * Families that were moved to the trash, with restore and permanent delete.
	 * Deleting here drops the record only; the files stay on disk and show up
	 * under unused files in Import & export.
	 */
	function renderTrash() {
		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('trash', 'Trash') }));
		contentEl.appendChild(el('p', {
			class: 'efm-muted',
			text: s('trashHint', 'These families are not loaded on the site. Their font files are still on the server, so restoring one brings it back exactly as it was.')
		}));

		var inTrash = trashedFamilies();

		contentEl.appendChild(el('div', { class: 'efm-card__actions' }, [
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--outline efm-btn--sm',
				onclick: function () {
					state.families.forEach(function (family) {
						family.trashed = false;
					});
					state.dirty = true;
					render();
				}
			}, [icon('undo', 'sm'), el('span', { text: s('restoreAll', 'Restore all') + ' (' + inTrash.length + ')' })]),
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--outline efm-btn--sm',
				onclick: function () {
					if (!window.confirm(s('confirmEmptyTrash', 'Delete every family in the trash for good? Their font files stay on the server and can be removed from Import & export.'))) {
						return;
					}

					state.families = state.families.filter(function (family) {
						return !isTrashed(family);
					});
					state.editing = null;
					state.dirty = true;
					render();
				}
			}, [icon('trash', 'sm'), el('span', { text: s('emptyTrash', 'Empty trash') })])
		]));

		var grid = el('div', { class: 'efm-grid' });

		state.families.forEach(function (family, index) {
			if (!isTrashed(family)) {
				return;
			}

			var variants = family.variants || [];

			grid.appendChild(el('article', { class: 'efm-card' }, [
				el('div', { class: 'efm-card__head' }, [
					el('h2', { class: 'efm-card__title', text: family.name }),
					el('div', { class: 'efm-card__actions' }, [
						el('button', {
							type: 'button',
							class: 'efm-btn efm-btn--outline efm-btn--sm',
							onclick: function () {
								family.trashed = false;
								state.dirty = true;
								render();
							}
						}, [icon('undo', 'sm'), el('span', { text: s('restoreFamily', 'Restore') })]),
						el('button', {
							type: 'button',
							class: 'efm-icon-btn efm-icon-btn--danger',
							'aria-label': s('deleteFamily', 'Delete permanently'),
							title: s('deleteFamily', 'Delete permanently'),
							onclick: function () {
								if (!window.confirm(s('confirmDeleteFamily', 'Delete this family for good? Its font files stay on the server and can be removed from Import & export.'))) {
									return;
								}

								state.families.splice(index, 1);
								state.editing = null;
								state.dirty = true;
								render();
							}
						}, [icon('trash')])
					])
				]),
				el('div', { class: 'efm-card__meta' }, [
					el('span', { text: variants.length + ' ' + plural(variants.length, s('variant', 'variant'), s('variants', 'variants')) })
				])
			]));
		});

		contentEl.appendChild(grid);
	}

	function renderLibrary() {
		var search = el('input', {
			type: 'search',
			class: 'efm-input',
			placeholder: s('filterFamilies', 'Filter families'),
			value: state.filter,
			oninput: debounce(function (event) {
				state.filter = event.target.value;
				render();
			}, 200)
		});

		contentEl.appendChild(previewToolbar(
			el('div', { class: 'efm-toolbar__lead' }, [
				el('div', { class: 'efm-search' }, [icon('search', 'sm'), search]),
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--outline',
					onclick: addFamily
				}, [icon('plus', 'sm'), el('span', { text: s('newFamily', 'New family') })]),
				layoutToggle()
			])
		));

		if (!liveFamilies().length) {
			contentEl.appendChild(emptyState(
				s('noFamilies', 'No font families yet.'),
				s('noFamiliesHint', 'Upload a font file or install one from Google Fonts.'),
				s('googleFonts', 'Google Fonts'),
				function () { go('google'); }
			));
			return;
		}

		var needle = state.filter.trim().toLowerCase();
		var list = state.families
			.map(function (family, index) { return { family: family, index: index }; })
			.filter(function (row) {
				if (isTrashed(row.family)) {
					return false;
				}

				return !needle || (row.family.name || '').toLowerCase().indexOf(needle) !== -1;
			});

		if (!list.length) {
			contentEl.appendChild(el('p', { class: 'efm-muted', text: s('noMatches', 'No families match that filter.') }));
			return;
		}

		var grid = el('div', { class: gridClass() });

		list.forEach(function (row) {
			var family = row.family;
			var variants = family.variants || [];
			var weights = variants.map(function (v) { return v.weight; }).filter(function (w, i, arr) { return arr.indexOf(w) === i; }).sort();
			var subsetList = variants.map(function (v) { return v.subset; }).filter(function (sub, i, arr) {
				return sub && arr.indexOf(sub) === i;
			}).sort();

			var enabled = isEnabled(family);

			grid.appendChild(
				el('article', { class: 'efm-card' + (enabled ? '' : ' is-disabled') }, [
					el('div', { class: 'efm-card__head' }, [
						el('h2', { class: 'efm-card__title', text: family.name }),
						/*
						 * A badge, not the full-width notice this used to be. That
						 * notice sat between the title and the specimen, so in the
						 * grid every disabled card pushed its specimen down and the
						 * row stopped lining up. The wording moves to the button's
						 * title, where it is still reachable.
						 */
						enabled ? null : el('span', { class: 'efm-badge efm-badge--muted', text: s('disabledLabel', 'Disabled') }),
						el('div', { class: 'efm-card__actions' }, [
							el('button', {
								type: 'button',
								class: 'efm-btn efm-btn--outline efm-btn--sm',
								'aria-pressed': enabled ? 'true' : 'false',
								title: enabled ? '' : s('disabledNotice', 'Disabled. Its files are kept, but it is not loaded on the site.'),
								text: enabled ? s('disableFamily', 'Disable') : s('enableFamily', 'Enable'),
								onclick: function () {
									setFamilyEnabled(row.index, !enabled);
								}
							}),
							el('button', {
								type: 'button',
								class: 'efm-btn efm-btn--outline efm-btn--sm',
								onclick: function () {
									state.editing = row.index;
									render();
								}
							}, [icon('edit', 'sm'), el('span', { text: s('manageFamily', 'Manage') })]),
							el('button', {
								type: 'button',
								class: 'efm-icon-btn efm-icon-btn--danger',
								'aria-label': s('trashFamily', 'Move to trash'),
								title: s('trashFamily', 'Move to trash'),
								onclick: function () {
									trashFamily(row.index);
								}
							}, [icon('trash')])
						])
					]),
					specimen(family.name, subsetList),
					subsetList.length ? el('div', { class: 'efm-chips' }, subsetList.slice(0, CHIP_LIMIT).map(function (sub) {
						return el('span', { class: 'efm-chip', text: sub });
					}).concat(subsetList.length > CHIP_LIMIT
						? [el('span', { class: 'efm-chip efm-chip--more', text: '+' + (subsetList.length - CHIP_LIMIT) })]
						: [])) : null,
					el('div', { class: 'efm-card__meta' }, [
						el('span', { text: variants.length + ' ' + plural(variants.length, s('variant', 'variant'), s('variants', 'variants')) }),
						el('span', { class: 'efm-weights', text: weights.join(' · ') || '—' })
					])
				])
			);
		});

		contentEl.appendChild(grid);
	}

	function renderFamilyEditor(index) {
		var family = state.families[index];
		var variants = family.variants || [];

		contentEl.appendChild(
			el('div', { class: 'efm-breadcrumb' }, [
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--outline efm-btn--icon',
					'aria-label': s('back', 'Back'),
					title: s('back', 'Back'),
					onclick: function () {
						state.editing = null;
						render();
					}
				}, [icon('back')]),
				el('h2', { class: 'efm-breadcrumb__title', text: family.name })
			])
		);

		contentEl.appendChild(previewToolbar(null));
		contentEl.appendChild(specimen(family.name));

		contentEl.appendChild(
			el('label', { class: 'efm-field' }, [
				el('span', { class: 'efm-field__label', text: s('familyName', 'Family name') }),
				el('input', {
					type: 'text',
					class: 'efm-input',
					value: family.name,
					oninput: function (event) {
						state.families[index].name = event.target.value;
						state.dirty = true;
						renderHeaderActions();
					}
				})
			])
		);

		if (family.slug) {
			contentEl.appendChild(cssTokenField(family));
		}

		contentEl.appendChild(
			el('label', { class: 'efm-toggle' }, [
				el('input', {
					type: 'checkbox',
					class: 'efm-checkbox',
					checked: isEnabled(family),
					onchange: function (event) {
						setFamilyEnabled(index, event.target.checked);
					}
				}),
				el('span', {}, [
					el('span', { class: 'efm-toggle__label', text: s('familyEnabled', 'Load this family on the site') }),
					el('span', { class: 'efm-field__hint', text: s('familyEnabledHint', 'Turn off to stop the font loading without deleting anything. Files and weight mapping are kept.') })
				])
			])
		);

		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('delivery', 'Delivery') }));
		contentEl.appendChild(deliverySection(index));

		if (family.google) {
			contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('googleSource', 'Google Fonts') }));
			contentEl.appendChild(googleSection(index));
		}

		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('cssPreview', 'Generated CSS') }));
		contentEl.appendChild(el('pre', { class: 'efm-code', text: previewCss(family) }));

		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('variants', 'variants') }));

		if (!variants.length) {
			contentEl.appendChild(el('p', { class: 'efm-muted', text: s('noVariants', 'No variants mapped yet.') }));
		} else {
			var table = el('div', { class: 'efm-table' }, [
				el('div', { class: 'efm-table__head' }, [
					el('span', { text: s('file', 'File') }),
					el('span', { text: s('weight', 'Weight') }),
					el('span', { text: s('style', 'Style') }),
					el('span', { text: '' })
				])
			]);

			variants.forEach(function (variant, vi) {
				table.appendChild(variantRow(index, vi, variant));
			});

			contentEl.appendChild(table);
		}

		contentEl.appendChild(
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--outline',
				onclick: function () {
					state.families[index].variants = state.families[index].variants || [];
					var used = (state.families[index].variants || []).map(function (v) { return v.file; });
					var next = state.files.filter(function (f) { return used.indexOf(f.name) === -1; })[0] || state.files[0];

					state.families[index].variants.push({
						file: next ? next.name : '',
						weight: next && next.weight ? next.weight : '400',
						style: next && next.style ? next.style : 'normal'
					});
					state.dirty = true;
					render();
				}
			}, [icon('plus', 'sm'), el('span', { text: s('addVariant', 'Add variant') })])
		);
	}

	/**
	 * The custom property a family is published as, ready to copy.
	 *
	 * The slug comes from the server so it always matches the generated CSS.
	 * Renaming the family changes it, so the value shown is the saved name, not
	 * whatever is currently typed in the name field.
	 *
	 * @param {object} family Family record.
	 * @return {HTMLElement}
	 */
	/**
	 * The CSS this family contributes to the generated stylesheet.
	 *
	 * Rebuilt in the panel rather than fetched, so it updates live as fields are
	 * edited. It mirrors build_css() and is for reading, not for copying into a
	 * stylesheet by hand.
	 *
	 * @param {object} family Family record.
	 * @return {string}
	 */
	function previewCss(family) {
		if (!isEnabled(family) || isTrashed(family)) {
			return s('cssPreviewOff', 'This family is not loaded, so it contributes no CSS.');
		}

		var display = family.display || 'swap';
		var name = family.name || '';

		var blocks = (family.variants || []).filter(function (variant) {
			return !!variant.file;
		}).map(function (variant) {
			var rule = '@font-face {\n' +
				'\tfont-family: "' + name + '";\n' +
				'\tsrc: url("' + variant.file + '") format("woff2");\n' +
				'\tfont-weight: ' + (variant.weight || '400') + ';\n' +
				'\tfont-style: ' + (variant.style || 'normal') + ';\n' +
				'\tfont-display: ' + display + ';\n';

			if (variant.range) {
				rule += '\tunicode-range: ' + variant.range + ';\n';
			}

			return rule + '}';
		});

		if (family.slug) {
			blocks.push(':root {\n\t--efm-family-' + family.slug + ': ' + familyStack(name) + ';\n}');
		}

		if (family.selector) {
			blocks.push(family.selector + ' {\n\tfont-family: ' + familyStack(name) + (family.force ? ' !important' : '') + ';\n}');
		}

		return blocks.length
			? blocks.join('\n\n')
			: s('cssPreviewEmpty', 'No variants mapped yet, so this family contributes no CSS.');
	}

	function cssTokenField(family) {
		var token = 'var(--efm-family-' + family.slug + ')';

		var input = el('input', {
			type: 'text',
			class: 'efm-input',
			readonly: true,
			value: token,
			onclick: function (event) {
				event.target.select();
			}
		});

		return el('label', { class: 'efm-field' }, [
			el('span', { class: 'efm-field__label', text: s('cssToken', 'CSS variable') }),
			input,
			el('span', {
				class: 'efm-field__hint',
				text: s('cssTokenHint', 'Use this anywhere a font family is expected. It already includes the fallback stack.')
			})
		]);
	}

	/**
	 * Cuts a family currently has installed, in Google's notation.
	 *
	 * @param {object} family Family record.
	 * @return {string[]}
	 */
	function installedCuts(family) {
		var cuts = [];

		(family.variants || []).forEach(function (variant) {
			var weight = String(variant.weight || '400');

			// A variable cut carries a range and maps to no single weight.
			if (weight.indexOf(' ') !== -1) {
				return;
			}

			var cut = weight + (variant.style === 'italic' ? 'i' : '');

			if (cuts.indexOf(cut) === -1) {
				cuts.push(cut);
			}
		});

		return cuts;
	}

	/**
	 * Which cuts of a Google family are installed, and re-installing a different
	 * selection. Deselecting leaves the file on disk so re-enabling costs
	 * nothing; "Remove unused files" in Import & export clears them for good.
	 *
	 * @param {number} index Family index.
	 * @return {HTMLElement}
	 */
	function googleSection(index) {
		var family = state.families[index];
		var google = family.google || {};
		var subsets = google.subsets || ['latin'];
		var busy = state.busy === 'install:' + family.name;
		var rows = [];

		if (google.variable) {
			var axis = google.axis || {};
			var span = axis.min && axis.max ? axis.min + '–' + axis.max : '';

			rows.push(el('p', {
				class: 'efm-field__hint',
				text: s('variableNote', 'Installed as a variable font: one file per subset covering every weight.') + (span ? ' ' + span + '.' : '')
			}));
		} else {
			var available = (google.cuts || []).slice();

			if (!available.length) {
				available = installedCuts(family);
			}

			var chosen = state.cuts[family.name] || installedCuts(family);
			state.cuts[family.name] = chosen;

			rows.push(el('div', { class: 'efm-subsets' }, [
				el('span', { class: 'efm-subsets__label', text: s('weights', 'Weights') }),
				el('div', { class: 'efm-chips' }, available.map(function (cut) {
					var on = chosen.indexOf(cut) !== -1;

					return el('button', {
						type: 'button',
						class: 'efm-chip efm-chip--toggle' + (on ? ' is-on' : ''),
						'aria-pressed': on ? 'true' : 'false',
						text: cutLabel(cut),
						onclick: function () {
							var at = chosen.indexOf(cut);

							if (at === -1) {
								chosen.push(cut);
							} else {
								chosen.splice(at, 1);
							}

							render();
						}
					});
				}))
			]));
		}

		rows.push(el('p', {
			class: 'efm-field__hint',
			text: s('googleSubsets', 'Subsets') + ': ' + subsets.join(', ')
		}));

		if (!google.variable) {
			rows.push(el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--outline',
				disabled: busy || !(state.cuts[family.name] || []).length,
				text: busy ? s('installing', 'Installing…') : s('applyCuts', 'Download selection'),
				onclick: function () {
					installGoogleFont(family.name, subsets, false, state.cuts[family.name] || []);
				}
			}));
		}

		return el('div', { class: 'efm-delivery' }, rows);
	}

	/**
	 * How a family is delivered: loading behaviour, preload and fallback stack.
	 *
	 * @param {number} index Family index.
	 * @return {HTMLElement}
	 */
	function deliverySection(index) {
		var family = state.families[index];

		var displaySelect = el('select', {
			class: 'efm-input efm-input--select',
			onchange: function (event) {
				state.families[index].display = event.target.value;
				state.dirty = true;
				renderHeaderActions();
			}
		});

		['swap', 'optional', 'fallback', 'block', 'auto'].forEach(function (value) {
			displaySelect.appendChild(el('option', {
				value: value,
				text: value,
				selected: value === (family.display || 'swap')
			}));
		});

		var stackInput = el('input', {
			type: 'text',
			class: 'efm-input',
			list: 'efm-stacks',
			placeholder: 'sans-serif',
			value: family.fallback || '',
			oninput: function (event) {
				state.families[index].fallback = event.target.value;
				state.dirty = true;
				renderHeaderActions();
			}
		});

		var stacks = el('datalist', { id: 'efm-stacks' });
		[
			'system-ui, sans-serif',
			'Arial, Helvetica, sans-serif',
			'Georgia, "Times New Roman", serif',
			'ui-monospace, SFMono-Regular, monospace'
		].forEach(function (value) {
			stacks.appendChild(el('option', { value: value }));
		});

		var preloadInput = el('input', {
			type: 'checkbox',
			class: 'efm-checkbox',
			checked: !!family.preload,
			onchange: function (event) {
				state.families[index].preload = event.target.checked;
				state.dirty = true;
				renderHeaderActions();
			}
		});

		return el('div', { class: 'efm-delivery' }, [
			stacks,
			el('div', { class: 'efm-fields' }, [
				el('label', { class: 'efm-field' }, [
					el('span', { class: 'efm-field__label', text: s('fontDisplay', 'Loading behaviour') }),
					displaySelect,
					el('span', { class: 'efm-field__hint', text: s('fontDisplayHint', 'swap shows a fallback until the font arrives. optional skips the font entirely on slow connections, which removes layout shift.') })
				]),
				el('label', { class: 'efm-field' }, [
					el('span', { class: 'efm-field__label', text: s('fallbackStack', 'Fallback stack') }),
					stackInput,
					el('span', { class: 'efm-field__hint', text: s('fallbackHint', 'Shown while the font loads, and if it fails. A close match reduces layout shift.') })
				]),
				el('label', { class: 'efm-field' }, [
					el('span', { class: 'efm-field__label', text: s('applyTo', 'Apply to') }),
					el('input', {
						type: 'text',
						class: 'efm-input',
						placeholder: 'h1, .site-title',
						value: family.selector || '',
						oninput: function (event) {
							state.families[index].selector = event.target.value;
							state.dirty = true;
							renderHeaderActions();
						}
					}),
					el('span', { class: 'efm-field__hint', text: s('applyToHint', 'Optional. A comma separated selector list this family is applied to, so you do not have to write the rule yourself.') })
				])
			]),
			family.selector ? el('label', { class: 'efm-toggle' }, [
				el('input', {
					type: 'checkbox',
					class: 'efm-checkbox',
					checked: !!family.force,
					onchange: function (event) {
						state.families[index].force = event.target.checked;
						state.dirty = true;
						render();
					}
				}),
				el('span', {}, [
					el('span', { class: 'efm-toggle__label', text: s('applyForce', 'Override theme styles') }),
					el('span', { class: 'efm-field__hint', text: s('applyForceHint', 'Adds !important, for when a theme stylesheet loads later or wins on specificity.') })
				])
			]) : null,
			el('label', { class: 'efm-toggle' }, [
				preloadInput,
				el('span', {}, [
					el('span', { class: 'efm-toggle__label', text: s('preload', 'Preload this family') }),
					el('span', { class: 'efm-field__hint', text: s('preloadHint', 'Fetches the regular weight early. Use it only for fonts visible above the fold; preloading everything slows the page down.') })
				])
			])
		]);
	}

	function variantRow(familyIndex, variantIndex, variant) {
		var fileSelect = el('select', {
			class: 'efm-input efm-input--select',
			'aria-label': s('file', 'File'),
			onchange: function (event) {
				var target = state.families[familyIndex].variants[variantIndex];
				var picked = state.files.filter(function (f) { return f.name === event.target.value; })[0];

				target.file = event.target.value;

				// Weight and style are read from the file name so mapping a
				// freshly uploaded file is a single step.
				if (picked && picked.weight) {
					target.weight = picked.weight;
					target.style = picked.style || 'normal';
				}

				state.dirty = true;
				render();
			}
		});

		if (!state.files.length) {
			fileSelect.appendChild(el('option', { value: '', text: s('noFiles', 'No files uploaded yet.') }));
		}

		state.files.forEach(function (file) {
			fileSelect.appendChild(el('option', {
				value: file.name,
				text: file.name,
				selected: file.name === variant.file
			}));
		});

		var weightSelect = el('select', {
			class: 'efm-input efm-input--select',
			'aria-label': s('weight', 'Weight'),
			onchange: function (event) {
				state.families[familyIndex].variants[variantIndex].weight = event.target.value;
				state.dirty = true;
				renderHeaderActions();
			}
		});

		var weights = ['100', '200', '300', '400', '500', '600', '700', '800', '900', '100 900'];

		// A narrowed variable axis produces a range this list does not carry, so
		// the stored value is added rather than silently rewritten on save.
		if (weights.indexOf(String(variant.weight)) === -1) {
			weights.push(String(variant.weight));
		}

		weights.forEach(function (weight) {
			weightSelect.appendChild(el('option', {
				value: weight,
				text: weight.indexOf(' ') !== -1 ? s('variable', 'variable') + ' ' + weight : weight,
				selected: weight === String(variant.weight)
			}));
		});

		var styleSelect = el('select', {
			class: 'efm-input efm-input--select',
			'aria-label': s('style', 'Style'),
			onchange: function (event) {
				state.families[familyIndex].variants[variantIndex].style = event.target.value;
				state.dirty = true;
				renderHeaderActions();
			}
		});

		[['normal', s('normal', 'Normal')], ['italic', s('italic', 'Italic')]].forEach(function (pair) {
			styleSelect.appendChild(el('option', {
				value: pair[0],
				text: pair[1],
				selected: pair[0] === variant.style
			}));
		});

		return el('div', { class: 'efm-table__row' }, [
			fileSelect,
			weightSelect,
			styleSelect,
			el('button', {
				type: 'button',
				class: 'efm-icon-btn efm-icon-btn--danger',
				'aria-label': s('removeVariant', 'Remove variant'),
				title: s('removeVariant', 'Remove variant'),
				onclick: function () {
					state.families[familyIndex].variants.splice(variantIndex, 1);
					state.dirty = true;
					render();
				}
			}, [icon('trash')])
		]);
	}

	/* ------------------------------- Upload ------------------------------ */

	function renderUpload() {
		var input = el('input', {
			type: 'file',
			accept: '.woff2,.woff,.ttf,.otf',
			multiple: true,
			class: 'efm-file-input',
			onchange: function (event) {
				uploadFiles(event.target.files);
				event.target.value = '';
			}
		});

		var dropzone = el('div', {
			class: 'efm-dropzone',
			tabindex: '0',
			role: 'button',
			'aria-label': s('upload', 'Upload font files'),
			onclick: function () { input.click(); },
			onkeydown: function (event) {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					input.click();
				}
			},
			ondragover: function (event) {
				event.preventDefault();
				dropzone.classList.add('is-dragover');
			},
			ondragleave: function () { dropzone.classList.remove('is-dragover'); },
			ondrop: function (event) {
				event.preventDefault();
				dropzone.classList.remove('is-dragover');
				uploadFiles(event.dataTransfer.files);
			}
		}, [
			icon('cloudUpload', 'lg'),
			el('p', { class: 'efm-dropzone__title', text: s('upload', 'Upload font files') }),
			el('p', { class: 'efm-dropzone__hint', text: s('uploadHint', 'Drop woff2, woff, ttf or otf files here, or click to browse.') }),
			input
		]);

		contentEl.appendChild(dropzone);

		if (converterAvailable()) {
			contentEl.appendChild(el('label', { class: 'efm-toggle efm-toggle--convert' }, [
				el('input', {
					type: 'checkbox',
					class: 'efm-checkbox',
					checked: !!state.convert,
					onchange: function (event) {
						state.convert = event.target.checked;
						savePrefs();
					}
				}),
				el('span', {}, [
					el('span', { class: 'efm-toggle__label', text: s('convertUpload', 'Convert TTF and OTF to WOFF2') }),
					el('span', {
						class: 'efm-field__hint',
						text: s('convertHint', 'Runs in your browser, so the font is never sent anywhere but your own site. WOFF2 is normally 30 to 65% smaller and is what every current browser prefers. Only the container changes: glyphs, variable axes and OpenType features are untouched. It is not a subsetter, so a font that is large because of its character coverage stays large.')
					})
				])
			]));
		}

		if (state.convertLog.length) {
			contentEl.appendChild(convertReport());
		}

		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('files', 'Uploaded files') }));

		if (!state.files.length) {
			contentEl.appendChild(el('p', { class: 'efm-muted', text: s('noFiles', 'No files uploaded yet.') }));
			return;
		}

		var table = el('div', { class: 'efm-table efm-table--files' }, [
			el('div', { class: 'efm-table__head' }, [
				el('span', { text: s('file', 'File') }),
				el('span', { text: s('type', 'Type') }),
				el('span', { text: s('size', 'Size') }),
				el('span', { text: '' }),
				el('span', { text: '' })
			])
		]);

		state.files.forEach(function (file) {
			table.appendChild(
				el('div', { class: 'efm-table__row' }, [
					el('span', { class: 'efm-file__name', text: file.name, title: file.name }),
					el('span', { class: 'efm-muted', text: (file.ext || '').toUpperCase() + ' · ' + (file.weight || '400') + (file.style === 'italic' ? ' ' + s('italic', 'Italic') : '') }),
					el('span', { class: 'efm-muted', text: formatSize(file.size) + (fileUsedBy(file.name).length ? ' · ' + s('inUse', 'in use') : '') }),
					convertible(file.name) && converterAvailable()
						? el('button', {
							type: 'button',
							class: 'efm-icon-btn',
							disabled: !!state.converting,
							'aria-label': s('convertFile', 'Convert to WOFF2'),
							title: s('convertFile', 'Convert to WOFF2'),
							onclick: function () {
								convertExisting(file);
							}
						}, [icon('compress')])
						// Keeps the delete button in its own column on rows that
						// cannot be converted.
						: el('span', {}),
					el('button', {
						type: 'button',
						class: 'efm-icon-btn efm-icon-btn--danger',
						'aria-label': s('deleteFile', 'Delete file'),
						title: s('deleteFile', 'Delete file'),
						onclick: function () {
							var users = fileUsedBy(file.name);
							var message = s('confirmDelete', 'Delete this file from the fonts folder?');

							if (users.length) {
								message += '\n\n' + s('confirmDeleteUsed', 'It is mapped by:') + ' ' + users.join(', ') +
									'.\n' + s('confirmDeleteUsedHint', 'Those variants will be removed too.');
							}

							if (window.confirm(message)) {
								deleteFile(file.name);
							}
						}
					}, [icon('trash')])
				])
			);
		});

		contentEl.appendChild(table);
	}

	/* ---------------------------- Google Fonts --------------------------- */

	/* --------------------------- Family detail --------------------------- */

	/**
	 * A private family name for the variable face.
	 *
	 * The browse grid has already loaded a static preview face under the real
	 * family name. Injecting the variable face under that same name would leave
	 * the browser free to keep matching the static one, and the axis sliders
	 * would move with nothing happening. Aliasing removes the ambiguity.
	 *
	 * @param {string} family Family name.
	 * @return {string}
	 */
	function vfAlias(family) {
		return 'EFM VF ' + family;
	}

	function trimNumber(value) {
		return String(Number(value));
	}

	/**
	 * Build the css2 axis spec for a family, e.g. "GRAD,opsz,wght@-1..0,17..18,400..700".
	 *
	 * Requesting a family without this returns a **static instance**, not the
	 * variable font — measured against the live API. Google wants uppercase axis
	 * tags before lowercase ones, each group alphabetical.
	 *
	 * @param {object} font Index record.
	 * @return {string} Empty when the family has no axes.
	 */
	function axisSpec(font) {
		var axes = ((font && font.axes) || []).slice();

		if (!axes.length) {
			return '';
		}

		axes.sort(function (a, b) {
			var au = a.tag.charAt(0) === a.tag.charAt(0).toUpperCase();
			var bu = b.tag.charAt(0) === b.tag.charAt(0).toUpperCase();

			if (au !== bu) {
				return au ? -1 : 1;
			}

			return a.tag < b.tag ? -1 : (a.tag > b.tag ? 1 : 0);
		});

		return axes.map(function (a) {
			return a.tag;
		}).join(',') + '@' + axes.map(function (a) {
			return trimNumber(a.min) + '..' + trimNumber(a.max);
		}).join(',');
	}

	/**
	 * Fetch the variable face and re-declare it under the alias.
	 *
	 * fonts.googleapis.com serves css2 with Access-Control-Allow-Origin: *, so
	 * the response can be read and rewritten rather than only linked.
	 *
	 * @param {object}   font Index record.
	 * @param {Function} done Called once the face is available.
	 */
	function loadVariableFace(font, done) {
		var alias = vfAlias(font.family);
		var spec = axisSpec(font);

		if (!spec || vfLoaded[alias]) {
			done();
			return;
		}

		vfLoaded[alias] = true;

		window.fetch(
			'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(font.family) +
				':' + spec + '&display=swap'
		)
			.then(function (response) {
				return response.ok ? response.text() : null;
			})
			.then(function (css) {
				if (!css) {
					vfLoaded[alias] = false;
					done();
					return;
				}

				var style = document.createElement('style');

				style.className = 'efm-vf-face';
				style.textContent = css.replace(/font-family:\s*'[^']*'/g, "font-family: '" + alias + "'");
				document.head.appendChild(style);
				done();
			})
			.catch(function () {
				vfLoaded[alias] = false;
				done();
			});
	}

	function axisState(family) {
		if (!state.axisValues[family]) {
			state.axisValues[family] = {};
		}

		return state.axisValues[family];
	}

	function axisValue(font, axis) {
		var held = axisState(font.family);

		return held[axis.tag] === undefined ? axis.def : held[axis.tag];
	}

	function variationSettings(font) {
		var axes = (font.axes || []);

		if (!axes.length) {
			return '';
		}

		return axes.map(function (axis) {
			return '"' + axis.tag + '" ' + trimNumber(axisValue(font, axis));
		}).join(', ');
	}

	/**
	 * Type tester for one family: the whole face, driven live by its own axes.
	 *
	 * @param {object} font Index record.
	 */
	function renderGoogleDetail(font) {
		var axes = font.axes || [];
		var alias = vfAlias(font.family);
		var hasVariable = !!axes.length;

		contentEl.appendChild(previewToolbar(
			el('div', { class: 'efm-toolbar__lead' }, [
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--outline efm-btn--sm',
					onclick: function () {
						state.detail = null;
						render();
					}
				}, [icon('back', 'sm'), el('span', { text: s('backToBrowse', 'Back') })])
			])
		));

		contentEl.appendChild(el('div', { class: 'efm-detail__head' }, [
			el('h2', { class: 'efm-detail__title', text: font.family }),
			font.designers && font.designers.length
				? el('p', { class: 'efm-card__by', text: font.designers.join(', ') })
				: null,
			el('div', { class: 'efm-chips' }, [
				font.category ? el('span', { class: 'efm-chip', text: font.category }) : null
			].concat((font.classes || []).map(function (name) {
				return el('span', { class: 'efm-chip', text: name });
			})).concat([
				el('span', { class: 'efm-chip', text: stylesLabel(font) }),
				font.size ? el('span', { class: 'efm-chip', text: formatSize(font.size) }) : null,
				font.added ? el('span', { class: 'efm-chip', text: s('addedOn', 'Added') + ' ' + font.added }) : null
			]))
		]));

		// The tester renders in the aliased face so the sliders cannot be silently
		// overridden by the static preview face already loaded for the grid.
		var tester = el('p', {
			class: 'efm-tester',
			'data-efm-specimen': 'true',
			'data-efm-subsets': (font.subsets || []).join(','),
			'data-efm-script': font.script || '',
			text: sampleFor(font),
			style: {
				'font-family': '"' + alias + '", "' + font.family + '", sans-serif',
				'font-size': state.previewSize + 'px',
				'font-variation-settings': variationSettings(font) || 'normal'
			}
		});

		contentEl.appendChild(tester);

		if (hasVariable) {
			var cssLine = el('code', {
				class: 'efm-code efm-code--inline',
				text: 'font-variation-settings: ' + variationSettings(font) + ';'
			});

			var repaint = function () {
				var settings = variationSettings(font);

				tester.style.setProperty('font-variation-settings', settings || 'normal');
				cssLine.textContent = 'font-variation-settings: ' + settings + ';';
			};

			contentEl.appendChild(el('div', { class: 'efm-axes' }, axes.map(function (axis) {
				var meta = state.axisNames[axis.tag] || {};
				var step = Math.pow(10, meta.precision || 0);
				var valueLabel = el('span', {
					class: 'efm-axis__value',
					text: trimNumber(axisValue(font, axis))
				});

				return el('label', { class: 'efm-axis' }, [
					el('span', { class: 'efm-axis__label' }, [
						el('span', { class: 'efm-axis__name', text: meta.name || axis.tag }),
						el('span', { class: 'efm-axis__tag', text: axis.tag }),
						valueLabel
					]),
					el('input', {
						type: 'range',
						class: 'efm-range',
						min: trimNumber(axis.min),
						max: trimNumber(axis.max),
						step: trimNumber(step),
						value: trimNumber(axisValue(font, axis)),
						'aria-label': (meta.name || axis.tag) + ' (' + axis.tag + ')',
						oninput: function (event) {
							axisState(font.family)[axis.tag] = parseFloat(event.target.value);
							valueLabel.textContent = event.target.value;
							repaint();
						}
					}),
					el('span', {
						class: 'efm-axis__range',
						text: trimNumber(axis.min) + ' – ' + trimNumber(axis.max) +
							' · ' + s('axisDefault', 'default') + ' ' + trimNumber(axis.def)
					})
				]);
			})));

			contentEl.appendChild(el('div', { class: 'efm-detail__actions' }, [
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--ghost efm-btn--sm',
					onclick: function () {
						delete state.axisValues[font.family];
						render();
					}
				}, [icon('refresh', 'sm'), el('span', { text: s('resetAxes', 'Reset axes') })])
			]));

			contentEl.appendChild(cssLine);
		} else {
			contentEl.appendChild(el('p', {
				class: 'efm-muted',
				text: s('noAxes', 'This family has no variable axes, so there is nothing to adjust.')
			}));
		}

		/*
		 * The same install controls as the browse card. A tester you cannot install
		 * from would just send the user back to the grid to start again.
		 */
		var installed = state.families.some(function (family) {
			return (family.name || '').toLowerCase() === font.family.toLowerCase();
		});
		var chosen = selectedSubsets(font);
		var available = font.subsets && font.subsets.length ? font.subsets : ['latin'];
		var useVariable = hasVariable && state.variable[font.family] !== false;
		var allCuts = availableCuts(font);
		var cuts = selectedCuts(font);
		var pickCuts = !useVariable && allCuts.length > 1;

		contentEl.appendChild(el('div', { class: 'efm-subsets' }, [
			el('span', { class: 'efm-subsets__label', text: s('subsets', 'Subsets') }),
			el('div', { class: 'efm-chips' }, available.map(function (sub) {
				var on = chosen.indexOf(sub) !== -1;

				return el('button', {
					type: 'button',
					class: 'efm-chip efm-chip--toggle' + (on ? ' is-on' : ''),
					'aria-pressed': on ? 'true' : 'false',
					text: sub,
					onclick: function () {
						toggleSubset(font, sub);
					}
				});
			}))
		]));

		if (hasVariable) {
			// The detail view is one family on a full pane, so it keeps the whole
			// sentence; only the stacking goes.
			contentEl.appendChild(el('label', { class: 'efm-toggle efm-toggle--inline' }, [
				el('input', {
					type: 'checkbox',
					class: 'efm-checkbox',
					checked: useVariable,
					onchange: function (event) {
						state.variable[font.family] = event.target.checked;
						render();
					}
				}),
				el('span', {}, [
					el('span', { class: 'efm-toggle__label', text: s('variableCut', 'Variable') }),
					el('span', {
						class: 'efm-field__hint',
						text: s('variableHint', 'one file per subset instead of one per weight')
					})
				])
			]));
		}

		if (pickCuts) {
			contentEl.appendChild(el('div', { class: 'efm-subsets' }, [
				el('span', { class: 'efm-subsets__label', text: s('weights', 'Weights') }),
				el('div', { class: 'efm-chips' }, allCuts.map(function (cut) {
					var on = cuts.indexOf(cut) !== -1;

					return el('button', {
						type: 'button',
						class: 'efm-chip efm-chip--toggle' + (on ? ' is-on' : ''),
						'aria-pressed': on ? 'true' : 'false',
						text: cutLabel(cut),
						onclick: function () {
							toggleCut(font, cut);
						}
					});
				}))
			]));
		}

		contentEl.appendChild(el('div', { class: 'efm-detail__actions' }, [
			el('button', {
				type: 'button',
				class: 'efm-btn ' + (installed ? 'efm-btn--outline' : 'efm-btn--primary'),
				text: state.busy === 'install:' + font.family
					? s('installing', 'Installing…')
					: (installed ? s('reinstall', 'Reinstall') : s('install', 'Install')),
				disabled: 0 === state.busy.indexOf('install:') || !chosen.length || (pickCuts && !cuts.length),
				onclick: function () {
					installGoogleFont(font.family, chosen, useVariable, cuts);
				}
			}),
			installed ? el('span', { class: 'efm-badge' }, [icon('check', 'sm'), el('span', { text: s('installed', 'Installed') })]) : null
		]));

		contentEl.appendChild(el('p', { class: 'efm-muted' }, [
			el('a', {
				href: 'https://fonts.google.com/specimen/' + font.family.replace(/ /g, '+'),
				target: '_blank',
				rel: 'noopener noreferrer',
				text: s('viewOnGoogle', 'View on Google Fonts')
			})
		]));

		loadVariableFace(font, function () {
			// Nothing to repaint: the alias is already in the tester's stack, so the
			// face swaps in as soon as the style element lands.
		});
	}

	function renderGoogle() {
		var detail = null;
		var i;

		if (state.detail) {
			for (i = 0; i < state.results.length; i++) {
				if (state.results[i].family === state.detail) {
					detail = state.results[i];
					break;
				}
			}

			// The record is only in the current result page, so a filter change can
			// strand the detail view. Falling back to the grid beats an empty pane.
			if (detail) {
				renderGoogleDetail(detail);
				return;
			}

			state.detail = null;
		}

		var search = el('input', {
			type: 'search',
			class: 'efm-input',
			placeholder: s('searchGoogle', 'Search Google Fonts'),
			value: state.query,
			oninput: debounce(function (event) {
				state.query = event.target.value;
				searchGoogle();
			}, 320)
		});

		var categorySelect = el('select', {
			class: 'efm-input efm-input--select',
			'aria-label': s('category', 'Category'),
			onchange: function (event) {
				state.category = event.target.value;
				searchGoogle();
			}
		}, [el('option', { value: '', text: s('allCategories', 'All categories'), selected: !state.category })]);

		state.categories.forEach(function (cat) {
			categorySelect.appendChild(el('option', { value: cat, text: cat, selected: state.category === cat }));
		});

		var sortSelect = el('select', {
			class: 'efm-input efm-input--select',
			'aria-label': s('sortBy', 'Sort by'),
			onchange: function (event) {
				state.sort = event.target.value;
				searchGoogle();
			}
		}, [
			el('option', { value: 'popularity', text: s('sortPopular', 'Most popular'), selected: state.sort === 'popularity' }),
			el('option', { value: 'trending', text: s('sortTrending', 'Trending'), selected: state.sort === 'trending' }),
			el('option', { value: 'newest', text: s('sortNewest', 'Newest'), selected: state.sort === 'newest' }),
			el('option', { value: 'alphabetical', text: s('sortAlpha', 'A to Z'), selected: state.sort === 'alphabetical' })
		]);

		/*
		 * Writing system. The count matters: it is the difference between "Latin,
		 * 1817 families" and "Sinhala, 8", and picking a script without knowing
		 * that looks like a broken filter rather than a small catalogue.
		 */
		var subsetSelect = el('select', {
			class: 'efm-input efm-input--select',
			'aria-label': s('writingSystem', 'Writing system'),
			onchange: function (event) {
				state.subset = event.target.value;
				resetSubsetDefaults();
				searchGoogle();
			}
		}, [el('option', { value: '', text: s('allScripts', 'Any writing system'), selected: !state.subset })]);

		state.subsetList.forEach(function (entry) {
			subsetSelect.appendChild(el('option', {
				value: entry.subset,
				text: entry.subset + ' (' + entry.count + ')',
				selected: state.subset === entry.subset
			}));
		});

		var variableSelect = el('select', {
			class: 'efm-input efm-input--select',
			'aria-label': s('technology', 'Technology'),
			onchange: function (event) {
				state.variableOnly = event.target.value;
				searchGoogle();
			}
		}, [
			el('option', { value: '', text: s('anyTech', 'Any technology'), selected: '' === state.variableOnly }),
			el('option', { value: '1', text: s('variableOnly', 'Variable only'), selected: '1' === state.variableOnly }),
			el('option', { value: '0', text: s('staticOnly', 'Static only'), selected: '0' === state.variableOnly })
		]);

		contentEl.appendChild(previewToolbar(
			el('div', { class: 'efm-toolbar__lead' }, [
				el('div', { class: 'efm-search' }, [icon('search', 'sm'), search]),
				filterPopover([
					filterField(s('category', 'Category'), categorySelect),
					filterField(s('writingSystem', 'Writing system'), subsetSelect),
					filterField(s('technology', 'Technology'), variableSelect),
					filterField(s('sortBy', 'Sort by'), sortSelect)
				]),
				layoutToggle()
			])
		));

		if (state.searching) {
			contentEl.appendChild(el('p', { class: 'efm-sr-only', role: 'status', text: s('searching', 'Searching…') }));
			contentEl.appendChild(skeletonGrid(6));
			return;
		}

		if (!state.results.length) {
			// An empty catalogue is almost always a filter, so offer the way out
			// rather than leaving a dead end.
			contentEl.appendChild(emptyState(
				s('noResults', 'No fonts found.'),
				null,
				googleFiltered() ? s('resetAll', 'Reset all') : null,
				resetGoogleFilters
			));
			return;
		}

		contentEl.appendChild(el('div', { class: 'efm-resultbar' }, [
			el('p', {
				class: 'efm-muted',
				text: state.results.length + ' ' + s('ofLabel', 'of') + ' ' + state.total + ' ' + s('familiesLabel', 'families')
			}),
			state.picked.length ? el('div', { class: 'efm-bulk' }, [
				el('span', {
					class: 'efm-bulk__count',
					text: state.picked.length + ' ' + s('selected', 'selected')
				}),
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--ghost efm-btn--sm',
					disabled: 0 === state.busy.indexOf('install:'),
					onclick: function () {
						state.picked = [];
						render();
					}
				}, [icon('close', 'sm'), el('span', { text: s('clearSelection', 'Clear') })]),
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--primary efm-btn--sm',
					text: 0 === state.busy.indexOf('install:')
						? s('installing', 'Installing…')
						: s('installSelected', 'Install selected'),
					disabled: 0 === state.busy.indexOf('install:'),
					onclick: installPicked
				})
			]) : null
		]));

		var grid = el('div', { class: gridClass() });

		state.results.forEach(function (font) {
			var installed = state.families.some(function (family) {
				return (family.name || '').toLowerCase() === font.family.toLowerCase();
			});
			var picked = state.picked.indexOf(font.family) !== -1;
			var busy = state.busy === 'install:' + font.family;
			var available = font.subsets && font.subsets.length ? font.subsets : ['latin'];
			var chosen = selectedSubsets(font);
			var hasVariable = !!(font.wght && font.wght.min);
			var useVariable = hasVariable && state.variable[font.family] !== false;
			var allCuts = availableCuts(font);
			var cuts = selectedCuts(font);
			// A variable cut spans every weight in one file, so the weight picker
			// is only meaningful for a static install.
			var pickCuts = !useVariable && allCuts.length > 1;

			grid.appendChild(
				el('article', { class: 'efm-card' + (picked ? ' is-picked' : ''), 'data-family': font.family }, [
					el('div', { class: 'efm-card__head' }, [
						el('label', { class: 'efm-card__pick' }, [
							el('input', {
								type: 'checkbox',
								class: 'efm-checkbox',
								checked: picked,
								'aria-label': s('selectFamily', 'Select') + ' ' + font.family,
								onchange: function () {
									togglePick(font.family);
								}
							})
						]),
						el('h2', { class: 'efm-card__title' }, [
							el('button', {
								type: 'button',
								class: 'efm-linkbtn',
								text: font.family,
								title: s('openDetail', 'Open the type tester'),
								onclick: function () {
									state.detail = font.family;
									render();
								}
							})
						]),
						el('div', { class: 'efm-card__actions' }, [
							installed ? el('span', { class: 'efm-badge' }, [icon('check', 'sm'), el('span', { text: s('installed', 'Installed') })]) : null,
							/*
							 * Outline, not accent. A grid of twenty-four cards each
							 * shouting in the accent colour is not a hierarchy, and
							 * Etch keeps one accent action per screen. The bulk bar
							 * above the grid carries the primary.
							 */
							el('button', {
								type: 'button',
								class: 'efm-btn efm-btn--sm efm-btn--outline',
								text: busy
									? s('installing', 'Installing…')
									: (installed ? s('reinstall', 'Reinstall') : s('install', 'Install')),
								disabled: state.busy.indexOf('install:') === 0 || !chosen.length || (pickCuts && !cuts.length),
								onclick: function () { installGoogleFont(font.family, chosen, useVariable, cuts); }
							})
						])
					]),
					font.designers && font.designers.length
						? el('p', { class: 'efm-card__by', text: font.designers.join(', ') })
						: null,
					specimen(font.family, font.subsets, font.script),
					/*
					 * One line. The axis range earns its place on a card, but the
					 * explanation behind it does not need repeating twenty-four
					 * times down a grid, so it moves to the label's tooltip.
					 */
					hasVariable ? el('label', {
						class: 'efm-toggle efm-toggle--inline',
						title: s('variableHint', 'one file per subset instead of one per weight')
					}, [
						el('input', {
							type: 'checkbox',
							class: 'efm-checkbox',
							checked: useVariable,
							onchange: function (event) {
								state.variable[font.family] = event.target.checked;
								render();
							}
						}),
						el('span', {}, [
							el('span', { class: 'efm-toggle__label', text: s('variableCut', 'Variable') }),
							el('span', { class: 'efm-field__hint', text: font.wght.min + '–' + font.wght.max })
						])
					]) : null,
					pickCuts ? chipWall(
						'cuts:' + font.family,
						s('weights', 'Weights'),
						allCuts.map(function (cut) {
							return {
								label: cutLabel(cut),
								on: cuts.indexOf(cut) !== -1,
								onclick: function () { toggleCut(font, cut); }
							};
						}),
						CHIP_LIMIT,
						[el('button', {
							type: 'button',
							class: 'efm-chip efm-chip--toggle',
							text: cuts.length === allCuts.length ? s('cutsNone', 'None') : s('cutsAll', 'All'),
							onclick: function () {
								setCuts(font, cuts.length === allCuts.length ? [] : allCuts);
							}
						})]
					) : null,
					available.length > 1 ? chipWall(
						'subsets:' + font.family,
						s('subsets', 'Subsets'),
						available.map(function (sub) {
							return {
								label: sub,
								on: chosen.indexOf(sub) !== -1,
								onclick: function () { toggleSubset(font, sub); }
							};
						}),
						CHIP_LIMIT
					) : null,
					el('div', { class: 'efm-card__meta' }, [
						el('span', { text: font.category || '' }),
						el('span', { text: stylesLabel(font) }),
						font.size ? el('span', {
							class: 'efm-muted',
							text: formatSize(font.size),
							title: s('familySizeHint', 'Size of the whole family at Google. What you install depends on the subsets and weights chosen below.')
						}) : null
					])
				])
			);
		});

		contentEl.appendChild(grid);
		observePreviews(grid);

		if (state.results.length < state.total) {
			contentEl.appendChild(
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--ghost efm-btn--block',
					text: state.loadingMore ? s('loading', 'Loading…') : s('loadMore', 'Load more'),
					disabled: state.loadingMore,
					onclick: loadMoreGoogle
				})
			);
		}
	}

	/**
	 * "Variable (3 axes)" or "18 styles", matching how Google labels a family.
	 *
	 * The axis count is the more useful number for a variable family: the style
	 * count says 18 whether those cuts are 18 files or one file with a wght axis.
	 *
	 * @param {object} font Index record.
	 * @return {string}
	 */
	function stylesLabel(font) {
		var axes = (font && font.axes) || [];
		var count = ((font && font.variants) || []).length;

		if (axes.length) {
			return s('variableLabel', 'Variable') + ' (' + axes.length + ' ' +
				plural(axes.length, s('axis', 'axis'), s('axes', 'axes')) + ')';
		}

		// Deliberately not the existing 'style' string: that one is the capitalised
		// form label "Style" and would render as "18 Style".
		return count + ' ' + plural(count, s('styleSingular', 'style'), s('styles', 'styles'));
	}

	function togglePick(family) {
		var at = state.picked.indexOf(family);

		if (at === -1) {
			state.picked.push(family);
		} else {
			state.picked.splice(at, 1);
		}

		render();
	}

	/**
	 * Install every selected family, one at a time.
	 *
	 * Serial on purpose. Each install downloads a set of woff2 files from Google
	 * and writes them, and firing a dozen of those concurrently is a good way to
	 * get rate limited or to time the request out on shared hosting.
	 */
	function installPicked() {
		var queue = state.picked.slice();
		var done = 0;
		var failed = [];

		if (!queue.length) {
			return;
		}

		function next() {
			if (!queue.length) {
				state.busy = '';
				state.picked = failed.slice();

				if (failed.length) {
					setStatus(
						s('bulkPartial', 'Installed') + ' ' + done + ', ' +
							s('bulkFailed', 'failed') + ': ' + failed.join(', '),
						'error'
					);
				} else {
					setStatus(s('bulkDone', 'Installed') + ' ' + done + ' ' +
						plural(done, s('familySingular', 'family'), s('familiesLabel', 'families')));
				}

				render();
				return;
			}

			var family = queue.shift();
			var font = null;
			var i;

			for (i = 0; i < state.results.length; i++) {
				if (state.results[i].family === family) {
					font = state.results[i];
					break;
				}
			}

			if (!font) {
				next();
				return;
			}

			var hasVariable = !!(font.wght && font.wght.min);
			var useVariable = hasVariable && state.variable[font.family] !== false;

			state.busy = 'install:' + family;
			setStatus(s('installing', 'Installing…') + ' ' + family + ' (' + (done + 1) + '/' + state.picked.length + ')');
			render();

			request('/google/install', {
				method: 'POST',
				body: {
					family: family,
					subsets: selectedSubsets(font),
					variable: useVariable,
					cuts: useVariable ? [] : selectedCuts(font)
				}
			})
				.then(function (data) {
					applyState(data && data.state);
					delete state.cuts[family];
					done++;
				})
				.catch(function () {
					// Kept in the selection so a retry does not need re-picking.
					failed.push(family);
				})
				.then(next);
		}

		next();
	}

	/**
	 * Subsets chosen for a family. Latin is preselected because it carries the
	 * numerals and punctuation most scripts still rely on.
	 *
	 * @param {object} font Search result.
	 * @return {string[]}
	 */
	function selectedSubsets(font) {
		if (!state.subsets[font.family]) {
			var available = font.subsets && font.subsets.length ? font.subsets : ['latin'];

			/*
			 * The family's own script is preselected alongside latin.
			 *
			 * Latin alone was the default, which meant installing Gemunu Libre or
			 * Noto Sans Sinhala from a single click produced a family with **no
			 * Sinhala glyphs**, silently falling back to a system font. That is
			 * gotcha #4, and defaulting to latin-only reintroduced it every time
			 * the user did not think to tick the box.
			 */
			var own = SCRIPT_SUBSET[font.script || ''];

			/*
			 * An active writing-system filter counts as the user asking for that
			 * script. Families like Google Sans carry sinhala without it being
			 * their primary script, so primaryScript alone would still install
			 * them latin-only right after a search for Sinhala faces.
			 */
			var asked = state.subset || '';

			state.subsets[font.family] = available.filter(function (sub) {
				return sub === 'latin' || (own && sub === own) || (asked && sub === asked);
			});

			if (!state.subsets[font.family].length) {
				state.subsets[font.family] = available.slice(0, 1);
			}
		}

		return state.subsets[font.family];
	}

	function toggleSubset(font, subset) {
		var chosen = selectedSubsets(font);
		var at = chosen.indexOf(subset);

		if (at === -1) {
			chosen.push(subset);
		} else {
			chosen.splice(at, 1);
		}

		// Marks this family as the user's own choice, so changing the writing-system
		// filter later cannot quietly overwrite it.
		state.subsetTouched[font.family] = true;
		render();
	}

	/**
	 * Drop auto-selected subset defaults so they are recomputed.
	 *
	 * Defaults are cached per family on first render. Without this, a family
	 * already shown before the writing-system filter was applied keeps its
	 * latin-only default — which is how Google Sans stayed latin-only in a
	 * Sinhala-filtered list. Families the user has touched are left alone.
	 */
	function resetSubsetDefaults() {
		Object.keys(state.subsets).forEach(function (family) {
			if (!state.subsetTouched[family]) {
				delete state.subsets[family];
			}
		});
	}

	/**
	 * Every cut a family offers, in Google's own notation: "400" for regular,
	 * "700i" for bold italic. Ordered by weight, uprights before italics.
	 *
	 * @param {object} font Search result.
	 * @return {string[]}
	 */
	function availableCuts(font) {
		var cuts = (font.variants || []).map(function (variant) {
			return String(variant.weight) + (variant.style === 'italic' ? 'i' : '');
		});

		if (!cuts.length) {
			cuts = ['400'];
		}

		return cuts.filter(function (cut, i, arr) {
			return arr.indexOf(cut) === i;
		}).sort(function (a, b) {
			var ai = a.slice(-1) === 'i';
			var bi = b.slice(-1) === 'i';

			if (ai !== bi) {
				return ai ? 1 : -1;
			}

			return parseInt(a, 10) - parseInt(b, 10);
		});
	}

	/**
	 * Cuts chosen for a family. Regular and bold are preselected because they
	 * cover body copy and headings; installing all eighteen wastes disk, install
	 * time and generated CSS on weights almost no site uses.
	 *
	 * @param {object} font Search result.
	 * @return {string[]}
	 */
	function selectedCuts(font) {
		if (!state.cuts[font.family]) {
			var available = availableCuts(font);

			state.cuts[font.family] = available.filter(function (cut) {
				return cut === '400' || cut === '700';
			});

			if (!state.cuts[font.family].length) {
				state.cuts[font.family] = available.slice(0, 1);
			}
		}

		return state.cuts[font.family];
	}

	function toggleCut(font, cut) {
		var chosen = selectedCuts(font);
		var at = chosen.indexOf(cut);

		if (at === -1) {
			chosen.push(cut);
		} else {
			chosen.splice(at, 1);
		}

		render();
	}

	function setCuts(font, cuts) {
		state.cuts[font.family] = cuts.slice();
		render();
	}

	/**
	 * Label for a cut chip. "400" reads as "400", "700i" as "700 italic".
	 *
	 * @param {string} cut Cut key.
	 * @return {string}
	 */
	function cutLabel(cut) {
		return cut.slice(-1) === 'i'
			? cut.slice(0, -1) + ' ' + s('italic', 'Italic')
			: cut;
	}

	var previewed = {};
	var previewQueue = [];
	var previewObserver = null;

	/**
	 * Load specimen webfonts only for cards that are actually on screen.
	 *
	 * Requesting every result up front pulled a stylesheet for two dozen
	 * families whether or not they were ever seen, which is slow and wasteful
	 * once the library can be browsed rather than only searched.
	 *
	 * @param {HTMLElement} grid Result grid.
	 */
	function observePreviews(grid) {
		if (!('IntersectionObserver' in window)) {
			queuePreviews(state.results.map(function (font) { return font.family; }));
			return;
		}

		if (previewObserver) {
			previewObserver.disconnect();
		}

		previewObserver = new IntersectionObserver(function (entries) {
			var families = [];

			entries.forEach(function (entry) {
				if (!entry.isIntersecting) {
					return;
				}

				families.push(entry.target.getAttribute('data-family'));
				previewObserver.unobserve(entry.target);
			});

			if (families.length) {
				queuePreviews(families);
			}
		}, { root: contentEl, rootMargin: '200px' });

		Array.prototype.forEach.call(grid.querySelectorAll('[data-family]'), function (card) {
			previewObserver.observe(card);
		});
	}

	function queuePreviews(families) {
		var fresh = families.filter(function (family) {
			return family && !previewed[family];
		});

		if (!fresh.length) {
			return;
		}

		fresh.forEach(function (family) {
			previewed[family] = true;
			previewQueue.push(family);
		});

		window.clearTimeout(queuePreviews._timer);
		queuePreviews._timer = window.setTimeout(flushPreviews, 120);
	}

	function flushPreviews() {
		var batch = previewQueue.splice(0, previewQueue.length);

		if (!batch.length) {
			return;
		}

		var link = document.createElement('link');
		link.rel = 'stylesheet';
		link.className = 'efm-google-preview';
		link.href = 'https://fonts.googleapis.com/css2?' + batch.map(function (family) {
			return 'family=' + encodeURIComponent(family);
		}).join('&') + '&display=swap';

		document.head.appendChild(link);
	}

	/* -------------------------------- Theme ------------------------------ */

	function renderSettings() {
		var stylesheetStatus = el('p', {
			class: 'efm-muted',
			text: state.cssBuilt
				? s('cssBuilt', 'Last generated') + ': ' + new Date(state.cssBuilt * 1000).toLocaleString()
				: s('cssNever', 'The stylesheet has not been generated yet.')
		});

		var inlineToggle =
			el('label', { class: 'efm-toggle' }, [
				el('input', {
					type: 'checkbox',
					class: 'efm-checkbox',
					checked: !!state.settings.inline_css,
					onchange: function (event) {
						state.settings.inline_css = event.target.checked;
						render();
					}
				}),
				el('span', {}, [
					el('span', { class: 'efm-toggle__label', text: s('inlineCss', 'Print the CSS inline') }),
					el('span', { class: 'efm-field__hint', text: s('inlineCssHint', 'Saves one request but the CSS cannot be cached separately. Worth it for a small font set, not for a large one.') })
				])
			]);

		var regenerate =
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--outline',
				disabled: state.busy === 'regenerate',
				text: state.busy === 'regenerate' ? s('saving', 'Saving…') : s('regenerate', 'Regenerate stylesheet'),
				onclick: regenerateCss
			});

		var blockGoogle =
			el('label', { class: 'efm-toggle' }, [
				el('input', {
					type: 'checkbox',
					class: 'efm-checkbox',
					checked: !!state.settings.block_google,
					onchange: function (event) {
						state.settings.block_google = event.target.checked;
						render();
					}
				}),
				el('span', {}, [
					el('span', { class: 'efm-toggle__label', text: s('blockGoogle', 'Block Google Fonts loaded by other plugins') }),
					el('span', { class: 'efm-field__hint', text: s('blockGoogleHint', 'Stops theme and plugin stylesheets that point at fonts.googleapis.com, and removes the matching preconnect hints. It cannot reach an @import inside a theme stylesheet or a link tag printed straight into the page. Your own local fonts are unaffected.') })
				])
			]);

		contentEl.appendChild(section(s('stylesheet', 'Stylesheet'), [stylesheetStatus, inlineToggle, regenerate]));
		contentEl.appendChild(section(s('privacy', 'Privacy'), [blockGoogle]));

		// Saving covers both boxes, so it belongs to the screen rather than to
		// either one of them.
		contentEl.appendChild(
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--primary',
				text: state.busy === 'settings' ? s('saving', 'Saving…') : s('save', 'Save changes'),
				disabled: state.busy === 'settings',
				onclick: saveSettings
			})
		);
	}

	/* -------------------------------- Tools ------------------------------ */

	function renderTools() {
		var unused = state.unused || [];

		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('cleanupTitle', 'Unused files') }));
		contentEl.appendChild(el('p', {
			class: 'efm-muted',
			text: unused.length
				? s('cleanupHint', 'These font files are on the server but no family uses them, usually from deselecting a weight. Deleting them frees space; the weight can be downloaded again at any time.')
				: s('cleanupNone', 'Every font file on the server is in use.')
		}));

		if (unused.length) {
			contentEl.appendChild(el('ul', { class: 'efm-files' }, unused.map(function (file) {
				return el('li', { class: 'efm-file' }, [
					el('span', { class: 'efm-file__name', text: file.name + ' · ' + formatSize(file.size) })
				]);
			})));

			contentEl.appendChild(
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--outline',
					text: state.pruning
						? s('loading', 'Loading…')
						: s('cleanupButton', 'Delete unused files') + ' (' + unused.length + ')',
					disabled: state.pruning,
					onclick: pruneFiles
				})
			);
		}

		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('exportTitle', 'Export') }));
		contentEl.appendChild(el('p', { class: 'efm-muted', text: s('exportHint', 'Download families, their variant mapping and assignments as a JSON file. Choose which families to include, and whether to bundle the font files with them.') }));

		var exportable = state.families.map(function (family) { return family.name; });

		if (exportable.length) {
			var picked = state.exportPick && state.exportPick.length ? state.exportPick : exportable;

			contentEl.appendChild(el('div', { class: 'efm-subsets' }, [
				el('span', { class: 'efm-subsets__label', text: s('exportPick', 'Families') }),
				el('div', { class: 'efm-chips' }, exportable.map(function (name) {
					var on = picked.indexOf(name) !== -1;

					return el('button', {
						type: 'button',
						class: 'efm-chip efm-chip--toggle' + (on ? ' is-on' : ''),
						'aria-pressed': on ? 'true' : 'false',
						text: name,
						onclick: function () {
							var next = picked.slice();
							var at = next.indexOf(name);

							if (at === -1) {
								next.push(name);
							} else {
								next.splice(at, 1);
							}

							state.exportPick = next;
							render();
						}
					});
				}).concat([
					el('button', {
						type: 'button',
						class: 'efm-chip efm-chip--toggle',
						text: picked.length === exportable.length ? s('cutsNone', 'None') : s('cutsAll', 'All'),
						onclick: function () {
							state.exportPick = picked.length === exportable.length ? [] : exportable.slice();
							render();
						}
					})
				]))
			]));

			contentEl.appendChild(
				el('label', { class: 'efm-toggle' }, [
					el('input', {
						type: 'checkbox',
						class: 'efm-checkbox',
						checked: !!state.exportBundle,
						onchange: function (event) {
							state.exportBundle = event.target.checked;
							render();
						}
					}),
					el('span', {}, [
						el('span', { class: 'efm-toggle__label', text: s('exportBundle', 'Include the font files') + (state.exportBundle ? ' · ' + formatSize(bundleSize(picked)) : '') }),
						el('span', { class: 'efm-field__hint', text: s('exportBundleHint', 'Makes a much larger file that rebuilds anywhere. Without it, Google families are re-downloaded on import and hand-uploaded fonts have to be uploaded again.') })
					])
				])
			);
		}
		contentEl.appendChild(
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--primary',
				text: state.busy === 'export' ? s('loading', 'Loading…') : s('exportButton', 'Download configuration'),
				disabled: state.busy === 'export',
				onclick: exportConfig
			})
		);

		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('importTitle', 'Import') }));
		contentEl.appendChild(el('p', { class: 'efm-muted', text: s('importHint', 'Load a configuration exported from another site.') }));

		var modeSelect = el('select', {
			class: 'efm-input efm-input--select',
			'aria-label': s('importMode', 'Import mode'),
			onchange: function (event) {
				state.importMode = event.target.value;
			}
		}, [
			el('option', { value: 'replace', text: s('importReplace', 'Replace everything'), selected: state.importMode !== 'merge' }),
			el('option', { value: 'merge', text: s('importMerge', 'Merge with existing families'), selected: state.importMode === 'merge' })
		]);

		var fileInput = el('input', {
			type: 'file',
			accept: '.json,application/json',
			class: 'efm-file-input',
			onchange: function (event) {
				var file = event.target.files && event.target.files[0];
				event.target.value = '';

				if (file) {
					importConfig(file);
				}
			}
		});

		contentEl.appendChild(
			el('div', { class: 'efm-fields' }, [
				el('label', { class: 'efm-field' }, [
					el('span', { class: 'efm-field__label', text: s('importMode', 'Import mode') }),
					modeSelect
				])
			])
		);

		contentEl.appendChild(
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--outline',
				text: state.busy === 'import' ? s('loading', 'Loading…') : s('importButton', 'Choose a file…'),
				disabled: state.busy === 'import',
				onclick: function () { fileInput.click(); }
			})
		);
		contentEl.appendChild(fileInput);

		if (state.importPreview) {
			var pv = state.importPreview;
			var pvLines = [
				el('p', { class: 'efm-notice', text: s('previewTitle', 'Nothing has been changed yet. This is what importing would do:') })
			];

			var summarise = function (key, label) {
				var names = pv[key] || [];

				if (!names.length) {
					return;
				}

				pvLines.push(el('p', { class: 'efm-muted', text: label + ' (' + names.length + '): ' + names.join(', ') }));
			};

			summarise('added', s('previewAdded', 'Added'));
			summarise('updated', s('previewUpdated', 'Overwritten'));
			summarise('removed', s('previewRemoved', 'Removed'));

			if (pv.bundled) {
				pvLines.push(el('p', { class: 'efm-muted', text: s('previewBundled', 'Font files included in the file') + ': ' + pv.bundled }));
			}

			if (pv.missing && pv.missing.length) {
				pvLines.push(el('p', { class: 'efm-muted', text: s('previewMissing', 'Font files that would still be missing afterwards') + ': ' + pv.missing.length }));
			}

			pvLines.push(el('div', { class: 'efm-card__actions' }, [
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--primary',
					disabled: state.busy === 'import',
					text: state.busy === 'import' ? s('loading', 'Loading…') : s('previewConfirm', 'Import now'),
					onclick: confirmImport
				}),
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--outline',
					text: s('previewCancel', 'Cancel'),
					onclick: cancelImport
				})
			]));

			contentEl.appendChild(el('div', { class: 'efm-report' }, pvLines));
		}

		if (state.importReport) {
			var report = state.importReport;
			var lines = [
				el('p', { class: 'efm-muted', text: report.families + ' ' + plural(report.families, s('familyLabel', 'family'), s('familiesLabel', 'families')) + ' ' + s('imported', 'imported') })
			];

			if (report.missing && report.missing.length) {
				lines.push(el('p', { class: 'efm-notice', text: s('importMissing', 'These files are referenced but not present in the fonts folder. Upload them, or reinstall the family from Google Fonts:') }));
				lines.push(el('ul', { class: 'efm-files' }, report.missing.map(function (name) {
					return el('li', { class: 'efm-file' }, [el('span', { class: 'efm-file__name', text: name })]);
				})));
			}

			if (report.restored && report.restored.length) {
				lines.push(el('p', { class: 'efm-muted', text: s('importRestored', 'Font files written from the file') + ': ' + report.restored.length }));
			}

			if (report.rejected && report.rejected.length) {
				lines.push(el('p', { class: 'efm-notice', text: s('importRejected', 'Rejected, because they are not valid font files:') + ' ' + report.rejected.join(', ') }));
			}

			var recoverable = report.recoverable || [];

			if (recoverable.length) {
				lines.push(el('p', {
					class: 'efm-muted',
					text: s('recoverHint', 'These families came from Google Fonts, so their files can be fetched again with the same subsets and weights:') + ' ' +
						recoverable.map(function (item) { return item.name; }).join(', ')
				}));
				lines.push(el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--primary',
					disabled: !!state.recovering,
					text: state.recovering
						? s('recovering', 'Downloading…') + ' ' + state.recovering
						: s('recoverButton', 'Download missing Google fonts') + ' (' + recoverable.length + ')',
					onclick: function () { recoverMissing(recoverable); }
				}));
			}

			contentEl.appendChild(el('div', { class: 'efm-report' }, lines));
		}

		// Three unrelated tools on one pane; the headings mark where each ends.
		groupSections(contentEl);
	}

	/**
	 * Fetch the files for imported Google families whose fonts are missing.
	 *
	 * Runs one install at a time rather than in parallel: each one downloads
	 * several files from Google, and a shared host will not thank us for opening
	 * a dozen connections at once.
	 *
	 * @param {object[]} items Recoverable families from the import report.
	 */
	/**
	 * Apply the import that was previewed.
	 */
	function confirmImport() {
		if (!state.importPayload) {
			return;
		}

		state.busy = 'import';
		render();

		request('/import', { method: 'POST', body: { data: state.importPayload, mode: state.importMode || 'replace' } })
			.then(function (result) {
				applyState(result && result.state);
				state.importReport = (result && result.report) || null;
				state.importPreview = null;
				state.importPayload = null;
				setStatus(s('imported', 'imported'));
			})
			.catch(fail)
			.then(function () {
				state.busy = '';
				render();
			});
	}

	function cancelImport() {
		state.importPreview = null;
		state.importPayload = null;
		render();
	}

	function recoverMissing(items) {
		var queue = items.slice();
		var done = 0;
		var failed = [];

		var next = function () {
			if (!queue.length) {
				state.recovering = '';

				if (failed.length) {
					fail(new Error(s('recoverFailed', 'Could not download:') + ' ' + failed.join(', ')));
				} else {
					state.importReport = null;
					setStatus(s('recoverDone', 'Downloaded') + ' · ' + done);
				}

				render();
				return;
			}

			var item = queue.shift();
			state.recovering = item.name;
			render();

			request('/google/install', {
				method: 'POST',
				body: {
					family: item.name,
					subsets: item.subsets && item.subsets.length ? item.subsets : ['latin'],
					variable: !!item.variable,
					cuts: item.variable ? [] : (item.cuts || [])
				}
			})
				.then(function (data) {
					applyState(data && data.state);
					done += 1;
				})
				.catch(function () {
					failed.push(item.name);
				})
				.then(next);
		};

		next();
	}

	/**
	 * Roughly how large a bundled export of these families would be.
	 *
	 * Base64 adds about a third, and the JSON wrapper a little more. Shown so
	 * that a bundle big enough for a server to refuse is obvious before it is
	 * downloaded rather than after the import fails.
	 *
	 * @param {string[]} names Families to be exported.
	 * @return {number} Approximate bytes.
	 */
	function bundleSize(names) {
		var wanted = {};

		state.families.forEach(function (family) {
			if (names.indexOf(family.name) === -1) {
				return;
			}

			(family.variants || []).forEach(function (variant) {
				if (variant.file) {
					wanted[variant.file] = true;
				}
			});
		});

		var bytes = 0;

		(state.files || []).forEach(function (file) {
			if (wanted[file.name]) {
				bytes += file.size || 0;
			}
		});

		return Math.round(bytes * 1.37);
	}

	function exportConfig() {
		state.busy = 'export';
		render();

		var chosen = state.exportPick || [];
		var all = liveFamilies().map(function (family) { return family.name; });
		var query = [];

		// Sending every name and sending none mean the same thing to the server,
		// so the shorter request wins.
		if (chosen.length && chosen.length !== all.length) {
			chosen.forEach(function (name) {
				query.push('families[]=' + encodeURIComponent(name));
			});
		}

		if (state.exportBundle) {
			query.push('bundle=1');
		}

		request('/export' + (query.length ? '?' + query.join('&') : ''))
			.then(function (data) {
				var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
				var url = URL.createObjectURL(blob);
				var link = document.createElement('a');

				link.href = url;
				link.download = 'etch-fonts-' + new Date().toISOString().slice(0, 10) + '.json';
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
				window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

				setStatus(s('exported', 'Configuration downloaded.'));
			})
			.catch(fail)
			.then(function () {
				state.busy = '';
				render();
			});
	}

	function importConfig(file) {
		state.busy = 'import';
		render();

		var reader = new FileReader();

		reader.onload = function () {
			var payload;

			try {
				payload = JSON.parse(reader.result);
			} catch (error) {
				state.busy = '';
				fail(new Error(s('importInvalid', 'That file is not valid JSON.')));
				render();
				return;
			}

			// Preview first. Import replaces or merges live data, so it is worth
			// seeing what will change before anything is written.
			request('/import', { method: 'POST', body: { data: payload, mode: state.importMode || 'replace', preview: true } })
				.then(function (result) {
					state.importPreview = (result && result.report) || null;
					state.importPayload = payload;
					state.importReport = null;
				})
				.catch(fail)
				.then(function () {
					state.busy = '';
					render();
				});
		};

		reader.onerror = function () {
			state.busy = '';
			fail(new Error(s('error', 'Something went wrong.')));
			render();
		};

		reader.readAsText(file);
	}

	/* ------------------------------- Actions ----------------------------- */

	function addFamily() {
		state.families.push({ name: s('newFamily', 'New family'), variants: [], display: 'swap', preload: false, fallback: '' });
		state.editing = state.families.length - 1;
		state.dirty = true;
		render();
	}

	function saveFamilies() {
		state.busy = 'save';
		renderHeaderActions();

		request('/families', { method: 'POST', body: { families: state.families } })
			.then(function (next) {
				applyState(next);
				setStatus(s('saved', 'Fonts saved.'));
			})
			.catch(fail)
			.then(function () {
				state.busy = '';
				render();
			});
	}

	function reload() {
		request('/state').then(function (next) {
			applyState(next);
			state.editing = null;
			render();
		}).catch(fail);
	}

	/* ------------------------------ Converter ---------------------------- */

	/*
	 * TTF and OTF are uncompressed sfnt containers. WOFF2 is the same font in a
	 * Brotli-compressed wrapper, so the conversion is lossless: glyphs, variable
	 * axes, named instances and OpenType features all survive untouched. It is
	 * not a subsetter, though — a font that is large because it carries 20,000
	 * CJK glyphs comes out smaller but still large.
	 *
	 * google/woff2 compiled to WebAssembly does the work, in a worker, in the
	 * browser (assets/wasm/). Nothing is uploaded in order to convert. The
	 * plugin posts the WOFF2 result to /upload exactly as if the user had picked
	 * that file themselves, so the whole server side is unchanged.
	 */

	var CONVERTIBLE = { ttf: true, otf: true, woff: true };

	var WOFF_HEADER = 44;
	var WOFF_ENTRY = 20;

	// Brotli quality 11 runs at roughly a second per 100 KB. Anything still
	// going after two minutes is not going to finish.
	var CONVERT_TIMEOUT = 120000;

	var converter = {
		worker: null,
		jobs: {},
		seq: 0,
		// Latches once the worker cannot start. A site with a strict
		// Content-Security-Policy (no wasm-unsafe-eval, no worker-src) must fall
		// back to plain uploads rather than throw on every file.
		broken: false
	};

	function extensionOf(name) {
		var dot = String(name || '').lastIndexOf('.');
		return dot === -1 ? '' : String(name).slice(dot + 1).toLowerCase();
	}

	function woff2Name(name) {
		var dot = String(name).lastIndexOf('.');
		return (dot === -1 ? String(name) : String(name).slice(0, dot)) + '.woff2';
	}

	/**
	 * Does a run of bytes carry the WOFF2 signature?
	 *
	 * The same check the PHP side runs before writing anything to disk. Doing it
	 * here too means a bad conversion is caught before it is ever uploaded.
	 *
	 * @param {Uint8Array} bytes Leading bytes.
	 * @return {boolean}
	 */
	function isWoff2(bytes) {
		return bytes.length >= 4 && 0x77 === bytes[0] && 0x4f === bytes[1] && 0x46 === bytes[2] && 0x32 === bytes[3];
	}

	function isWoff(bytes) {
		return bytes.length >= 4 && 0x77 === bytes[0] && 0x4f === bytes[1] && 0x46 === bytes[2] && 0x46 === bytes[3];
	}

	/**
	 * Inflate one zlib stream.
	 *
	 * WOFF table data is zlib (RFC 1950), so the format here is 'deflate'.
	 * 'deflate-raw' is RFC 1951 and would choke on the two byte zlib header.
	 *
	 * @param {Uint8Array} bytes Compressed bytes.
	 * @return {Promise} Resolves with a Uint8Array.
	 */
	function inflate(bytes) {
		var stream = new Blob([bytes]).stream().pipeThrough(new window.DecompressionStream('deflate'));

		return new Response(stream).arrayBuffer().then(function (buffer) {
			return new Uint8Array(buffer);
		});
	}

	/**
	 * Rebuild an sfnt from its flavour, table directory and table data.
	 *
	 * @param {number} flavor  sfnt version from the WOFF header.
	 * @param {Array}  entries Table directory entries, sorted by tag.
	 * @param {Array}  tables  Uncompressed table data, matching entries.
	 * @return {ArrayBuffer}
	 */
	function assembleSfnt(flavor, entries, tables) {
		var count = entries.length;
		var offsets = [];
		var offset = 12 + count * 16;
		var i;

		for (i = 0; i < count; i++) {
			offsets.push(offset);

			// Tables are aligned to four bytes, with the padding counted in the
			// next offset but not in the recorded length.
			offset += (tables[i].length + 3) & ~3;
		}

		var out = new Uint8Array(offset);
		var view = new DataView(out.buffer);
		var exponent = Math.floor(Math.log(count) / Math.LN2);
		var searchRange = Math.pow(2, exponent) * 16;

		view.setUint32(0, flavor);
		view.setUint16(4, count);
		view.setUint16(6, searchRange);
		view.setUint16(8, exponent);
		view.setUint16(10, count * 16 - searchRange);

		for (i = 0; i < count; i++) {
			var at = 12 + i * 16;
			view.setUint32(at, entries[i].tag);
			view.setUint32(at + 4, entries[i].checksum);
			view.setUint32(at + 8, offsets[i]);
			view.setUint32(at + 12, tables[i].length);
			out.set(tables[i], offsets[i]);
		}

		return out.buffer;
	}

	/**
	 * Unwrap a WOFF into the plain sfnt inside it.
	 *
	 * WOFF is not a format the WOFF2 encoder understands. It is an sfnt whose
	 * tables have each been deflated separately, so rebuilding the sfnt is
	 * header parsing plus inflate — no extra binary, just DecompressionStream.
	 *
	 * The metadata and private data blocks are dropped deliberately. They carry
	 * no glyph data, WOFF2 stores them differently, and nothing here reads them.
	 *
	 * @param {ArrayBuffer} buffer WOFF bytes.
	 * @return {Promise} Resolves with an ArrayBuffer of sfnt bytes.
	 */
	function woffToSfnt(buffer) {
		function damaged() {
			return new Error(s('convertBadWoff', 'This WOFF file is damaged and could not be read.'));
		}

		if (buffer.byteLength < WOFF_HEADER) {
			return Promise.reject(damaged());
		}

		var view = new DataView(buffer);
		var flavor = view.getUint32(4);
		var count = view.getUint16(12);

		if (!count || WOFF_HEADER + count * WOFF_ENTRY > buffer.byteLength) {
			return Promise.reject(damaged());
		}

		var source = new Uint8Array(buffer);
		var entries = [];
		var i;

		for (i = 0; i < count; i++) {
			var at = WOFF_HEADER + i * WOFF_ENTRY;
			var entry = {
				tag: view.getUint32(at),
				offset: view.getUint32(at + 4),
				compLength: view.getUint32(at + 8),
				origLength: view.getUint32(at + 12),
				checksum: view.getUint32(at + 16)
			};

			// Refuse anything that points outside the file or claims to inflate
			// to less than it occupies, rather than trusting it and allocating.
			if (entry.compLength > entry.origLength ||
				entry.offset + entry.compLength > buffer.byteLength) {
				return Promise.reject(damaged());
			}

			entries.push(entry);
		}

		// The sfnt directory must be in ascending tag order. WOFF requires that
		// too, but a file that got it wrong would otherwise produce a font no
		// shaper will read.
		entries.sort(function (a, b) {
			return a.tag - b.tag;
		});

		return Promise.all(entries.map(function (item) {
			var slice = source.subarray(item.offset, item.offset + item.compLength);

			// A table is stored as-is when deflating it did not help. The spec
			// signals that by making compLength equal to origLength.
			if (item.compLength === item.origLength) {
				return Promise.resolve(slice.slice());
			}

			return inflate(slice).then(function (data) {
				if (data.length !== item.origLength) {
					throw damaged();
				}
				return data;
			});
		})).then(function (tables) {
			return assembleSfnt(flavor, entries, tables);
		}, function () {
			// A failed inflate throws its own DOM exception, which says nothing
			// useful to someone who just dropped a font on the page.
			throw damaged();
		});
	}

	/**
	 * Hand the encoder something it can actually read.
	 *
	 * Dispatches on the signature rather than the file name, so a mislabelled
	 * file still converts instead of failing deep inside the encoder.
	 *
	 * @param {ArrayBuffer} buffer Source bytes.
	 * @return {Promise} Resolves with an ArrayBuffer of sfnt bytes.
	 */
	function toSfnt(buffer) {
		var head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));

		return isWoff(head) ? woffToSfnt(buffer) : Promise.resolve(buffer);
	}

	/**
	 * Can this file be converted here and now?
	 *
	 * WOFF needs DecompressionStream on top of everything else, so it is gated
	 * separately: an older browser keeps TTF and OTF conversion rather than
	 * losing the feature entirely.
	 *
	 * @param {string} name File name.
	 * @return {boolean}
	 */
	function convertible(name) {
		var ext = extensionOf(name);

		if (!CONVERTIBLE[ext]) {
			return false;
		}

		return 'woff' !== ext || typeof window.DecompressionStream === 'function';
	}

	function converterAvailable() {
		return !converter.broken &&
			!!cfg.wasmUrl &&
			typeof window.Worker === 'function' &&
			typeof window.WebAssembly !== 'undefined';
	}

	function converterWorker() {
		if (converter.worker) {
			return converter.worker;
		}

		var worker = new window.Worker(cfg.wasmUrl + 'woff2-worker.js');

		worker.onmessage = function (event) {
			var message = event.data || {};
			var job = message.id ? converter.jobs[message.id] : null;

			if (!job) {
				// A failure carrying no job id means the module itself did not
				// load, so everything queued behind it is doomed as well.
				if ('error' === message.type) {
					breakConverter(message.error);
				}
				return;
			}

			delete converter.jobs[message.id];
			window.clearTimeout(job.timer);

			if ('done' === message.type) {
				job.resolve(message.buffer);
			} else {
				job.reject(new Error(message.error || s('convertFailed', 'Could not convert this font.')));
			}
		};

		// Fires when the worker script itself fails to load, parse or run.
		worker.onerror = function () {
			breakConverter();
		};

		converter.worker = worker;

		return worker;
	}

	/**
	 * Stand the converter down for the rest of the session.
	 *
	 * @param {string} message Reason, if the worker gave one.
	 */
	function breakConverter(message) {
		converter.broken = true;

		if (converter.worker) {
			converter.worker.terminate();
			converter.worker = null;
		}

		Object.keys(converter.jobs).forEach(function (id) {
			var job = converter.jobs[id];
			delete converter.jobs[id];
			window.clearTimeout(job.timer);
			job.reject(new Error(message || s('convertBlocked', 'The converter could not start in this browser.')));
		});
	}

	/**
	 * Compress sfnt bytes to WOFF2.
	 *
	 * @param {ArrayBuffer} buffer Source bytes. Transferred to the worker.
	 * @return {Promise} Resolves with an ArrayBuffer of WOFF2 bytes.
	 */
	function convertBuffer(buffer) {
		return new Promise(function (resolve, reject) {
			var worker;

			try {
				worker = converterWorker();
			} catch (e) {
				breakConverter(e && e.message);
				reject(new Error(s('convertBlocked', 'The converter could not start in this browser.')));
				return;
			}

			var id = ++converter.seq;

			converter.jobs[id] = {
				resolve: resolve,
				reject: reject,
				timer: window.setTimeout(function () {
					delete converter.jobs[id];
					reject(new Error(s('convertTimeout', 'Converting took too long and was stopped.')));
				}, CONVERT_TIMEOUT)
			};

			worker.postMessage({ id: id, type: 'convert', buffer: buffer }, [buffer]);
		});
	}

	/**
	 * Decide what to actually upload for one picked file.
	 *
	 * A conversion failure is never fatal: the original file is uploaded and the
	 * reason is logged, so a browser that cannot run the converter still gets
	 * its font installed.
	 *
	 * @param {File} file Picked file.
	 * @return {Promise} Resolves with { blob, filename, converted, from, to }.
	 */
	function prepareUpload(file) {
		var plain = {
			blob: file,
			filename: file.name,
			converted: false,
			from: file.size,
			to: file.size
		};

		if (!state.convert || !convertible(file.name) || !converterAvailable()) {
			return Promise.resolve(plain);
		}

		return file.arrayBuffer().then(toSfnt).then(convertBuffer).then(function (result) {
			var bytes = new Uint8Array(result);

			// Only take the result if it really is a WOFF2 and really is smaller.
			// Anything else and the original file is the better upload.
			if (!isWoff2(bytes) || bytes.length >= file.size) {
				return plain;
			}

			return {
				blob: new Blob([bytes], { type: 'font/woff2' }),
				filename: woff2Name(file.name),
				converted: true,
				from: file.size,
				to: bytes.length
			};
		}).catch(function (error) {
			plain.error = (error && error.message) || s('convertFailed', 'Could not convert this font.');
			return plain;
		});
	}

	function logConversion(name, item) {
		state.convertLog.push({
			name: name,
			from: item.from,
			to: item.to,
			saved: item.from ? Math.round((1 - item.to / item.from) * 100) : 0,
			error: item.error || ''
		});
	}

	function convertReport() {
		var list = el('ul', { class: 'efm-convert-log' });

		state.convertLog.forEach(function (entry) {
			list.appendChild(el('li', { class: 'efm-convert-log__item' + (entry.error ? ' is-error' : '') }, [
				el('span', { class: 'efm-file__name', text: entry.name, title: entry.name }),
				el('span', {
					class: 'efm-muted',
					text: entry.error
						? entry.error
						: formatSize(entry.from) + ' → ' + formatSize(entry.to) + ' · ' + entry.saved + '% ' + s('smaller', 'smaller')
				})
			]));
		});

		return el('div', { class: 'efm-convert-report' }, [
			el('h3', { class: 'efm-section-title', text: s('converted', 'Converted') }),
			list
		]);
	}

	/**
	 * Convert a file that is already on the server.
	 *
	 * The WOFF2 is uploaded alongside the original and any variant mapping the
	 * old file is repointed at the new one. The original is deliberately left in
	 * place: deleting bytes is the one thing this plugin always asks about
	 * first, and Tools → Unused files already exists to sweep it up.
	 *
	 * @param {Object} file Entry from state.files.
	 */
	function convertExisting(file) {
		if (state.converting) {
			return;
		}

		// Repointing variants writes the family list back to the server, which
		// would take the saved version and drop anything edited but not saved.
		if (state.dirty && !window.confirm(s('convertDirty', 'Converting saves the family mapping. Unsaved changes will be discarded. Continue?'))) {
			return;
		}

		state.converting = file.name;
		state.convertLog = [];
		setStatus(s('converting', 'Converting…') + ' · ' + file.name, 'progress');
		render();

		var stored;

		fetch(file.url, { credentials: 'same-origin' }).then(function (response) {
			if (!response.ok) {
				throw new Error(s('convertNoRead', 'Could not read the file from the fonts folder.'));
			}
			return response.arrayBuffer();
		}).then(toSfnt).then(convertBuffer).then(function (result) {
			var bytes = new Uint8Array(result);

			if (!isWoff2(bytes)) {
				throw new Error(s('convertFailed', 'Could not convert this font.'));
			}

			stored = { from: file.size, to: bytes.length };

			var form = new FormData();
			form.append('file', new Blob([bytes], { type: 'font/woff2' }), woff2Name(file.name));

			return request('/upload', { method: 'POST', body: form });
		}).then(function (result) {
			applyState(result && result.state);

			// store_upload() renames on collision, so the mapping has to follow
			// the name the server actually wrote, not the one we asked for.
			var written = (result && result.file && result.file.name) || woff2Name(file.name);
			var remapped = 0;

			state.families.forEach(function (family) {
				(family.variants || []).forEach(function (variant) {
					if (variant.file === file.name) {
						variant.file = written;
						remapped++;
					}
				});
			});

			logConversion(file.name, stored);

			if (!remapped) {
				return null;
			}

			return request('/families', { method: 'POST', body: { families: state.families } })
				.then(function (next) {
					applyState(next);
				});
		}).then(function () {
			setStatus(s('converted', 'Converted') + ' · ' + formatSize(stored.from) + ' → ' + formatSize(stored.to));
		}).catch(fail).then(function () {
			state.converting = '';
			render();
		});
	}

	function uploadFiles(fileList) {
		var files = Array.prototype.slice.call(fileList || []);
		if (!files.length) {
			return;
		}

		state.convertLog = [];

		var chain = Promise.resolve();
		var done = 0;

		files.forEach(function (file) {
			chain = chain.then(function () {
				var converting = state.convert && converterAvailable() && convertible(file.name);

				setStatus(
					(converting ? s('converting', 'Converting…') : s('uploading', 'Uploading…')) +
					' ' + (done + 1) + '/' + files.length + ' · ' + file.name,
					'progress'
				);

				return prepareUpload(file);
			}).then(function (item) {
				if (item.converted || item.error) {
					logConversion(file.name, item);
				}

				var form = new FormData();
				form.append('file', item.blob, item.filename);

				return request('/upload', { method: 'POST', body: form }).then(function (result) {
					applyState(result && result.state);
					done++;
				});
			});
		});

		chain.then(function () {
			setStatus(s('uploaded', 'Uploaded') + ' · ' + done);
		}).catch(fail).then(render);
	}

	function pruneFiles() {
		var unused = state.unused || [];

		if (!unused.length) {
			return;
		}

		// Deleting bytes is not reversible, so it is always confirmed.
		if (!window.confirm(s('cleanupConfirm', 'Delete these font files from the server?') + '\n\n' + unused.map(function (file) {
			return file.name;
		}).join('\n'))) {
			return;
		}

		state.pruning = true;
		render();

		request('/files/prune', { method: 'POST' })
			.then(function (data) {
				applyState(data && data.state);
				var report = (data && data.pruned) || {};
				setStatus(s('cleanupDone', 'Deleted') + ' · ' + (report.deleted || []).length + ' · ' + formatSize(report.bytes || 0));
			})
			.catch(fail)
			.then(function () {
				state.pruning = false;
				render();
			});
	}

	function deleteFile(filename) {
		request('/files/delete', { method: 'POST', body: { filename: filename } })
			.then(function (next) {
				applyState(next);
				render();
			})
			.catch(fail);
	}

	function googleQuery(offset) {
		return '/google/search?query=' + encodeURIComponent(state.query) +
			'&category=' + encodeURIComponent(state.category) +
			'&subset=' + encodeURIComponent(state.subset) +
			'&variable=' + encodeURIComponent(state.variableOnly) +
			'&sort=' + encodeURIComponent(state.sort) +
			'&limit=24&offset=' + offset;
	}

	/**
	 * How many of the collapsed filters are active.
	 *
	 * The search box stays on the surface, so it is deliberately excluded: the
	 * badge reports what is hidden behind the button, not something already
	 * visible next to it.
	 */
	function hiddenFilterCount() {
		var n = 0;

		if (state.category) { n += 1; }
		if (state.subset) { n += 1; }
		if (state.variableOnly) { n += 1; }
		if ('popularity' !== state.sort) { n += 1; }

		return n;
	}

	/**
	 * True when anything narrows the catalogue, which is what enables Reset all.
	 */
	function googleFiltered() {
		return !!(state.query || state.category || state.subset || state.variableOnly) ||
			'popularity' !== state.sort;
	}

	function resetGoogleFilters() {
		state.query = '';
		state.category = '';
		state.subset = '';
		state.variableOnly = '';
		state.sort = 'popularity';
		resetSubsetDefaults();
		searchGoogle();
	}

	function searchGoogle() {
		state.searching = true;
		render();

		request(googleQuery(0))
			.then(function (data) {
				state.results = (data && data.results) || [];
				state.total = (data && data.total) || 0;

				if (data && data.categories && data.categories.length) {
					state.categories = data.categories;
				}

				/*
				 * subsets() is computed from the whole index server-side, not from
				 * the filtered result, so this list is stable. Assigned once purely
				 * to avoid rebuilding the dropdown on every keystroke.
				 */
				if (data && data.subsetList && data.subsetList.length && !state.subsetList.length) {
					state.subsetList = data.subsetList;
				}

				if (data && data.axisNames) {
					state.axisNames = data.axisNames;
				}
			})
			.catch(fail)
			.then(function () {
				state.searching = false;
				render();
			});
	}

	function loadMoreGoogle() {
		state.loadingMore = true;
		render();

		request(googleQuery(state.results.length))
			.then(function (data) {
				state.results = state.results.concat((data && data.results) || []);
				state.total = (data && data.total) || state.total;
			})
			.catch(fail)
			.then(function () {
				state.loadingMore = false;
				render();
			});
	}

	function installGoogleFont(family, subsets, variable, cuts) {
		state.busy = 'install:' + family;
		setStatus(s('installing', 'Installing…') + ' ' + family);
		render();

		request('/google/install', {
			method: 'POST',
			body: {
				family: family,
				subsets: subsets || ['latin'],
				variable: !!variable,
				// A variable cut is one file per subset spanning every weight, so
				// picking individual weights would mean nothing there.
				cuts: variable ? [] : (cuts || [])
			}
		})
			.then(function (data) {
				applyState(data && data.state);
				// Let the chips re-derive from what is actually installed.
				delete state.cuts[family];
				setStatus(s('installed', 'Installed') + ' · ' + family);
			})
			.catch(fail)
			.then(function () {
				state.busy = '';
				render();
			});
	}

	function regenerateCss() {
		state.busy = 'regenerate';
		render();

		request('/css/regenerate', { method: 'POST' })
			.then(function (next) {
				applyState(next);
				setStatus(s('regenerated', 'Stylesheet regenerated.'));
			})
			.catch(fail)
			.then(function () {
				state.busy = '';
				render();
			});
	}

	function saveSettings() {
		state.busy = 'settings';
		render();

		request('/settings', {
			method: 'POST',
			body: {
				inline_css: !!state.settings.inline_css,
				block_google: !!state.settings.block_google
			}
		})
			.then(function (next) {
				applyState(next);
				setStatus(s('saved', 'Fonts saved.'));
			})
			.catch(fail)
			.then(function () {
				state.busy = '';
				render();
			});
	}

	/* --------------------------------------------------------------------- */
	/* Settings Bar control                                                   */
	/* --------------------------------------------------------------------- */

	var registered = false;

	function placement() {
		var value = cfg.placement || 'top-end';

		// Legacy value, mapped to a supported API position.
		if (value === 'after-dark-mode') {
			value = 'bottom-start';
		}

		var section = value.indexOf('top') === 0 ? 'top' : (value.indexOf('center') === 0 ? 'center' : 'bottom');

		return { section: section, atEnd: value.indexOf('-end') !== -1 };
	}

	function settingsBarReady() {
		var controls = window.etchControls;
		var target = placement().section;
		var container = document.querySelector('.settings-bar__section.' + target);

		return !!(
			controls &&
			controls.builder &&
			controls.builder.settingsBar &&
			controls.builder.settingsBar[target] &&
			container &&
			container.querySelector('button')
		);
	}

	function registerControl() {
		if (registered || !settingsBarReady()) {
			return false;
		}

		var target = placement();
		var api = window.etchControls.builder.settingsBar[target.section];
		var container = document.querySelector('.settings-bar__section.' + target.section);
		var before = Array.prototype.slice.call(container.querySelectorAll('button'));

		// Etch stores controls before rendering them, and its list is keyed by
		// id, so the control is registered exactly once.
		registered = true;

		try {
			(target.atEnd ? api.addAfter : api.addBefore).call(api, {
				id: CONTROL_ID,
				icon: cfg.icon || 'ph:text-aa-duotone',
				tooltip: s('fontManager', 'Font Manager'),
				callback: toggle
			});
		} catch (error) {
			registered = false;
			return false;
		}

		var finished = false;
		var observer;

		var finish = function () {
			if (finished) {
				return;
			}

			var buttons = Array.prototype.slice.call(container.querySelectorAll('button'));
			controlButton = buttons.filter(function (button) {
				return before.indexOf(button) === -1;
			})[0];

			if (!controlButton) {
				return;
			}

			finished = true;
			if (observer) {
				observer.disconnect();
			}

			controlButton.setAttribute('aria-expanded', 'false');
			controlButton.setAttribute('aria-controls', 'efm-manager');
			controlButton.classList.add('efm-control');

			watchSettingsBar();
		};

		finish();

		if (!finished) {
			observer = new MutationObserver(finish);
			observer.observe(container, { childList: true, subtree: true });
			window.setTimeout(function () {
				if (observer) {
					observer.disconnect();
				}
			}, 5000);
		}

		return true;
	}

	function boot() {
		var attempts = 0;

		// Before anything renders, so the first paint already uses the saved
		// layout rather than flashing the default and then correcting itself.
		loadPrefs();

		var timer = window.setInterval(function () {
			attempts += 1;

			if (settingsBarReady()) {
				window.clearInterval(timer);

				// Let third-party controls register first.
				window.setTimeout(function () {
					registerControl();
					refreshFontCss();
				}, 1200);
				return;
			}

			if (attempts > 160) {
				window.clearInterval(timer);
			}
		}, 250);
	}

	if (document.readyState === 'complete') {
		boot();
	} else {
		window.addEventListener('load', boot);
	}
})();
