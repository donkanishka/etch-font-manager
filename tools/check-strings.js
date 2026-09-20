#!/usr/bin/env node
/*
 * Every string the panel asks for must exist in the PHP map that supplies them.
 *
 * s( key, fallback ) reads cfg.strings[ key ], which class-efm-builder.php
 * builds from __() calls. A key missing from that map is not a crash: the panel
 * quietly renders the English fallback written beside it in the JavaScript, and
 * the string is simply never translatable. Nothing said so.
 *
 * check-pot.js does not catch it either, because it reads the PHP files and the
 * template and never looks at the panel. So a new JavaScript string could be
 * added, pass every check, ship, and be untranslatable -- which is exactly what
 * happened to seven strings across 1.0.8.
 *
 * The reverse is worth failing on too. A key left in the map after its last
 * caller is gone is dead weight a translator still has to translate.
 *
 *   node tools/check-strings.js
 */
'use strict';

var fs = require('node:fs');
var path = require('node:path');

var root = path.join(__dirname, '..');
var panel = path.join(root, 'assets', 'panel.js');
var builder = path.join(root, 'includes', 'class-efm-builder.php');

var js = fs.readFileSync(panel, 'utf8');
var php = fs.readFileSync(builder, 'utf8');

/*
 * Only a literal key counts. s() is always called with one in this codebase,
 * and a computed key could not be checked against the map anyway.
 */
var used = [];
var seen = Object.create(null);
var call = /\bs\(\s*'([A-Za-z0-9_]+)'/g;
var match;

while ((match = call.exec(js))) {
	if (!seen[match[1]]) {
		seen[match[1]] = true;
		used.push(match[1]);
	}
}

var mapped = Object.create(null);
var entry = /'([A-Za-z0-9_]+)'\s*=>\s*__\(/g;

while ((match = entry.exec(php))) {
	mapped[match[1]] = true;
}

var missing = used.filter(function (key) {
	return !mapped[key];
});

var unused = Object.keys(mapped).filter(function (key) {
	return !seen[key];
});

if (missing.length || unused.length) {
	console.error('The panel strings and the PHP map disagree.\n');

	if (missing.length) {
		console.error('  Used by assets/panel.js, absent from the map, so never translatable:');
		missing.forEach(function (key) {
			console.error('    ' + key);
		});
		console.error('');
	}

	if (unused.length) {
		console.error('  In the map with no caller left in the panel:');
		unused.forEach(function (key) {
			console.error('    ' + key);
		});
		console.error('');
	}

	console.error('  Add or remove the entries in includes/class-efm-builder.php,');
	console.error('  then run: node tools/check-pot.js --write');
	process.exit(1);
}

console.log('Panel strings and the PHP map agree (' + used.length + ' keys).');
