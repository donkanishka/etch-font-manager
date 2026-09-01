#!/usr/bin/env node
/*
 * Boot assets/panel.js the way a browser does, and fail if it throws.
 *
 * `node --check` parses the file and stops there, so it passes happily on a
 * script that dies the moment it runs. v0.34.0 shipped exactly that: a `var`
 * holding the settings key list was declared beside the functions that read it,
 * several hundred lines below the state literal that fingerprints the settings
 * as it is built. Hoisting gave the name but not the value, normalizeSettings()
 * read undefined, and the panel threw before registering its control -- so the
 * Font Manager icon simply was not there. Syntax was never the problem.
 *
 * This stubs the handful of browser globals the boot path touches, runs the
 * file, and fails if it throws.
 *
 * It deliberately does not assert that a control was registered. That happens
 * once Etch's settings bar appears in the DOM, through an observer, so proving
 * it here would mean simulating Etch's own markup and timing -- and a check
 * that breaks when unrelated markup shifts is worse than no check at all. The
 * throw is the part that is unambiguous, and the part that actually shipped.
 *
 *   node tools/boot-check.js
 */

'use strict';

var fs = require( 'fs' );
var path = require( 'path' );

var PANEL = path.join( __dirname, '..', 'assets', 'panel.js' );

/**
 * The smallest DOM the boot path touches.
 *
 * Deliberately thin: this is not a DOM implementation, it is enough shape for
 * the script to reach its control registration without a real browser. Anything
 * it genuinely needs and does not get shows up as a throw, which is the point.
 *
 * @return {object} A stub element.
 */
function element() {
	var node = {
		style: { setProperty: function () {}, removeProperty: function () {} },
		dataset: {},
		classList: { add: function () {}, remove: function () {}, contains: function () { return false; }, toggle: function () {} },
		setAttribute: function () {},
		removeAttribute: function () {},
		getAttribute: function () { return null; },
		hasAttribute: function () { return false; },
		appendChild: function () {},
		removeChild: function () {},
		insertBefore: function () {},
		remove: function () {},
		addEventListener: function () {},
		removeEventListener: function () {},
		querySelector: function () { return null; },
		querySelectorAll: function () { return []; },
		closest: function () { return null; },
		focus: function () {},
		getBoundingClientRect: function () { return { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }; },
		children: [],
		childNodes: []
	};

	return node;
}

var registered = [];

var win = {
	efmConfig: {
		i18n: {},
		root: 'https://example.test/wp-json/etch-font-manager/v1',
		nonce: 'stub',
		wasmUrl: '',
		state: {
			families: [],
			files: [],
			settings: { inline_css: false, block_google: false, purge_files: false, delete_source_on_convert: false },
			unused: [],
			missing: []
		}
	},
	/*
	 * Shaped like the real Controls API the panel calls:
	 * window.etchControls.builder.settingsBar[section].addBefore/addAfter. Both
	 * sections are provided because placement() is filterable and either may be
	 * the target.
	 */
	etchControls: {
		builder: {
			settingsBar: {
				top: { addBefore: function ( c ) { registered.push( c ); }, addAfter: function ( c ) { registered.push( c ); } },
				bottom: { addBefore: function ( c ) { registered.push( c ); }, addAfter: function ( c ) { registered.push( c ); } }
			}
		}
	},
	addEventListener: function () {},
	removeEventListener: function () {},
	matchMedia: function () { return { matches: false, addEventListener: function () {}, removeEventListener: function () {} }; },
	setTimeout: setTimeout,
	clearTimeout: clearTimeout,
	requestAnimationFrame: function ( fn ) { return setTimeout( fn, 0 ); },
	localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
	navigator: { clipboard: null, userAgent: 'node' },
	console: console,
	fetch: function () { return Promise.resolve( { ok: true, json: function () { return Promise.resolve( {} ); } } ); },
	location: { href: 'https://example.test/' },
	document: null,
	Worker: undefined,
	WebAssembly: undefined,
	DecompressionStream: undefined
};

/*
 * registerControl() will only run once the settings bar is on the page, so the
 * container and a button inside it have to exist for the boot to reach the API.
 */
var bar = element();

bar.querySelectorAll = function () { return [ element() ]; };
bar.querySelector = function () { return element(); };

var doc = {
	createElement: function () { return element(); },
	createElementNS: function () { return element(); },
	createTextNode: function () { return element(); },
	querySelector: function ( sel ) {
		return /settings-bar__section/.test( String( sel ) ) ? bar : null;
	},
	querySelectorAll: function () { return []; },
	getElementById: function () { return null; },
	addEventListener: function () {},
	removeEventListener: function () {},
	body: element(),
	head: element(),
	documentElement: element(),
	activeElement: null
};

win.document = doc;

var source = fs.readFileSync( PANEL, 'utf8' );

try {
	// eslint-disable-next-line no-new-func
	var run = new Function( 'window', 'document', 'navigator', 'console', 'setTimeout', 'clearTimeout', 'fetch', source );

	run( win, doc, win.navigator, console, setTimeout, clearTimeout, win.fetch );
} catch ( error ) {
	console.error( 'assets/panel.js threw while booting.' );
	console.error( '' );
	console.error( '  ' + error.name + ': ' + error.message );

	var frame = String( error.stack || '' ).split( '\n' )[ 1 ];

	if ( frame ) {
		console.error( '  ' + frame.trim() );
	}

	console.error( '' );
	console.error( 'The panel registers its Settings Bar control on boot, so a throw here means' );
	console.error( 'the Font Manager icon never appears and the plugin is unreachable.' );
	process.exit( 1 );
}

console.log(
	'assets/panel.js boots without throwing' +
	( registered.length ? ', and registered ' + registered.length + ' control(s).' : '.' )
);
