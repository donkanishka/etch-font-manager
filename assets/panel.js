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

	/*
	 * Declared here, above the state literal, because that literal fingerprints
	 * the settings as it is built and the fingerprint reads this list. Left where
	 * it reads best -- beside the functions that use it -- `var` hoisting gives it
	 * the name but not the value, so normalizeSettings() saw undefined and the
	 * whole panel threw on boot without ever registering its control.
	 */
	var SETTING_KEYS = ['inline_css', 'block_google', 'delete_source_on_convert', 'purge_files'];

	function s(key, fallback) {
		return t[key] || fallback;
	}

	var state = {
		families: (cfg.state && cfg.state.families) || [],
		/*
		 * The last copy the server confirmed, stringified. Etch tracks its own
		 * unsaved state exactly this way -- every store holds a serialised snapshot
		 * and compares it against the live object -- and holding one here is what
		 * lets the save bar name which families changed instead of only saying that
		 * something did.
		 */
		saved: fingerprint((cfg.state && cfg.state.families) || []),
		/*
		 * The same snapshot for the settings screen, so its toggles answer to the
		 * save bar like everything else instead of to a button of their own.
		 */
		savedSettings: settingsFingerprint((cfg.state && cfg.state.settings) || {}),
		files: (cfg.state && cfg.state.files) || [],
		settings: (cfg.state && cfg.state.settings) || {},
		cssUrl: (cfg.state && cfg.state.cssUrl) || '',
		cssVersion: (cfg.state && cfg.state.cssVersion) || '',
		view: 'library',
		editing: null,
		// Transient: whether the Google Fonts filter popover is open. Not saved.
		filtersOpen: false,
		// Transient: the key of the open dropdown, at most one at a time. Not saved.
		openMenu: '',
		// Transient: which collapsed chip rows the user has expanded. Not saved.
		chipsOpen: {},
		/*
		 * Selections, by name rather than by index. A row can move underneath a
		 * selection -- a delete splices the list, an upload re-sorts it -- and an
		 * index would then point at whatever took its place.
		 */
		pickedFiles: [],
		pickedTrash: [],
		// Live families, selected by name for the same reason as the two above.
		pickedFamilies: [],
		/*
		 * Variants have no id to select by, so this holds positions -- and positions
		 * only mean anything next to the family they came from. Carrying that family
		 * with them is what stops a selection made in one editor acting on another.
		 */
		pickedVariants: { family: null, list: [] },
		filter: '',
		// Transient: the Font files search box and format chips. Not saved, and not
		// part of the library, so neither reaches the dirty diff.
		fileFilter: '',
		fileFormats: [],
		// Transient: a font file is being read back for its axes or its metrics.
		readingAxes: false,
		readingMetrics: false,
		query: '',
		results: [],
		// Transient: which page of the catalogue is on screen, counted from zero.
		page: 0,
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
		subsets: {},
		cuts: {},
		pruning: false,
		recovering: '',
		/*
		 * null means "not chosen yet", which defaults to every family. An array
		 * means an explicit choice, and an empty one means none. They were the same
		 * value before, which is what made the None chip appear to do nothing: it
		 * set the list empty, and empty was read back as "all".
		 */
		/*
		 * Files a permanent delete asked to remove, held until the delete is saved.
		 * Removing a family is buffered like every other edit, so unlinking its
		 * files at the moment of asking would leave Discard able to restore a record
		 * whose files had already gone -- which is precisely the family that looks
		 * installed and loads nothing.
		 */
		pendingFileDeletes: [],
		exportPick: null,
		exportBundle: false,
		importPreview: null,
		importPayload: null,
		unused: (cfg.state && cfg.state.unused) || [],
		/*
		 * File names a family maps but that are not in the fonts folder. An export
		 * without the files bundled in carries the mapping and none of the bytes, so
		 * importing it produces exactly this: families that look complete and load
		 * nothing.
		 */
		missing: (cfg.state && cfg.state.missing) || [],
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
	/*
	 * Also the allowlist a stored preference is checked against, so an install
	 * that saved the retired 'compact' layout falls back to the default rather
	 * than restoring a mode that no longer has a button.
	 */
	var LAYOUTS = ['row', 'grid'];

	/*
	 * How many chips a collapsed row shows. Six fills roughly one line of a card
	 * at the grid's 340px minimum, which is the width the layout is built around.
	 */
	var CHIP_LIMIT = 6;

	/*
	 * How many preset chips will share the toolbar's first row before the whole
	 * set drops to a second one. Three is the floor -- Auto, Latin and 123 are
	 * always there -- so a library holding nothing but Latin keeps its one-row
	 * toolbar, and a fourth script is the point at which the row is carrying a
	 * search field, a button, a layout toggle, the preview field and the size
	 * slider as well.
	 */
	var ROW_CHIP_LIMIT = 4;

	/* How many families the catalogue asks for at a time, and so a page. */
	var GOOGLE_PAGE_SIZE = 24;

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
	/**
	 * Each script named in itself.
	 *
	 * The preview chips used to be a fixed row of Latin, Sinhala and Tamil, which
	 * were the author's own two scripts rather than a general choice: a reader in
	 * Athens or Osaka got two writing systems they cannot read and none for their
	 * own, on a row that sits above every card. The panel has samples for fourteen
	 * scripts and picks the right one per family already, so the chips are derived
	 * from what is actually installed now, and each is labelled in its own script
	 * because that is the one label a reader of it can always recognise.
	 */
	var SCRIPT_LABEL = {
		sinhala: 'සිංහල',
		tamil: 'தமிழ்',
		devanagari: 'देवनागरी',
		arabic: 'العربية',
		hebrew: 'עברית',
		thai: 'ไทย',
		greek: 'Ελληνικά',
		cyrillic: 'Кириллица',
		korean: '한국어',
		japanese: '日本語',
		chinese: '中文',
		bengali: 'বাংলা',
		armenian: 'Հայերեն',
		georgian: 'ქართული'
	};

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
		// Etch's own manager back arrow, copied off the Loop Manager header: an
		// arrow, not a bare chevron.
		back: '<path d="M9 17L4 12L9 7"/><path d="M4 12H20"/>',
		chevronDown: '<path d="M6 9L12 15L18 9"/>',
		forward: '<path d="M15 7L20 12L15 17"/><path d="M20 12H4"/>',
		external: '<path d="M21 3H15M21 3V9M21 3L13 11"/><path d="M21 13V19.4C21 19.7314 20.7314 20 20.4 20H4.6C4.26863 20 4 19.7314 4 19.4V3.6C4 3.26863 4.26863 3 4.6 3H11"/>',
		copy: '<path d="M19.4 20H9.6C9.26863 20 9 19.7314 9 19.4V9.6C9 9.26863 9.26863 9 9.6 9H19.4C19.7314 9 20 9.26863 20 9.6V19.4C20 19.7314 19.7314 20 19.4 20Z"/><path d="M15 9V4.6C15 4.26863 14.7314 4 14.4 4H4.6C4.26863 4 4 4.26863 4 4.6V14.4C4 14.7314 4.26863 15 4.6 15H9"/>',
		plus: '<path d="M6 12H12M18 12H12M12 12V6M12 12V18"/>',
		check: '<path d="M5 13L9 17L19 7"/>',
		close: '<path d="M6.75827 17.2426L12.0009 12M17.2435 6.75736L12.0009 12M12.0009 12L6.75827 6.75736M12.0009 12L17.2435 17.2426"/>',
		search: '<path d="M17 17L21 21"/><path d="M3 11C3 15.4183 6.58172 19 11 19C13.213 19 15.2161 18.1015 16.6644 16.6493C18.1077 15.2022 19 13.2053 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11Z"/>',
		filter: '<path d="M3.99961 3H19.9997C20.552 3 20.9997 3.44764 20.9997 3.99987L20.9999 5.58569C21 5.85097 20.8946 6.10538 20.707 6.29295L14.2925 12.7071C14.105 12.8946 13.9996 13.149 13.9996 13.4142L13.9996 19.7192C13.9996 20.3698 13.3882 20.8472 12.7571 20.6894L10.7571 20.1894C10.3119 20.0781 9.99961 19.6781 9.99961 19.2192L9.99961 13.4142C9.99961 13.149 9.89425 12.8946 9.70672 12.7071L3.2925 6.29289C3.10496 6.10536 2.99961 5.851 2.99961 5.58579V4C2.99961 3.44772 3.44732 3 3.99961 3Z"/>',
		refresh: '<path d="M21.8883 13.5C21.1645 18.3113 17.013 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C16.1006 2 19.6248 4.46819 21.1679 8"/><path d="M17 8H21.4C21.7314 8 22 7.73137 22 7.4V3"/>',
		undo: '<path d="M4.5 8C8.5 8 11 8 15 8C15 8 15 8 15 8C15 8 20 8 20 12.7059C20 18 15 18 15 18C11.5714 18 9.71429 18 6.28571 18"/><path d="M7.5 11.5C6.13317 10.1332 5.36683 9.36683 4 8C5.36683 6.63317 6.13317 5.86683 7.5 4.5"/>',
		/*
		 * Restoring, split from undo. They were one glyph doing two jobs: the Restore
		 * buttons in the trash, and the header of the unsaved-changes question, where
		 * a box with an arrow coming out of it would mean nothing. The arrow-loop
		 * stays with the dialog; the trash gets a box you take something back out of.
		 */
		restore: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h2"/><path d="M20 8v11a2 2 0 0 1-2 2h-2"/><path d="m9 15 3-3 3 3"/><path d="M12 12v9"/>',
		edit: '<path d="M14.3632 5.65156L15.8431 4.17157C16.6242 3.39052 17.8905 3.39052 18.6716 4.17157L20.0858 5.58579C20.8668 6.36683 20.8668 7.63316 20.0858 8.41421L18.6058 9.8942M14.3632 5.65156L4.74749 15.2672C4.41542 15.5993 4.21079 16.0376 4.16947 16.5054L3.92738 19.2459C3.87261 19.8659 4.39148 20.3848 5.0115 20.33L7.75191 20.0879C8.21972 20.0466 8.65806 19.8419 8.99013 19.5099L18.6058 9.8942M14.3632 5.65156L18.6058 9.8942"/>',
		/*
		 * Tabler's trash. Two ribs inside the bin, which is what tells it apart from
		 * the plain tapered bucket at 14px -- the size it renders at in a card's
		 * action row and in a table row.
		 *
		 * Tabler ships a full-bleed <path d="M0 0h24v24H0z"> in front of every icon
		 * as a bounding box, carrying its own stroke="none" fill="none". Dropped
		 * here: icon() sets stroke on the wrapper, so keeping that path without its
		 * own stroke="none" would draw a square around every bin in the panel.
		 */
		trash: '<path d="M4 7l16 0"/><path d="M10 11l0 6"/><path d="M14 11l0 6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/>',
		/*
		 * Lucide's book-type: the same T, now set in a book rather than a plain
		 * square. It says "a collection of typefaces" where the box only said
		 * "type", and it stops the nav opening with two near-identical outlines now
		 * that Google Fonts is a rounded square too.
		 */
		library: '<path d="M10 13h4"/><path d="M12 6v7"/><path d="M16 8V6H8v2"/><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>',

		/*
		 * The stat row's copy of the families glyph, split from the nav's on purpose.
		 * They were one entry, so filling the stat row would have filled the nav item
		 * too and left one solid icon among five outlines. Two uses that want to look
		 * different have to be two entries -- editing one is what keeps every place a
		 * glyph appears in step, and this is the other case.
		 */
		statFamilies: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12v-1h6v1"/><path d="M11 17h2"/><path d="M12 11v6"/>',

		/*
		 * A G in a rounded square rather than the globe this used to be. The globe
		 * said "the internet"; the nav item means Google Fonts specifically, and at
		 * 16px its five continent strokes turned to noise.
		 *
		 * Stripped of the stroke, stroke-width and cap attributes it arrived with:
		 * icon() sets those on the wrapper, and a stroke of #ffffff baked into the
		 * path would have ignored currentColor -- staying white while the nav item
		 * around it goes muted, active or hovered.
		 */
		google: '<path d="M15.5475 8.30327C14.6407 7.49361 13.4329 7 12.1089 7C9.28696 7 7 9.23899 7 12C7 14.761 9.28696 17 12.1089 17C15.5781 17 16.86 14.4296 17 12.4167H12.841"/><path d="M21 8V16C21 18.7614 18.7614 21 16 21H8C5.23858 21 3 18.7614 3 16V8C3 5.23858 5.23858 3 8 3H16C18.7614 3 21 5.23858 21 8Z"/>',
		settings: '<path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"/><path d="M19.6224 10.3954L18.5247 7.7448L20 6L18 4L16.2647 5.48295L13.5578 4.36974L12.9353 2H10.981L10.3491 4.40113L7.70441 5.51596L6 4L4 6L5.45337 7.78885L4.3725 10.4463L2 11V13L4.40111 13.6555L5.51575 16.2997L4 18L6 20L7.79116 18.5403L10.397 19.6123L11 22H13L13.6045 19.6132L16.2551 18.5155C16.6969 18.8313 18 20 18 20L20 18L18.5159 16.2494L19.6139 13.598L21.9999 12.9772L22 11L19.6224 10.3954Z"/>',
		transfer: '<path d="M17 20V4M17 4L20 7M17 4L14 7"/><path d="M7 4V20M7 20L10 17M7 20L4 17"/>',
		layoutRow: '<path d="M3 5H21"/><path d="M3 12H21"/><path d="M3 19H21"/>',
		layoutGrid: '<path d="M14 20.4V14.6C14 14.2686 14.2686 14 14.6 14H20.4C20.7314 14 21 14.2686 21 14.6V20.4C21 20.7314 20.7314 21 20.4 21H14.6C14.2686 21 14 20.7314 14 20.4Z"/><path d="M3 20.4V14.6C3 14.2686 3.26863 14 3.6 14H9.4C9.73137 14 10 14.2686 10 14.6V20.4C10 20.7314 9.73137 21 9.4 21H3.6C3.26863 21 3 20.7314 3 20.4Z"/><path d="M14 9.4V3.6C14 3.26863 14.2686 3 14.6 3H20.4C20.7314 3 21 3.26863 21 3.6V9.4C21 9.73137 20.7314 10 20.4 10H14.6C14.2686 10 14 9.73137 14 9.4Z"/><path d="M3 9.4V3.6C3 3.26863 3.26863 3 3.6 3H9.4C9.73137 3 10 3.26863 10 3.6V9.4C10 9.73137 9.73137 10 9.4 10H3.6C3.26863 10 3 9.73137 3 9.4Z"/>',
		/*
		 * Tabler's text-resize: a bounded block with a handle at each corner, which
		 * says the size of the type rather than merely letters.
		 *
		 * It replaces an Aa that was the one entry here not drawn on the 24 grid.
		 * That one needed a declared 512 box, then padding out to 560 to stop it
		 * rendering wider and heavier than the Lucide and Tabler glyphs beside it.
		 * This is Tabler's own 24, so none of that applies: no box, no padding, and
		 * icon() derives exactly the 1.5 stroke the source ships with.
		 *
		 * Tabler's leading <path d="M0 0h24v24H0z"> bounding box is dropped, as with
		 * file-typography and arrows-exchange below -- it is invisible only because
		 * of its own stroke="none", which does not survive being stripped. The
		 * stroke, width, cap and join attributes go with it: icon() sets those on
		 * the wrapper, and the #ffffff this arrived with would have ignored
		 * currentColor and stayed white while the stat row around it goes muted.
		 *
		 * The Settings Bar control keeps its own ph:text-aa-duotone, so the stat and
		 * the control no longer echo one another.
		 */
		textSize: '<path d="M3 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M17 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M3 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M17 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M5 7v10"/><path d="M7 5h10"/><path d="M7 19h10"/><path d="M19 7v10"/><path d="M10 10h4"/><path d="M12 14v-4"/>',
		/*
		 * Tabler's file-typography: a page with a T set in it rather than three ruled
		 * lines, so it reads as a font file specifically. Tabler's leading
		 * <path d="M0 0h24v24H0z"> bounding box is dropped, as with the bin -- it is
		 * invisible only because of its own stroke="none", which does not survive
		 * being stripped.
		 *
		 * Shared by the Font files nav item and the Files stat below it, because both
		 * mean the same thing. Named for the glyph rather than for one of them: it
		 * was called `page` while the nav wore an upload arrow, and an upload arrow
		 * named how a file arrives rather than what the screen holds.
		 */
		fontFile: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2"/><path d="M11 18h2"/><path d="M12 18v-7"/><path d="M9 12v-1h6v1"/>',
		/*
		 * Tabler's arrows-exchange: two arrows swapping places, which is what a
		 * format conversion is. The old glyph was arrows converging on a line -- a
		 * compress mark, and WOFF2 is a container change rather than a squeeze.
		 * Tabler's leading bounding-box path is dropped, as with the bin and the
		 * file: it is invisible only because of its own stroke="none".
		 */
		compress: '<path d="M7 10h14l-4 -4"/><path d="M17 14h-14l4 4"/>'
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
		var entry = PATHS[name];

		/*
		 * An entry is normally just its paths, drawn on the 24 grid this panel and
		 * Etch both use. Some sets do not work that way -- Phosphor is filled and
		 * drawn on 256 -- so an entry may instead name its own box and say it is
		 * filled. Either way the colour comes from currentColor, which is what lets
		 * one glyph go muted in the nav and danger-red in a delete button.
		 */
		var markup = typeof entry === 'string' ? entry : (entry && entry.d) || '';
		var box = (entry && entry.box) || '0 0 24 24';
		var filled = !!(entry && entry.fill);
		var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

		if (!markup && window.console && window.console.warn) {
			window.console.warn('Etch Font Manager: no icon named "' + name + '".');
		}

		svg.setAttribute('class', variant === 'md' ? 'efm-icon' : 'efm-icon efm-icon--' + variant);
		svg.setAttribute('viewBox', box);
		svg.setAttribute('width', ICON_SIZES[variant]);
		svg.setAttribute('height', ICON_SIZES[variant]);
		svg.setAttribute('fill', filled ? 'currentColor' : 'none');
		svg.setAttribute('stroke', filled ? 'none' : 'currentColor');

		if (!filled) {
			/*
			 * 1.5 is the weight on a 24 box, and what matters is the ratio, not the
			 * number: the same stroke on a 512 box is a hairline. Scaling it with the
			 * grid means an icon from any set keeps the panel's weight without being
			 * redrawn -- and it lands on 32 for a 512 box, which is the width these
			 * icons ship with anyway.
			 */
			var span = parseFloat(String(box).split(/\s+/)[2]) || 24;

			svg.setAttribute('stroke-width', String(1.5 * span / 24));
			svg.setAttribute('stroke-linecap', 'round');
			svg.setAttribute('stroke-linejoin', 'round');
		}

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

	/**
	 * Where a family's font files came from.
	 *
	 * Mirrors EFM_Fonts::derive_source(), because a record the editor has only
	 * held in memory has to fingerprint the same as the one the server sends
	 * back. The Google block is the signal; nothing but the installer writes
	 * one, and anything without it reached the fonts folder through the
	 * uploader.
	 *
	 * @param {Object} family Family record.
	 * @return {string} 'google' or 'upload'.
	 */
	function familySource(family) {
		var source = family && family.source;

		if ('google' === source || 'upload' === source) {
			return source;
		}

		return family && family.google && Object.keys(family.google).length ? 'google' : 'upload';
	}

	/**
	 * Whether a family's files can be downloaded from Google again.
	 *
	 * @param {Object} family Family record.
	 * @return {boolean} True for a Google Fonts install.
	 */
	function fromGoogle(family) {
		return 'google' === familySource(family);
	}

	/**
	 * A value with its object keys in a fixed order.
	 *
	 * Two records that mean the same thing have to serialise the same way, and
	 * raw JSON does not promise that: key order follows insertion, so a family
	 * the server sent and the same family after the editor has rebuilt part of
	 * it can differ by nothing but the order of the keys.
	 *
	 * @param {*} value Anything.
	 * @return {*} The same value with every object key sorted.
	 */
	function canonical(value) {
		if (Array.isArray(value)) {
			return value.map(canonical);
		}

		if (value && 'object' === typeof value) {
			return Object.keys(value).sort().reduce(function (out, key) {
				if (undefined !== value[key]) {
					out[key] = canonical(value[key]);
				}

				return out;
			}, {});
		}

		return value;
	}

	/**
	 * A family reduced to the shape the server stores it in.
	 *
	 * Absent is not the same as default in a stored record: a family saved
	 * before `enabled` existed carries no such key, while anything the editor
	 * has touched carries `enabled: true`. Both mean enabled, and comparing
	 * them as they stand reads as an edit that never happened. The defaults
	 * applied here mirror EFM_Fonts::sanitize_families(), so a record and its
	 * round trip through the server compare equal.
	 *
	 * @param {Object} family Family record.
	 * @return {Object} Canonical copy.
	 */
	function normalizeFamily(family) {
		var source = family || {};
		var out = canonical(source);

		out.name = String(source.name || '');
		out.source = familySource(source);
		out.variants = (source.variants || []).map(function (variant) {
			var cut = {
				file: String(variant.file || ''),
				style: 'italic' === variant.style ? 'italic' : 'normal',
				weight: String(variant.weight || '400')
			};

			if (variant.subset) {
				cut.subset = String(variant.subset);
			}

			if (variant.range) {
				cut.range = String(variant.range);
			}

			return canonical(cut);
		});
		out.display = String(source.display || 'swap');
		out.preload = !!source.preload;
		out.fallback = String(source.fallback || '');
		out.selector = String(source.selector || '');
		out.force = !!source.force;
		/*
		 * Sorted, because the order a role was ticked in is not a change. Without
		 * this, unticking heading and ticking it again leaves ['text','heading']
		 * against a stored ['heading','text'] and the panel reports unsaved changes
		 * over a difference nobody made -- the same trap absent-versus-default set
		 * for the rest of this record.
		 */
		out.roles = (source.roles || []).slice().sort();
		out.enabled = isEnabled(source);
		out.trashed = !!source.trashed;
		/*
		 * Through the same reader the stylesheet uses, so a stored value the server
		 * would reject compares equal to no value at all rather than reading as an
		 * unsaved change nobody can save away.
		 */
		var metrics = familyMetrics(source);

		out.metrics = metrics
			? { ascent: metrics.ascent, descent: metrics.descent, gap: metrics.gap }
			: null;

		// The server drops an empty Google block rather than storing one.
		if (!out.google || !Object.keys(out.google).length) {
			delete out.google;
		}

		return canonical(out);
	}

	/**
	 * The whole library as one comparable string.
	 *
	 * @param {Array} list Families.
	 * @return {string} Canonical JSON.
	 */
	function fingerprint(list) {
		return JSON.stringify((list || []).map(normalizeFamily));
	}

	/*
	 * The four settings the panel writes are declared at the top of this file,
	 * above the state literal that fingerprints them. Their labels live here and
	 * are only read once the save bar has something to say, so they can be
	 * translated at the point of use.
	 */
	function settingLabel(key) {
		if ('inline_css' === key) {
			return s('inlineCss', 'Print the CSS inline');
		}

		if ('block_google' === key) {
			return s('blockGoogle', 'Block Google Fonts loaded by other plugins');
		}

		if ('delete_source_on_convert' === key) {
			return s('deleteSource', 'Delete the original after converting it to WOFF2');
		}

		return s('purgeFiles', 'Delete the font files when the plugin is deleted');
	}

	/**
	 * Settings as the server would store them.
	 *
	 * Booleans, in a declared order, so an absent key and a false one fingerprint
	 * the same -- the same normalising the family diff needed, for the same reason.
	 *
	 * @param {Object} [values] Settings to read. Defaults to the live ones.
	 * @return {Object} Normalised settings.
	 */
	function normalizeSettings(values) {
		var source = values || {};
		var out = {};

		SETTING_KEYS.forEach(function (key) {
			out[key] = !!source[key];
		});

		return out;
	}

	function settingsFingerprint(values) {
		return JSON.stringify(normalizeSettings(values));
	}

	function settingsDirty() {
		return settingsFingerprint(state.settings) !== state.savedSettings;
	}

	/**
	 * Whether anything is waiting to be saved.
	 *
	 * Derived, never stored. A boolean set at each of the twenty points that
	 * edit a family could only ever be switched on: undo an edit by hand and
	 * the flag stayed true, so the save bar sat lit over a diff that had
	 * nothing in it. The snapshot already says what the server holds, so the
	 * comparison is the answer and the flag was only ever a guess at it.
	 *
	 * @return {boolean} True when the buffer differs from the last save.
	 */
	function isDirty() {
		if (state.pendingFileDeletes.length) {
			return true;
		}

		if (settingsDirty()) {
			return true;
		}

		return fingerprint(state.families) !== state.saved;
	}

	/**
	 * Run something that rewrites the stored family list, without losing the buffer.
	 *
	 * The Google installer and the WOFF2 converter both work server-side from the
	 * stored option rather than from what the panel is holding: install() reads
	 * EFM_Fonts::families(), rewrites one family and saves the lot, and the
	 * applyState() that follows replaces the buffer with the result. So an unsaved
	 * edit anywhere in the panel is gone.
	 *
	 * The converter has asked about this since it was written. The installer never
	 * did, which meant choosing a different set of weights on a family -- or any
	 * install at all, since all three call sites share this -- discarded every
	 * unsaved edit without saying so.
	 *
	 * Saving is offered alongside discarding because the two were never really
	 * exclusive: the edits can go to the server first and the action can then run
	 * on top of them.
	 *
	 * @param {string}   note   What the action is about to do.
	 * @param {Function} action Runs once the buffer is safe.
	 */
	function withSavedBuffer(note, action) {
		if (!isDirty()) {
			action();

			return;
		}

		/*
		 * Two answers, not three. Abandoning the edits in order to install is a
		 * combination almost nobody wants, and offering it here put a third button
		 * on a dialog to serve it. Anyone who does want it discards on the save bar
		 * first, which is one deliberate click in the place discard lives.
		 */
		askConfirm({
			title: s('unsavedChanges', 'Unsaved changes'),
			icon: 'undo',
			message: note,
			confirm: s('saveFirst', 'Save first')
		}).then(function (answer) {
			if ('confirm' !== answer) {
				return;
			}

			// Only once the save has landed: running on top of a failed write would
			// be the silent overwrite this exists to prevent.
			saveFamilies().then(function (saved) {
				if (saved) {
					action();
				}
			});
		});
	}

	/**
	 * What differs from the last saved copy, family by family.
	 *
	 * Matched by name, so a rename reads as one gone and one arrived. When that
	 * is the only thing on each side it is reported as the rename it almost
	 * certainly is; families carry no id to match on, so anything more ambitious
	 * would be guessing.
	 *
	 * @return {Array} Entries of { name, what }.
	 */
	/*
	 * Settings the buffer has changed, worded the way a family change is worded so
	 * the two read as one list: the control's own label, then enabled or disabled.
	 */
	function settingChanges() {
		var before;

		try {
			before = JSON.parse(state.savedSettings || '{}');
		} catch (error) {
			return [];
		}

		var now = normalizeSettings(state.settings);

		return SETTING_KEYS.filter(function (key) {
			return !!before[key] !== !!now[key];
		}).map(function (key) {
			return {
				name: settingLabel(key),
				what: now[key] ? s('changeEnabled', 'enabled') : s('changeDisabled', 'disabled')
			};
		});
	}

	function changeSummary() {
		var before;

		try {
			before = JSON.parse(state.saved || '[]');
		} catch (error) {
			return settingChanges();
		}

		var was = {};
		var seen = {};
		var added = [];
		var removed = [];
		var out = [];

		before.forEach(function (family) {
			was[family.name || ''] = family;
		});

		state.families.forEach(function (family) {
			var name = family.name || '';
			var prior = was[name];

			seen[name] = true;

			if (!prior) {
				added.push(name);
				return;
			}

			/*
			 * Reported alongside the state change rather than swallowed by it.
			 * Disabling or trashing a family drops the tokens it held, and "Inter
			 * disabled" on its own does not tell you the site just lost its heading
			 * font -- which is the part worth seeing before pressing Save.
			 */
			var lost = ROLE_KEYS.filter(function (role) {
				return hasRole(prior, role) && !hasRole(family, role);
			}).map(function (role) {
				return {
					name: name,
					what: s('changeRoleCleared', 'no longer') + ' ' +
						('heading' === role ? s('roleHeadingChip', 'Headings') : s('roleTextChip', 'Body text')).toLowerCase()
				};
			});

			if (!!prior.trashed !== !!family.trashed) {
				out.push({ name: name, what: family.trashed ? s('changeTrashed', 'moved to trash') : s('changeRestored', 'restored') });
				lost.forEach(function (entry) { out.push(entry); });
				return;
			}

			if (isEnabled(prior) !== isEnabled(family)) {
				out.push({ name: name, what: isEnabled(family) ? s('changeEnabled', 'enabled') : s('changeDisabled', 'disabled') });
				lost.forEach(function (entry) { out.push(entry); });
				return;
			}

			if (JSON.stringify(normalizeFamily(prior)) === JSON.stringify(normalizeFamily(family))) {
				return;
			}

			/*
			 * Named, because a token has one owner: taking heading for this family
			 * silently takes it from another, and the save bar is where that becomes
			 * visible before it is committed rather than after.
			 */
			var roleShift = ROLE_KEYS.filter(function (role) {
				return hasRole(prior, role) !== hasRole(family, role);
			});

			if (roleShift.length) {
				roleShift.forEach(function (role) {
					var gained = hasRole(family, role);
					var label = 'heading' === role
						? s('roleHeadingChip', 'Headings')
						: s('roleTextChip', 'Body text');

					out.push({
						name: name,
						what: (gained ? s('changeRoleSet', 'set as') : s('changeRoleCleared', 'no longer')) +
							' ' + label.toLowerCase()
					});
				});

				return;
			}

			var had = (prior.variants || []).length;
			var has = (family.variants || []).length;

			if (has !== had) {
				var delta = Math.abs(has - had);

				out.push({
					name: name,
					what: (has > had ? s('changeGained', 'gained') : s('changeLost', 'lost')) + ' ' + delta + ' ' +
						plural(delta, s('variant', 'variant'), s('variants', 'variants'))
				});

				return;
			}

			out.push({ name: name, what: s('changeEdited', 'edited') });
		});

		before.forEach(function (family) {
			if (!seen[family.name || '']) {
				removed.push(family.name || '');
			}
		});

		if (1 === added.length && 1 === removed.length) {
			out.push({ name: removed[0], what: s('changeRenamed', 'renamed to') + ' ' + added[0] });

			return out.concat(settingChanges());
		}

		added.forEach(function (name) { out.push({ name: name, what: s('changeAdded', 'added') }); });
		removed.forEach(function (name) { out.push({ name: name, what: s('changeRemoved', 'removed') }); });

		return out.concat(settingChanges());
	}

	function plural(count, one, many) {
		return count === 1 ? one : many;
	}

	/*
	 * Mirrors FALLBACK_SUFFIX and FALLBACK_LOCALS in class-efm-fonts.php.
	 */
	var FALLBACK_SUFFIX = 'fallback';
	var FALLBACK_LOCALS = ['Arial', 'Helvetica Neue', 'Liberation Sans'];

	/**
	 * Percentage overrides read out of a font, or null.
	 *
	 * Mirrors sanitize_metrics() in class-efm-fonts.php, including its refusal to
	 * clamp: a bad number would silently reshape every line of body text, so no
	 * override at all is the safer failure.
	 *
	 * @param {Object} family Family record.
	 * @return {Object|null}
	 */
	function familyMetrics(family) {
		var m = family && family.metrics;

		if (!m) {
			return null;
		}

		var out = {};
		var ok = ['ascent', 'descent', 'gap'].every(function (key) {
			var value = Number(m[key]);

			if (!isFinite(value) || value < 0 || value > 400) {
				return false;
			}

			out[key] = Math.round(value * 100) / 100;

			return true;
		});

		return ok && out.ascent > 0 ? out : null;
	}

	/**
	 * The metric-matched @font-face, mirroring fallback_face_css().
	 *
	 * @param {Object} family Family record.
	 * @return {string} CSS, empty when there are no metrics.
	 */
	function fallbackFaceCss(family) {
		var metrics = familyMetrics(family);
		var name = (family && family.name) || '';

		if (!metrics || !name) {
			return '';
		}

		return '@font-face {\n' +
			'\tfont-family: "' + name + ' ' + FALLBACK_SUFFIX + '";\n' +
			'\tsrc: ' + FALLBACK_LOCALS.map(function (local) {
				return 'local("' + local + '")';
			}).join(', ') + ';\n' +
			'\tascent-override: ' + metrics.ascent + '%;\n' +
			'\tdescent-override: ' + metrics.descent + '%;\n' +
			'\tline-gap-override: ' + metrics.gap + '%;\n' +
			'}';
	}

	/**
	 * The font stack for a family, mirroring family_stack().
	 *
	 * @param {string} name   Family name.
	 * @param {Object} family Family record, when one is to hand.
	 * @return {string}
	 */
	function familyStack(name, family) {
		if (!name) {
			return 'inherit';
		}

		var stack = '"' + name + '"';

		// Between the real font and the generic, because it only matters while the
		// real font is still on its way.
		if (family && familyMetrics(family)) {
			stack += ', "' + name + ' ' + FALLBACK_SUFFIX + '"';
		}

		return stack + ', sans-serif';
	}

	/**
	 * Families that map a given file, so deleting it can warn first.
	 *
	 * @param {string} filename File name.
	 * @return {string[]} Family names.
	 */
	/*
	 * Everything in a font file name that is not part of the family's name: the
	 * weight and style the server already reads off it, the markers a variable
	 * font carries, and the subset suffix this plugin's own Google installs add.
	 */
	var FAMILY_NOISE = [
		'thin', 'extralight', 'ultralight', 'light', 'regular', 'normal', 'book', 'medium',
		'semibold', 'demibold', 'demi', 'bold', 'extrabold', 'ultrabold', 'black', 'heavy',
		'italic', 'oblique',
		'variablefont', 'variable', 'vf', 'wght', 'wdth', 'slnt', 'opsz', 'ital',
		'latin', 'latinext', 'cyrillic', 'cyrillicext', 'greek', 'greekext', 'vietnamese',
		'sinhala', 'tamil', 'devanagari', 'bengali', 'arabic', 'hebrew', 'thai', 'khmer',
		'korean', 'japanese', 'chinese', 'symbols', 'math', 'emoji', 'menu'
	];

	/**
	 * Read a family name off a font file name.
	 *
	 * "Sekuya-400-latin.woff2" and "OpenSans-SemiBoldItalic.woff2" both name their
	 * family first and then describe the cut, so the cut is what gets stripped:
	 * numeric weights, weight and style words including run-together ones, axis
	 * lists in brackets, and subset suffixes. Whatever is left is the name, with
	 * runs of camel case split back into words.
	 *
	 * @param {string} filename Font file name.
	 * @return {string} Family name, or the bare file name if nothing survives.
	 */
	function guessFamilyName(filename) {
		var base = String(filename || '').replace(/\.[a-z0-9]+$/i, '').replace(/\[[^\]]*\]/g, ' ');
		var kept = [];

		base.split(/[-_.\s]+/).forEach(function (token) {
			var flat = token.toLowerCase().replace(/[^a-z0-9]/g, '');
			var trimmed = token;
			var cutting = true;

			if (!flat || /^[1-9]00i?$/.test(flat) || FAMILY_NOISE.indexOf(flat) !== -1) {
				return;
			}

			// Run-together cuts such as "SemiBoldItalic", peeled off the end so a
			// name that merely contains a keyword, like "Blackout", survives.
			while (cutting) {
				cutting = false;

				FAMILY_NOISE.forEach(function (word) {
					var tail = trimmed.slice(-word.length).toLowerCase();

					/*
					 * Equal length counts, so "SemiBoldItalic" loses "Italic" and then
					 * the whole of "SemiBold" rather than stopping at "Semi". A token
					 * that is nothing but a cut description is dropped entirely.
					 */
					if (trimmed.length >= word.length && tail === word) {
						trimmed = trimmed.slice(0, -word.length);
						cutting = true;
					}
				});
			}

			trimmed = trimmed.replace(/[0-9]+$/, '');

			if (trimmed) {
				kept.push(trimmed);
			}
		});

		var name = kept.join(' ')
			// "IBMPlexMono" splits at the acronym boundary as well as the plain one.
			.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
			.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
			.replace(/\s+/g, ' ')
			.trim();

		if (!name) {
			return String(filename || '').replace(/\.[a-z0-9]+$/i, '');
		}

		// Only the first letter, so an acronym keeps its own casing.
		return name.split(' ').map(function (word) {
			return word.charAt(0).toUpperCase() + word.slice(1);
		}).join(' ');
	}

	/**
	 * Files a family maps that nothing else does.
	 *
	 * Shared files stay: two families can point at one file, and deleting one of
	 * them must not pull the ground from under the other.
	 *
	 * @param {number[]} indexes Family indexes being removed.
	 * @return {string[]} File names no surviving family maps.
	 */
	function orphanedBy(indexes) {
		var doomed = {};
		var kept = {};

		state.families.forEach(function (family, at) {
			var bucket = indexes.indexOf(at) === -1 ? kept : doomed;

			(family.variants || []).forEach(function (variant) {
				if (variant.file) {
					bucket[variant.file] = true;
				}
			});
		});

		return Object.keys(doomed).filter(function (file) {
			return !kept[file];
		});
	}

	/**
	 * Total size on disk of a list of file names.
	 *
	 * @param {string[]} names File names.
	 * @return {number} Bytes.
	 */
	function sizeOfFiles(names) {
		return (state.files || []).reduce(function (total, file) {
			return names.indexOf(file.name) === -1 ? total : total + (file.size || 0);
		}, 0);
	}

	/*
	 * The same total for a list of the records themselves, which is what
	 * state.files and state.unused already hold. Kept separate from sizeOfFiles
	 * above rather than folded into it with a type check: one takes names and has
	 * to look them up, this one is handed the sizes, and a helper that guessed
	 * which it had been given would be wrong silently the first time a list came
	 * in empty.
	 */
	function sizeOfRecords(files) {
		return (files || []).reduce(function (total, file) {
			return total + (file.size || 0);
		}, 0);
	}

	function fileUsedBy(filename) {
		return state.families.filter(function (family) {
			return (family.variants || []).some(function (variant) {
				return variant.file === filename;
			});
		}).map(function (family) {
			return family.name;
		});
	}

	/**
	 * Families that map a file AND actually load it.
	 *
	 * Deliberately narrower than fileUsedBy, which answers a different question.
	 * That one asks whether anything would break if the file went away, and a
	 * trashed family still counts there because restoring it has to find its
	 * files. This one asks whether the file is on the site right now, and a
	 * trashed or disabled family emits no @font-face at all -- build_css() drops
	 * both through active_families() before writing a line.
	 *
	 * @param {string} filename File name.
	 * @return {string[]} Family names loading it.
	 */
	function fileLoadedBy(filename) {
		return state.families.filter(function (family) {
			if (isTrashed(family) || !isEnabled(family)) {
				return false;
			}

			return (family.variants || []).some(function (variant) {
				return variant.file === filename;
			});
		}).map(function (family) {
			return family.name;
		});
	}

	/**
	 * What a file's row should say about itself.
	 *
	 * Three states rather than two. "In use" against "unused" had no room for the
	 * commonest middle case -- a family sitting in the trash, or switched off --
	 * whose files load nothing but must not be deleted either, because that is
	 * what restoring it needs. Those read as in use, which was wrong, and the
	 * alternative of reading as unused would have been worse: the cleanup button
	 * would have offered to delete them.
	 *
	 * @param {string} filename File name.
	 * @return {{label: string, owners: string[]}}
	 */
	function fileUseState(filename) {
		var loading = fileLoadedBy(filename);

		if (loading.length) {
			return { label: s('inUse', 'in use'), owners: loading };
		}

		var mapped = fileUsedBy(filename);

		if (mapped.length) {
			return { label: s('notLoaded', 'not loaded'), owners: mapped };
		}

		return { label: s('unusedLabel', 'unused'), owners: [] };
	}

	/**
	 * Families these files would leave with nothing mapped.
	 *
	 * Every variant has to be in the set, which is why the whole selection is
	 * weighed at once: deleting one of a family's six files empties nothing, and
	 * deleting all six empties it exactly once.
	 *
	 * @param {string[]} filenames Files about to be deleted.
	 * @return {string[]} Family names left with no variants.
	 */
	function emptiedBy(filenames) {
		return state.families.filter(function (family) {
			var variants = family.variants || [];

			// Already empty, so this delete is not what emptied it.
			if (!variants.length || isTrashed(family)) {
				return false;
			}

			return variants.every(function (variant) {
				return filenames.indexOf(variant.file) !== -1;
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
					/*
					 * Tagged, because only a message the server actually wrote is
					 * worth showing. A refusal it could not describe -- a crash, a
					 * 502, an HTML error page -- arrives with nothing useful, and
					 * the caller's own sentence is better than a shrug.
					 */
					var refusal = new Error((data && data.message) || '');

					refusal.fromServer = !!(data && data.message);
					throw refusal;
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
		state.saved = fingerprint(next.families || []);
		state.files = next.files || [];
		state.settings = next.settings || {};
		state.savedSettings = settingsFingerprint(next.settings || {});
		state.cssUrl = next.cssUrl || state.cssUrl;
		state.cssVersion = next.cssVersion || state.cssVersion;
		state.unused = next.unused || [];
		state.missing = next.missing || [];
		state.cssBuilt = next.cssBuilt || 0;

		/*
		 * Only when the payload carries them. A search response is the richer
		 * source -- it can pay for a fetch -- so a state refresh must not blank
		 * names the Google screen has already put there.
		 */
		if (next.axisNames && Object.keys(next.axisNames).length) {
			state.axisNames = next.axisNames;
		}

		refreshFontCss();
		loadPreviewFaces();
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
	/*
	 * Faces the generated stylesheet deliberately leaves out, loaded for the panel
	 * alone.
	 *
	 * build_css() runs over active_families(), so a disabled family has no
	 * @font-face anywhere -- which is exactly what disabling is for. Its card in
	 * the library still labels a specimen with the family name though, so the
	 * preview fell through to the interface font and showed the wrong face under
	 * the right name, with nothing saying so. The one screen whose job is to show
	 * you your fonts was the screen not showing one.
	 *
	 * These go into the document's own font set rather than into the stylesheet,
	 * so nothing about what the site loads changes and build_css() keeps its single
	 * definition of what ships. Adding a face re-renders the text already using it,
	 * so no render() is needed here. Each is loaded once; a file that will not
	 * parse is the missing-files case, which the card already reports.
	 */
	var previewFaces = {};

	function loadPreviewFaces() {
		if (!window.FontFace || !document.fonts) {
			return;
		}

		state.families.forEach(function (family) {
			// Enabled families are already declared, and trash draws no specimen.
			if (isTrashed(family) || isEnabled(family) || !family.name) {
				return;
			}

			(family.variants || []).forEach(function (variant) {
				var file = (state.files || []).filter(function (entry) {
					return entry.name === variant.file;
				})[0];

				if (!file || !file.url) {
					return;
				}

				var key = family.name + '|' + file.name;

				if (previewFaces[key]) {
					return;
				}

				previewFaces[key] = true;

				var face = new FontFace(family.name, 'url("' + file.url + '")', {
					weight: String(variant.weight || '400'),
					style: 'italic' === variant.style ? 'italic' : 'normal'
				});

				face.load().then(function (loaded) {
					document.fonts.add(loaded);
				}).catch(function () {});
			});
		});
	}

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
	var saveBarEl = null;
	var statusEl = null;
	var statusMessageEl = null;
	var statusRingEl = null;

	/*
	 * Etch's toast countdown, measured from its component: a 30x30 ring drawn at
	 * r=14, its dash offset walked from 0 to the full circumference as the time
	 * runs out, repainted every 100ms and smoothed by a CSS transition of the
	 * same length.
	 */
	var TOAST_DURATION = 4000;
	var TOAST_RADIUS = 14;
	var TOAST_CIRCUMFERENCE = 2 * Math.PI * TOAST_RADIUS;
	var toastTimer = { deadline: 0, remaining: 0, interval: 0 };
	var controlButton = null;
	var isOpen = false;
	var lastFocus = null;
	var barObserver = null;

	/*
	 * count is optional and only set where a number means something. Etch badges
	 * its asset collections but not its tools, so Google Fonts, Settings and
	 * Import & export carry no badge.
	 */
	/*
	 * Extension to the value CSS wants in format(). Mirrors EFM_Fonts::FORMATS,
	 * which is what the shipped stylesheet is built from; this copy exists only so
	 * the preview can be rebuilt live without asking the server.
	 */
	var FILE_FORMATS = {
		woff2: 'woff2',
		woff: 'woff',
		ttf: 'truetype',
		otf: 'opentype'
	};

	/* Suggested fallback stacks. The field accepts anything; these are shortcuts. */
	var FALLBACK_STACKS = [
		'system-ui, sans-serif',
		'Arial, Helvetica, sans-serif',
		'Georgia, "Times New Roman", serif',
		'ui-monospace, SFMono-Regular, monospace'
	];

	var VIEWS = [
		{ key: 'library', icon: 'library', label: function () { return s('library', 'Font library'); }, count: function () { return liveFamilies().length; } },
		/*
		 * Named for what the screen holds, not for one of the ways a file gets
		 * there. The count gave it away: it has always been every file in the
		 * folder, and on a library built from Google Fonts almost none of them were
		 * uploads. Uploading is still the first and largest thing on the screen.
		 */
		{ key: 'upload', icon: 'fontFile', label: function () { return s('fontFiles', 'Font files'); }, count: function () { return state.files.length; } },

		{ key: 'google', icon: 'google', label: function () { return s('googleFonts', 'Google Fonts'); } },
		{ key: 'settings', icon: 'settings', label: function () { return s('settings', 'Settings'); } },
		{ key: 'tools', icon: 'transfer', label: function () { return s('tools', 'Import & export'); } },
		/*
		 * Listed at all times, not conditional on something being in it. The trash
		 * used to appear only once a family had been thrown away, so the one place
		 * a deleted family can be recovered from was missing from the sidebar
		 * exactly while somebody was looking for it, and the sidebar changed
		 * length under the pointer as families came and went.
		 *
		 * The count stays even at zero, which is what Library and Upload already
		 * do, so the row keeps its shape rather than growing a badge on use.
		 */
		{ key: 'trash', icon: 'trash', label: function () { return s('trash', 'Trash'); }, count: function () { return trashedFamilies().length; } }
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

	/**
	 * Files this family maps that are not on the server.
	 *
	 * @param {object} family Family record.
	 * @return {string[]} Missing file names.
	 */
	function missingFor(family) {
		var absent = state.missing || [];

		if (!absent.length) {
			return [];
		}

		return (family.variants || []).map(function (variant) {
			return variant.file || '';
		}).filter(function (file, at, all) {
			return file && absent.indexOf(file) !== -1 && all.indexOf(file) === at;
		});
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

		/*
		 * The buffer is the whole panel's, not one pane's: twenty different
		 * edits change the family list, across the family editor, the library
		 * cards and the trash, and saving posts every family in one request. So
		 * this is
		 * one bar for the panel, pinned at its foot where the work is, rather than
		 * a button per section that would claim to save only that section.
		 */
		saveBarEl = el('div', { class: 'efm-savebar', hidden: true });
		/*
		 * The live region is the message itself rather than the whole toast, so a
		 * screen reader announces what happened without also reading out the
		 * dismiss button every time.
		 */
		statusMessageEl = el('span', { class: 'efm-status__message', role: 'status', 'aria-live': 'polite' });
		statusRingEl = toastRing();

		statusEl = el('div', { class: 'efm-status', hidden: true }, [
			statusMessageEl,
			el('span', { class: 'efm-status__close-wrap' }, [
				statusRingEl,
				el('button', {
					type: 'button',
					class: 'efm-status__close',
					'aria-label': s('dismiss', 'Dismiss'),
					onclick: function () {
						setStatus('');
					}
				}, [icon('close', 'sm')])
			])
		]);

		// Etch pauses every toast's countdown while the pointer is over it, so a
		// message cannot expire while it is being read.
		statusEl.addEventListener('mouseenter', pauseToastTimer);
		statusEl.addEventListener('mouseleave', resumeToastTimer);

		manager = el('section', {
			class: 'efm-manager',
			id: 'efm-manager',
			role: 'dialog',
			'aria-label': s('fontManager', 'Font Manager'),
			// Which input device last drove the panel, read by the focus rules in
			// panel.css. Starts as keyboard so a panel opened from the keyboard
			// shows its rings before any pointer press has been seen.
			'data-efm-modality': 'keyboard',
			hidden: true
		}, [
			el('header', { class: 'efm-header' }, [
				el('button', {
					type: 'button',
					// Not the square icon variant: Etch's managers use the plain
					// outline button, which its 12px inline padding takes to 40x28
					// around a 14px arrow.
					class: 'efm-btn efm-btn--outline efm-tooltip',
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
				}, [icon('back', 'sm')]),
				el('h1', { class: 'efm-header__title', text: s('fontManager', 'Font Manager') }),
				statusEl
			]),
			el('div', { class: 'efm-body' }, [navEl, contentEl]),
			saveBarEl
		]);

		manager.addEventListener('keydown', function (event) {
			/*
			 * Only Tab counts as keyboard navigation for the focus ring. Any other
			 * key would light the ring up mid-typing in a field the pointer had
			 * just opened, which is the thing the modality flag exists to avoid.
			 */
			if (event.key === 'Tab') {
				manager.setAttribute('data-efm-modality', 'keyboard');
			}

			if (event.key === 'Escape') {
				event.stopPropagation();

				/*
				 * Innermost layer first. A dropdown can be open inside the filters
				 * popover, so it takes Escape before the popover does, and the
				 * popover before the manager.
				 */
				if (state.openMenu) {
					closeMenu(true);
					return;
				}

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
		 * Records the pointer as the current input device, then dismisses the
		 * filters popover on a press anywhere outside it. Bound to the manager
		 * rather than the document because the manager already covers the builder,
		 * and pointerdown rather than click so the popover is gone before whatever
		 * was pressed reacts — and so the flag is set before focus lands.
		 */
		manager.addEventListener('pointerdown', function (event) {
			manager.setAttribute('data-efm-modality', 'pointer');

			// A press anywhere outside the open dropdown closes it, including on
			// another dropdown's trigger, which then opens its own.
			if (state.openMenu && !event.target.closest('.efm-select')) {
				closeMenu(false);
			}

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

		/*
		 * The buffer lives as long as the page and no longer. Closing the panel keeps
		 * it; reloading the builder, navigating away or closing the tab drops it, and
		 * that happened without a word.
		 *
		 * Etch guards its own work exactly here -- one beforeunload checking five of
		 * its stores -- and this panel is not one of them, so its unsaved changes had
		 * no guard at all. Registered in build() rather than at boot, because the
		 * panel has to have been opened for there to be anything to lose.
		 *
		 * Current browsers show their own wording and ignore the string; it is set
		 * for the older ones that still read it.
		 */
		window.addEventListener('beforeunload', function (event) {
			if (!isDirty()) {
				return undefined;
			}

			event.preventDefault();
			event.returnValue = s('confirmLeave', 'You have unsaved font changes.');

			return event.returnValue;
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
		loadPreviewFaces();

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
		/*
		 * Closing is not destructive and never was. shutPanel() hides the DOM and
		 * flips a flag; open() re-renders from the same state object without
		 * re-fetching. So the buffer survives a close, the save bar is still lit
		 * when the panel comes back, and there is nothing here to confirm.
		 *
		 * This used to ask, and the only way out it offered besides staying was to
		 * throw the work away -- a destructive answer to a harmless question. The
		 * real risk is leaving the page, which drops the buffer with it, so the
		 * warning moved to the beforeunload in build(), where that actually happens.
		 * Discard keeps its home on the save bar, where it sits beside the message
		 * naming what changed and is chosen deliberately rather than offered as the
		 * way out of a dialog.
		 */
		shutPanel(restoreFocus);
	}

	/**
	 * Put the panel away, once there is nothing left to ask about.
	 *
	 * @param {boolean} restoreFocus Send focus back to the control.
	 */
	function shutPanel(restoreFocus) {
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

	/**
	 * Ask a question in a dialog of the panel's own.
	 *
	 * window.confirm() draws the browser's dialog: system chrome, system type,
	 * the site's hostname above it, and no relation to the builder it interrupts.
	 * This is Etch's dialog instead, measured from its own component: fixed and
	 * centred, on --e-base at a 6px radius under its layered shadow, over a
	 * blurred 40% overlay.
	 *
	 * Answering is asynchronous, unlike window.confirm, so callers take the
	 * answer from the promise rather than from a return value.
	 *
	 * The answer is a name rather than a boolean. It costs nothing and it reads at
	 * the call site: 'confirm' === answer says which way the question went, where a
	 * bare truthy value only says that it went somewhere.
	 *
	 * @param {object} config
	 *   title    Heading.
	 *   message  Body text. Blank lines split it into paragraphs.
	 *   confirm  Label for the affirmative button.
	 *   danger   Whether that button destroys something on the server.
	 *   mark     Elements to flag as the target while the question is up.
	 * @return {Promise<string>} 'confirm' or 'cancel'.
	 */
	function askConfirm(config) {
		return new Promise(function (resolve) {
			var previous = document.activeElement;
			var overlay = el('div', { class: 'efm-dialog-overlay' });

			/*
			 * What the answer is about, marked behind the dialog for as long as it is
			 * up. Etch's Asset Manager does this, and it is what makes a question
			 * saying "this family" checkable rather than something to take on trust.
			 * Cleared in finish(), whichever way the question goes.
			 */
			var marked = (config.mark || []).filter(Boolean);

			marked.forEach(function (node) {
				node.classList.add('efm-doomed');
			});
			var body = el('div', { class: 'efm-dialog__body' });

			String(config.message || '').split('\n').forEach(function (line) {
				if (line.trim()) {
					body.appendChild(el('p', { class: 'efm-dialog__text', text: line.trim() }));
				}
			});

			/*
			 * A list of names is not prose and must not be set as prose. Etch centres
			 * a dialog's message, which is right for a sentence and wrong for five
			 * file names: centred, ragged both sides and in the body face, they read
			 * as more of the question rather than as the things it is asking about.
			 * They go in the sunken well this panel already uses for anything
			 * machine-written, left aligned, monospaced, and scrolling past a handful
			 * so the dialog cannot grow to the height of the screen.
			 */
			if (config.list && config.list.length) {
				body.appendChild(el('div', { class: 'efm-filewell' }, config.list.map(function (item) {
					return el('span', { class: 'efm-filewell__item', text: item });
				})));
			}

			/*
			 * An optional extra the answer carries with it. The caller owns the
			 * object, so the promise still resolves a plain yes or no and the five
			 * confirmations that do not need one are untouched.
			 */
			if (config.checkbox) {
				body.appendChild(el('label', { class: 'efm-toggle efm-toggle--inline efm-dialog__extra' }, [
					el('input', {
						type: 'checkbox',
						class: 'efm-checkbox',
						checked: !!config.checkbox.state.checked,
						onchange: function (event) {
							config.checkbox.state.checked = event.target.checked;
						}
					}),
					el('span', { class: 'efm-toggle__label', text: config.checkbox.label })
				]));
			}

			/*
			 * Etch heads its confirmation with an icon beside a centred title and
			 * repeats that icon on the destructive answer, which is what makes the
			 * question readable before any of the words are. A caller can name its
			 * own; a destructive one falls back to the trash.
			 */
			var glyph = config.icon || (config.danger ? 'trash' : null);

			/*
			 * The two levels Etch's own dialog has. Red is reserved for the four
			 * questions that remove something from the server; everything else takes
			 * the accent, which a dialog can afford because it holds exactly one
			 * affirmative action.
			 */
			var tone = config.danger ? 'danger' : 'primary';

			var cancel = el('button', {
				type: 'button',
				class: 'efm-dialog__btn efm-dialog__btn--cancel',
				text: s('cancel', 'Cancel'),
				onclick: function () { finish('cancel'); }
			});

			var accept = el('button', {
				type: 'button',
				class: 'efm-dialog__btn efm-dialog__btn--' + tone,
				onclick: function () { finish('confirm'); }
			}, [
				'primary' !== tone && glyph ? icon(glyph, 'sm') : null,
				el('span', { text: config.confirm || s('continue', 'Continue') })
			]);

			/*
			 * Visual order, and the order Tab walks. Every dialog in the panel is two
			 * answers, which is what Etch's own .confirm-dialog renders: a question with
			 * three ways out is usually two questions wearing one coat.
			 */
			var answers = [cancel, accept];

			var dialog = el('div', {
				class: 'efm-dialog',
				role: 'dialog',
				'aria-modal': 'true',
				'aria-label': config.title || ''
			}, [
				el('div', {
					class: 'efm-dialog__header' + ('primary' === tone ? '' : ' efm-dialog__header--' + tone)
				}, [
					glyph ? icon(glyph, 'sm') : null,
					el('h2', { class: 'efm-dialog__title', text: config.title || '' })
				]),
				body,
				el('div', { class: 'efm-dialog__actions' }, answers)
			]);

			function onKey(event) {
				if (event.key === 'Escape') {
					// Before the manager's own Escape handler, which would otherwise
					// close the whole panel underneath the question.
					event.stopPropagation();
					event.preventDefault();
					finish('cancel');
					return;
				}

				if (event.key !== 'Tab') {
					return;
				}

				/*
				 * The buttons are the whole trap, walked in visual order and wrapping at
				 * both ends. Stopped as well as prevented: the panel keeps its own focus
				 * trap, and since the dialog is the last thing in it, that trap would see
				 * focus land on the final control and send it back to the panel's first
				 * one.
				 */
				event.preventDefault();
				event.stopPropagation();

				var at = answers.indexOf(document.activeElement);
				var step = event.shiftKey ? -1 : 1;

				answers[(at + step + answers.length) % answers.length].focus();
			}

			function finish(answer) {
				document.removeEventListener('keydown', onKey, true);
				overlay.remove();
				dialog.remove();

				marked.forEach(function (node) {
					node.classList.remove('efm-doomed');
				});

				if (previous && previous.focus) {
					previous.focus({ preventScroll: true });
				}

				resolve(answer);
			}

			overlay.addEventListener('click', function () { finish('cancel'); });
			document.addEventListener('keydown', onKey, true);

			(manager || document.body).appendChild(overlay);
			(manager || document.body).appendChild(dialog);

			// The safe answer holds focus, so Enter never destroys anything.
			cancel.focus();
		});
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

	/**
	 * Show a toast.
	 *
	 * The default level is success, because every call that does not name one
	 * reports something that finished: saved, installed, uploaded, exported.
	 * Work still in progress passes 'progress' so it is not announced green and
	 * is not cleared while it is still running.
	 *
	 * @param {string} message Text to show.
	 * @param {string} [type]  success, error, warning or progress.
	 */
	function setStatus(message, type) {
		state.status = message ? { message: message, type: type || 'success' } : null;
		renderStatus();

		// Always cancel a pending clear. A timer left over from an earlier
		// transient message used to fire on top of whatever replaced it, wiping
		// an error or a progress line that should have stayed.
		clearToastTimer();

		if (message && !toastPersists(state.status.type)) {
			runToastTimer(TOAST_DURATION);
		}
	}

	/**
	 * Whether a level stays until it is dismissed.
	 *
	 * 'progress' stays put: a long conversion would otherwise clear the only
	 * sign that anything is still happening. So do 'error' and 'warning', which
	 * name what failed and are worth reading at your own pace.
	 *
	 * @param {string} type Toast level.
	 * @return {boolean} True when the toast has no countdown.
	 */
	function toastPersists(type) {
		return type === 'error' || type === 'progress' || type === 'warning';
	}

	/**
	 * The countdown ring behind the dismiss button.
	 *
	 * @return {SVGElement} Ring, hidden from assistive technology.
	 */
	function toastRing() {
		var ns = 'http://www.w3.org/2000/svg';
		var svg = document.createElementNS(ns, 'svg');
		var circle = document.createElementNS(ns, 'circle');

		svg.setAttribute('class', 'efm-status__ring');
		svg.setAttribute('viewBox', '0 0 30 30');
		svg.setAttribute('aria-hidden', 'true');

		circle.setAttribute('class', 'efm-status__ring-stroke');
		circle.setAttribute('cx', '15');
		circle.setAttribute('cy', '15');
		circle.setAttribute('r', String(TOAST_RADIUS));
		circle.setAttribute('fill', 'none');
		circle.setAttribute('stroke', 'currentColor');
		circle.setAttribute('stroke-width', '1.5');
		circle.setAttribute('stroke-dasharray', String(TOAST_CIRCUMFERENCE));
		circle.setAttribute('stroke-dashoffset', '0');
		svg.appendChild(circle);

		return svg;
	}

	/**
	 * Draw the ring for a share of time remaining.
	 *
	 * @param {number} share 1 for a full ring, 0 for none.
	 */
	function paintToastRing(share) {
		if (!statusRingEl) {
			return;
		}

		statusRingEl.firstChild.setAttribute(
			'stroke-dashoffset',
			String(TOAST_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, share))))
		);
	}

	function clearToastTimer() {
		if (toastTimer.interval) {
			window.clearInterval(toastTimer.interval);
		}

		toastTimer.interval = 0;
		toastTimer.deadline = 0;
		toastTimer.remaining = 0;
		paintToastRing(1);
	}

	/**
	 * Start or restart the countdown.
	 *
	 * @param {number} ms Milliseconds left to run.
	 */
	function runToastTimer(ms) {
		if (toastTimer.interval) {
			window.clearInterval(toastTimer.interval);
		}

		toastTimer.deadline = Date.now() + ms;
		toastTimer.remaining = 0;
		toastTimer.interval = window.setInterval(tickToastTimer, 100);
		tickToastTimer();
	}

	function tickToastTimer() {
		var left = Math.max(0, toastTimer.deadline - Date.now());

		// Always a share of the full duration, so a resumed toast picks the ring
		// up where it was paused rather than refilling it.
		paintToastRing(left / TOAST_DURATION);

		if (left > 0) {
			return;
		}

		clearToastTimer();
		state.status = null;
		renderStatus();
	}

	function pauseToastTimer() {
		if (!toastTimer.deadline) {
			return;
		}

		toastTimer.remaining = Math.max(0, toastTimer.deadline - Date.now());
		window.clearInterval(toastTimer.interval);
		toastTimer.interval = 0;
	}

	function resumeToastTimer() {
		if (toastTimer.remaining) {
			runToastTimer(toastTimer.remaining);
		}
	}

	function renderStatus() {
		if (!statusEl) {
			return;
		}
		var status = state.status;

		statusMessageEl.textContent = status ? status.message : '';

		// One class per level, matching Etch's own toast--{level} variants.
		statusEl.className = 'efm-status' + (status ? ' is-' + status.type : '');

		if (status) {
			statusEl.removeAttribute('hidden');
		} else {
			statusEl.setAttribute('hidden', '');
		}

		// A message that never expires has no countdown to draw, but is still
		// dismissible, which is exactly how Etch treats one.
		statusRingEl.hidden = !status || toastPersists(status.type);
	}

	/**
	 * A rejection handler that names the operation the server could not.
	 *
	 * A rejection arrives from three places and only one of them is worth
	 * repeating: a response the server refused with a message of its own. The
	 * other two -- a refusal it could not describe, and fetch rejecting because
	 * the network went away -- used to surface as "Something went wrong." or, on
	 * a dropped connection, the browser's own "Failed to fetch". Neither says
	 * which of thirteen operations just failed or what it left behind, so those
	 * take the caller's sentence instead.
	 *
	 * @param {string} message What this particular operation should say.
	 * @return {Function} A rejection handler for .catch().
	 */
	function failing(message) {
		return function (error) {
			setStatus((error && error.fromServer && error.message) || message, 'error');
		};
	}

	function go(view) {
		state.filtersOpen = false;
		state.openMenu = '';

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

	/**
	 * Read a field's selection, when it has one.
	 *
	 * @param {Element} node Focused element.
	 * @return {Array<number>|null} Selection start and end, or null.
	 */
	/*
	 * Where each view was scrolled to, so leaving one and coming back lands where
	 * you left off. Keyed by what is on screen rather than by the nav section: a
	 * family editor and the type tester are their own places, and each starts at
	 * the top the first time it is opened.
	 */
	var scrollMemory = {};
	var renderedView = '';

	/**
	 * Identify what the pane is showing.
	 *
	 * @return {string} Key for the scroll memory.
	 */
	function viewKey() {
		if (state.editing !== null) {
			return 'family:' + state.editing;
		}

		if ('google' === state.view && state.detail) {
			return 'google-detail:' + state.detail;
		}

		return state.view;
	}

	function caretOf(node) {
		try {
			return typeof node.selectionStart === 'number' ? [node.selectionStart, node.selectionEnd] : null;
		} catch (error) {
			// Types such as number and email have no selection to read.
			return null;
		}
	}

	/*
	 * One debounced call each, for the whole session, rather than one per render.
	 * These inputs are rebuilt every time the pane redraws, and a debounce created
	 * inline in the handler goes with them: the timer already pending on the
	 * discarded input still fires, so two instances race and the earlier keystroke
	 * can land after the later one.
	 */
	var queueGoogleSearch = debounce(function () { searchGoogle(); }, 320);
	var queueRender = debounce(function () { render(); }, 200);

	function render() {
		if (!manager) {
			return;
		}

		/*
		 * render() rebuilds the content pane wholesale, which destroys whatever
		 * was focused inside it. A field that re-renders as you type — the library
		 * filter, the Google Fonts search — otherwise loses the caret mid-word,
		 * one debounce after the keystroke. Anything carrying data-efm-focus is
		 * found again by that key once the new tree is in place, selection and
		 * all.
		 */
		var active = document.activeElement;
		var focusKey = active && contentEl.contains(active) ? active.getAttribute('data-efm-focus') : null;
		var caret = focusKey ? caretOf(active) : null;

		// Captured before the pane is emptied, which resets scrollTop to 0.
		if (renderedView) {
			scrollMemory[renderedView] = contentEl.scrollTop;
		}

		renderNav();
		renderSaveBar();
		renderStatus();

		contentEl.innerHTML = '';

		var nextView = viewKey();

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

		/*
		 * Put the scroll back. The same view redrawing keeps its place, which is
		 * what stops "Load more" and a filter keystroke throwing you to the top,
		 * and returning to a view it remembers lands where it was left.
		 */
		renderedView = nextView;
		contentEl.scrollTop = scrollMemory[nextView] || 0;

		if (!focusKey) {
			return;
		}

		var restored = contentEl.querySelector('[data-efm-focus="' + focusKey + '"]');

		if (!restored) {
			return;
		}

		// preventScroll: the pane is scrollable, and focusing a field the user is
		// already typing in must not jump it.
		restored.focus({ preventScroll: true });

		if (caret && caretOf(restored)) {
			restored.setSelectionRange(caret[0], caret[1]);
		}
	}

	function renderNav() {
		navEl.innerHTML = '';

		VIEWS.forEach(function (view) {
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
				stat(live.length, plural(live.length, s('familyLabel', 'family'), s('familiesLabel', 'families')), 'statFamilies'),
				stat(variantCount, plural(variantCount, s('variant', 'variant'), s('variants', 'variants')), 'textSize'),
				stat(state.files.length, plural(state.files.length, s('fileLabel', 'file'), s('filesLabel', 'files')), 'fontFile')
			])
		);
	}

	function renderSaveBar() {
		saveBarEl.innerHTML = '';

		if (!isDirty()) {
			saveBarEl.setAttribute('hidden', '');
			return;
		}

		saveBarEl.removeAttribute('hidden');


		/*
		 * What is unsaved, not that something is. "Unsaved changes" told the reader
		 * nothing they could act on, and after a long editing session it is the one
		 * thing worth knowing before pressing either button. Two are named in the
		 * bar and the rest counted; the whole list is on the tooltip, because the
		 * bar is one row and a family name can be long.
		 */
		var changes = changeSummary();
		var phrase = function (change) { return change.name + ' ' + change.what; };
		var label = changes.length
			? changes.slice(0, 2).map(phrase).join(', ') +
				(changes.length > 2 ? ', +' + (changes.length - 2) + ' ' + s('moreLabel', 'more') : '')
			: s('unsavedChanges', 'Unsaved changes');

		saveBarEl.appendChild(el('span', {
			class: 'efm-savebar__label' + (changes.length > 2 ? ' efm-tooltip efm-tooltip--wrap efm-tooltip--start' : ''),
			'data-efm-tooltip': changes.length > 2 ? changes.map(phrase).join(', ') : null
		}, [
			el('span', { class: 'efm-savebar__text', text: label })
		]));
		saveBarEl.appendChild(
			el('button', {
				type: 'button',
				/*
				 * Outline against Save's fill, which is the panel's own language for a
				 * secondary action beside a primary one. A ghost read as hierarchy in
				 * isolation but made the control hard to find as a target, and it was
				 * the only borderless button in the panel doing real work.
				 */
				class: 'efm-btn efm-btn--outline',
				text: s('discard', 'Discard'),
				onclick: reload
			})
		);
		saveBarEl.appendChild(
			el('button', {
				type: 'button',
				/*
				 * The accent variant, like every other committing action in the
				 * panel. This used to be a neutral one-off, on the reasoning that
				 * the builder's own accent Save sits nine pixels below the panel
				 * and two accent saves would compete. The panel had already
				 * abandoned that rule everywhere else -- Settings saves, Import
				 * now, Download configuration and Reset all are all accent-filled
				 * -- so the one button that actually commits the library was the
				 * quietest committing button on the screen. Dumal's call.
				 */
				class: 'efm-btn efm-btn--primary',
				text: state.busy === 'save' ? s('saving', 'Saving…') : s('save', 'Save fonts'),
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
	/**
	 * Repaint every specimen on screen.
	 *
	 * @param {string} [variation] Instance to apply, when a drag is changing one.
	 *                             Dragging an axis used to rewrite the generated
	 *                             CSS and mark the panel unsaved while the preview
	 *                             sat at the default cut, so the one control whose
	 *                             whole purpose is to be seen showed nothing.
	 */
	function repaintSpecimens(variation) {
		Array.prototype.forEach.call(contentEl.querySelectorAll('[data-efm-specimen]'), function (node) {
			var subsets = (node.getAttribute('data-efm-subsets') || '').split(',').filter(Boolean);

			node.textContent = sampleFor({
				subsets: subsets,
				script: node.getAttribute('data-efm-script') || ''
			});
			node.style.fontSize = state.previewSize + 'px';

			if (variation !== undefined) {
				node.style.fontVariationSettings = variation || 'normal';
			}
		});
	}

	/**
	 * Preset preview strings.
	 *
	 * "Auto" is the important one and the default: it hands each card back to
	 * sampleFor(), so a mixed result set previews every family in its own script
	 * rather than forcing one script onto all of them.
	 */
	/**
	 * The non-Latin scripts present in whatever is on screen.
	 *
	 * Read from the families in the library and from any Google results being
	 * browsed, so the row answers to this install rather than to a list decided in
	 * advance. A subset the panel has no sample for contributes nothing, since a
	 * chip that previews the fallback face teaches the reader nothing.
	 *
	 * @return {string[]} Sample keys, in the order SCRIPT_LABEL declares them.
	 */
	function scriptsOnScreen() {
		var seen = {};

		function note(subset) {
			if (subset && subset !== 'latin' && subset !== 'latin-ext' && SAMPLES[subset]) {
				seen[subset] = true;
			}
		}

		(state.families || []).forEach(function (family) {
			if (isTrashed(family)) {
				return;
			}

			(family.variants || []).forEach(function (variant) {
				note(variant.subset);
			});

			// A Google install records every subset it was given, which covers a
			// family whose variants predate that record.
			((family.google && family.google.subsets) || []).forEach(note);
		});

		/*
		 * Results only count while they are on screen. state.results is written by a
		 * search and never cleared when you leave the Google view, so counting it
		 * everywhere would put a script on the Library's row that the library does
		 * not contain -- and browsing Google opens with a search, so that would
		 * happen to anyone who so much as looked at the screen.
		 */
		if ('google' === state.view) {
			(state.results || []).forEach(function (font) {
				(font.subsets || []).forEach(note);
			});
		}

		return Object.keys(SCRIPT_LABEL).filter(function (key) {
			return seen[key];
		});
	}

	function previewPresets() {
		var presets = [
			{ id: 'auto', label: s('sampleAuto', 'Auto'), text: '' },
			{ id: 'latin', label: s('sampleLatin', 'Latin'), text: s('preview', 'The quick brown fox') }
		];

		scriptsOnScreen().forEach(function (key) {
			presets.push({ id: key, label: SCRIPT_LABEL[key], text: SAMPLES[key] });
		});

		presets.push({ id: 'numerals', label: s('sampleNumerals', '123'), text: NUMERALS });

		return presets;
	}

	/**
	 * Put a button inside a field that empties it.
	 *
	 * Shown only once there is something to clear, and on its own input listener
	 * rather than the field's, which is usually debounced: the button should
	 * appear with the first character, not a fraction of a second after it.
	 *
	 * @param {HTMLInputElement} input   Field to wrap.
	 * @param {string}           label   Accessible name for the button.
	 * @param {Function}         onclear Runs after the field is emptied.
	 * @return {HTMLElement} Field and button in a positioned wrapper.
	 */
	function clearableField(input, label, onclear) {
		var button = el('button', {
			type: 'button',
			class: 'efm-input__clear efm-tooltip efm-tooltip--end',
			'aria-label': label,
			'data-efm-tooltip': label,
			hidden: !input.value,
			onclick: function () {
				input.value = '';
				button.hidden = true;

				// Straight back to typing, since that is what the field is for.
				input.focus();
				onclear();
			}
		}, [icon('close', 'sm')]);

		input.addEventListener('input', function () {
			button.hidden = !input.value;
		});

		return el('div', { class: 'efm-input-wrap' }, [input, button]);
	}

	function previewToolbar(lead) {
		var sizeLabel = el('span', { class: 'efm-toolbar__size', text: state.previewSize + 'px' });

		/*
		 * The slider carried an aria-label and nothing a sighted reader could see:
		 * a bare track and a number, on all four screens this toolbar appears on.
		 * The axis sliders in the type tester were never in doubt -- each of those
		 * names itself, and its tag, and its range -- so this was the one control
		 * in the panel a reader had to drag to identify.
		 *
		 * Etch does not leave its own slider bare either. .compression-control
		 * heads it with the name, an em dash and the value, and puts the name at
		 * 0.75 opacity against a full-strength value, so the word says what the
		 * control is and the number stays the thing being read. The same split is
		 * kept here, with the track standing in for the dash: a muted name before
		 * it, the value after it lifted out of muted so the pair does not read as
		 * one grey smear.
		 *
		 * The string is the one the aria-label already uses, so the visible name
		 * and the spoken one cannot drift and no new translation is introduced.
		 */
		var sizeName = el('span', { class: 'efm-toolbar__label', text: s('previewSize', 'Preview size') });

		// syncPresetChips is a declaration further down, so it is already hoisted.
		var queuePreview = debounce(function () {
			savePrefs();
			repaintSpecimens();
			syncPresetChips();
		}, 160);

		var textInput = el('input', {
			type: 'text',
			class: 'efm-input',
			value: state.previewCustom,
			'aria-label': s('previewText', 'Preview text'),
			placeholder: s('previewAuto', 'Each family in its own script'),
			/*
			 * Same split again. This field does not redraw the pane, so it never lost
			 * a caret in practice, but state.previewCustom still trailed it by a
			 * debounce: any render fired by something else in that window rebuilt the
			 * field from the older value. The read is immediate; only the repaint,
			 * which touches every specimen on screen, waits.
			 */
			oninput: function (event) {
				state.previewCustom = event.target.value;
				queuePreview();
			}
		});

		/*
		 * Clearing puts every card back to its own script, which is the default
		 * this panel exists to show. Selecting the text and deleting it was the
		 * only way back to that.
		 */
		var textField = clearableField(textInput, s('clearPreview', 'Clear preview text'), function () {
			state.previewCustom = '';
			savePrefs();
			repaintSpecimens();
			syncPresetChips();
		});
		var clearText = textField.querySelector('.efm-input__clear');

		/*
		 * The strip is at its worst on the Google view. scriptsOnScreen() reports
		 * the subsets of everything on screen, and one page of Google results
		 * reaches across most of the catalogue's writing systems, so Auto, Latin
		 * and 123 arrive with a dozen or more scripts between them: measured on a
		 * live builder, fifteen chips running 823px along a row it shares with the
		 * preview field, the size slider and its readout.
		 *
		 * So it collapses behind the same disclosure the install cards use -- the
		 * same CHIP_LIMIT, the same dashed +N, the same "Show fewer" -- and a
		 * collapsed row of chips reads identically wherever it appears.
		 *
		 * chipWall is not called here despite owning that behaviour: it returns a
		 * labelled two-column shell built for a card, and it re-renders the pane to
		 * open. Both are wrong for a toolbar. Every chip is built and stays in the
		 * DOM, and the collapse only decides which are shown, which is what lets
		 * syncPresetChips keep working against a stable row and lets a click cost a
		 * repaint rather than a render -- on the Google view a render rebuilds a
		 * grid of two dozen cards, and this is a control people click through to
		 * compare scripts.
		 */
		var presets = previewPresets();

		var presetButtons = presets.map(function (preset) {
			return el('button', {
				type: 'button',
				class: 'efm-chip efm-chip--toggle',
				'data-efm-preset': preset.id,
				'aria-pressed': state.previewCustom === preset.text ? 'true' : 'false',
				text: preset.label,
				onclick: function () {
					state.previewCustom = preset.text;
					textInput.value = preset.text;
					// A preset fills the field too, so the clear stays in step.
					clearText.hidden = !preset.text;
					savePrefs();
					repaintSpecimens();
					syncPresetChips();
				}
			});
		});

		/*
		 * Opening and closing is the row's own business, so it does not re-render:
		 * the chips are all present already and only their visibility changes.
		 */
		var moreChip = el('button', {
			type: 'button',
			class: 'efm-chip efm-chip--more efm-tooltip',
			onclick: function () {
				state.chipsOpen.preview = !state.chipsOpen.preview;
				syncPresetChips();
			}
		});

		/*
		 * Past the limit the chips take a row of their own and the preview field and
		 * the size slider keep the first row's right corner to themselves. Under it
		 * -- a Latin-only library, where the set is just Auto, Latin and 123 -- they
		 * ride along on the first row and the toolbar stays one line deep.
		 *
		 * Decided on how many presets exist rather than how many are showing, so
		 * opening the collapsed set cannot move the field and the slider: the row
		 * the chips live on is settled before the disclosure is read.
		 */
		var chips = el('div', {
			class: 'efm-chips efm-chips--presets' +
				(presets.length > ROW_CHIP_LIMIT ? ' is-own-row' : '')
		}, presetButtons.concat([moreChip]));

		/*
		 * One pass over the row: which chip is on, and which ones the collapse
		 * leaves standing. A chip that is on stays visible whatever its position,
		 * the way chipWall keeps a selected one, so picking a script and then
		 * collapsing can never hide the choice that is actually in force.
		 *
		 * The presets are captured once above rather than recomputed here, so the
		 * buttons and the records they describe cannot drift out of step.
		 */
		function syncPresetChips() {
			var open = !!state.chipsOpen.preview;
			var collapsible = presets.length > CHIP_LIMIT;
			var buried = 0;

			presetButtons.forEach(function (node, i) {
				var on = state.previewCustom === presets[i].text;
				var show = open || i < CHIP_LIMIT || on;

				node.setAttribute('aria-pressed', on ? 'true' : 'false');
				node.classList.toggle('is-on', on);
				node.hidden = !show;

				if (!show) {
					buried += 1;
				}
			});

			// "+3" says how many are hidden, not what pressing it does, so the name
			// and the tooltip say that instead.
			var label = buried
				? s('showAll', 'Show all') + ' (' + presets.length + ')'
				: s('showFewer', 'Show fewer');

			moreChip.hidden = !collapsible;
			moreChip.textContent = buried ? '+' + buried : s('showFewer', 'Show fewer');
			moreChip.setAttribute('aria-expanded', buried ? 'false' : 'true');
			moreChip.setAttribute('aria-label', label);
			moreChip.setAttribute('data-efm-tooltip', label);
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
				syncRange(event.target);
				savePrefs();
				repaintSpecimens();
			}
		});

		syncRange(size);

		/*
		 * Three items on one wrapping row rather than the chips being buried in the
		 * preview group. They used to sit between the preview field and the size
		 * slider, which is what tied all three together and made a long chip set
		 * push the slider along the row ahead of it.
		 */
		return el('div', { class: 'efm-toolbar' }, [
			lead || null,
			chips,
			el('div', { class: 'efm-toolbar__preview' }, [textField, sizeName, size, sizeLabel])
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
			/*
			 * A count is a number rather than part of the name, so it is its own span
			 * and takes the sidebar's badge. Items without one keep the plain text and
			 * the outline they had, which is every caller but the file formats.
			 */
			var counted = item.count !== null && item.count !== undefined;

			var attrs = {
				type: 'button',
				class: 'efm-chip efm-chip--toggle' + (counted ? ' efm-chip--counted' : '') + (item.on ? ' is-on' : ''),
				'aria-pressed': item.on ? 'true' : 'false',
				onclick: item.onclick
			};

			if (!counted) {
				attrs.text = item.label;

				return el('button', attrs);
			}

			return el('button', attrs, [
				el('span', { text: item.label }),
				el('span', { class: 'efm-chip__count', text: String(item.count) })
			]);
		});

		if (hidden > 0) {
			chips.push(el('button', {
				type: 'button',
				class: 'efm-chip efm-chip--more efm-tooltip',
				'aria-expanded': 'false',
				'aria-label': s('showAll', 'Show all') + ' (' + items.length + ')',
				// "+3" says how many are hidden, not what pressing it does.
				'data-efm-tooltip': s('showAll', 'Show all') + ' (' + items.length + ')',
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
	 * Which page numbers to show, with gaps marked.
	 *
	 * Always the first and last page, and the current one with a neighbour each
	 * side. Anything skipped becomes a single gap marker, so the control stays
	 * the same width whether the catalogue is 3 pages or 80.
	 *
	 * @param {number} current Current page, from zero.
	 * @param {number} count   Total pages.
	 * @return {Array} Page indexes, with null for a gap.
	 */
	function pageWindow(current, count) {
		var wanted = [0, count - 1, current, current - 1, current + 1];
		var pages = [];
		var out = [];

		wanted.forEach(function (page) {
			if (page >= 0 && page < count && pages.indexOf(page) === -1) {
				pages.push(page);
			}
		});

		pages.sort(function (a, b) { return a - b; });

		pages.forEach(function (page, i) {
			if (i > 0 && page - pages[i - 1] > 1) {
				out.push(null);
			}

			out.push(page);
		});

		return out;
	}

	/**
	 * Page through a long list.
	 *
	 * Follows shadcn's Pagination: a centred nav of previous, page numbers with a
	 * gap marker, and next, with the current page carrying aria-current. Drawn in
	 * this panel's own controls rather than shadcn's, so it sits in Etch.
	 *
	 * @param {number}   current Current page, from zero.
	 * @param {number}   count   Total pages.
	 * @param {Function} onPick  Called with the page to show.
	 * @return {HTMLElement} Navigation element.
	 */
	function pagination(current, count, onPick) {
		var list = el('div', { class: 'efm-pagination__list' });

		function step(label, tooltip, glyph, page, disabled) {
			return el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--ghost efm-btn--sm efm-pagination__step',
				'aria-label': tooltip,
				disabled: disabled || !!state.loadingMore,
				onclick: function () { onPick(page); }
			}, glyph === 'back'
				? [icon('back', 'sm'), el('span', { text: label })]
				: [el('span', { text: label }), icon('forward', 'sm')]);
		}

		list.appendChild(step(
			s('previous', 'Previous'),
			s('previousPage', 'Go to previous page'),
			'back',
			current - 1,
			current === 0
		));

		pageWindow(current, count).forEach(function (page) {
			if (page === null) {
				list.appendChild(el('span', { class: 'efm-pagination__gap', 'aria-hidden': 'true', text: '\u2026' }));
				return;
			}

			var on = page === current;

			list.appendChild(el('button', {
				type: 'button',
				class: 'efm-pagination__page' + (on ? ' is-on' : ''),
				'aria-label': s('goToPage', 'Go to page') + ' ' + (page + 1),
				'aria-current': on ? 'page' : null,
				disabled: !!state.loadingMore,
				text: String(page + 1),
				onclick: function () { onPick(page); }
			}));
		});

		list.appendChild(step(
			s('next', 'Next'),
			s('nextPage', 'Go to next page'),
			'forward',
			current + 1,
			current >= count - 1
		));

		return el('nav', {
			class: 'efm-pagination',
			role: 'navigation',
			'aria-label': s('pagination', 'Pagination')
		}, [list]);
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
			/*
			 * Full height rather than --sm. This is the middle control of the Google
			 * Fonts toolbar, and the Library's New family button is the same control
			 * in the same slot of the same row at the full 28: a small button here
			 * made the one row four pixels shorter than the other for no reason the
			 * reader could see. --sm belongs to buttons inside cards, dialogs and
			 * popovers, which is where the other sixteen uses of it are.
			 */
			class: 'efm-btn efm-btn--outline',
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
	/*
	 * A div rather than a label: every control this wraps is now a dropdown,
	 * which is a button, and a label wrapping a button associates with nothing
	 * and does not forward a click to it.
	 */
	function filterField(labelText, control) {
		return el('div', { class: 'efm-field' }, [
			el('span', { class: 'efm-field__label', text: labelText }),
			control
		]);
	}

	/**
	 * A select rendered as a popover instead of the operating system's list.
	 *
	 * A native select's list is drawn by the OS, so it ignores the panel's
	 * colours, type and corner radius entirely. This is the same surface as the
	 * Filters popover, which is what makes every chooser in the panel match.
	 *
	 * @param {object} config
	 *   key      Stable id. Identifies the open menu across a re-render.
	 *   value    Currently selected value.
	 *   options  Array of { value, label }.
	 *   onselect Called with the chosen value.
	 *   label    Accessible name, when no visible label sits beside it.
	 * @return {HTMLElement} Trigger and menu in a positioned wrapper.
	 */
	/**
	 * A field that suggests without constraining.
	 *
	 * dropdown() locks its value to one of its options, which is right for the
	 * nine closed sets in this panel and wrong for a fallback stack: any valid CSS
	 * font list is allowed, so the suggestions have to sit beside the field rather
	 * than replace it. This was a native <datalist>, and a datalist's list is drawn
	 * by the operating system -- the last OS-drawn menu left in the panel after
	 * 0.26.0 replaced the selects, missed then because it is an input, not a select.
	 *
	 * @param {object} config key, label, input, options, onpick.
	 * @return {HTMLElement}
	 */
	function suggestField(config) {
		var open = state.openMenu === config.key;
		var menuId = 'efm-suggest-' + config.key;

		/*
		 * Picking a suggestion puts the caret back in the field rather than on the
		 * arrow. The field is where the work is -- a stack is often edited after a
		 * suggestion rather than accepted whole -- and the caller has already given
		 * the input a key for surviving the re-render, so reusing it means the two
		 * cannot drift apart. The input sits before the menu in the wrapper, so it
		 * is what the restore finds first.
		 */
		var focusKey = config.input.getAttribute('data-efm-focus') || 'suggest-' + config.key;

		/*
		 * Opening from the field never closes it again. Etch's combobox binds one
		 * handler to the input for exactly this -- `open || setOpen(true)`, read
		 * off the builder bundle -- and the reason is that a click inside free text
		 * is usually aimed at the caret: toggling there would shut the list on the
		 * second attempt to position it. The arrow keeps the toggle.
		 *
		 * @param {boolean} enter Move focus into the list rather than leaving it in
		 *                        the field.
		 */
		function openSuggestions(enter) {
			if (state.openMenu !== config.key) {
				state.openMenu = config.key;
				render();
			}

			revealMenu(config.key, !enter);
		}

		/*
		 * The whole field is the trigger, so the input carries the combobox role
		 * and the expanded state, and the arrow is a pointer affordance rather than
		 * a second tab stop. That is the editable-combobox-with-button pattern, and
		 * it is what Etch does: its arrow lives in a bare `all: unset` trigger while
		 * the input holds role="combobox" and aria-autocomplete="list".
		 */
		config.input.setAttribute('role', 'combobox');
		config.input.setAttribute('aria-expanded', open ? 'true' : 'false');
		config.input.setAttribute('aria-controls', menuId);
		config.input.setAttribute('aria-autocomplete', 'list');

		config.input.addEventListener('click', function () {
			openSuggestions(false);
		});

		config.input.addEventListener('keydown', function (event) {
			if ('ArrowDown' !== event.key) {
				return;
			}

			// The documented way into a combobox list from the keyboard, and the
			// reason the arrow does not need to be tabbable.
			event.preventDefault();
			openSuggestions(true);
		});

		var toggle = el('button', {
			type: 'button',
			class: 'efm-combo__toggle',
			tabindex: '-1',
			'aria-label': config.label,
			onclick: function () {
				if (state.openMenu === config.key) {
					closeMenu(false);

					return;
				}

				openSuggestions(false);
			}
		}, [icon('chevronDown', 'sm')]);

		var menu = el('div', {
			class: 'efm-popover efm-select__menu',
			id: menuId,
			role: 'listbox',
			'aria-label': config.label,
			'data-efm-menu': config.key,
			hidden: !open,
			onkeydown: function (event) {
				walkMenu(event, menu);
			}
		}, config.options.map(function (value) {
			// Matched against what is in the field, so a stack typed by hand that
			// happens to equal a suggestion is still shown as the current one.
			var on = value === (config.input.value || '');

			return el('button', {
				type: 'button',
				role: 'option',
				class: 'efm-select__option' + (on ? ' is-on' : ''),
				'aria-selected': on ? 'true' : 'false',
				'data-efm-focus': focusKey,
				onclick: function () {
					state.openMenu = '';
					config.onpick(value);
				}
			}, [
				el('span', { class: 'efm-select__option-label', text: value }),
				on ? icon('check', 'sm') : null
			]);
		}));

		// is-open drives the field's border the way it drives .efm-select__trigger's.
		return el('div', { class: 'efm-select efm-combo' + (open ? ' is-open' : '') }, [config.input, toggle, menu]);
	}

	function dropdown(config) {
		var open = state.openMenu === config.key;
		var focusKey = 'select-' + config.key;
		var current = null;

		config.options.forEach(function (option) {
			if (String(option.value) === String(config.value)) {
				current = option;
			}
		});

		var trigger = el('button', {
			type: 'button',
			class: 'efm-select__trigger' + (open ? ' is-open' : ''),
			'aria-haspopup': 'listbox',
			'aria-expanded': open ? 'true' : 'false',
			'aria-label': config.label || null,
			// Shared with the options below, so picking one returns focus here
			// rather than dropping it on the document.
			'data-efm-focus': focusKey,
			onclick: function () {
				if (open) {
					closeMenu(true);
					return;
				}

				state.openMenu = config.key;
				render();
				revealMenu(config.key);
			}
		}, [
			el('span', { class: 'efm-select__value', text: current ? current.label : (config.placeholder || '') }),
			icon('chevronDown', 'sm')
		]);

		var menu = el('div', {
			class: 'efm-popover efm-select__menu',
			role: 'listbox',
			'aria-label': config.label || null,
			'data-efm-menu': config.key,
			hidden: !open,
			onkeydown: function (event) {
				walkMenu(event, menu);
			}
		}, config.options.map(function (option) {
			var on = String(option.value) === String(config.value);

			return el('button', {
				type: 'button',
				role: 'option',
				class: 'efm-select__option' + (on ? ' is-on' : ''),
				'aria-selected': on ? 'true' : 'false',
				'data-efm-focus': focusKey,
				onclick: function () {
					state.openMenu = '';
					config.onselect(option.value);

					// Some callers only refresh the header, so the pane is redrawn
					// here to close the menu and show the new value either way.
					render();
				}
			}, [
				el('span', { class: 'efm-select__option-label', text: option.label }),
				on ? icon('check', 'sm') : null
			]);
		}));

		return el('div', { class: 'efm-select' }, [trigger, menu]);
	}

	/**
	 * Close the open dropdown.
	 *
	 * @param {boolean} refocus Send focus back to the trigger.
	 */
	function closeMenu(refocus) {
		if (!state.openMenu) {
			return;
		}

		var key = state.openMenu;

		state.openMenu = '';
		render();

		if (!refocus) {
			return;
		}

		var trigger = manager.querySelector('[data-efm-focus="select-' + key + '"]');

		if (trigger) {
			trigger.focus();
		}
	}

	/**
	 * Place the newly opened menu and put focus in it.
	 *
	 * @param {string} key Dropdown key.
	 */
	/**
	 * Arrow keys inside an open menu.
	 *
	 * The list is the focus ring, so the arrows walk it and wrap at both ends
	 * rather than leaving the menu.
	 *
	 * @param {KeyboardEvent} event Key event.
	 * @param {Element}       menu  The open menu.
	 */
	function walkMenu(event, menu) {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
			return;
		}

		event.preventDefault();

		var items = Array.prototype.slice.call(menu.querySelectorAll('.efm-select__option'));
		var at = items.indexOf(document.activeElement);
		var next = event.key === 'ArrowDown' ? at + 1 : at - 1;

		if (next < 0) {
			next = items.length - 1;
		} else if (next >= items.length) {
			next = 0;
		}

		if (items[next]) {
			items[next].focus();
		}
	}

	function revealMenu(key, keepFocus) {
		var menu = manager.querySelector('[data-efm-menu="' + key + '"]');

		if (!menu) {
			return;
		}

		/*
		 * The pane scrolls, so a menu opening near its foot would be cut off.
		 * Flipped above the trigger when it does not fit below and the pane is
		 * tall enough to hold it there.
		 */
		var box = menu.getBoundingClientRect();
		var pane = contentEl.getBoundingClientRect();

		if (box.bottom > pane.bottom && box.height < pane.height) {
			menu.classList.add('is-above');
		}

		/*
		 * A combobox opened by clicking its own field keeps the caret there: the
		 * point of suggesting rather than constraining is that you can carry on
		 * typing with the list up. Every other caller wants the list to take focus,
		 * so that stays the default.
		 */
		if (keepFocus) {
			return;
		}

		var target = menu.querySelector('.efm-select__option.is-on') || menu.querySelector('.efm-select__option');

		if (target) {
			target.focus();
		}
	}

	/**
	 * Row / Grid switch.
	 *
	 * Row is for judging a face at reading length, grid for scanning the
	 * catalogue. The choice only caps density: the grid itself is
	 * container-driven, so a narrow panel still collapses to one column whatever
	 * is selected here.
	 */
	function layoutToggle() {
		var labels = {
			row: s('layoutRow', 'Row'),
			grid: s('layoutGrid', 'Grid')
		};

		/*
		 * Icon and label together, not icon alone: the layouts are not
		 * self-evident from a glyph, and dropping the labels would trade
		 * discoverability for a few pixels of toolbar width.
		 */
		var glyphs = {
			row: 'layoutRow',
			grid: 'layoutGrid'
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
	function specimen(family, subsets, script, variation) {
		return el('p', {
			class: 'efm-specimen',
			'data-efm-specimen': 'true',
			'data-efm-subsets': (subsets || []).join(','),
			'data-efm-script': script || '',
			text: sampleFor({ subsets: subsets || [], script: script || '' }),
			/*
			 * The instance the family carries, so the preview shows the face the
			 * site will actually render rather than the default cut. 'normal' is
			 * the CSS-wide way of saying "no instance", which is what a family
			 * without a tuned variation wants.
			 */
			style: {
				'font-family': familyStack(family),
				'font-size': state.previewSize + 'px',
				'font-variation-settings': variation || 'normal'
			}
		});
	}

	/**
	 * The state a view ends in when it has nothing to show.
	 *
	 * Shaped like Etch's Assets Library empty state, which is what the Upload
	 * screen already follows: it fills the pane and centres on it rather than
	 * leaving a line of small print at the top of a screen of nothing.
	 *
	 * @param {string} title    What is missing.
	 * @param {string} [hint]   One line on what to do about it.
	 * @param {Array}  [acts]   Buttons, each { label, onclick, variant }. The
	 *                          first takes the primary fill and the rest outline.
	 * @return {Element} The empty state.
	 */
	function emptyState(title, hint, acts) {
		var actions = (acts || []).filter(function (action) {
			return action && action.label;
		});

		return el('div', { class: 'efm-empty' }, [
			el('p', { class: 'efm-empty__title', text: title }),
			hint ? el('p', { class: 'efm-empty__hint', text: hint }) : null,
			actions.length ? el('div', { class: 'efm-empty__actions' }, actions.map(function (action, at) {
				return el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--' + (action.variant || (at === 0 ? 'primary' : 'outline')),
					text: action.label,
					onclick: action.onclick
				});
			})) : null
		]);
	}

	/**
	 * The state a search with no matches ends in.
	 *
	 * Etch's Asset Manager answers a fruitless search by repeating the term back
	 * in the middle of the empty pane rather than with a line of small print, so
	 * this does the same: same wording, same 24px title, same bold italic term,
	 * same muted hint under it.
	 *
	 * @param {string}  query    What was searched for.
	 * @param {Element} [action] Optional control below the hint.
	 * @return {Element} The empty state.
	 */
	function searchEmpty(query, action) {
		return el('div', { class: 'efm-search-empty' }, [
			el('p', { class: 'efm-search-empty__title' }, [
				s('noResultsFor', 'No results for') + ' ',
				el('strong', { class: 'efm-search-empty__query', text: query })
			]),
			el('p', { class: 'efm-search-empty__hint', text: s('checkSpelling', 'Please check your spelling.') }),
			action || null
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
		dropRolesIfIdle(index);
		render();
	}

	/**
	 * Move a family to the trash. The record and every file stay put; only the
	 * output stops, so restoring costs nothing.
	 *
	 * @param {number} index Family index.
	 */
	/*
	 * Kept in the order the generated stylesheet writes them, so the panel and the
	 * CSS agree about which token comes first.
	 */
	var ROLE_KEYS = ['heading', 'text'];

	/**
	 * A family's Apply to list, split into its individual selectors.
	 *
	 * @param {Object} family Family record.
	 * @return {string[]}
	 */
	function selectorParts(family) {
		return String(family.selector || '').split(',').map(function (part) {
			return part.trim();
		}).filter(Boolean);
	}

	/*
	 * Mirrors ROLE_SELECTORS in class-efm-fonts.php. A role publishes
	 * --{role}-font-family and Automatic.css turns that into a rule for these
	 * selectors once its Typography section is configured, so naming one in Apply
	 * to as well would write a second rule for the same element and leave source
	 * order to settle it:
	 *
	 *     h1,h2,h3,h4,h5,h6 { font-family: var(--heading-font-family); }
	 *     body, p, li, a, button { font-family: var(--text-font-family); }
	 */
	var ROLE_SELECTORS = {
		heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
		text: ['body', 'p', 'li', 'a', 'button']
	};

	/**
	 * Which role, if any, already answers for a selector this family holds.
	 *
	 * @param {Object} family Family record.
	 * @param {string} part   One selector from the Apply to list.
	 * @return {string} Role key, or empty.
	 */
	function roleCovering(family, part) {
		var needle = part.toLowerCase();
		var found = null;

		ROLE_KEYS.forEach(function (role) {
			if (found || ROLE_SELECTORS[role].indexOf(needle) === -1) {
				return;
			}

			/*
			 * Whichever family holds it, not just this one. A token and a plain
			 * selector aiming at the same element is a fight the selector wins, so
			 * the two features are kept from overlapping: the tokens own these tags
			 * and Apply to owns everything they do not. Asking only about this
			 * family let a second one quietly take h1 from whoever held the token.
			 */
			var holder = familyHolding(role);

			if (holder) {
				found = { role: role, name: holder.name || '', mine: (holder.name || '') === (family.name || '') };
			}
		});

		return found;
	}

	/**
	 * The Apply to selectors a role has taken over, and those still written.
	 *
	 * @param {Object} family Family record.
	 * @return {{kept: string[], covered: string[]}}
	 */
	function splitSelectors(family) {
		var kept = [];
		var covered = [];
		var holders = [];

		selectorParts(family).forEach(function (part) {
			var by = roleCovering(family, part);

			if (!by) {
				kept.push(part);

				return;
			}

			covered.push(part);

			if (!by.mine && by.name && holders.indexOf(by.name) === -1) {
				holders.push(by.name);
			}
		});

		return { kept: kept, covered: covered, holders: holders };
	}



	/**
	 * Other live families applying themselves to the same selector.
	 *
	 * Exact matches between comma-separated parts only. Two families both naming
	 * h1 is a genuine collision -- build_css() writes both rules and the later one
	 * silently wins -- and it can be found by comparing strings. Whether ".card h1"
	 * overlaps "h1" is a cascade question, not a string question, so it is left
	 * alone rather than guessed at.
	 *
	 * @param {number} index Family index to check.
	 * @return {Array} Entries of { name, parts }.
	 */
	function selectorClashes(index) {
		var mine = selectorParts(state.families[index] || {});

		if (!mine.length) {
			return [];
		}

		var out = [];

		state.families.forEach(function (family, at) {
			if (at === index || isTrashed(family) || !isEnabled(family) || !(family.variants || []).length) {
				return;
			}

			var shared = selectorParts(family).filter(function (part) {
				return mine.indexOf(part) !== -1;
			});

			if (shared.length) {
				out.push({ name: family.name, parts: shared });
			}
		});

		return out;
	}

	function hasRole(family, role) {
		return (family.roles || []).indexOf(role) !== -1;
	}

	/**
	 * The live family currently holding a role, if any.
	 *
	 * @param {string} role Role key.
	 * @return {?Object} The family, or null.
	 */
	function familyHolding(role) {
		/*
		 * The same liveness test token_css() applies before emitting anything.
		 * A family that is trashed, switched off, or maps no file writes no token,
		 * so it holds nothing -- and saying otherwise made the panel drop an Apply
		 * to selector that the stylesheet went on to write, which is the two
		 * disagreeing about what is on the page.
		 */
		return state.families.filter(function (family) {
			return !isTrashed(family) &&
				isEnabled(family) &&
				(family.variants || []).length &&
				hasRole(family, role);
		})[0] || null;
	}

	/**
	 * Give a role to one family, taking it from whoever had it.
	 *
	 * @param {number}  index Family index.
	 * @param {string}  role  Role key.
	 * @param {boolean} on    Whether this family should hold it.
	 */
	function setRole(index, role, on) {
		state.families.forEach(function (family, at) {
			var roles = (family.roles || []).filter(function (held) {
				return held !== role;
			});

			if (on && at === index) {
				roles.push(role);
			}

			family.roles = roles.sort();
		});

		render();
	}

	/**
	 * Who held a role at the last save.
	 *
	 * Derived from the saved snapshot rather than remembered when the toggle is
	 * pressed, for the same reason the dirty flag is derived: a stored fact would
	 * have to be cleared on save, on discard and on reload, and the one that got
	 * missed would leave the panel reporting a handover that no longer exists.
	 *
	 * @param {string} role Role key.
	 * @return {string} Family name, or empty when nothing held it.
	 */
	function savedHolder(role) {
		var before;

		try {
			before = JSON.parse(state.saved || '[]');
		} catch (error) {
			return '';
		}

		var held = before.filter(function (family) {
			return !family.trashed && (family.roles || []).indexOf(role) !== -1;
		})[0];

		return held ? held.name || '' : '';
	}

	/**
	 * Drop the roles of a family that is no longer live.
	 *
	 * The server does this on every save -- a disabled or trashed family emits no
	 * @font-face, so a token pointing at it would name a font the page never loads
	 * -- and the panel has to do the same or the two disagree about what was
	 * saved. Doing it here also puts the loss in the save bar, where "Sekuya no
	 * longer used for headings" is visible before you commit rather than after.
	 *
	 * @param {number} index Family index.
	 */
	function dropRolesIfIdle(index) {
		var family = state.families[index];

		if (!family || !(family.roles || []).length) {
			return;
		}

		if (isTrashed(family) || !isEnabled(family)) {
			family.roles = [];
		}
	}

	function trashFamily(index) {
		var family = state.families[index];

		family.trashed = true;
		dropRolesIfIdle(index);
		state.editing = null;
		render();
	}

	/**
	 * Move a selection of live families to the trash.
	 *
	 * No confirmation, deliberately: the single-card button it mirrors asks none
	 * either, because nothing is destroyed. The families keep their files and
	 * their mapping and the Trash screen restores them exactly as they were. The
	 * question is asked there, where deleting is permanent.
	 */
	function trashPickedFamilies() {
		state.families.forEach(function (family, at) {
			if (!isTrashed(family) && state.pickedFamilies.indexOf(family.name) !== -1) {
				family.trashed = true;
				dropRolesIfIdle(at);
			}
		});

		state.pickedFamilies = [];
		state.editing = null;
		render();
	}

	/**
	 * Families that were moved to the trash, with restore and permanent delete.
	 * Deleting here drops the record only; the files stay on disk and show up
	 * under unused files in Import & export.
	 */
	function renderTrash() {
		var inTrash = trashedFamilies();

		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('trash', 'Trash') }));

		/*
		 * The view is reachable at any time now, so it has to answer for itself
		 * when there is nothing in it. Before, it could only be opened once it had
		 * contents; empty, it would have drawn a hint about restoring above a
		 * "Restore all (0)", an "Empty trash" that empties nothing, and a grid of
		 * no cards.
		 */
		if (!inTrash.length) {
			/*
			 * Outline rather than the primary fill. An empty trash is the state you
			 * want, not a problem to solve, so the way out is offered without being
			 * urged; the library's empty state fills its first button because there
			 * the emptiness is the thing to fix.
			 */
			contentEl.appendChild(emptyState(
				s('trashEmpty', 'The trash is empty'),
				s('trashEmptyHint', 'Families you delete from the library wait here, and can be restored until you empty it.'),
				[{
					label: s('backToLibrary', 'Back to the font library'),
					variant: 'outline',
					onclick: function () { go('library'); }
				}]
			));

			return;
		}

		contentEl.appendChild(el('p', {
			class: 'efm-muted',
			text: s('trashHint', 'These families are not loaded on the site. Their font files are still on the server, so restoring one brings it back exactly as it was.')
		}));

		var everyTrashed = inTrash.map(function (family) { return family.name; });

		var trashBar = bulkBar(state.pickedTrash, everyTrashed, [
			{
				label: s('restoreSelected', 'Restore selected'),
				onclick: restorePickedTrash
			},
			{
				label: s('deleteSelected', 'Delete selected'),
				variant: 'danger',
				onclick: deletePickedTrash
			}
		]);

		if (trashBar) {
			contentEl.appendChild(el('div', { class: 'efm-resultbar' }, [el('span', {}), trashBar]));
		}

		contentEl.appendChild(el('div', { class: 'efm-card__actions' }, [
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--outline efm-btn--sm',
				onclick: function () {
					state.families.forEach(function (family) {
						family.trashed = false;
					});
					render();
				}
			}, [icon('restore', 'sm'), el('span', { text: s('restoreAll', 'Restore all') + ' (' + inTrash.length + ')' })]),
			el('button', {
				type: 'button',
				// Empties the trash for good, so it wears the same danger variant as
				// every other delete. Restore all beside it stays outline: it is the
				// recovering answer, and two identical buttons either side of that
				// difference is how a trash gets emptied by accident.
				class: 'efm-btn efm-btn--danger efm-btn--sm',
				onclick: function () {
					var doomed = [];

					state.families.forEach(function (family, at) {
						if (isTrashed(family)) {
							doomed.push(at);
						}
					});

					var orphans = orphanedBy(doomed);

					/*
					 * Ticked for the user only when every family going is a Google
					 * install, because that is the case where the files are a click
					 * from coming back. One uploaded family in the selection and the
					 * offer goes back to being off, since the buttons delete the
					 * whole list either way.
					 */
					var recoverable = doomed.every(function (at) {
						return fromGoogle(state.families[at]);
					});
					var also = { checked: orphans.length ? recoverable : false };

					askConfirm({
						// Every card in the trash view, which is the whole of what goes.
						mark: Array.prototype.slice.call(contentEl.querySelectorAll('.efm-card')),
						title: s('emptyTrash', 'Empty trash'),
						message: recoverable
							? s('confirmEmptyTrashGoogle', 'Delete every family in the trash for good? Their font files can be downloaded from Google Fonts again.')
							: s('confirmEmptyTrash', 'Delete every family in the trash for good? Their font files stay on the server and can be removed from Import & export.'),
						confirm: s('deleteAction', 'Delete'),
						danger: true,
						checkbox: orphans.length ? {
							state: also,
							label: s('alsoDeleteFiles', 'Also delete its font files') + ' \u00b7 ' +
								orphans.length + ' ' + plural(orphans.length, s('fileSingular', 'file'), s('filesLower', 'files')) +
								' \u00b7 ' + formatSize(sizeOfFiles(orphans))
						} : null
					}).then(function (answer) {
						if ('confirm' !== answer) {
							return;
						}

						if (also.checked) {
							state.pendingFileDeletes = state.pendingFileDeletes.concat(orphans);
						}

						emptyTrash();
					});
				}
			}, [icon('trash', 'sm'), el('span', { text: s('emptyTrash', 'Empty trash') })])
		]));

		renderTrashGrid();
	}

	/**
	 * Indexes of the trashed families a selection names.
	 *
	 * Resolved at the moment of acting rather than held, because a restore or a
	 * delete renumbers everything after it.
	 *
	 * @return {number[]} Indexes into state.families.
	 */
	/**
	 * Remove the selected variants from a family.
	 *
	 * No confirmation, matching the single remove beside each row: this edits the
	 * buffer rather than the server, so Discard on the save bar undoes it and the
	 * font files are untouched either way.
	 *
	 * @param {number} familyIndex Family being edited.
	 */
	function removePickedVariants(familyIndex) {
		var family = state.families[familyIndex];
		var picks = variantPicks(familyIndex);

		if (!family || !picks.length) {
			return;
		}

		// Highest first, so removing one cannot shift the next.
		picks.map(Number).sort(function (a, b) { return b - a; }).forEach(function (at) {
			(family.variants || []).splice(at, 1);
		});

		state.pickedVariants = { family: familyIndex, list: [] };
		render();
	}

	function pickedTrashIndexes() {
		var out = [];

		state.families.forEach(function (family, at) {
			if (isTrashed(family) && state.pickedTrash.indexOf(family.name) !== -1) {
				out.push(at);
			}
		});

		return out;
	}

	function restorePickedTrash() {
		pickedTrashIndexes().forEach(function (at) {
			state.families[at].trashed = false;
		});

		state.pickedTrash = [];
		render();
	}

	/**
	 * Delete a selection of trashed families for good.
	 *
	 * The same question the single delete asks, over a list: the files offered are
	 * the ones no surviving family maps once the whole selection is gone, which is
	 * why orphanedBy() takes the indexes together rather than one at a time.
	 */
	function deletePickedTrash() {
		var doomed = pickedTrashIndexes();

		if (!doomed.length) {
			return;
		}

		var names = doomed.map(function (at) { return state.families[at].name; });
		var orphans = orphanedBy(doomed);
		var recoverable = doomed.every(function (at) { return fromGoogle(state.families[at]); });
		var also = { checked: orphans.length ? recoverable : false };

		askConfirm({
			mark: Array.prototype.slice.call(contentEl.querySelectorAll('.efm-card')).filter(function (card) {
				var title = card.querySelector('.efm-card__title');

				return title && names.indexOf(title.textContent) !== -1;
			}),
			title: s('deleteFamilies', 'Delete permanently'),
			message: recoverable
				? s('confirmDeleteFamiliesGoogle', 'Delete these families for good? Their font files can be downloaded from Google Fonts again.')
				: s('confirmDeleteFamilies', 'Delete these families for good? Their font files stay on the server and can be removed from Import & export.'),
			list: names,
			confirm: s('deleteAction', 'Delete'),
			danger: true,
			checkbox: orphans.length ? {
				state: also,
				label: s('alsoDeleteFiles', 'Also delete its font files') + ' \u00b7 ' +
					orphans.length + ' ' + plural(orphans.length, s('fileSingular', 'file'), s('filesLower', 'files')) +
					' \u00b7 ' + formatSize(sizeOfFiles(orphans))
			} : null
		}).then(function (answer) {
			if ('confirm' !== answer) {
				return;
			}

			if (also.checked) {
				state.pendingFileDeletes = state.pendingFileDeletes.concat(orphans);
			}

			// Highest index first, so removing one cannot shift the next.
			doomed.slice().sort(function (a, b) { return b - a; }).forEach(function (at) {
				state.families.splice(at, 1);
			});

			state.pickedTrash = [];
			state.editing = null;
			render();
		});
	}

	function emptyTrash() {
		state.families = state.families.filter(function (family) {
			return !isTrashed(family);
		});
		state.editing = null;
		render();
	}

	function renderTrashGrid() {
		var grid = el('div', { class: 'efm-grid' });

		state.families.forEach(function (family, index) {
			if (!isTrashed(family)) {
				return;
			}

			var variants = family.variants || [];
			/*
			 * Read once and used twice, so the border and the checkbox cannot
			 * disagree about whether this card is selected.
			 */
			var picked = state.pickedTrash.indexOf(family.name) !== -1;

			/*
			 * The same accent edge the Google Fonts grid draws on a selected card.
			 * .efm-card already carries a transparent 1px border for exactly this --
			 * the rule says so -- and .efm-card.is-picked already colours it, so the
			 * only thing missing here was the card asking for the class. Selecting in
			 * the trash moved nothing but a checkbox, which is the one place in the
			 * panel where the selection decides whether families are destroyed.
			 */
			grid.appendChild(el('article', { class: 'efm-card' + (picked ? ' is-picked' : '') }, [
				el('div', { class: 'efm-card__head' }, [
					el('label', { class: 'efm-card__pick' }, [
						el('input', {
							type: 'checkbox',
							class: 'efm-checkbox',
							checked: picked,
							'aria-label': s('selectFamily', 'Select') + ' ' + family.name,
							onchange: function () {
								togglePicked(state.pickedTrash, family.name);
							}
						})
					]),
					el('h2', { class: 'efm-card__title', text: family.name }),
					el('div', { class: 'efm-card__actions' }, [
						el('button', {
							type: 'button',
							class: 'efm-btn efm-btn--outline efm-btn--sm',
							onclick: function () {
								family.trashed = false;
								render();
							}
						}, [icon('restore', 'sm'), el('span', { text: s('restoreFamily', 'Restore') })]),
						el('button', {
							type: 'button',
							class: 'efm-icon-btn efm-icon-btn--danger efm-tooltip efm-tooltip--end',
							'aria-label': s('deleteFamily', 'Delete permanently'),
							'data-efm-tooltip': s('deleteFamily', 'Delete permanently'),
							onclick: function (event) {
								var orphans = orphanedBy([index]);
								var recoverable = fromGoogle(family);
								var also = { checked: orphans.length ? recoverable : false };

								askConfirm({
									// Read off the event rather than captured, so the card
									// this button actually sits in is the one marked.
									mark: [event.currentTarget.closest('.efm-card')],
									title: s('deleteFamily', 'Delete permanently'),
									message: recoverable
										? s('confirmDeleteFamilyGoogle', 'Delete this family for good? Its font files can be downloaded from Google Fonts again.')
										: s('confirmDeleteFamily', 'Delete this family for good? Its font files stay on the server and can be removed from Import & export.'),
									confirm: s('deleteAction', 'Delete'),
									danger: true,
									/*
									 * Offered rather than implied. A Google file is a
									 * click away from being downloaded again, so that
									 * one is ticked; an uploaded one is often the only
									 * copy there is, so that one is not. Only files no
									 * surviving family maps are listed either way.
									 */
									checkbox: orphans.length ? {
										state: also,
										label: s('alsoDeleteFiles', 'Also delete its font files') + ' \u00b7 ' +
											orphans.length + ' ' + plural(orphans.length, s('fileSingular', 'file'), s('filesLower', 'files')) +
											' \u00b7 ' + formatSize(sizeOfFiles(orphans))
									} : null
								}).then(function (answer) {
									if ('confirm' !== answer) {
										return;
									}

									if (also.checked) {
										state.pendingFileDeletes = state.pendingFileDeletes.concat(orphans);
									}

									state.families.splice(index, 1);
									state.editing = null;
									render();
								});
							}
							// Card rows carry --sm buttons, whose glyphs are one step
							// down. The box stays the control height either way.
						}, [icon('trash', 'sm')])
					])
				]),
				el('div', { class: 'efm-card__meta' }, [
					el('span', { text: variants.length + ' ' + plural(variants.length, s('variant', 'variant'), s('variants', 'variants')) }),
					// The delete below offers to take the files with it, so the
					// one fact that decides the answer belongs on the card.
					el('span', {
						text: fromGoogle(family) ? s('googleSource', 'Google Fonts') : s('sourceUpload', 'Uploaded')
					})
				])
			]));
		});

		contentEl.appendChild(grid);
	}

	function renderLibrary() {
		var search = el('input', {
			type: 'search',
			class: 'efm-input',
			'data-efm-focus': 'library-filter',
			placeholder: s('filterFamilies', 'Filter families'),
			value: state.filter,
			// Same split as the Google search: read now, redraw later.
			oninput: function (event) {
				state.filter = event.target.value;
				queueRender();
			}
		});

		contentEl.appendChild(previewToolbar(
			el('div', { class: 'efm-toolbar__lead' }, [
				el('div', { class: 'efm-search' }, [
					icon('search', 'sm'),
					clearableField(search, s('clearFilter', 'Clear filter'), function () {
						state.filter = '';
						render();
					})
				]),
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--outline',
					onclick: addFamily
				}, [icon('plus', 'sm'), el('span', { text: s('newFamily', 'New family') })]),
				layoutToggle()
			])
		));

		if (!liveFamilies().length) {
			/*
			 * The hint names two routes out, so both are offered. It used to say
			 * "Upload a font file or install one from Google Fonts" over a single
			 * Google Fonts button, leaving the reader to find the other one.
			 */
			/*
			 * Font files can already be sitting in wp-content/fonts before this plugin
			 * ever runs -- Etch shares that folder, the legacy plugin used it, and a
			 * reinstall leaves its own behind. They show on the Upload screen as
			 * unused, but nothing had ever offered to make families of them, so an
			 * empty library on a full folder read as a plugin that could not see them.
			 */
			var waiting = unmappedFiles();
			var routes = [
				{ label: s('googleFonts', 'Google Fonts'), onclick: function () { go('google'); } },
				{ label: s('upload', 'Upload font files'), onclick: function () { go('upload'); } }
			];

			if (waiting.length) {
				routes.unshift({
					label: s('adoptFiles', 'Add the files already here') + ' (' + waiting.length + ')',
					onclick: function () { adoptFiles(waiting); }
				});
			}

			contentEl.appendChild(emptyState(
				s('noFamilies', 'No font families yet.'),
				waiting.length
					? s('noFamiliesFound', 'There are font files on the server that no family uses yet. They can be taken into the library, or start fresh from Google Fonts.')
					: s('noFamiliesHint', 'Upload a font file or install one from Google Fonts.'),
				routes
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

		// Only reachable with a filter typed in: an unfiltered library with no
		// families at all was answered by the empty state above.
		if (!list.length) {
			contentEl.appendChild(searchEmpty(state.filter.trim()));
			return;
		}

		/*
		 * The same selection the Trash and the file tables already offer, on the one
		 * screen that did not. Scoped to what is on screen: everyFamily is built from
		 * the filtered list, so Select all means the ones the filter left showing
		 * rather than a library the reader cannot see.
		 */
		var everyFamily = list.map(function (row) { return row.family.name; });

		// Anything the filter hid stops being selected, so a bulk action cannot reach
		// a family that is not on screen.
		state.pickedFamilies = state.pickedFamilies.filter(function (name) {
			return everyFamily.indexOf(name) !== -1;
		});

		var libraryBar = bulkBar(state.pickedFamilies, everyFamily, [
			{
				label: s('trashSelected', 'Move selected to trash'),
				variant: 'danger',
				onclick: trashPickedFamilies
			}
		]);

		if (libraryBar) {
			contentEl.appendChild(el('div', { class: 'efm-resultbar' }, [el('span', {}), libraryBar]));
		}

		var grid = el('div', { class: gridClass() });

		list.forEach(function (row) {
			var family = row.family;
			// Read once and used twice, so the border and the checkbox cannot disagree.
			var picked = state.pickedFamilies.indexOf(family.name) !== -1;
			var variants = family.variants || [];
			var weights = variants.map(function (v) { return v.weight; }).filter(function (w, i, arr) { return arr.indexOf(w) === i; }).sort();
			var subsetList = variants.map(function (v) { return v.subset; }).filter(function (sub, i, arr) {
				return sub && arr.indexOf(sub) === i;
			}).sort();

			var enabled = isEnabled(family);
			var gone = missingFor(family);

			grid.appendChild(
				el('article', { class: 'efm-card' + (enabled ? '' : ' is-disabled') + (picked ? ' is-picked' : '') }, [
					el('div', { class: 'efm-card__head' }, [
						el('label', { class: 'efm-card__pick' }, [
							el('input', {
								type: 'checkbox',
								class: 'efm-checkbox',
								checked: picked,
								'aria-label': s('selectFamily', 'Select') + ' ' + family.name,
								onchange: function () {
									togglePicked(state.pickedFamilies, family.name);
								}
							})
						]),
						el('h2', { class: 'efm-card__title', text: family.name }),
						/*
						 * A badge, not the full-width notice this used to be. That
						 * notice sat between the title and the specimen, so in the
						 * grid every disabled card pushed its specimen down and the
						 * row stopped lining up. The wording moves to the button's
						 * title, where it is still reachable.
						 */
						enabled ? null : el('span', { class: 'efm-badge efm-badge--muted', text: s('disabledLabel', 'Disabled') }),
						/*
						 * The role chips 0.17.0 removed, back because something can be
						 * assigned again. They went then because nothing could: the mapping
						 * had been deleted and the chips could never light up.
						 */
						hasRole(family, 'heading')
							? el('span', { class: 'efm-badge', text: s('roleHeadingChip', 'Headings') })
							: null,
						hasRole(family, 'text')
							? el('span', { class: 'efm-badge', text: s('roleTextChip', 'Body text') })
							: null,
						/*
						 * A family with no variants at all, which is what deleting the last
						 * file it mapped leaves behind. The footer counted "0 variants" and
						 * nothing else said the card was inert -- it still named a family and
						 * still published a CSS variable, while generating no @font-face.
						 */
						variants.length ? null : el('span', {
							class: 'efm-badge efm-badge--warn efm-tooltip efm-tooltip--wrap',
							'data-efm-tooltip': s('emptyNotice', 'This family maps no font files, so it loads nothing. Add a variant from Manage, or move the family to the trash.'),
							text: s('emptyLabel', 'No files')
						}),
						/*
						 * Nothing else said so. The specimen renders in whatever the
						 * browser falls back to, which on the machine that did the
						 * export is often the real face out of its own cache, so the
						 * card looked correct and the site loaded nothing.
						 */
						gone.length ? el('span', {
							class: 'efm-badge efm-badge--warn efm-tooltip efm-tooltip--wrap',
							'data-efm-tooltip': s('missingNotice', 'These files are not on the server, so this family loads nothing. Upload them, or reinstall the family from Google Fonts.') + ' ' + gone.join(', '),
							text: s('missingLabel', 'Files missing')
						}) : null,
						el('div', { class: 'efm-card__actions' }, [
							el('button', {
								type: 'button',
								// The explanation is only worth a tooltip while it applies.
								class: 'efm-btn efm-btn--outline efm-btn--sm' + (enabled ? '' : ' efm-tooltip efm-tooltip--wrap'),
								'aria-pressed': enabled ? 'true' : 'false',
								'data-efm-tooltip': enabled ? null : s('disabledNotice', 'Disabled. Its files are kept, but it is not loaded on the site.'),
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
								class: 'efm-icon-btn efm-icon-btn--danger efm-tooltip efm-tooltip--end',
								'aria-label': s('trashFamily', 'Move to trash'),
								'data-efm-tooltip': s('trashFamily', 'Move to trash'),
								onclick: function () {
									trashFamily(row.index);
								}
								// Card rows carry --sm buttons, whose glyphs are one step
								// down. The box stays the control height either way.
							}, [icon('trash', 'sm')])
						])
					]),
					// Carries the tuned instance too, so the card previews the face the
					// site renders rather than the default cut.
					specimen(family.name, subsetList, '', family.variation),
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
					// Same geometry as the panel header's back button, above. Start
					// anchored because this one sits at the content pane's edge, which
					// would clip a centred tooltip of this length.
					class: 'efm-btn efm-btn--outline efm-tooltip efm-tooltip--start',
					// Named for where it lands, not for the direction it points.
					'aria-label': s('backToLibrary', 'Back to the font library'),
					'data-efm-tooltip': s('backToLibrary', 'Back to the font library'),
					onclick: function () {
						state.editing = null;
						render();
					}
				}, [icon('back', 'sm')])
			])
		);

		/*
		 * The same shape the type tester uses: the way back on its own row, then the
		 * family name as this view's heading with a rule under it. It shared a line
		 * with the button before, which meant the rule could only run as far as the
		 * word did.
		 */
		contentEl.appendChild(el('h2', { class: 'efm-detail__title', text: family.name }));

		contentEl.appendChild(previewToolbar(null));
		contentEl.appendChild(specimen(family.name, null, '', family.variation));

		/*
		 * The tuning the type tester offers before an install, offered again after
		 * one. The axes used to live only in the search results, so an instance died
		 * the moment you left the Google view: you could dial a face to exactly the
		 * weight you wanted, read the declaration off the screen, and your only way
		 * to keep it was to paste it into a stylesheet by hand.
		 *
		 * Directly under the preview, because that is the only place the sliders mean
		 * anything. They used to sit below Delivery and the Google block -- measured
		 * at 702px under the specimen, in a pane 711px tall, so reaching them scrolled
		 * the thing they change off the screen entirely.
		 *
		 * Read at upload, from the file itself, for any format the codec can open --
		 * which since the decoder was compiled in means WOFF2 as well as TTF, OTF and
		 * WOFF. A family installed before that could read nothing has no stored list,
		 * which is what the paragraph below is about.
		 */
		var tunable = axesForFamily(family);

		/*
		 * Said rather than left blank. Nothing has read this family's files, so its
		 * axes are not absent, they are unknown -- a distinction worth drawing,
		 * because an empty space looks like an answer.
		 *
		 * The reason used to be that the panel could not open a WOFF2 at all. It can
		 * now, so what remains is families installed before it could, which have no
		 * stored list rather than an unreadable one. Uploading the file again reads
		 * it, whatever format it is in.
		 */
		if (!tunable.length && axesUnreadable(family)) {
			contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('axesTitle', 'Variable axes') }));
			contentEl.appendChild(el('p', {
				class: 'efm-muted',
				text: s('axesUnknown', 'Nothing has read this family\'s files yet, so the panel does not know whether the font has variable axes.')
			}));
			/*
			 * Offered rather than done on sight. Reading means fetching the whole
			 * font back and decompressing it, which is not something to do on every
			 * render of every family that happens to predate the decoder.
			 */
			contentEl.appendChild(el('div', { class: 'efm-card__actions' }, [
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--outline',
					text: state.readingAxes
						? s('loading', 'Loading\u2026')
						: s('readAxes', 'Read the files'),
					disabled: state.readingAxes || !converterAvailable(),
					// Named, so the answer to "why can I not press this" is not a guess.
					title: converterAvailable() ? null : s('convertBlocked', 'The converter could not start in this browser.'),
					onclick: function () { readAxesFor(index); }
				})
			]));
		}

		if (tunable.length) {
			contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('axesTitle', 'Variable axes') }));

			/*
			 * Conditional, because the honest answer differs. build_css() only writes
			 * font-variation-settings into a rule when the family has an Apply to
			 * selector; without one the instance is published as a custom property
			 * and nothing consumes it. A blanket "this changes your site" was wrong
			 * for the default case, which is the case most families are in.
			 */
			contentEl.appendChild(el('p', {
				class: 'efm-muted',
				text: family.selector
					? s('axesHintApplied', 'This family has an Apply to selector, so these change how it renders on the site as well as in this preview.')
					: s('axesHintUnapplied', 'These change this preview only. To use the instance on the site, give the family an Apply to selector under Delivery, or use its variation variable in your own CSS.')
			}));
			contentEl.appendChild(familyAxes(index, tunable));
		}

		/*
		 * Paired on one row. Both hold a short value, so a full-width input each
		 * spent the whole pane on two words and pushed everything below it down.
		 * They fall back to one per line when the panel is too narrow to hold both.
		 */
		contentEl.appendChild(
			el('div', { class: 'efm-field-row' }, [
				el('label', { class: 'efm-field' }, [
					el('span', { class: 'efm-field__label', text: s('familyName', 'Family name') }),
					el('input', {
						type: 'text',
						class: 'efm-input',
						value: family.name,
						oninput: function (event) {
							state.families[index].name = event.target.value;
							renderSaveBar();
						}
					})
				]),
				family.slug ? cssTokenField(family) : null
			])
		);

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

		/*
		 * The two names Etch's documentation tells people to declare and Automatic.css
		 * reads without ever declaring: measured on a live ACSS install, its stylesheet
		 * consumes --text-font-family twice and defines it nowhere, so the token is a
		 * contract waiting to be filled rather than a value to fight over.
		 *
		 * A role belongs to one family at a time. Ticking it here takes it from
		 * whichever family held it, because a custom property has one value and
		 * silently honouring the first of two claimants would make the stylesheet
		 * depend on library order.
		 */
		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('rolesTitle', 'Typography tokens') }));
		contentEl.appendChild(el('p', {
			class: 'efm-muted',
			text: s('rolesHint', 'Publish this family as the site\'s heading or body font. Etch documents both names and Automatic.css reads them, so a framework picks the family up without you writing a rule. Each one belongs to a single family.')
		}));

		ROLE_KEYS.forEach(function (role) {
			var holder = familyHolding(role);
			var mine = hasRole(family, role);

			contentEl.appendChild(el('label', { class: 'efm-toggle' }, [
				el('input', {
					type: 'checkbox',
					class: 'efm-checkbox',
					checked: mine,
					onchange: function (event) {
						setRole(index, role, event.target.checked);
					}
				}),
				el('span', {}, [
					el('span', {
						class: 'efm-toggle__label',
						text: 'heading' === role
							? s('roleHeading', 'Use for headings')
							: s('roleText', 'Use for body text')
					}),
					el('span', {
						class: 'efm-field__hint',
						text: '--' + role + '-font-family' +
							(!mine && holder ? ' \u00b7 ' + s('roleHeldBy', 'currently') + ' ' + holder.name : '')
					}),
					/*
					 * Named the moment it happens, in the same shape the selector clash
					 * above uses. A token has one owner, so ticking this took it from a
					 * family the reader did not come here to change, on a screen they
					 * are not looking at. The hint above names the holder beforehand,
					 * which only helps if it was read first.
					 *
					 * It is unsaved state, so it behaves like unsaved state: it stands
					 * until the change is committed or dropped, the save bar names both
					 * families in the same breath, and Discard is what puts it back.
					 */
					(function () {
						var lost = mine ? savedHolder(role) : '';

						if (!lost || lost === (family.name || '')) {
							return null;
						}

						return el('span', {
							class: 'efm-field__hint efm-field__hint--warn',
							text: s('roleTakenFrom', 'Taken from') + ' ' + lost + '. ' +
								s('roleTakenHint', 'Unsaved: Discard puts it back.')
						});
					}())
				])
			]));
		});

		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('delivery', 'Delivery') }));
		contentEl.appendChild(deliverySection(index));

		if (family.google) {
			contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('googleSource', 'Google Fonts') }));
			contentEl.appendChild(googleSection(index));
		}

		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('cssPreview', 'Generated CSS') }));
		contentEl.appendChild(el('pre', { class: 'efm-code', text: previewCss(family) }));

		// Its own string, not the plural label: that one is reused mid-sentence in
		// "6 variants", where a capital would be wrong.
		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('variantsTitle', 'Variants') }));

		if (!variants.length) {
			contentEl.appendChild(el('p', { class: 'efm-muted', text: s('noVariants', 'No variants mapped yet.') }));
		} else {
			var picks = variantPicks(index);
			var everyVariant = variants.map(function (variant, vi) { return String(vi); });

			if (picks.length) {
				contentEl.appendChild(el('div', { class: 'efm-resultbar' }, [
					el('span', {}),
					// Null, not everyVariant: this table heads its own select-all in the
					// column beside File, where it reads as a header rather than a stray box.
					bulkBar(picks, null, [
						{
							label: s('removeSelected', 'Remove selected'),
							variant: 'danger',
							onclick: function () { removePickedVariants(index); }
						}
					])
				]));
			}

			var table = el('div', { class: 'efm-table' }, [
				el('div', { class: 'efm-table__head' }, [
					el('span', { class: 'efm-file__cell' }, [
						pickAll(picks, everyVariant, s('selectAllVariants', 'Select every variant')),
						el('span', { text: s('file', 'File') })
					]),
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
				// The section's own action, so it takes the larger size.
				class: 'efm-btn efm-btn--outline efm-btn--lg',
				onclick: function () {
					state.families[index].variants = state.families[index].variants || [];
					var used = (state.families[index].variants || []).map(function (v) { return v.file; });
					var next = state.files.filter(function (f) { return used.indexOf(f.name) === -1; })[0] || state.files[0];

					state.families[index].variants.push({
						file: next ? next.name : '',
						weight: next && next.weight ? next.weight : '400',
						style: next && next.style ? next.style : 'normal'
					});
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
	/**
	 * The value format() takes for a file, from its extension.
	 *
	 * @param {string} file File name.
	 * @return {string}
	 */
	function formatOf(file) {
		var ext = String(file || '').split('.').pop().toLowerCase();

		return FILE_FORMATS[ext] || 'woff2';
	}

	function previewCss(family) {
		if (!isEnabled(family) || isTrashed(family)) {
			return s('cssPreviewOff', 'This family is not loaded, so it contributes no CSS.');
		}

		var display = family.display || 'swap';
		var name = family.name || '';

		var absent = state.missing || [];

		/*
		 * Both halves of mirroring build_css(): a file that is not on the server
		 * produces no rule there, so it must produce none here either, or the
		 * preview shows a face the stylesheet does not contain.
		 */
		var blocks = (family.variants || []).filter(function (variant) {
			return !!variant.file && absent.indexOf(variant.file) === -1;
		}).map(function (variant) {
			var rule = '@font-face {\n' +
				'\tfont-family: "' + name + '";\n' +
				'\tsrc: url("' + variant.file + '") format("' + formatOf(variant.file) + '");\n' +
				'\tfont-weight: ' + (variant.weight || '400') + ';\n' +
				'\tfont-style: ' + (variant.style || 'normal') + ';\n' +
				'\tfont-display: ' + display + ';\n';

			if (variant.range) {
				rule += '\tunicode-range: ' + variant.range + ';\n';
			}

			return rule + '}';
		});

		/*
		 * Still mirroring build_css(): the instance is declared where it applies,
		 * on the token and on the family's own selector, and never inside the
		 * @font-face rules above -- measured in Chrome, a face carrying
		 * font-variation-settings renders identically to one that does not.
		 */
		var variation = String(family.variation || '');

		/*
		 * First, mirroring build_css(): it is the face that renders while the real
		 * one is still arriving, so it belongs at the top of what the reader is
		 * shown as well as at the top of the stylesheet.
		 */
		var fallbackFace = fallbackFaceCss(family);

		if (fallbackFace) {
			blocks.unshift(fallbackFace);
		}

		if (family.slug) {
			blocks.push(':root {\n\t--efm-family-' + family.slug + ': ' + familyStack(name, family) + ';\n' +
				(variation ? '\t--efm-family-' + family.slug + '-variation: ' + variation + ';\n' : '') + '}');
		}

		/*
		 * Mirrors token_css() in build_css(). These two have drifted twice in this
		 * codebase, which is why the roles are read the same way here: a role only
		 * reaches the stylesheet from a family that is enabled, untrashed and
		 * actually maps a file.
		 */
		if (family.slug && (family.variants || []).length && isEnabled(family) && !isTrashed(family)) {
			var held = ROLE_KEYS.filter(function (role) {
				return hasRole(family, role);
			});

			var roleLines = held.map(function (role) {
				return '\t--' + role + '-font-family: var(--efm-family-' + family.slug + ');';
			});

			if (roleLines.length) {
				blocks.push(':root {\n' + roleLines.join('\n') + '\n}');
			}

			/*
			 * The rule that makes the token mean something, mirroring token_css().
			 * Declaring the property alone was the whole feature until now, and on a
			 * live site nothing read it.
			 */
			held.forEach(function (role) {
				blocks.push(ROLE_SELECTORS[role].join(', ') +
					' {\n\tfont-family: var(--' + role + '-font-family);\n}');
			});
		}

		/*
		 * applied_selector() in build_css(), mirrored: a selector one of this
		 * family's own roles already answers for is not written twice. These two
		 * have drifted before, so they change together.
		 */
		var applied = splitSelectors(family).kept.join(', ');

		if (applied) {
			var important = family.force ? ' !important' : '';

			blocks.push(applied + ' {\n\tfont-family: ' + familyStack(name, family) + important + ';\n' +
				(variation ? '\tfont-variation-settings: ' + variation + important + ';\n' : '') + '}');
		}

		return blocks.length
			? blocks.join('\n\n')
			: s('cssPreviewEmpty', 'No variants mapped yet, so this family contributes no CSS.');
	}

	function cssTokenField(family) {
		var token = 'var(--efm-family-' + family.slug + ')';
		var tuned = String(family.variation || '');
		var variationToken = 'var(--efm-family-' + family.slug + '-variation)';

		/*
		 * A published value rather than a field. It used to be a readonly input,
		 * which looks exactly like the editable ones beside it and invites a
		 * cursor that then does nothing. It now reads as code, on the sunken well
		 * Etch shows code on, with copying as a button rather than a hidden click.
		 */
		return el('div', { class: 'efm-field' }, [
			el('span', { class: 'efm-field__label', text: s('cssToken', 'CSS variable') }),
			el('div', { class: 'efm-token' }, [
				el('code', { class: 'efm-token__value', text: token }),
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--ghost efm-btn--sm efm-btn--icon efm-tooltip efm-tooltip--end',
					'aria-label': s('copy', 'Copy'),
					'data-efm-tooltip': s('copy', 'Copy'),
					onclick: function () {
						copyText(token, s('copiedToken', 'CSS variable copied.'));
					}
				}, [icon('copy', 'sm')])
			]),
			el('span', {
				class: 'efm-field__hint',
				text: s('cssTokenHint', 'Use this anywhere a font family is expected. It already includes the fallback stack.')
			}),

			/*
			 * Only once an instance exists, and only here, beside the token it
			 * belongs to. The stylesheet has always published this property; the
			 * panel never mentioned it, so the one way to use a tuned instance
			 * without an Apply to selector was to find it by reading the
			 * generated CSS.
			 */
			tuned ? el('div', { class: 'efm-token' }, [
				el('code', { class: 'efm-token__value', text: variationToken }),
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--ghost efm-btn--sm efm-btn--icon efm-tooltip efm-tooltip--end',
					'aria-label': s('copy', 'Copy'),
					'data-efm-tooltip': s('copy', 'Copy'),
					onclick: function () {
						copyText(variationToken, s('copiedVariationToken', 'Variation variable copied.'));
					}
				}, [icon('copy', 'sm')])
			]) : null,
			tuned ? el('span', {
				class: 'efm-field__hint',
				text: s('variationTokenHint', 'The tuned instance, for font-variation-settings. Pair it with the family variable above.')
			}) : null
		]);
	}

	/**
	 * Put a value on the clipboard.
	 *
	 * The async clipboard API is unavailable on an insecure origin and can be
	 * refused by permissions policy inside the builder, so a hidden textarea and
	 * execCommand stand behind it rather than the copy quietly doing nothing.
	 *
	 * The caller says what it handed over. Three buttons share this, and "Copied."
	 * left the toast unable to tell a CSS variable from an axis declaration from
	 * the @import line -- three values a reader is quite likely to be comparing in
	 * the same sitting.
	 *
	 * @param {string} text    Value to copy.
	 * @param {string} message What the toast should say once it is on the clipboard.
	 */
	function copyText(text, message) {
		function done() {
			setStatus(message);
		}

		function legacy() {
			var field = el('textarea', { class: 'efm-sr-only', readonly: true });
			var copied = false;

			field.value = text;
			manager.appendChild(field);
			field.select();

			try {
				copied = document.execCommand('copy');
			} catch (error) {
				copied = false;
			}

			manager.removeChild(field);

			if (copied) {
				done();
				return;
			}

			// Never silently: the value is selectable, so say so.
			setStatus(s('copyFailed', 'Could not copy. Select the value and copy it.'), 'error');
		}

		if (window.navigator.clipboard && window.navigator.clipboard.writeText) {
			window.navigator.clipboard.writeText(text).then(done, legacy);
			return;
		}

		legacy();
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
	/**
	 * The variable-axis editor for an installed family.
	 *
	 * @param {number} index Family index.
	 * @param {Array}  axes  Axis records from the family's Google block.
	 * @return {HTMLElement}
	 */
	function familyAxes(index, axes) {
		var family = state.families[index];
		var map = variationMap(family);

		var reset = el('button', {
			type: 'button',
			class: 'efm-btn efm-btn--outline efm-btn--sm',
			disabled: '' === String(family.variation || ''),
			onclick: function () {
				family.variation = '';
				render();
			}
		}, [icon('refresh', 'sm'), el('span', { text: s('resetAxes', 'Reset axes') })]);

		var rows = axes.map(function (axis) {
			var current = map[axis.tag] === undefined ? axis.def : map[axis.tag];

			return axisRow(axis, current, function (value) {
				map[axis.tag] = value;
				family.variation = variationString(axes, map);

				/*
				 * Everything below is updated in place, because a render mid-drag
				 * would take the slider out from under the pointer. The save bar is
				 * the one thing that has to be told, since it is derived from a diff
				 * that nothing else here recomputes.
				 */
				repaintSpecimens(family.variation);
				reset.disabled = '' === family.variation;

				// Looked up now, not captured: the Generated CSS block is appended
				// after this section, so at build time there is nothing to hold.
				var preview = contentEl.querySelector('.efm-code');

				if (preview) {
					preview.textContent = previewCss(family);
				}

				renderSaveBar();
			});
		});

		return el('div', { class: 'efm-axes' }, rows.concat([reset]));
	}

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

			var here = installedCuts(family);
			var chosen = state.cuts[family.name] || here.slice();
			state.cuts[family.name] = chosen;

			rows.push(el('div', { class: 'efm-subsets' }, [
				el('span', { class: 'efm-subsets__label', text: s('weights', 'Weights') }),
				el('div', { class: 'efm-chips' }, available.map(function (cut) {
					var on = chosen.indexOf(cut) !== -1;
					/*
					 * Already on disk, as opposed to merely ticked. The two looked
					 * identical, which is what made a selection carrying weights you
					 * already own read as a second download of them -- it never was one,
					 * install() skips any file that exists, but nothing here said so.
					 * The tick is the difference between "you have this" and "you have
					 * asked for this".
					 */
					var have = here.indexOf(cut) !== -1;
					var label = cutLabel(cut);

					/*
					 * An installed weight is fixed here. Unticking one used to be a way of
					 * deleting it -- install() replaces the variant list with whatever this
					 * row holds -- so a selection that only dropped a weight left the button
					 * live and still reading "Download selection", which downloaded nothing
					 * and removed a weight. Weights are removed in the Variants table below,
					 * which says so; this row only adds.
					 */
					return el('button', {
						type: 'button',
						class: 'efm-chip efm-chip--toggle' + (on ? ' is-on' : '') + (have ? ' efm-chip--have' : ''),
						'aria-pressed': on ? 'true' : 'false',
						'aria-label': have ? label + ' \u00b7 ' + s('alreadyInstalled', 'already installed') : label,
						disabled: have,
						title: have ? s('alreadyInstalled', 'already installed') : null,
						onclick: function () {
							var at = chosen.indexOf(cut);

							if (at === -1) {
								chosen.push(cut);
							} else {
								chosen.splice(at, 1);
							}

							render();
						}
					}, have
						? [icon('check', 'sm'), el('span', { text: label })]
						: [el('span', { text: label })]);
				}))
			]));
		}

		rows.push(el('p', {
			class: 'efm-field__hint',
			text: s('googleSubsets', 'Subsets') + ': ' + subsets.join(', ')
		}));

		if (!google.variable) {
			var installed = installedCuts(family);
			var picked = state.cuts[family.name] || [];

			/*
			 * What this press would actually fetch. The button used to be enabled
			 * whenever the selection differed from what was installed, which meant it
			 * went live for a selection that only dropped a weight -- downloading
			 * nothing under a label that said Download. It now counts the weights
			 * that are not here yet, and says how many, so a disabled button means
			 * there is nothing to fetch rather than nothing that changed.
			 */
			var adding = picked.filter(function (cut) {
				return installed.indexOf(cut) === -1;
			});

			rows.push(el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--outline',
				disabled: busy || !adding.length,
				text: busy
					? s('installing', 'Installing…')
					: s('downloadCuts', 'Download') + ' ' + adding.length + ' ' +
						plural(adding.length, s('weightOne', 'weight'), s('weightMany', 'weights')),
				onclick: function () {
					/*
					 * Installed weights go with it. install() replaces the variant list
					 * with what it is sent, so sending only the additions would delete
					 * everything the family already had.
					 */
					installGoogleFont(family.name, subsets, false, installed.concat(adding));
				}
			}));

			if (unchanged && !busy) {
				rows.push(el('p', {
					class: 'efm-field__hint',
					// Why it cannot be pressed, which is the only thing worth saying
					// once it is disabled.
					text: available.length === installed.length
						? s('cutsAllInstalled', 'Every weight Google publishes for this family is installed.')
						: s('cutsUnchanged', 'Change the weights to download a different selection.')
				}));
			}
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

		var displaySelect = dropdown({
			key: 'display-' + index,
			value: family.display || 'swap',
			options: ['swap', 'optional', 'fallback', 'block', 'auto'].map(function (value) {
				/*
				 * The value is the CSS keyword and goes into the stylesheet exactly
				 * as written here; only the label is capitalised. A menu of five
				 * lowercase words reads as code being echoed back rather than as a
				 * set of choices, and every other menu in the panel is capitalised.
				 */
				return { value: value, label: value.charAt(0).toUpperCase() + value.slice(1) };
			}),
			onselect: function (value) {
				state.families[index].display = value;
				renderSaveBar();
			}
		});

		var stackInput = el('input', {
			type: 'text',
			class: 'efm-input',
			// Carried across the re-render a pick causes, so the caret survives.
			'data-efm-focus': 'fallback-' + index,
			placeholder: 'sans-serif',
			value: family.fallback || '',
			oninput: function (event) {
				state.families[index].fallback = event.target.value;
				renderSaveBar();
			}
		});

		var stackField = suggestField({
			key: 'fallback-' + index,
			label: s('commonStacks', 'Common stacks'),
			input: stackInput,
			options: FALLBACK_STACKS,
			onpick: function (value) {
				state.families[index].fallback = value;
				render();
			}
		});

		var preloadInput = el('input', {
			type: 'checkbox',
			class: 'efm-checkbox',
			checked: !!family.preload,
			onchange: function (event) {
				state.families[index].preload = event.target.checked;
				renderSaveBar();
			}
		});

		return el('div', { class: 'efm-delivery' }, [
			el('div', { class: 'efm-fields' }, [
				// A div, not a label: the control inside is a dropdown button now.
				el('div', { class: 'efm-field' }, [
					el('span', { class: 'efm-field__label', text: s('fontDisplay', 'Loading behaviour') }),
					displaySelect,
					el('span', { class: 'efm-field__hint', text: s('fontDisplayHint', 'Swap shows a fallback until the font arrives. Optional skips the font entirely on slow connections, which removes layout shift.') })
				]),
				// A div, not a label: a label wrapping the menu would fire the input
				// on every option click.
				el('div', { class: 'efm-field' }, [
					el('span', { class: 'efm-field__label', text: s('fallbackStack', 'Fallback stack') }),
					stackField,
					el('span', { class: 'efm-field__hint', text: s('fallbackHint', 'Shown while the font loads, and if it fails. A close match reduces layout shift.') })
				]),
				el('label', { class: 'efm-field' }, [
					el('span', { class: 'efm-field__label', text: s('applyTo', 'Apply to') }),
					el('input', {
						type: 'text',
						class: 'efm-input',
						'data-efm-focus': 'apply-to-' + index,
						placeholder: 'h1, .site-title',
						value: family.selector || '',
						/*
						 * Redrawn as you type, not only when something else happens to
						 * redraw the pane. The warnings below this field are the whole
						 * point of it -- they say which selectors a role already answers
						 * for and which other family is writing the same rule -- and they
						 * used to sit there stale while the reader typed the very thing
						 * they warn about. The save bar alone was updating.
						 *
						 * Same split the Library filter uses: read now, redraw on a
						 * debounce. The field carries data-efm-focus so render() puts the
						 * caret back where it was.
						 */
						oninput: function (event) {
							state.families[index].selector = event.target.value;
							renderSaveBar();
							queueRender();
						}
					}),
					el('span', { class: 'efm-field__hint', text: s('applyToHint', 'Optional. A comma separated selector list this family is applied to, so you do not have to write the rule yourself.') }),
					/*
					 * Named the moment it happens. Two families writing a rule for the
					 * same selector is decided by which one the stylesheet reaches last,
					 * which is stored order -- invisible from here, and not something to
					 * discover by wondering why a font did not change.
					 */
					/*
					 * A role already answers for these, so writing them here would put a
					 * second rule on the same element and leave source order to settle
					 * which font wins. They are dropped from the stylesheet rather than
					 * from the field: the field is what the reader typed, and a role can
					 * be unticked, at which point they come back on their own.
					 */
					(function () {
						var split = splitSelectors(family);

						if (!split.covered.length) {
							return null;
						}

						// Named when it is not this family, because "a token covers this"
						// raises the question of whose, and the answer is a click away.
						return el('span', {
							class: 'efm-field__hint efm-field__hint--warn',
							text: s('roleCoversSelector', 'Not applied:') + ' ' + split.covered.join(', ') + '. ' +
								(split.holders.length
									? split.holders.join(', ') + ' ' + s('roleCoversOther', 'covers these with a typography token.')
									: s('roleCoversHint', 'The typography token above already answers for these.'))
						});
					}()),
					(function () {
						var clashes = selectorClashes(index);

						if (!clashes.length) {
							return null;
						}

						return el('span', {
							class: 'efm-field__hint efm-field__hint--warn',
							text: s('selectorClash', 'Also applied by') + ' ' +
								clashes.map(function (clash) {
									return clash.name + ' (' + clash.parts.join(', ') + ')';
								}).join(', ') + '. ' +
								s('selectorClashHint', 'Whichever comes last in the stylesheet wins.')
						});
					}())
				])
			]),
			family.selector ? el('label', { class: 'efm-toggle' }, [
				el('input', {
					type: 'checkbox',
					class: 'efm-checkbox',
					checked: !!family.force,
					onchange: function (event) {
						state.families[index].force = event.target.checked;
						render();
					}
				}),
				el('span', {}, [
					el('span', { class: 'efm-toggle__label', text: s('applyForce', 'Override theme styles') }),
					el('span', { class: 'efm-field__hint', text: s('applyForceHint', 'Adds !important, for when a theme stylesheet loads later or wins on specificity.') })
				])
			]) : null,
			/*
			 * A local face wearing this font's vertical metrics, so the line boxes are
			 * the right height before the web font arrives and nothing jumps when it
			 * does. Off by default: it is measured from the file, so switching it on
			 * has to go and read one.
			 */
			el('label', { class: 'efm-toggle' }, [
				el('input', {
					type: 'checkbox',
					class: 'efm-checkbox',
					checked: !!familyMetrics(family),
					disabled: state.readingMetrics,
					onchange: function (event) {
						if (event.target.checked) {
							fitFallback(index);
							return;
						}

						state.families[index].metrics = null;
						render();
					}
				}),
				el('span', {}, [
					el('span', {
						class: 'efm-toggle__label',
						text: state.readingMetrics
							? s('loading', 'Loading\u2026')
							: s('matchFallback', 'Hold the space while this font loads')
					}),
					el('span', {
						class: 'efm-field__hint',
						text: s('matchFallbackHint', 'Adds a local stand-in carrying this font\'s own line height, so text does not shift when the real font arrives. Measured from the file, so it needs reading once.')
					})
				])
			]),
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
		var fileOptions = state.files.map(function (file) {
			return { value: file.name, label: file.name };
		});

		if (!fileOptions.length) {
			fileOptions.push({ value: '', label: s('noFiles', 'No font files on the server yet.') });
		}

		var fileSelect = dropdown({
			key: 'variant-file-' + familyIndex + '-' + variantIndex,
			label: s('file', 'File'),
			value: variant.file,
			options: fileOptions,
			onselect: function (value) {
				var target = state.families[familyIndex].variants[variantIndex];
				var picked = state.files.filter(function (f) { return f.name === value; })[0];

				target.file = value;

				// Weight and style are read from the file name so mapping a
				// freshly uploaded file is a single step.
				if (picked && picked.weight) {
					target.weight = picked.weight;
					target.style = picked.style || 'normal';
				}
			}
		});

		var weights = ['100', '200', '300', '400', '500', '600', '700', '800', '900', '100 900'];

		// A narrowed variable axis produces a range this list does not carry, so
		// the stored value is added rather than silently rewritten on save.
		if (weights.indexOf(String(variant.weight)) === -1) {
			weights.push(String(variant.weight));
		}

		var weightSelect = dropdown({
			key: 'variant-weight-' + familyIndex + '-' + variantIndex,
			label: s('weight', 'Weight'),
			value: String(variant.weight),
			options: weights.map(function (weight) {
				return {
					value: weight,
					label: weight.indexOf(' ') !== -1 ? s('variable', 'variable') + ' ' + weight : weight
				};
			}),
			onselect: function (value) {
				state.families[familyIndex].variants[variantIndex].weight = value;
			}
		});

		var styleSelect = dropdown({
			key: 'variant-style-' + familyIndex + '-' + variantIndex,
			label: s('style', 'Style'),
			value: variant.style,
			options: [
				{ value: 'normal', label: s('normal', 'Normal') },
				{ value: 'italic', label: s('italic', 'Italic') }
			],
			onselect: function (value) {
				state.families[familyIndex].variants[variantIndex].style = value;
			}
		});

		return el('div', { class: 'efm-table__row' }, [
			el('span', { class: 'efm-file__cell' }, [
				el('label', { class: 'efm-card__pick' }, [
					el('input', {
						type: 'checkbox',
						class: 'efm-checkbox',
						checked: variantPicks(familyIndex).indexOf(String(variantIndex)) !== -1,
						'aria-label': s('selectVariant', 'Select variant') + ' ' + (variantIndex + 1),
						onchange: function () {
							togglePicked(variantPicks(familyIndex), String(variantIndex));
						}
					})
				]),
				fileSelect
			]),
			weightSelect,
			styleSelect,
			el('button', {
				type: 'button',
				class: 'efm-icon-btn efm-icon-btn--danger efm-tooltip efm-tooltip--end',
				'aria-label': s('removeVariant', 'Remove variant'),
				'data-efm-tooltip': s('removeVariant', 'Remove variant'),
				onclick: function () {
					state.families[familyIndex].variants.splice(variantIndex, 1);
					render();
				}
			}, [icon('trash')])
		]);
	}

	/* ------------------------------- Upload ------------------------------ */

	/**
	 * One row of the font files table.
	 *
	 * Lifted out of renderUpload so the three groups below can each build their
	 * own table from the same row rather than three copies of it drifting apart,
	 * which is exactly what previewCss() and build_css() have twice done here.
	 *
	 * @param {Object} file File record.
	 * @return {HTMLElement} The row.
	 */
	function fileRow(file) {
		/*
		 * A file whose WOFF2 twin is already sitting in this same table has
		 * nothing left to convert: running it again would spend the work only to
		 * overwrite the file it produced last time.
		 */
		var twin = woff2Name(file.name);
		var already = twin !== file.name && state.files.some(function (other) {
			return other.name === twin;
		});

		return el('div', { class: 'efm-table__row' }, [
				el('span', { class: 'efm-file__cell' }, [
					el('label', { class: 'efm-card__pick' }, [
						el('input', {
							type: 'checkbox',
							class: 'efm-checkbox',
							checked: state.pickedFiles.indexOf(file.name) !== -1,
							'aria-label': s('selectFile', 'Select') + ' ' + file.name,
							onchange: function () {
								togglePicked(state.pickedFiles, file.name);
							}
						})
					]),
					el('span', { class: 'efm-file__name', text: file.name, title: file.name })
				]),
				el('span', { class: 'efm-muted', text: (file.ext || '').toUpperCase() + ' · ' + (file.weight || '400') + (file.style === 'italic' ? ' ' + s('italic', 'Italic') : '') }),
				/*
				 * Every state named. "in use" against a blank meant the reader had
				 * to know that blank was a state at all -- and the file it applies
				 * to most often is a source left behind by a conversion, which is
				 * exactly the one worth noticing. The families are on the tooltip,
				 * because "not loaded" raises the question of which family it is
				 * waiting for, and a row is too narrow to answer it inline.
				 */
				(function () {
					var use = fileUseState(file.name);

					return el('span', {
						class: 'efm-muted' + (use.owners.length ? ' efm-tooltip efm-tooltip--end' : ''),
						'data-efm-tooltip': use.owners.length ? use.owners.join(', ') : null,
						text: formatSize(file.size) + ' \u00b7 ' + use.label
					});
				}()),
				convertible(file.name) && converterAvailable()
					? el('button', {
						type: 'button',
						class: 'efm-icon-btn efm-tooltip efm-tooltip--end',
						disabled: !!state.converting || already,
						// Named, so the answer to "why can I not press this" is the
						// file that already holds the result.
						'aria-label': already ? s('convertedAlready', 'Already converted to WOFF2') : s('convertFile', 'Convert to WOFF2'),
						'data-efm-tooltip': already
							? s('convertedAlready', 'Already converted to WOFF2') + ' \u00b7 ' + twin
							: s('convertFile', 'Convert to WOFF2'),
						onclick: function () {
							convertExisting(file);
						}
					}, [icon('compress')])
					// Keeps the delete button in its own column on rows that
					// cannot be converted.
					: el('span', {}),
				el('button', {
					type: 'button',
					class: 'efm-icon-btn efm-icon-btn--danger efm-tooltip efm-tooltip--end',
					'aria-label': s('deleteFile', 'Delete file'),
					'data-efm-tooltip': s('deleteFile', 'Delete file'),
					onclick: function (event) {
						var users = fileUsedBy(file.name);
						var emptied = emptiedBy([file.name]);
						var alsoFamily = { checked: false };
						var message = s('confirmDelete', 'Delete this file from the fonts folder?');

						if (users.length) {
							message += '\n\n' + s('confirmDeleteUsed', 'It is mapped by:') + ' ' + users.join(', ') +
								'.\n' + s('confirmDeleteUsedHint', 'Those variants will be removed too.');
						}

						/*
						 * Named before it happens. Stripping the variants used to leave a
						 * family behind with none, which the dialog never mentioned.
						 */
						if (emptied.length) {
							message += '\n\n' + s('confirmEmpties', 'That leaves nothing mapped by:') + ' ' + emptied.join(', ') + '.';
						}

						/*
						 * Last, where Etch puts "This action cannot be undone". Two
						 * different things in this panel are called Delete and only
						 * one of them is recoverable: a family goes to the Trash and
						 * leaves its files behind, while a file is unlinked from disk
						 * on the spot. The dialog never said which of the two this
						 * was.
						 */
						message += '\n\n' + s('confirmPermanent', 'The Trash holds families, not files, so this cannot be undone.');

						askConfirm({
							// The row it is unlinking, marked behind the question.
							mark: [event.currentTarget.closest('.efm-table__row')],
							title: s('deleteFile', 'Delete file'),
							message: message,
							confirm: s('deleteAction', 'Delete'),
							danger: true,
							/*
							 * The mirror of the family dialog's "Also delete its font
							 * files", offered from the other side. Unticked: a family is
							 * more than the file that went -- it holds the name, the
							 * Apply to selector, its CSS variable and any tuned instance.
							 */
							checkbox: emptied.length ? {
								state: alsoFamily,
								label: s('alsoTrashEmptied', 'Also move the emptied family to the trash')
							} : null
						}).then(function (answer) {
							if ('confirm' === answer) {
								deleteFile(file.name, alsoFamily.checked);
							}
						});
					}
				}, [icon('trash')])
		]);
	}

	/**
	 * Where a file came from, as far as the library can honestly say.
	 *
	 * Read off the families that map it, because nothing records an origin on the
	 * file itself: a Google install writes into the same shared folder an upload
	 * does, and Etch writes there too. A file nothing maps is reported as loose
	 * rather than guessed at -- it may be Etch's, or left by an older plugin.
	 *
	 * @param {string} filename File name.
	 * @return {string} 'google', 'upload' or 'loose'.
	 */
	/**
	 * The axes a family can be tuned on.
	 *
	 * A Google install carries them from the API. Anything else reads them from
	 * whichever of its files turned out to be variable, which the panel recorded
	 * when that file was uploaded. Both arrive in the same shape, so the editor
	 * below cannot tell the two apart.
	 *
	 * @param {Object} family Family record.
	 * @return {Array} Axis records, empty when there is nothing to tune.
	 */
	/**
	 * Read the axes of the files a family maps, from the files themselves.
	 *
	 * The upload path reads a font as it arrives, which is the only moment it is
	 * in the browser. A family installed before the panel could open its format --
	 * every WOFF2 predating the decoder -- never had that moment, so this gives it
	 * one by fetching the file back off the server.
	 *
	 * An empty list is stored when nothing is found, which is not the same as
	 * storing nothing: it records that the file has been looked at, so the panel
	 * stops offering to look again and stops calling the answer unknown.
	 *
	 * Only the file record is updated locally, never applyState(): that would
	 * replace state.families with the server's copy and take any unsaved edit in
	 * the open editor with it. Axes live beside the files, not on the family.
	 *
	 * @param {number} index Family index.
	 */
	function readAxesFor(index) {
		var family = state.families[index];

		if (!family || state.readingAxes) {
			return;
		}

		var names = (family.variants || []).map(function (variant) {
			return variant.file;
		}).filter(function (name, at, all) {
			if (!name || all.indexOf(name) !== at) {
				return false;
			}

			var record = fileRecord(name);

			return record && !record.axes;
		});

		if (!names.length) {
			return;
		}

		state.readingAxes = true;
		render();

		var found = 0;
		var failed = 0;

		// One at a time. Each file is fetched whole and a WOFF2 is decompressed in
		// the worker, and there is one worker.
		names.reduce(function (chain, name) {
			return chain.then(function () {
				return window.fetch(cfg.filesUrl + encodeURIComponent(name)).then(function (response) {
					if (!response.ok) {
						throw new Error(String(response.status));
					}

					return response.arrayBuffer();
				}).then(axesFromFont).then(function (axes) {
					return request('/files/axes', {
						method: 'POST',
						body: { filename: name, axes: axes || [] }
					}).then(function () {
						var record = fileRecord(name);

						if (record) {
							record.axes = axes || [];
						}

						if (axes && axes.length) {
							found += 1;
						}
					});
				}).catch(function () {
					// One unreadable file does not stop the others being read.
					failed += 1;
				});
			});
		}, Promise.resolve()).then(function () {
			state.readingAxes = false;
			render();

			if (found) {
				setStatus(s('axesRead', 'Variable axes read from the file.'), 'success');
			} else if (failed === names.length) {
				setStatus(s('axesReadFailed', 'Could not read this family\'s files.'), 'error');
			} else {
				setStatus(s('axesNone', 'No variable axes in this family\'s files.'), 'success');
			}
		});
	}

	/**
	 * Measure a family's font and keep the numbers a fallback face needs.
	 *
	 * Read from the file rather than guessed. The overrides only help if they are
	 * this font's actual metrics; a wrong number moves the text it was meant to
	 * hold still.
	 *
	 * @param {number} index Family index.
	 */
	function fitFallback(index) {
		var family = state.families[index];

		if (!family || state.readingMetrics) {
			return;
		}

		var absent = state.missing || [];
		var file = (family.variants || []).map(function (variant) {
			return variant.file;
		}).filter(function (name) {
			return name && absent.indexOf(name) === -1;
		})[0];

		if (!file) {
			setStatus(s('metricsFailed', 'Could not read the metrics from this family\'s font.'), 'error');
			return;
		}

		state.readingMetrics = true;
		render();

		window.fetch(cfg.filesUrl + encodeURIComponent(file)).then(function (response) {
			if (!response.ok) {
				throw new Error(String(response.status));
			}

			return response.arrayBuffer();
		}).then(metricsFromFont).then(function (metrics) {
			state.readingMetrics = false;

			if (!metrics) {
				render();
				setStatus(s('metricsFailed', 'Could not read the metrics from this family\'s font.'), 'error');
				return;
			}

			state.families[index].metrics = metrics;
			render();
			setStatus(s('metricsRead', 'Fallback matched to this font.'), 'success');
		}).catch(function () {
			state.readingMetrics = false;
			render();
			setStatus(s('metricsFailed', 'Could not read the metrics from this family\'s font.'), 'error');
		});
	}

	/**
	 * Whether the files this family actually maps are variable.
	 *
	 * Read from the install, not from the catalogue. Two signals, either of which
	 * is conclusive: a variant whose weight is a range rather than a number, which
	 * is how a variable face is stored, or a mapped file with axes read out of it.
	 *
	 * @param {Object} family Family record.
	 * @return {boolean}
	 */
	function familyIsVariable(family) {
		return (family.variants || []).some(function (variant) {
			if (String(variant.weight || '').indexOf(' ') !== -1) {
				return true;
			}

			var record = fileRecord(variant.file);

			return !!(record && (record.axes || []).length);
		});
	}

	function axesForFamily(family) {
		/*
		 * The catalogue describes the family, not the install. Google publishes
		 * Open Sans as a variable font and records its axes here whichever way it
		 * was fetched, so a library holding five static weight files was being
		 * offered sliders for a wght axis none of those files carry: they would
		 * write font-variation-settings into the stylesheet and move nothing.
		 */
		if (!familyIsVariable(family)) {
			return [];
		}

		if (family.google && (family.google.axes || []).length) {
			return family.google.axes;
		}

		var found = [];

		(family.variants || []).forEach(function (variant) {
			if (found.length) {
				return;
			}

			var record = fileRecord(variant.file);

			if (record && (record.axes || []).length) {
				found = record.axes;
			}
		});

		return found;
	}

	/**
	 * Whether nothing has ever been able to read this family's files.
	 *
	 * True only when every file it maps is one the panel cannot open -- a WOFF2,
	 * in practice. That is the difference between a font with no axes and a font
	 * whose axes are unknowable, and it is worth saying out loud rather than
	 * showing an empty space where sliders would be.
	 *
	 * @param {Object} family Family record.
	 * @return {boolean}
	 */
	function axesUnreadable(family) {
		var variants = family.variants || [];

		if (!variants.length || (family.google && (family.google.axes || []).length)) {
			return false;
		}

		/*
		 * Only worth saying about a font that plausibly has axes to miss. Every
		 * family installed before the panel learned to read fvar has no stored list,
		 * and most fonts are not variable, so answering true on all of them would
		 * put a paragraph about variable axes on the majority of static families --
		 * noise in place of the silence they had.
		 */
		if (!variants.some(function (variant) { return looksVariable(variant.file); })) {
			return false;
		}

		return variants.every(function (variant) {
			var record = fileRecord(variant.file);

			// No stored list at all means nothing has looked, which for a file the
			// panel converted is the same as cannot look.
			return record && !record.axes;
		});
	}

	/**
	 * Whether a file name advertises a variable font.
	 *
	 * A guess, and deliberately a conservative one, used only to decide whether
	 * an unreadable font is worth mentioning. Guessing wrong low costs nothing --
	 * the panel stays quiet, which is what it did before -- while guessing wrong
	 * high puts an explanation on a font that never had axes.
	 *
	 * Axis tags are matched only inside the brackets Google and most foundries
	 * use, so "Something-Italic" is not read as declaring an ital axis.
	 *
	 * @param {string} filename File name.
	 * @return {boolean}
	 */
	function looksVariable(filename) {
		var name = String(filename || '').toLowerCase();

		if (/\[[a-z,]*(wght|wdth|opsz|slnt|ital|grad)[a-z,]*\]/.test(name)) {
			return true;
		}

		if (/(^|[^a-z])vf([^a-z]|$)/.test(name)) {
			return true;
		}

		return name.indexOf('variable') !== -1;
	}

	function fileRecord(filename) {
		return (state.files || []).filter(function (entry) {
			return entry.name === filename;
		})[0] || null;
	}

	function fileOrigin(filename) {
		var owners = state.families.filter(function (family) {
			return (family.variants || []).some(function (variant) {
				return variant.file === filename;
			});
		});

		if (!owners.length) {
			return 'loose';
		}

		return owners.some(function (family) {
			return 'google' === (family.source || '');
		}) ? 'google' : 'upload';
	}

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

		/*
		 * Shaped like Etch's Assets Library, measured from its own component: a
		 * dashed zone with the message centred in it, a button to open the picker
		 * and the accepted formats as chips underneath. With nothing uploaded yet
		 * the zone fills the pane the way Etch's empty state does; once there are
		 * files it steps back to a band above the table.
		 *
		 * The zone is a drop target, not a button. Etch puts the click on the
		 * button alone, which also avoids a control nested inside a control.
		 */
		var types = el('div', { class: 'efm-dropzone__types' }, [
			el('span', { class: 'efm-dropzone__types-label', text: s('supported', 'Supported:') })
		]);

		['WOFF2', 'WOFF', 'TTF', 'OTF'].forEach(function (format) {
			types.appendChild(el('span', { class: 'efm-chip efm-chip--type', text: format }));
		});

		var dropzone = el('div', {
			class: 'efm-dropzone' + (state.files.length ? '' : ' efm-dropzone--empty'),
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
			el('div', { class: 'efm-dropzone__center' }, [
				el('h2', { class: 'efm-dropzone__title', text: s('upload', 'Upload font files') }),
				el('p', { class: 'efm-dropzone__desc', text: s('uploadIntro', 'Font files live on your own server, and every family you build here is made from them.') }),
				el('p', { class: 'efm-dropzone__desc', text: s('uploadHint', 'Drag files from your computer, or select them with the button below.') }),
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--outline efm-btn--lg',
					onclick: function () { input.click(); }
				}, [icon('plus', 'sm'), el('span', { text: s('selectFiles', 'Select files') })]),
				types
			]),
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
					el('span', { class: 'efm-toggle__label', text: s('convertUpload', 'Convert TTF, OTF and WOFF to WOFF2') }),
					el('span', {
						class: 'efm-field__hint',
						text: s('convertHint', 'Runs in your browser, so the font is never sent anywhere but your own site. WOFF2 is what every current browser prefers: normally 40 to 65% smaller than TTF or OTF, and around 20% smaller than WOFF. Only the container changes: glyphs, variable axes and OpenType features are untouched. It is not a subsetter, so a font that is large because of its character coverage stays large.')
					})
				])
			]));
		}

		if (state.convertLog.length) {
			contentEl.appendChild(convertReport());
		}

		if (!state.files.length) {
			contentEl.appendChild(el('h3', {
				class: 'efm-section-title',
				text: s('filesTitle', 'Font files')
			}));
			contentEl.appendChild(el('p', { class: 'efm-muted', text: s('noFiles', 'No font files on the server yet.') }));
			return;
		}

		/*
		 * The band under this heading used to hold one unlabelled checkbox and
		 * otherwise nothing, so the screen read as a heading, a gap, then a second
		 * heading. The Library and Google Fonts both put a toolbar in exactly that
		 * position; this screen is the one that never had one, and it is also the
		 * one whose list has no ceiling -- it shows the whole shared fonts folder,
		 * which Etch writes into too. So the band earns its height by holding the
		 * thing a long list needs: a way to find a file.
		 */
		var fileQuery = state.fileFilter.trim().toLowerCase();

		// Formats in a fixed preference order rather than whatever order the folder
		// happens to be in, so the chips do not move between renders. Anything the
		// list does not know about is appended alphabetically rather than dropped.
		var formatOrder = ['WOFF2', 'WOFF', 'TTF', 'OTF'];
		var formatCounts = {};

		state.files.forEach(function (file) {
			var ext = (file.ext || '').toUpperCase();

			if (ext) {
				formatCounts[ext] = (formatCounts[ext] || 0) + 1;
			}
		});

		var formats = Object.keys(formatCounts).sort(function (a, b) {
			var ia = formatOrder.indexOf(a);
			var ib = formatOrder.indexOf(b);

			if (ia === -1 && ib === -1) {
				return a < b ? -1 : 1;
			}

			return (ia === -1 ? formatOrder.length : ia) - (ib === -1 ? formatOrder.length : ib);
		});

		// A format that is no longer on disk stops being a filter, so converting the
		// last TTF cannot leave the screen filtered to nothing by a chip that is gone.
		state.fileFormats = state.fileFormats.filter(function (ext) {
			return formats.indexOf(ext) !== -1;
		});

		var visibleFiles = state.files.filter(function (file) {
			var ext = (file.ext || '').toUpperCase();

			if (state.fileFormats.length && state.fileFormats.indexOf(ext) === -1) {
				return false;
			}

			return !fileQuery || file.name.toLowerCase().indexOf(fileQuery) !== -1;
		});

		var filtering = !!fileQuery || !!state.fileFormats.length;

		/*
		 * The heading carries what the folder costs. The table lists a size per row
		 * and never totalled them, so the one question a font folder raises -- how
		 * much is this -- took adding up twelve lines by hand. Under a filter it
		 * counts what is on screen against the whole folder, the way the Library
		 * already reports a search, because the total alone would describe files the
		 * reader cannot see.
		 */
		contentEl.appendChild(el('h3', {
			class: 'efm-section-title',
			/*
			 * "Font files", not "Uploaded files". This lists the whole shared folder
			 * -- uploads, Google installs and anything Etch left there -- and the old
			 * heading claimed an origin it never checked.
			 */
			text: s('filesTitle', 'Font files') + ' \u00b7 ' + (filtering
				? visibleFiles.length + ' ' + s('ofLabel', 'of') + ' ' + state.files.length +
					' \u00b7 ' + formatSize(sizeOfRecords(visibleFiles))
				: formatSize(sizeOfRecords(state.files)))
		}));

		var fileSearch = el('input', {
			type: 'search',
			class: 'efm-input',
			'data-efm-focus': 'file-filter',
			placeholder: s('searchFiles', 'Search font files'),
			'aria-label': s('searchFiles', 'Search font files'),
			value: state.fileFilter,
			// Same split as the Library filter: read now, redraw later.
			oninput: function (event) {
				state.fileFilter = event.target.value;
				queueRender();
			}
		});

		contentEl.appendChild(el('div', { class: 'efm-toolbar' }, [
			el('div', { class: 'efm-toolbar__lead' }, [
				el('div', { class: 'efm-search' }, [
					icon('search', 'sm'),
					clearableField(fileSearch, s('clearFilter', 'Clear filter'), function () {
						state.fileFilter = '';
						render();
					})
				])
			]),
			/*
			 * Toggles with no All chip: none on means everything, which is how every
			 * other chip row in the panel already behaves. An All chip beside them
			 * would be a second way to say the same thing.
			 *
			 * Shown even when there is only one format, which makes that single chip a
			 * filter that cannot change the list. Dumal's call, and the right one: the
			 * row reads as an inventory as much as a control -- one WOFF2 chip says
			 * every file is already converted, which is worth knowing -- and a toolbar
			 * that appears and disappears as the folder changes is worse than a chip
			 * that is briefly redundant.
			 */
			formats.length
				? chipWall('fileFormats', s('formatLabel', 'Format'), formats.map(function (ext) {
					return {
						label: ext,
						count: formatCounts[ext],
						on: state.fileFormats.indexOf(ext) !== -1,
						onclick: function () {
							togglePicked(state.fileFormats, ext);
						}
					};
				}), CHIP_LIMIT)
				: null
		]));

		// A selection cannot reach a file the filter is hiding, the same rule the
		// Library applies to families.
		state.pickedFiles = state.pickedFiles.filter(function (name) {
			return visibleFiles.some(function (file) { return file.name === name; });
		});

		if (!visibleFiles.length) {
			contentEl.appendChild(searchEmpty(
				fileQuery || state.fileFormats.join(', '),
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--outline',
					text: s('resetAll', 'Reset all'),
					onclick: function () {
						state.fileFilter = '';
						state.fileFormats = [];
						render();
					}
				})
			));
			return;
		}

		{
			/*
			 * Only what the selection can actually do. Converting offers itself for
			 * the files that are convertible and not already converted, which is the
			 * same test the per-row button runs; with none of those chosen the button
			 * would be a promise the selection cannot keep.
			 */
			var convertable = state.pickedFiles.filter(function (name) {
				return convertible(name) && converterAvailable() && !state.files.some(function (entry) {
					return entry.name === woff2Name(name) && entry.name !== name;
				});
			});

			// Only the ones no family maps yet; adopting a mapped file would be a
			// second variant pointing at the same bytes.
			var addable = state.pickedFiles.filter(function (name) {
				return !fileUsedBy(name).length;
			});

			/*
			 * Select-all lives in the bar rather than in a table head, because the table
			 * is three tables now and one control cannot sit in three heads. It selects
			 * every file on the screen, across all three groups.
			 */
			// The files on screen, not the folder: Select all cannot reach past a filter.
			var everyFile = visibleFiles.map(function (entry) { return entry.name; });

			var filesBar = bulkBar(state.pickedFiles, everyFile, [
				{
					label: s('convertSelected', 'Convert selected') + ' (' + convertable.length + ')',
					disabled: !convertable.length || !!state.converting,
					onclick: function () { convertPicked(convertable); }
				},
				{
					label: s('addSelected', 'Add to library') + ' (' + addable.length + ')',
					disabled: !addable.length,
					onclick: function () {
						var names = addable.slice();

						state.pickedFiles = [];
						adoptFiles(names);
					}
				},
				{
					label: s('deleteSelected', 'Delete selected'),
					variant: 'danger',
					disabled: !!state.converting,
					onclick: deletePickedFiles
				}
			]);

			if (filesBar) {
				contentEl.appendChild(el('div', { class: 'efm-resultbar' }, [el('span', {}), filesBar]));
			}
		}

		/*
		 * Grouped by where each file came from, because this screen lists the whole
		 * wp-content/fonts folder and always has: Etch shares it, a Google install
		 * writes into it, and adopting a file that is already there is a feature.
		 * Calling the lot "Uploaded files" was the only thing claiming otherwise.
		 *
		 * Each group says what it is and what its files are worth, because the right
		 * answer to "can I delete this" differs by group: a Google file is a click
		 * from being downloaded again, an uploaded one may be the only copy there is.
		 */
		var groups = [
			{
				id: 'upload',
				title: s('groupUploaded', 'Uploaded'),
				hint: s('groupUploadedHint', 'Files you added here, mapped by a family. For a font you uploaded this may be the only copy on the site.'),
				files: []
			},
			{
				id: 'google',
				title: s('groupGoogle', 'From Google Fonts'),
				hint: s('groupGoogleHint', 'Written by the Google Fonts screen. Deleting one can be undone by installing the family again.'),
				files: []
			},
			{
				id: 'loose',
				title: s('groupLoose', 'Not in the library'),
				hint: s('groupLooseHint', 'On the server, but no family maps them. Usually what is left after deselecting a weight, though Etch shares this folder so some may be its. Add them to the library, or delete them to free the space.'),
				files: []
			}
		];

		visibleFiles.forEach(function (file) {
			var bucket = fileOrigin(file.name);

			groups.forEach(function (group) {
				if (group.id === bucket) {
					group.files.push(file);
				}
			});
		});

		groups.forEach(function (group) {
			if (!group.files.length) {
				return;
			}

			contentEl.appendChild(el('h3', {
				class: 'efm-section-title',
				text: group.title + ' \u00b7 ' + group.files.length + ' ' +
					plural(group.files.length, s('fileSingular', 'file'), s('filesLower', 'files')) +
					' \u00b7 ' + formatSize(sizeOfRecords(group.files))
			}));
			contentEl.appendChild(el('p', { class: 'efm-muted', text: group.hint }));

			/*
			 * The cleanup lives with the files it deletes. It used to sit in Import &
			 * export under "Unused files", listing the same set a second time: that
			 * section and this group resolve to the identical predicate -- a file no
			 * family's variants name -- so the panel was answering one question on two
			 * screens and calling it two things.
			 */
			if ('loose' === group.id) {
				/*
				 * Counted from state.unused, not from the group on screen. The group is
				 * a filtered view and this button is not: prune() deletes every unused
				 * file on the server, so labelling it with a filtered count would have
				 * it promise two files and take seven. The two sets are identical with
				 * no filter on, which is why this only shows up once one is.
				 */
				var doomed = state.unused || [];

				contentEl.appendChild(
					el('button', {
						type: 'button',
						// Unlinks files from disk with no trash behind it, which makes it
						// the least recoverable button in the panel.
						class: 'efm-btn efm-btn--danger',
						text: state.pruning
							? s('loading', 'Loading\u2026')
							: s('cleanupButton', 'Delete unused files') + ' \u00b7 ' +
								doomed.length + ' ' +
								plural(doomed.length, s('fileSingular', 'file'), s('filesLower', 'files')) +
								' \u00b7 ' + formatSize(sizeOfRecords(doomed)),
						disabled: state.pruning || !doomed.length,
						onclick: pruneFiles
					})
				);
			}

			/*
			 * Each table heads its own select-all, scoped to the group it sits above.
			 * One box could not head three tables, which is why 0.34.0 pulled it out
			 * to a bare checkbox above the lot -- but three boxes can, one per head,
			 * where a select-all belongs and where the Variants table already puts it.
			 * The bar's Select all still answers for every group at once.
			 */
			var groupNames = group.files.map(function (file) { return file.name; });

			var table = el('div', { class: 'efm-table efm-table--files' }, [
				el('div', { class: 'efm-table__head' }, [
					el('span', { class: 'efm-file__cell' }, [
						pickAll(state.pickedFiles, groupNames, s('selectAllIn', 'Select every file in') + ' ' + group.title),
						el('span', { text: s('file', 'File') })
					]),
					el('span', { text: s('type', 'Type') }),
					el('span', { text: s('size', 'Size') }),
					el('span', { text: '' }),
					el('span', { text: '' })
				])
			]);

			group.files.forEach(function (file) {
				table.appendChild(fileRow(file));
			});

			contentEl.appendChild(table);
		});
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

	/**
	 * Keep a slider's filled track in step with its value.
	 *
	 * A webkit runnable track has no progress pseudo-element, so the fill is a
	 * background layer in panel.css sized from --efm-range-fill. Firefox draws
	 * its own through ::-moz-range-progress and ignores this.
	 *
	 * @param {HTMLInputElement} input Range input.
	 */
	function syncRange(input) {
		var min = parseFloat(input.min);
		var max = parseFloat(input.max);
		var span = max - min;

		input.style.setProperty(
			'--efm-range-fill',
			String(span > 0 ? (parseFloat(input.value) - min) / span : 0)
		);
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

	/**
	 * One variable axis: its name, its tag, the live value, the track and the
	 * range under it.
	 *
	 * Shared by the Google Fonts type tester and the family editor rather than
	 * written twice. previewCss() and build_css() are this codebase's standing
	 * lesson in what two copies of one rule do to each other -- they drifted twice
	 * -- and these two would have carried the same step, the same default
	 * graduation and the same aria-label between them.
	 *
	 * @param {Object}   axis    Axis record: tag, min, max and def.
	 * @param {number}   current Value to open on.
	 * @param {Function} onmove  Given the new value on every input event.
	 * @return {HTMLElement} The row.
	 */
	function axisRow(axis, current, onmove) {
		var meta = state.axisNames[axis.tag] || {};
		var step = Math.pow(10, meta.precision || 0);
		var span = axis.max - axis.min;
		var valueLabel = el('span', { class: 'efm-axis__value', text: trimNumber(current) });

		var slider = el('input', {
			type: 'range',
			class: 'efm-range',
			min: trimNumber(axis.min),
			max: trimNumber(axis.max),
			step: trimNumber(step),
			value: trimNumber(current),
			'aria-label': meta.name ? meta.name + ' (' + axis.tag + ')' : axis.tag,
			/*
			 * Updated in place rather than through render(). Dragging a slider
			 * cannot rebuild the pane -- that would destroy the input mid-drag --
			 * so the caller is handed the value and repaints whatever it owns.
			 */
			oninput: function (event) {
				valueLabel.textContent = event.target.value;
				syncRange(event.target);
				onmove(parseFloat(event.target.value));
			}
		});

		syncRange(slider);

		return el('label', { class: 'efm-axis' }, [
			/*
			 * The tag stands alone when nothing names it. Printing meta.name ||
			 * axis.tag beside the tag itself meant an unnamed axis rendered as
			 * "wdth wdth", which read like a bug because it was one.
			 */
			el('span', { class: 'efm-axis__label' }, [
				meta.name ? el('span', { class: 'efm-axis__name', text: meta.name }) : null,
				el('span', { class: meta.name ? 'efm-axis__tag' : 'efm-axis__name', text: axis.tag }),
				valueLabel
			]),
			/*
			 * The wrapper carries where the default sits on this axis, which
			 * panel.css draws as a single graduation under the track. That replaces
			 * the "default 400" that used to trail every slider on a third line, and
			 * puts the fact where it means something.
			 */
			el('div', {
				class: 'efm-axis__track',
				style: { '--efm-axis-default': String(span > 0 ? (axis.def - axis.min) / span : 0) }
			}, [slider]),
			el('span', { class: 'efm-axis__scale' }, [
				el('span', { text: trimNumber(axis.min) }),
				el('span', { text: trimNumber(axis.max) })
			])
		]);
	}

	/**
	 * A family's stored instance, read back into a map of tag to value.
	 *
	 * @param {Object} family Family record.
	 * @return {Object} Values by axis tag.
	 */
	function variationMap(family) {
		var out = {};

		String((family && family.variation) || '').split(',').forEach(function (piece) {
			var found = /^\s*"([A-Za-z0-9]{4})"\s+(-?\d+(?:\.\d+)?)\s*$/.exec(piece);

			if (found) {
				out[found[1]] = parseFloat(found[2]);
			}
		});

		return out;
	}

	/**
	 * The same map written back out as a font-variation-settings value.
	 *
	 * An axis sitting on its default is left out, so a family nobody has tuned
	 * stores an empty string and the stylesheet says nothing about it. That also
	 * makes dragging a slider back where it started undo the edit properly, the
	 * way the type tester's own reset does.
	 *
	 * @param {Array}  axes Axis records.
	 * @param {Object} map  Values by tag.
	 * @return {string} Declaration value, or an empty string.
	 */
	function variationString(axes, map) {
		var parts = [];

		axes.forEach(function (axis) {
			var value = map[axis.tag];

			if (value !== undefined && value !== axis.def) {
				parts.push('"' + axis.tag + '" ' + trimNumber(value));
			}
		});

		return parts.join(', ');
	}

	/**
	 * Whether any axis on this family sits away from its default.
	 *
	 * Compared rather than remembered. Asking whether the family had an entry at
	 * all answered a different question -- dragging a slider back to where it
	 * started left the entry behind, so the reset stayed live with nothing to
	 * undo. The same mistake the save bar's dirty flag used to make.
	 *
	 * @param {Object} font Family record from the catalogue.
	 * @param {Array}  axes Axis definitions.
	 * @return {boolean} True when a reset would change something.
	 */
	function axesMoved(font, axes) {
		var held = state.axisValues[font.family] || {};

		return (axes || []).some(function (axis) {
			return held[axis.tag] !== undefined && held[axis.tag] !== axis.def;
		});
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
					// Same geometry as the panel header's back button: every back in
					// the panel is the same 40x28 arrow, named by its tooltip.
					class: 'efm-btn efm-btn--outline efm-tooltip efm-tooltip--start',
					'aria-label': s('backToGoogle', 'Back to Google Fonts'),
					'data-efm-tooltip': s('backToGoogle', 'Back to Google Fonts'),
					onclick: function () {
						state.detail = null;
						render();
					}
				}, [icon('back', 'sm')])
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
				class: 'efm-token__value',
				text: 'font-variation-settings: ' + variationSettings(font) + ';'
			});

			var repaint = function () {
				var settings = variationSettings(font);

				tester.style.setProperty('font-variation-settings', settings || 'normal');
				cssLine.textContent = 'font-variation-settings: ' + settings + ';';
			};

			contentEl.appendChild(el('h3', {
				class: 'efm-section-title',
				text: s('variableAxes', 'Variable axes')
			}));

			/*
			 * The reset travels with the sliders, in the next column along. In the
			 * heading band it was right-aligned against a rule that spans the whole
			 * pane, which left it about fifteen hundred pixels from the axes it
			 * resets; on a row of its own underneath it read as a step that came
			 * after them. Beside them it reads as theirs.
			 */
			var resetAxes = el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--ghost efm-btn--sm',
				// Inert until an axis has actually moved, so the control reports
				// whether there is anything to undo rather than always offering it.
				disabled: !axesMoved(font, axes),
				onclick: function () {
					delete state.axisValues[font.family];
					render();
				}
			}, [icon('refresh', 'sm'), el('span', { text: s('resetAxes', 'Reset axes') })]);

			contentEl.appendChild(el('div', { class: 'efm-axes' }, axes.map(function (axis) {
				return axisRow(axis, axisValue(font, axis), function (value) {
					axisState(font.family)[axis.tag] = value;
					repaint();
					resetAxes.disabled = !axesMoved(font, axes);
				});
			}).concat([resetAxes])));

			/*
			 * The live declaration, on the same copyable well the CSS variable uses
			 * in the family editor. It was a bare full-width code block holding
			 * forty characters, with no way to lift them out.
			 */
			contentEl.appendChild(el('div', { class: 'efm-token efm-token--fit' }, [
				cssLine,
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--ghost efm-btn--sm efm-btn--icon efm-tooltip efm-tooltip--end',
					'aria-label': s('copy', 'Copy'),
					'data-efm-tooltip': s('copy', 'Copy'),
					onclick: function () {
						copyText(cssLine.textContent, s('copiedVariation', 'Variable font settings copied.'));
					}
				}, [icon('copy', 'sm')])
			]));
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

		/*
		 * Everything below this point decides what gets installed. Without a band
		 * it ran on from the tester as one undifferentiated stack of rows, which
		 * is the fault the section headings were introduced to fix everywhere else.
		 */
		contentEl.appendChild(el('h3', {
			class: 'efm-section-title',
			text: s('installOptions', 'Install options')
		}));

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
			installed ? el('span', { class: 'efm-badge' }, [icon('check', 'sm'), el('span', { text: s('installed', 'Installed') })]) : null,
			/*
			 * The one place the user leaves for, and it was a line of muted text
			 * stranded under everything else -- the only control in the panel that
			 * was not shaped like one. It takes the outline button every other
			 * secondary action uses and stands beside the install it belongs with,
			 * with the icon saying it opens outside the builder.
			 */
			el('a', {
				class: 'efm-btn efm-btn--outline',
				href: 'https://fonts.google.com/specimen/' + font.family.replace(/ /g, '+'),
				target: '_blank',
				rel: 'noopener noreferrer'
			}, [
				el('span', { text: s('viewOnGoogle', 'View on Google Fonts') }),
				icon('external', 'sm')
			])
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
			'data-efm-focus': 'google-search',
			placeholder: s('searchGoogle', 'Search Google Fonts'),
			value: state.query,
			/*
			 * The query is taken off the field at once and only the search is
			 * deferred. Debouncing the assignment too left state.query a keystroke or
			 * more behind the field, and since every render rebuilds this input from
			 * state.query, whatever was typed during the wait or the request was
			 * wiped and the caret jumped back to the end of the shorter string. Two
			 * renders happen per search -- one for the skeleton, one for the results --
			 * so the window was the debounce plus the round trip.
			 */
			oninput: function (event) {
				state.query = event.target.value;
				queueGoogleSearch();
			}
		});

		var categoryOptions = [{ value: '', label: s('allCategories', 'All categories') }];

		state.categories.forEach(function (cat) {
			categoryOptions.push({ value: cat, label: cat });
		});

		var categorySelect = dropdown({
			key: 'google-category',
			label: s('category', 'Category'),
			value: state.category,
			options: categoryOptions,
			onselect: function (value) {
				state.category = value;
				searchGoogle();
			}
		});

		var sortSelect = dropdown({
			key: 'google-sort',
			label: s('sortBy', 'Sort by'),
			value: state.sort,
			options: [
				{ value: 'popularity', label: s('sortPopular', 'Most popular') },
				{ value: 'trending', label: s('sortTrending', 'Trending') },
				{ value: 'newest', label: s('sortNewest', 'Newest') },
				{ value: 'alphabetical', label: s('sortAlpha', 'A to Z') }
			],
			onselect: function (value) {
				state.sort = value;
				searchGoogle();
			}
		});

		/*
		 * Writing system. The count matters: it is the difference between "Latin,
		 * 1817 families" and "Sinhala, 8", and picking a script without knowing
		 * that looks like a broken filter rather than a small catalogue.
		 */
		var subsetOptions = [{ value: '', label: s('allScripts', 'Any writing system') }];

		state.subsetList.forEach(function (entry) {
			subsetOptions.push({ value: entry.subset, label: entry.subset + ' (' + entry.count + ')' });
		});

		var subsetSelect = dropdown({
			key: 'google-subset',
			label: s('writingSystem', 'Writing system'),
			value: state.subset,
			options: subsetOptions,
			onselect: function (value) {
				state.subset = value;
				resetSubsetDefaults();
				searchGoogle();
			}
		});

		var variableSelect = dropdown({
			key: 'google-technology',
			label: s('technology', 'Technology'),
			value: state.variableOnly,
			options: [
				{ value: '', label: s('anyTech', 'Any technology') },
				{ value: '1', label: s('variableOnly', 'Variable only') },
				{ value: '0', label: s('staticOnly', 'Static only') }
			],
			onselect: function (value) {
				state.variableOnly = value;
				searchGoogle();
			}
		});

		contentEl.appendChild(previewToolbar(
			el('div', { class: 'efm-toolbar__lead' }, [
				el('div', { class: 'efm-search' }, [
					icon('search', 'sm'),
					clearableField(search, s('clearSearch', 'Clear search'), function () {
						state.query = '';
						searchGoogle();
					})
				]),
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
			var reset = googleFiltered()
				? el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--primary',
					text: s('resetAll', 'Reset all'),
					onclick: resetGoogleFilters
				})
				: null;

			/*
			 * A term can be quoted back; a filter with no term cannot, so that case
			 * keeps the plain empty state rather than saying "No results for" with
			 * nothing after it.
			 */
			contentEl.appendChild(state.query.trim()
				? searchEmpty(state.query.trim(), reset)
				: emptyState(
					s('noResults', 'No fonts found.'),
					null,
					googleFiltered()
						? [{ label: s('resetAll', 'Reset all'), onclick: resetGoogleFilters }]
						: null
				));
			return;
		}

		contentEl.appendChild(el('div', { class: 'efm-resultbar' }, [
			el('p', {
				class: 'efm-muted',
				text: googleSummary()
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
						el('h2', { class: 'efm-card__title efm-card__title--link' }, [
							el('button', {
								type: 'button',
								/*
								 * The hint is Etch's own tooltip rather than the browser's
								 * grey box, which meant the heading had to stop clipping:
								 * a ::after cannot escape an ancestor with hidden overflow.
								 * The name moves into a span so the ellipsis still happens,
								 * and the arrow beside it is the hover affordance that
								 * replaced the underline.
								 */
								class: 'efm-linkbtn efm-tooltip',
								'data-efm-tooltip': s('openDetail', 'Open the type tester'),
								onclick: function () {
									state.detail = font.family;
									render();
								}
							}, [
								el('span', { class: 'efm-linkbtn__text', text: font.family }),
								icon('forward', 'sm')
							])
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
					 * One line: the label and its axis range, nothing else. The
					 * explanation used to hang off this label as a wrapping tooltip,
					 * which opened downward across the Subsets row underneath and hid
					 * the chips the reader was on their way to. The type tester still
					 * spells it out, where there is one family and room to say it.
					 */
					hasVariable ? el('label', {
						class: 'efm-toggle efm-toggle--inline'
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
							class: 'efm-muted efm-tooltip efm-tooltip--wrap efm-tooltip--end',
							text: formatSize(font.size),
							'data-efm-tooltip': s('familySizeHint', 'Size of the whole family at Google. What you install depends on the subsets and weights chosen below.')
						}) : null
					])
				])
			);
		});

		contentEl.appendChild(grid);
		observePreviews(grid);

		if (googlePageCount() > 1) {
			contentEl.appendChild(pagination(state.page, googlePageCount(), goToGooglePage));
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
	/**
	 * The variant selection, if it still belongs to the family on screen.
	 *
	 * Switching families abandons it rather than reinterpreting its positions
	 * against a different list of variants.
	 *
	 * @param {number} familyIndex Family being edited.
	 * @return {string[]} Selected positions, as strings.
	 */
	function variantPicks(familyIndex) {
		var held = state.pickedVariants;

		if (held.family !== familyIndex) {
			state.pickedVariants = { family: familyIndex, list: [] };
		}

		return state.pickedVariants.list;
	}

	/**
	 * Add or remove a name from a selection, in place.
	 *
	 * @param {string[]} list Selection array from state.
	 * @param {string}   name What was clicked.
	 */
	function togglePicked(list, name) {
		var at = list.indexOf(name);

		if (at === -1) {
			list.push(name);
		} else {
			list.splice(at, 1);
		}

		render();
	}

	/**
	 * A select-all box for a table head or a grid header.
	 *
	 * Tri-state in the way that matters: indeterminate while some but not all are
	 * chosen, which is what Etch's own .bulk-bar__select-all does and what stops
	 * the box claiming the list is empty when it is half-picked.
	 *
	 * Scoped by membership rather than by length, because the Font files screen
	 * heads three tables that share one selection array. Counting would have a
	 * one-file table read as fully picked the moment two files were chosen in a
	 * different table, and clearing the whole array would have unticking one head
	 * wipe the other two tables' selections with it.
	 *
	 * @param {string[]} list  Selection array from state.
	 * @param {string[]} all   Every selectable name this box answers for.
	 * @param {string}   label Accessible name.
	 * @return {Element}
	 */
	function pickAll(list, all, label) {
		var chosen = all.filter(function (name) {
			return list.indexOf(name) !== -1;
		});

		var box = el('input', {
			type: 'checkbox',
			class: 'efm-checkbox',
			'aria-label': label,
			checked: all.length > 0 && chosen.length === all.length,
			onchange: function (event) {
				if (event.target.checked) {
					all.forEach(function (name) {
						if (list.indexOf(name) === -1) {
							list.push(name);
						}
					});
				} else {
					all.forEach(function (name) {
						var at = list.indexOf(name);

						if (at !== -1) {
							list.splice(at, 1);
						}
					});
				}

				render();
			}
		});

		box.indeterminate = chosen.length > 0 && chosen.length < all.length;

		return el('label', { class: 'efm-card__pick' }, [box]);
	}

	/**
	 * The bar that appears once something is selected.
	 *
	 * Select all is a word here rather than a naked checkbox above the grid. The
	 * checkbox it replaces sat outside the cards it selected, with no label and
	 * nothing to head, so it read as a stray control rather than a header. In the
	 * bar it cannot be mistaken for one: the bar exists only once something is
	 * picked, and it says what it does.
	 *
	 * @param {string[]} list    Selection array from state.
	 * @param {string[]} all     Every selectable key on screen. Null on a screen whose
	 *                           select-all sits in a table head, which already has one.
	 * @param {Array}    actions Buttons, each { label, variant, disabled, onclick }.
	 * @return {Element|null} Null when nothing is selected.
	 */
	function bulkBar(list, all, actions) {
		if (!list.length) {
			return null;
		}

		var every = all || [];
		var rest = every.filter(function (key) {
			return list.indexOf(key) === -1;
		});

		var head = [
			el('span', {
				class: 'efm-bulk__count',
				text: list.length + ' ' + s('selected', 'selected')
			})
		];

		// Hidden rather than disabled once everything is picked: the count beside it
		// already says so, and a dead button earns no room in a bar this short.
		if (rest.length) {
			head.push(el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--ghost efm-btn--sm',
				text: s('selectAll', 'Select all') + ' (' + every.length + ')',
				onclick: function () {
					rest.forEach(function (key) {
						list.push(key);
					});

					render();
				}
			}));
		}

		head.push(el('button', {
			type: 'button',
			class: 'efm-btn efm-btn--ghost efm-btn--sm',
			onclick: function () {
				list.length = 0;
				render();
			}
		}, [icon('close', 'sm'), el('span', { text: s('clearSelection', 'Clear') })]));

		return el('div', { class: 'efm-bulk' }, head.concat((actions || []).map(function (action) {
			return el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--' + (action.variant || 'outline') + ' efm-btn--sm',
				disabled: !!action.disabled,
				text: action.label,
				onclick: action.onclick
			});
		})));
	}

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
					// Some installed and some did not, which is Etch's warning level
					// rather than its error one.
					setStatus(
						s('bulkPartial', 'Installed') + ' ' + done + ', ' +
							s('bulkFailed', 'failed') + ': ' + failed.join(', '),
						'warning'
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
			setStatus(s('installing', 'Installing…') + ' ' + family + ' (' + (done + 1) + '/' + state.picked.length + ')', 'progress');
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

		/*
		 * A standing preference rather than a question asked at each conversion.
		 * Converting is one click from the Upload screen, and whether the original
		 * is worth keeping is a fact about how this site is run -- whether the
		 * fonts are archived somewhere else -- not a judgement to be made again for
		 * every file.
		 */
		var deleteSource =
			el('label', { class: 'efm-toggle' }, [
				el('input', {
					type: 'checkbox',
					class: 'efm-checkbox',
					checked: !!state.settings.delete_source_on_convert,
					onchange: function (event) {
						state.settings.delete_source_on_convert = event.target.checked;
						render();
					}
				}),
				el('span', {}, [
					el('span', { class: 'efm-toggle__label', text: s('deleteSource', 'Delete the original after converting it to WOFF2') }),
					el('span', { class: 'efm-field__hint', text: s('deleteSourceHint', 'Off by default. Converting is one-way here, so the file it converted from cannot be rebuilt from the result, and for a font you uploaded it may be the only copy on the site. Left off, the original stays on the server and the Upload screen marks it unused, ready to remove whenever you choose. A source that another family still maps is never deleted either way.') })
				])
			]);

		contentEl.appendChild(section(s('stylesheet', 'Stylesheet'), [stylesheetStatus, inlineToggle, regenerate]));
		contentEl.appendChild(section(s('privacy', 'Privacy'), [blockGoogle]));

		/*
		 * Hidden with the converter it belongs to. A build without the wasm binary
		 * hides the convert button rather than breaking uploads, and a setting for
		 * a button that is not there is a setting for nothing.
		 */
		if (converterAvailable()) {
			contentEl.appendChild(section(s('conversion', 'Conversion'), [deleteSource]));
		}

		/*
		 * The other half of what happens when the plugin goes. By default an
		 * uninstall leaves wp-content/fonts alone, so a site that deletes the plugin
		 * by accident still has its typography; this is how a site that means it
		 * gets a clean removal instead.
		 */
		var purgeFiles =
			el('label', { class: 'efm-toggle' }, [
				el('input', {
					type: 'checkbox',
					class: 'efm-checkbox',
					checked: !!state.settings.purge_files,
					// Re-rendered like its three neighbours. This one alone updated the
					// buffer and told nothing, so even the save bar could not see it.
					onchange: function (event) {
						state.settings.purge_files = event.target.checked;
						render();
					}
				}),
				// A bare wrapper, the way the other ten toggles write it. This one
				// alone carried an efm-toggle__text class that no rule ever matched.
				el('span', {}, [
					el('span', { class: 'efm-toggle__label', text: s('purgeFiles', 'Delete the font files when the plugin is deleted') }),
					el('span', { class: 'efm-field__hint', text: s('purgeFilesHint', 'Off by default, so deleting the plugin by mistake leaves your typography standing. On, deleting the plugin from Plugins also removes the generated stylesheet and every font file your families map. Files nothing maps are left alone, and so is anything else in wp-content/fonts, because Etch shares that folder. Deactivating never deletes anything.') })
				])
			]);

		contentEl.appendChild(section(s('removal', 'Removal'), [purgeFiles]));

		/*
		 * No save button of its own. This screen used to commit by itself, which
		 * meant a toggle changed nothing the save bar knew about: the panel could
		 * carry unsaved settings while reporting no unsaved changes, and closing it
		 * lost them without a word. The toggles are part of the same buffer as
		 * everything else now, so the save bar names them and one Save commits the
		 * lot.
		 */
	}

	/* -------------------------------- Tools ------------------------------ */

	/**
	 * The one line that carries the typography if the plugin goes.
	 *
	 * Deactivating or deleting stops anything enqueueing the stylesheet, so every
	 * family falls back even though the files are still on disk. The stylesheet
	 * itself survives an uninstall and references its files relatively, so it works
	 * from where it sits: one @import in a theme or in Automatic.css is the whole
	 * migration.
	 *
	 * @return {Element|null} The section, or null with no stylesheet to point at.
	 */
	function keepWithoutPlugin() {
		if (!state.cssUrl) {
			return null;
		}

		var line = '@import url("' + state.cssUrl + '");';

		return el('div', {}, [
			el('h3', { class: 'efm-section-title', text: s('keepTitle', 'Keeping these fonts without the plugin') }),
			el('p', {
				class: 'efm-muted',
				text: s('keepHint', 'Deactivating or deleting the plugin stops this stylesheet being loaded, so every family falls back to its stack. The font files and the stylesheet are both left in wp-content/fonts, so this line keeps them working from a theme or from Automatic.css. It has to be the first rule in whichever stylesheet you paste it into.')
			}),
			el('div', { class: 'efm-token' }, [
				el('code', { class: 'efm-token__value', text: line }),
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--ghost efm-btn--sm efm-btn--icon efm-tooltip efm-tooltip--end',
					'aria-label': s('copy', 'Copy'),
					'data-efm-tooltip': s('copy', 'Copy'),
					onclick: function () {
						copyText(line, s('copiedImport', 'Stylesheet import line copied.'));
					}
				}, [icon('copy', 'sm')])
			])
		]);
	}

	function renderTools() {
		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('exportTitle', 'Export') }));
		contentEl.appendChild(el('p', { class: 'efm-muted', text: s('exportHint', 'Download families, their variant mapping and assignments as a JSON file. Choose which families to include, and whether to bundle the font files with them.') }));

		/*
		 * Live families only. Reading state.families offered the trash as something
		 * to export, pre-selected along with everything else, so the obvious act of
		 * pressing Download carried away families the site had deleted. The server
		 * drops them too -- this is the half that stops them being offered.
		 */
		var exportable = liveFamilies().map(function (family) { return family.name; });
		var picked = state.exportPick || exportable;

		if (exportable.length) {

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
				// An export of no families is an empty file, so the button says so.
				disabled: state.busy === 'export' || !picked.length,
				onclick: exportConfig
			})
		);

		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('importTitle', 'Import') }));
		contentEl.appendChild(el('p', { class: 'efm-muted', text: s('importHint', 'Load a configuration exported from another site.') }));

		var modeSelect = dropdown({
			key: 'import-mode',
			label: s('importMode', 'Import mode'),
			value: state.importMode === 'merge' ? 'merge' : 'replace',
			options: [
				{ value: 'replace', label: s('importReplace', 'Replace everything') },
				{ value: 'merge', label: s('importMerge', 'Merge with existing families') }
			],
			onselect: function (value) {
				state.importMode = value;
			}
		});

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
				el('div', { class: 'efm-field' }, [
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
				lines.push(el('div', { class: 'efm-filewell' }, report.missing.map(function (name) {
					return el('span', { class: 'efm-filewell__item', text: name });
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

		var keeping = keepWithoutPlugin();

		if (keeping) {
			contentEl.appendChild(keeping);
		}

		// Unrelated tools on one pane; the headings mark where each ends.
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
			.catch(failing(s('failImport', 'Could not import that configuration. Your fonts are unchanged.')))
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
					setStatus(s('recoverFailed', 'Could not download:') + ' ' + failed.join(', '), 'error');
				} else {
					state.importReport = null;
					setStatus(s('recoverDone', 'Downloaded') + ' \u00b7 ' + done + ' ' +
						plural(done, s('fileSingular', 'file'), s('filesLower', 'files')));
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
		var all = liveFamilies().map(function (family) { return family.name; });
		var chosen = state.exportPick || all;
		var query = [];

		/*
		 * A deliberate choice of nothing cannot be expressed as a query, because
		 * omitting families[] is how "all" is sent, so it is refused here rather
		 * than quietly exporting the lot. The button is disabled in that state; this
		 * guards the path, not the pointer.
		 */
		if (!chosen.length) {
			return;
		}

		state.busy = 'export';
		render();

		// Sending every name and sending none mean the same thing to the server,
		// so the shorter request wins.
		if (chosen.length !== all.length) {
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
			.catch(failing(s('failExport', 'Could not build the download. Your fonts are unchanged.')))
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
				setStatus(s('importInvalid', 'That file is not valid JSON.'), 'error');
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
				.catch(failing(s('failImportPreview', 'Could not read that configuration. Nothing has been changed.')))
				.then(function () {
					state.busy = '';
					render();
				});
		};

		reader.onerror = function () {
			state.busy = '';
			setStatus(s('failImportRead', 'Could not read that file. It may be unreadable, or no longer where it was.'), 'error');
			render();
		};

		reader.readAsText(file);
	}

	/* ------------------------------- Actions ----------------------------- */

	function addFamily() {
		state.families.push({ name: s('newFamily', 'New family'), variants: [], source: 'upload', display: 'swap', preload: false, fallback: '' });
		state.editing = state.families.length - 1;
		render();
	}

	function saveFamilies() {
		state.busy = 'save';
		renderSaveBar();

		/*
		 * Taken before the request so a second save cannot send them twice, and only
		 * acted on once the record removal has actually landed.
		 */
		var doomedFiles = state.pendingFileDeletes.slice();

		/*
		 * Reported rather than assumed. "Save and close" has to know whether the save
		 * actually landed: closing the panel on a failed request would put the edits
		 * out of reach behind a toast nobody is looking at any more.
		 */
		var saved = true;

		/*
		 * Captured before anything is sent. Both endpoints answer with the whole
		 * state, so applying the families response would overwrite state.settings
		 * with the copy the server still holds -- and the settings request that
		 * followed would then post the values it had just been handed back. The
		 * payload is read once, here, and the settings response is the one applied.
		 */
		var settingsPending = settingsDirty();
		var settingsBody = normalizeSettings(state.settings);
		var bothChanged = settingsPending && fingerprint(state.families) !== state.saved;

		// Which request is in flight, so a failure names the half that failed rather
		// than reporting the families it may well have written successfully.
		var stage = 'families';

		state.pendingFileDeletes = [];

		return request('/families', { method: 'POST', body: { families: state.families } })
			.then(function (next) {
				if (!settingsPending) {
					applyState(next);
					setStatus(s('saved', 'Fonts saved.'));
					return null;
				}

				stage = 'settings';

				return request('/settings', { method: 'POST', body: settingsBody })
					.then(function (after) {
						applyState(after);
						setStatus(bothChanged
							? s('savedBoth', 'Fonts and settings saved.')
							: s('settingsSaved', 'Settings saved.'));
					});
			})
			.then(function () {
				return doomedFiles.reduce(function (chain, name) {
					return chain.then(function () {
						return request('/files/delete', { method: 'POST', body: { filename: name } })
							.then(applyState)
							// A file already gone is not a failure worth stopping for.
							.catch(function () {});
					});
				}, Promise.resolve());
			})
			.catch(function (error) {
				saved = false;
				failing('settings' === stage
					? s('failSaveSettings', 'Could not save your settings. They are unchanged on the server.')
					: s('failSaveFonts', 'Could not save your fonts. Nothing was written to the server.'))(error);
			})
			.then(function () {
				state.busy = '';
				render();

				return saved;
			});
	}

	function reload() {
		// Discard drops the queued deletions with everything else it discards.
		state.pendingFileDeletes = [];

		request('/state').then(function (next) {
			applyState(next);
			state.editing = null;
			render();
		}).catch(failing(s('failReload', 'Could not reload your fonts from the server, so what you see may be out of date.')));
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
	 * Whether these bytes open as a plain sfnt.
	 *
	 * 0x00010000 is TrueType, OTTO is CFF, true and ttcf turn up on older Apple
	 * fonts. Checked rather than assumed, because toSfnt() hands a WOFF2 straight
	 * back unchanged -- it only knows how to unwrap WOFF -- and reading a table
	 * directory out of brotli-compressed bytes yields convincing nonsense.
	 *
	 * @param {ArrayBuffer} buffer Font bytes.
	 * @return {boolean}
	 */
	function isSfnt(buffer) {
		if (!buffer || buffer.byteLength < 12) {
			return false;
		}

		var version = new DataView(buffer).getUint32(0);

		return 0x00010000 === version || 0x4f54544f === version ||
			0x74727565 === version || 0x74746366 === version;
	}

	/**
	 * Find one table in an sfnt directory.
	 *
	 * @param {ArrayBuffer} buffer Font bytes.
	 * @param {string}      want   Four character tag.
	 * @return {?{offset: number, length: number}}
	 */
	function sfntTable(buffer, want) {
		var view = new DataView(buffer);
		var count = view.getUint16(4);
		var at;
		var tag;
		var i;

		for (i = 0; i < count; i++) {
			at = 12 + i * 16;

			if (at + 16 > buffer.byteLength) {
				return null;
			}

			tag = String.fromCharCode(
				view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3)
			);

			if (tag === want) {
				return { offset: view.getUint32(at + 8), length: view.getUint32(at + 12) };
			}
		}

		return null;
	}

	/**
	 * The variable axes declared in a font's fvar table.
	 *
	 * Returned in the shape the Google index already uses -- tag, min, max, def --
	 * so the family editor cannot tell the two sources apart and needs no second
	 * code path. Values are Fixed 16.16, hence the /65536; fvar orders them min,
	 * default, max, which is not the order they are stored in.
	 *
	 * A malformed or truncated table answers with nothing rather than throwing:
	 * this runs inside an upload, and a font the panel cannot introspect should
	 * still upload perfectly well.
	 *
	 * @param {ArrayBuffer} buffer sfnt bytes.
	 * @return {Array} Axis records, empty when the font is not variable.
	 */
	function parseFvar(buffer) {
		if (!isSfnt(buffer)) {
			return [];
		}

		try {
			var table = sfntTable(buffer, 'fvar');

			if (!table || table.offset + 16 > buffer.byteLength) {
				return [];
			}

			var view = new DataView(buffer);
			var base = table.offset;
			var first = base + view.getUint16(base + 4);
			var count = view.getUint16(base + 8);
			var size = view.getUint16(base + 10);
			var out = [];
			var at;
			var i;

			// 20 is the size of the axis record every fvar has had since 1.0.
			if (size < 20) {
				return [];
			}

			for (i = 0; i < count; i++) {
				at = first + i * size;

				if (at + 20 > buffer.byteLength) {
					break;
				}

				out.push({
					tag: String.fromCharCode(
						view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3)
					),
					min: view.getInt32(at + 4) / 65536,
					def: view.getInt32(at + 8) / 65536,
					max: view.getInt32(at + 12) / 65536
				});
			}

			return out;
		} catch (error) {
			return [];
		}
	}

	/**
	 * Read a font's axes from whatever container it arrived in.
	 *
	 * The one seam the WOFF2 decoder slots into later: sfnt is read directly,
	 * WOFF is unwrapped by machinery that already exists, and WOFF2 answers with
	 * nothing because the wasm we ship encodes and does not decode. Filling that
	 * branch in is the whole of adding WOFF2 support -- nothing else here changes,
	 * and the axes it returns would be stored exactly the same way.
	 *
	 * Answers null when the container could not be opened and an array when it
	 * could. The difference matters: an empty array says "read it, not a variable
	 * font", null says "nobody has been able to look", and the family editor has
	 * something different to tell you in each case.
	 *
	 * @param {ArrayBuffer} buffer Original file bytes.
	 * @return {Promise} Resolves with axis records, or null when unreadable.
	 */
	/**
	 * The vertical metrics a metric-matched fallback needs.
	 *
	 * hhea rather than OS/2: hhea's ascender and descender are what browsers use
	 * for the line box on every platform, while the OS/2 pair are advisory and
	 * frequently disagree with them. Read as a fraction of the em, because that is
	 * the form ascent-override takes.
	 *
	 * @param {ArrayBuffer} sfnt Uncompressed font bytes.
	 * @return {Object|null} { ascent, descent, gap } as percentages.
	 */
	function parseMetrics(sfnt) {
		if (!isSfnt(sfnt)) {
			return null;
		}

		try {
			var head = sfntTable(sfnt, 'head');
			var hhea = sfntTable(sfnt, 'hhea');

			if (!head || !hhea) {
				return null;
			}

			var view = new DataView(sfnt);
			var unitsPerEm = view.getUint16(head.offset + 18);

			if (!unitsPerEm) {
				return null;
			}

			var percent = function (units) {
				return Math.round(Math.abs(units) / unitsPerEm * 10000) / 100;
			};

			return {
				ascent: percent(view.getInt16(hhea.offset + 4)),
				descent: percent(view.getInt16(hhea.offset + 6)),
				gap: percent(view.getInt16(hhea.offset + 8))
			};
		} catch (error) {
			return null;
		}
	}

	/**
	 * Read a font's metrics, unwrapping whatever container it is in.
	 *
	 * The same shape as axesFromFont, and for the same reason: a WOFF or WOFF2 is
	 * not readable until it has been unwrapped.
	 *
	 * @param {ArrayBuffer} buffer Font bytes.
	 * @return {Promise} Resolves with metrics or null.
	 */
	function metricsFromFont(buffer) {
		var head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));

		if (isWoff2(head)) {
			if (!converterAvailable()) {
				return Promise.resolve(null);
			}

			return decodeBuffer(buffer.slice(0)).then(parseMetrics).catch(function () {
				return null;
			});
		}

		return toSfnt(buffer).then(parseMetrics).catch(function () {
			return null;
		});
	}

	function axesFromFont(buffer) {
		var head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));

		/*
		 * A WOFF2 has to be unwrapped before its fvar table is anything but
		 * brotli-compressed noise. This used to answer null and say so in the
		 * interface, because only the encoder half of the codec was compiled in;
		 * the decoder is there now, so a variable font uploaded already compressed
		 * gets the same axes one uploaded as TTF has always got.
		 *
		 * A copy, because the worker takes ownership of whatever it is handed and
		 * the caller still needs these bytes afterwards. It costs one memcpy of a
		 * font, and it removes a dependency on a decision three functions away.
		 */
		if (isWoff2(head)) {
			if (!converterAvailable()) {
				return Promise.resolve(null);
			}

			return decodeBuffer(buffer.slice(0)).then(function (sfnt) {
				return isSfnt(sfnt) ? parseFvar(sfnt) : null;
			}).catch(function () {
				return null;
			});
		}

		return toSfnt(buffer).then(function (sfnt) {
			return isSfnt(sfnt) ? parseFvar(sfnt) : null;
		}).catch(function () {
			return null;
		});
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
	function workerJob(type, buffer) {
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

			// Transferred, not copied: the worker takes ownership of these bytes and
			// the buffer is detached here the moment this returns.
			worker.postMessage({ id: id, type: type, buffer: buffer }, [buffer]);
		});
	}

	function convertBuffer(buffer) {
		return workerJob('convert', buffer);
	}

	/**
	 * Unwrap WOFF2 bytes back to sfnt.
	 *
	 * Only ever used to read a table out of the result. The reconstructed sfnt is
	 * not byte-identical to whatever was compressed -- WOFF2 normalises table
	 * order and drops padding -- which does not matter to a reader and would
	 * matter a great deal to anything that kept the output.
	 *
	 * @param {ArrayBuffer} buffer WOFF2 bytes. Transferred to the worker.
	 * @return {Promise} Resolves with an ArrayBuffer of sfnt bytes.
	 */
	function decodeBuffer(buffer) {
		return workerJob('decode', buffer);
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
			to: file.size,
			axes: null
		};

		/*
		 * Read before anything else happens to the bytes. Conversion runs here in
		 * the browser and only its result is uploaded, so the original never reaches
		 * the server -- this is the one moment a variable font's fvar table can be
		 * read at all. Missing it is why an uploaded variable font had no axes while
		 * a Google install did.
		 */
		return file.arrayBuffer().then(function (buffer) {
			return axesFromFont(buffer).then(function (axes) {
				plain.axes = axes;

				if (!state.convert || !convertible(file.name) || !converterAvailable()) {
					return plain;
				}

				return convertUploadBuffer(buffer, file, plain);
			});
		});
	}

	/**
	 * Convert an upload's bytes, keeping the axes already read from them.
	 *
	 * @param {ArrayBuffer} buffer Original bytes.
	 * @param {File}        file   The file they came from.
	 * @param {Object}      plain  The unconverted result, used when conversion is
	 *                             refused or does not pay.
	 * @return {Promise}
	 */
	function convertUploadBuffer(buffer, file, plain) {
		return toSfnt(buffer).then(convertBuffer).then(function (result) {
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
				to: bytes.length,
				// Carried across the conversion. The WOFF2 that comes out cannot be
				// read back, so this is the only copy of the answer.
				axes: plain.axes
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

	/**
	 * A line in the upload report that is not a conversion.
	 *
	 * The report is the only part of an upload that stays on screen: the toast
	 * counts down and goes. So anything the user picked and did not get belongs
	 * here, beside the files that did convert, naming the file it was picked as.
	 *
	 * @param {string} name What the user picked.
	 * @param {string} note What happened to it.
	 */
	function logNote(name, note) {
		state.convertLog.push({ name: name, note: note, from: 0, to: 0, saved: 0, error: '' });
	}

	function convertReport() {
		var list = el('ul', { class: 'efm-convert-log' });

		state.convertLog.forEach(function (entry) {
			/*
			 * Three outcomes share this list: a conversion, a file that was skipped
			 * with a reason, and one that failed. Only the first has two sizes to
			 * compare, so only the first gets the band -- the other two would draw an
			 * empty one.
			 */
			var told = entry.error || entry.note || '';

			var head = el('div', { class: 'efm-convert-log__head' }, [
				el('span', { class: 'efm-file__name', text: entry.name, title: entry.name }),
				el('span', {
					class: 'efm-convert-log__note',
					// The saving keeps its place beside the name: Etch's band is two
					// columns and adding a third would stop being Etch's band.
					text: told || (entry.saved + '% ' + s('smaller', 'smaller'))
				})
			]);

			var rows = [head];

			if (!told) {
				rows.push(el('div', { class: 'efm-results' }, [
					el('div', { class: 'efm-results__col' }, [
						el('span', { class: 'efm-results__label', text: s('originalFile', 'Original') }),
						el('span', {
							class: 'efm-results__value',
							text: extensionOf(entry.name).toUpperCase() + ' ' + formatSize(entry.from)
						})
					]),
					el('div', { class: 'efm-results__col efm-results__col--out' }, [
						el('span', { class: 'efm-results__label', text: s('compressedFile', 'Compressed') }),
						el('span', { class: 'efm-results__value', text: 'WOFF2 ' + formatSize(entry.to) })
					])
				]));
			}

			list.appendChild(el('li', { class: 'efm-convert-log__item' + (entry.error ? ' is-error' : '') }, rows));
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
	/**
	 * Convert one file already on the server.
	 *
	 * Returns its promise so a selection can be run in order. It resolves either
	 * way: a file that will not convert is logged and the rest of the queue still
	 * runs, which is the same rule the uploader follows.
	 *
	 * @param {Object} file Entry from state.files.
	 * @return {Promise} Settles when this file is done with.
	 */
	function convertExisting(file) {
		if (state.converting) {
			return Promise.resolve();
		}

		/*
		 * Repointing variants writes the family list back to the server from the
		 * stored copy, so anything edited but not saved would go. Same question the
		 * installer asks, and the same two ways out of it.
		 */
		if (isDirty()) {
			withSavedBuffer(
				s('confirmConvertDirty', 'Converting writes the family mapping to the server, which replaces anything unsaved in the panel.'),
				function () {
					convertExisting(file);
				}
			);

			return Promise.resolve();
		}

		state.converting = file.name;
		state.convertLog = [];
		setStatus(s('converting', 'Converting to WOFF2…') + ' · ' + file.name, 'progress');
		render();

		var stored;

		return fetch(file.url, { credentials: 'same-origin' }).then(function (response) {
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
			var summary = s('converted', 'Converted') + ' \u00b7 ' + formatSize(stored.from) +
				' \u2192 ' + formatSize(stored.to) + ' \u00b7 ';

			/*
			 * The conversion is what made the source an orphan, so the source is
			 * named either way. What happens to it is the site's standing choice in
			 * Settings rather than this function's opinion.
			 *
			 * Off, which is the default, it stays: converting is one-way here --
			 * there is an encoder and no decoder, so a WOFF2 cannot become a TTF
			 * again -- and for an uploaded font this may be the only copy on the
			 * site. Import & export removes it on purpose instead.
			 *
			 * The mapping check is not belt and braces. store_upload() refuses a
			 * file it already holds and answers with the twin it kept, so converting
			 * a second copy of a face can finish with the source still mapped by
			 * another family, and no setting should delete a file in use.
			 */
			if (state.settings.delete_source_on_convert && !fileUsedBy(file.name).length) {
				// No trash-the-emptied flag, and there must never be one: the guard
				// above only lets this run on a file nothing maps, so there is no
				// family to empty and a standing setting should not trash one anyway.
				return deleteFile(file.name).then(function () {
					/*
					 * deleteFile reports its own failure and swallows it, so the message
					 * is decided by what the refreshed list actually holds rather than by
					 * having asked. A delete that failed still leaves an orphan, and
					 * saying otherwise sends someone looking for a file that is there.
					 */
					var gone = !(state.files || []).some(function (entry) {
						return entry.name === file.name;
					});

					setStatus(gone
						? summary + file.name + ' \u00b7 ' + s('sourceDeleted', 'original deleted')
						: summary + file.name + ' ' + s('nowUnused', 'is now unused'));
				});
			}

			setStatus(summary + file.name + ' ' + s('nowUnused', 'is now unused'));

			return null;
		}).catch(failing(s('failConvert', 'Could not convert that font. The original file is untouched.'))).then(function () {
			state.converting = '';
			render();
		});
	}

	/**
	 * Map freshly uploaded files onto families.
	 *
	 * Uploading used to leave the files sitting in the table with the library
	 * still empty: a family had to be created by hand and each file picked from a
	 * dropdown. The file name already says which family and which cut it is, so
	 * that mapping is done here instead.
	 *
	 * A file that some family already maps is left alone, and a name that matches
	 * a family already in the library joins it as another variant rather than
	 * creating a second family of the same name.
	 *
	 * @param {string[]} names File names as stored on the server.
	 * @return {object} What was created: families named, and variants added.
	 */
	/**
	 * Files on the server that no family in the buffer maps.
	 *
	 * Read from the buffer rather than from state.unused, which is the server's
	 * answer and predates whatever is waiting to be saved.
	 *
	 * @return {string[]} File names.
	 */
	function unmappedFiles() {
		return (state.files || []).filter(function (file) {
			return !fileUsedBy(file.name).length;
		}).map(function (file) {
			return file.name;
		});
	}

	/**
	 * Take a set of files into the library, and say what that did.
	 *
	 * @param {string[]} names Files to adopt.
	 */
	function adoptFiles(names) {
		var added = adoptUploads(names);

		if (!added.variants) {
			setStatus(s('nothingToAdd', 'Those files are already in the library.'), 'warning');
			render();

			return;
		}

		/*
		 * Left in the buffer rather than saved. They are the user's to look over --
		 * the family names are guessed from file names -- and the save bar already
		 * says which families arrived.
		 */
		setStatus(
			s('addedToLibrary', 'added to the library') + ' \u00b7 ' + added.variants + ' ' +
			plural(added.variants, s('variant', 'variant'), s('variants', 'variants')) +
			(added.families.length ? ' \u00b7 ' + added.families.join(', ') : '')
		);
		render();
	}

	function adoptUploads(names) {
		var report = { families: [], variants: 0 };

		names.forEach(function (name) {
			var file = state.files.filter(function (entry) { return entry.name === name; })[0];

			if (!file || fileUsedBy(name).length) {
				return;
			}

			var wanted = guessFamilyName(name);
			var target = null;

			state.families.forEach(function (family) {
				if (!isTrashed(family) && String(family.name).toLowerCase() === wanted.toLowerCase()) {
					target = family;
				}
			});

			if (!target) {
				target = { name: wanted, variants: [], source: 'upload', display: 'swap', preload: false, fallback: '' };
				state.families.push(target);
				report.families.push(wanted);
			}

			target.variants = target.variants || [];
			target.variants.push({
				file: name,
				weight: file.weight || '400',
				style: file.style || 'normal'
			});

			report.variants += 1;
		});

		return report;
	}

	/**
	 * A file the library already holds, checked before anything is sent.
	 *
	 * The server refuses an identical file too, but that is the backstop: it costs
	 * an upload to find out, and on a slow connection a re-picked folder spends
	 * minutes uploading fonts that will all be turned away. This answers the same
	 * question from what the panel already knows.
	 *
	 * Two ways of being the same font. The obvious one is the same name at the same
	 * size. The other is a convertible file whose WOFF2 twin is already here -- the
	 * library keeps a TTF as the WOFF2 it was converted into, so picking that TTF
	 * again is picking a font it already has, which is what the Upload table means
	 * when it says "Already converted to WOFF2".
	 *
	 * @param {File} file Picked file.
	 * @return {string} The file already held, or ''.
	 */
	function alreadyHeld(file) {
		var held = state.files || [];
		var same = held.filter(function (entry) {
			return entry.name === file.name && entry.size === file.size;
		})[0];

		if (same) {
			return same.name;
		}

		if (!convertible(file.name)) {
			return '';
		}

		var twin = woff2Name(file.name);
		var converted = held.filter(function (entry) {
			return entry.name === twin;
		})[0];

		return converted ? converted.name : '';
	}

	function uploadFiles(fileList) {
		var picked = Array.prototype.slice.call(fileList || []);
		if (!picked.length) {
			return;
		}

		state.convertLog = [];

		var chain = Promise.resolve();
		var done = 0;
		var stored = [];
		// Files the library already holds. Reported, never sent.
		var skipped = [];
		// Whether anything was already waiting to be saved before this upload.
		var hadEdits = isDirty();

		/*
		 * Sorted before the first byte leaves the browser, so a font already in the
		 * library is not uploaded at all rather than uploaded and turned away.
		 */
		var files = picked.filter(function (file) {
			var twin = alreadyHeld(file);

			if (!twin) {
				return true;
			}

			skipped.push(twin);
			logNote(file.name, twin === file.name
				? s('duplicateSkipped', 'Already installed')
				: s('duplicateSkippedAs', 'Already installed as') + ' ' + twin);

			return false;
		});

		if (!files.length) {
			render();
			setStatus(
				skipped.length + ' ' + s('alreadyInstalled', 'already installed') + ': ' + skipped.join(', '),
				'warning'
			);

			return;
		}

		files.forEach(function (file) {
			chain = chain.then(function () {
				var converting = state.convert && converterAvailable() && convertible(file.name);

				setStatus(
					(converting ? s('converting', 'Converting to WOFF2…') : s('uploading', 'Uploading…')) +
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

					/*
					 * Recorded against the name the server actually wrote, which is not
					 * always the one asked for: store_upload() renames on collision. Only
					 * when something was read -- a WOFF2 upload cannot be introspected, and
					 * storing an empty list for it would claim it had been looked at.
					 */
					var written = result && result.file && result.file.name;

					if (item.axes && written && !(result.file && result.file.duplicate)) {
						return request('/files/axes', {
							method: 'POST',
							body: { filename: written, axes: item.axes }
						}).then(function (next) {
							applyState(next && next.state);

							return result;
						// An upload that landed is not undone by failing to describe it.
						}).catch(function () {
							return result;
						});
					}

					return result;
				}).then(function (result) {

					/*
					 * A duplicate comes back as the file already holding those bytes
					 * rather than as an error, so one repeat in the middle of a folder
					 * does not abandon the rest of it. It is not adopted either: the
					 * family that maps the original still maps it.
					 */
					if (result && result.file && result.file.duplicate) {
						skipped.push(result.file.name);

						// Naming the twin only helps when it is a different name; the
						// usual case is the same file picked twice.
						logNote(file.name, result.file.name === item.filename
							? s('duplicateSkipped', 'Already installed')
							: s('duplicateSkippedAs', 'Already installed as') + ' ' + result.file.name);

						return;
					}

					stored.push(item.filename);
					done++;
				});
			});
		});

		chain.then(function () {
			var added = adoptUploads(stored);
			var message = s('uploaded', 'Uploaded') + ' \u00b7 ' + done;

			if (skipped.length) {
				message += ' \u00b7 ' + skipped.length + ' ' +
					s('alreadyInstalled', 'already installed') + ': ' + skipped.join(', ');
			}

			/*
			 * A skip makes the whole message a warning, which is the level that has no
			 * countdown. You asked for files and got fewer, and the sentence saying so
			 * should not expire while you are still reading the list it refers to.
			 */
			var level = skipped.length ? 'warning' : null;

			if (!added.variants) {
				setStatus(message, level);
				return;
			}


			if (added.families.length) {
				message += ' · ' + s('addedToLibrary', 'added to the library') + ': ' + added.families.join(', ');
			} else {
				message += ' · ' + s('mappedToFamily', 'mapped to an existing family');
			}

			/*
			 * Saved straight away when nothing else was pending, so an upload
			 * really does leave a usable family behind. If edits were already
			 * waiting, they are the user's to review, so this joins them in the
			 * buffer instead of flushing someone else's work.
			 */
			if (hadEdits) {
				setStatus(message + ' · ' + s('reviewAndSave', 'review and save'), 'warning');
				return;
			}

			// Carries the level too, so a mixed batch -- some new, some already there
			// -- keeps the warning rather than fading on a success countdown.
			setStatus(message, level);
			saveFamilies();
		}).catch(failing(s('failUpload', 'Could not upload those fonts. Nothing was added to the library.'))).then(render);
	}

	/**
	 * Convert a selection, one file at a time.
	 *
	 * Sequential on purpose: the converter is a single worker and the panel shows
	 * one progress line, so running them in parallel would race the status and the
	 * family mapping each conversion writes.
	 *
	 * @param {string[]} names Files to convert.
	 */
	function convertPicked(names) {
		var queue = names.slice();

		queue.reduce(function (chain, name) {
			return chain.then(function () {
				var file = (state.files || []).filter(function (entry) {
					return entry.name === name;
				})[0];

				return file ? convertExisting(file) : null;
			});
		}, Promise.resolve()).then(function () {
			state.pickedFiles = [];
			setStatus(s('convertedCount', 'Converted') + ' \u00b7 ' + queue.length + ' ' +
				plural(queue.length, s('fileSingular', 'file'), s('filesLower', 'files')));
			render();
		});
	}

	/**
	 * Delete a selection of files, after one question about the lot.
	 */
	function deletePickedFiles() {
		var names = state.pickedFiles.slice();

		if (!names.length) {
			return;
		}

		// Which of them a family still maps, so the question can say so once
		// rather than a family name appearing beside each file.
		var mapped = names.filter(function (name) {
			return fileUsedBy(name).length;
		});

		var emptied = emptiedBy(names);
		var alsoFamilies = { checked: false };
		var message = s('confirmDeleteFiles', 'Delete these files from the fonts folder?');

		if (mapped.length) {
			message += '\n\n' + mapped.length + ' ' +
				s('confirmDeleteFilesUsed', 'of them are mapped by a family, and those variants will be removed too.');
		}

		// Weighed across the whole selection: a family goes only when every file it
		// maps is in the list.
		if (emptied.length) {
			message += '\n\n' + s('confirmEmpties', 'That leaves nothing mapped by:') + ' ' + emptied.join(', ') + '.';
		}

		message += '\n\n' + s('confirmPermanent', 'The Trash holds families, not files, so this cannot be undone.');

		askConfirm({
			// The rows themselves, so the list in the dialog can be checked against
			// the table behind it.
			mark: Array.prototype.slice.call(contentEl.querySelectorAll('.efm-table__row')).filter(function (row) {
				var label = row.querySelector('.efm-file__name');

				return label && names.indexOf(label.textContent) !== -1;
			}),
			title: s('deleteFiles', 'Delete files'),
			message: message,
			list: names,
			confirm: s('deleteAction', 'Delete'),
			danger: true,
			checkbox: emptied.length ? {
				state: alsoFamilies,
				label: plural(
					emptied.length,
					s('alsoTrashEmptied', 'Also move the emptied family to the trash'),
					s('alsoTrashEmptiedPlural', 'Also move the emptied families to the trash')
				)
			} : null
		}).then(function (answer) {
			if ('confirm' !== answer) {
				return;
			}

			names.reduce(function (chain, name) {
				return chain.then(function () {
					return deleteFile(name, alsoFamilies.checked);
				});
			}, Promise.resolve()).then(function () {
				state.pickedFiles = [];
				setStatus(s('deletedCount', 'Deleted') + ' \u00b7 ' + names.length + ' ' +
					plural(names.length, s('fileSingular', 'file'), s('filesLower', 'files')));
				render();
			});
		});
	}

	function pruneFiles() {
		var unused = state.unused || [];

		if (!unused.length) {
			return;
		}

		// Deleting bytes is not reversible, so it is always confirmed.
		askConfirm({
			title: s('cleanupTitle', 'Unused files'),
			// The same warning: this one deletes files too, and said so no more
			// clearly than the single-file delete did.
			message: s('cleanupConfirm', 'Delete these font files from the server?') + '\n' +
				s('confirmPermanent', 'The Trash holds families, not files, so this cannot be undone.'),
			list: unused.map(function (file) { return file.name; }),
			confirm: s('deleteAction', 'Delete'),
			danger: true
		}).then(function (answer) {
			if ('confirm' === answer) {
				prune();
			}
		});
	}

	function prune() {
		state.pruning = true;
		render();

		request('/files/prune', { method: 'POST' })
			.then(function (data) {
				applyState(data && data.state);
				var report = (data && data.pruned) || {};
				/*
				 * Named, like the button that started it. A count beside a size reads
				 * as "N files · size" everywhere else in the panel; "Deleted · 7 ·
				 * 2.2 MB" left the 7 standing for a noun it never said.
				 */
				var freed = (report.deleted || []).length;

				setStatus(s('cleanupDone', 'Deleted') + ' \u00b7 ' + freed + ' ' +
					plural(freed, s('fileSingular', 'file'), s('filesLower', 'files')) +
					' \u00b7 ' + formatSize(report.bytes || 0));
			})
			.catch(failing(s('failPrune', 'Could not delete those files. They are still on the server.')))
			.then(function () {
				state.pruning = false;
				render();
			});
	}

	/**
	 * Unlink one file from the fonts folder.
	 *
	 * Returns its promise so a selection can be deleted in order, and resolves
	 * either way so one refusal does not strand the rest of the queue.
	 *
	 * @param {string} filename File to remove.
	 * @return {Promise}
	 */
	/**
	 * Unlink a file and drop the variants that mapped it.
	 *
	 * @param {string}  filename     File to remove.
	 * @param {boolean} [trashEmpty] Also trash any family this leaves with no
	 *                               variants. Decided in the confirmation, and
	 *                               sent with the delete so the two land together
	 *                               rather than as a second write the buffer could
	 *                               lose between.
	 */
	function deleteFile(filename, trashEmpty) {
		return request('/files/delete', { method: 'POST', body: { filename: filename, trash_emptied: !!trashEmpty } })
			.then(function (next) {
				applyState(next);
				render();
			})
			.catch(failing(s('failDeleteFile', 'Could not delete that file. It is still on the server.')));
	}

	function googleQuery(offset) {
		return '/google/search?query=' + encodeURIComponent(state.query) +
			'&category=' + encodeURIComponent(state.category) +
			'&subset=' + encodeURIComponent(state.subset) +
			'&variable=' + encodeURIComponent(state.variableOnly) +
			'&sort=' + encodeURIComponent(state.sort) +
			'&limit=' + GOOGLE_PAGE_SIZE + '&offset=' + offset;
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
		state.page = 0;

		// A new result set makes the old position meaningless, so the catalogue
		// starts at the top again rather than mid-way down a different list.
		delete scrollMemory.google;
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
			.catch(failing(s('failSearch', 'Could not reach Google Fonts. Check the connection and try again.')))
			.then(function () {
				state.searching = false;
				render();
			});
	}

	/**
	 * Show one page of the catalogue.
	 *
	 * The catalogue used to grow: every "Load more" appended another 24 families
	 * to the ones already on screen, so by the fourth press the page held a
	 * hundred cards, each with a live preview face. A page replaces rather than
	 * appends, which keeps the pane a fixed size however deep you go.
	 *
	 * @param {number} page Page index, counted from zero.
	 */
	function goToGooglePage(page) {
		var last = googlePageCount() - 1;
		var next = Math.max(0, Math.min(page, last));

		if (next === state.page || state.loadingMore) {
			return;
		}

		state.loadingMore = true;
		render();

		request(googleQuery(next * GOOGLE_PAGE_SIZE))
			.then(function (data) {
				state.results = (data && data.results) || [];
				state.total = (data && data.total) || state.total;
				state.page = next;

				// A new page starts at its own top rather than at the offset the
				// previous one was left at.
				delete scrollMemory.google;
			})
			.catch(failing(s('failPage', 'Could not load that page of results from Google Fonts.')))
			.then(function () {
				state.loadingMore = false;
				render();
			});
	}

	function googlePageCount() {
		return Math.max(1, Math.ceil((state.total || 0) / GOOGLE_PAGE_SIZE));
	}

	/**
	 * Which slice of the catalogue is on screen.
	 *
	 * state.results holds one page, so counting it read "24 of 1942" on every page
	 * but the last -- the page size and the total, and your position in neither.
	 * Paging changed the grid and left the sentence above it saying the same thing,
	 * which is what made it look broken. A range answers the question the sentence
	 * was already asking.
	 *
	 * One page has nothing to locate, so that case just counts. The total falls
	 * back to what is on screen, since a range is only honest if it has an end.
	 *
	 * @return {string} "1921-1942 of 1942 families", or a plain count.
	 */
	function googleSummary() {
		var total = state.total || state.results.length;
		var from = state.page * GOOGLE_PAGE_SIZE + 1;
		var to = from + state.results.length - 1;

		if (googlePageCount() < 2) {
			return total + ' ' + plural(total, s('familyLabel', 'family'), s('familiesLabel', 'families'));
		}

		return from + '\u2013' + to + ' ' + s('ofLabel', 'of') + ' ' +
			total + ' ' + s('familiesLabel', 'families');
	}

	/**
	 * Install or re-install a Google family.
	 *
	 * Guarded here rather than at the three call sites -- the browse card, the
	 * specimen detail and the family editor's weight picker -- so a fourth cannot
	 * be added without it.
	 *
	 * @param {string}   family   Family name.
	 * @param {string[]} subsets  Chosen subsets.
	 * @param {boolean}  variable Install the variable file.
	 * @param {string[]} cuts     Chosen weights, ignored for a variable install.
	 */
	function installGoogleFont(family, subsets, variable, cuts) {
		withSavedBuffer(
			s('confirmInstallDirty', 'Installing writes this family to the server, which replaces anything unsaved in the panel.'),
			function () {
				runInstall(family, subsets, variable, cuts);
			}
		);
	}

	function runInstall(family, subsets, variable, cuts) {
		state.busy = 'install:' + family;
		setStatus(s('installing', 'Installing…') + ' ' + family, 'progress');
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
			.catch(failing(s('failInstall', 'Could not install that family. Nothing was written to the server.')))
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
			.catch(failing(s('failRegenerate', 'Could not regenerate the stylesheet. The existing one is unchanged.')))
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
