#!/usr/bin/env node
/*
 * Keep languages/etch-font-manager.pot in step with the code.
 *
 * The template had drifted badly by v0.30.0: 23 translatable strings were
 * never added to it, 3 entries named strings that no longer existed, and 68%
 * of the "#:" references pointed at the wrong line, because the file was
 * maintained by hand across two dozen releases. Regenerating it once only
 * fixes it once, so this script is both the generator and a CI check.
 *
 *   node tools/check-pot.js            report drift and exit 1 if any
 *   node tools/check-pot.js --write    rewrite the template
 *
 * Written for Node rather than PHP so it can run in the JavaScript job, which
 * needs no Composer install, and so it is testable without a PHP runtime.
 */

'use strict';

var fs = require('fs');
var path = require('path');

var DOMAIN = 'etch-font-manager';
var TEMPLATE = 'languages/etch-font-manager.pot';

/*
 * Scanned in this order, which is the order entries appear in the template.
 * Files with no translatable string are listed anyway, so adding one to them
 * later needs no change here.
 */
var SOURCES = [
	'etch-font-manager.php',
	'includes/class-efm-builder.php',
	'includes/class-efm-fonts.php',
	'includes/class-efm-google-fonts.php',
	'includes/class-efm-rest.php',
	'includes/class-efm-updater.php',
	'uninstall.php'
];

var CALLS = /\b(__|esc_html__|esc_attr__|_e|esc_html_e)\s*\(\s*/g;
var PLACEHOLDER = /%(\d+\$)?[sdfu]|%%/;

/**
 * Read a PHP string literal starting at `at`.
 *
 * Written out rather than done with a regular expression because a literal can
 * carry an escaped quote, and the two quote styles escape differently: inside
 * single quotes only \' and \\ mean anything, while double quotes also take
 * \n, \t and friends.
 *
 * @param {string} src PHP source.
 * @param {number} at  Index of the opening quote.
 * @return {?{value: string, end: number}} Literal and the index after it.
 */
function readLiteral(src, at) {
	var quote = src[at];

	if ("'" !== quote && '"' !== quote) {
		return null;
	}

	var out = '';
	var i = at + 1;
	var escapes = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', $: '$' };

	while (i < src.length) {
		var ch = src[i];

		if ('\\' === ch) {
			var next = src[i + 1];

			if ("'" === quote) {
				out += ("'" === next || '\\' === next) ? next : '\\' + next;
			} else {
				out += Object.prototype.hasOwnProperty.call(escapes, next) ? escapes[next] : '\\' + next;
			}

			i += 2;
			continue;
		}

		if (ch === quote) {
			return { value: out, end: i + 1 };
		}

		out += ch;
		i++;
	}

	return null;
}

/**
 * Every translatable string in one file, with the line it sits on.
 *
 * Only a call whose literal is followed directly by the text domain counts, so
 * a __() belonging to another plugin, or a call built from a variable, is
 * skipped rather than guessed at.
 *
 * @param {string} file Path used in the reference.
 * @param {string} src  PHP source.
 * @return {Array<{file: string, line: number, text: string}>} Strings found.
 */
function stringsIn(file, src) {
	var found = [];
	var match;

	CALLS.lastIndex = 0;

	while ((match = CALLS.exec(src))) {
		var literal = readLiteral(src, CALLS.lastIndex);

		if (!literal) {
			continue;
		}

		var after = src.slice(literal.end);

		if (!new RegExp("^\\s*,\\s*(['\"])" + DOMAIN + "\\1\\s*\\)").test(after)) {
			continue;
		}

		found.push({
			file: file,
			line: src.slice(0, match.index).split('\n').length,
			text: literal.value
		});
	}

	return found;
}

/**
 * Escape a string for a po file.
 *
 * @param {string} value Raw string.
 * @return {string} Escaped.
 */
function escapePo(value) {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\n/g, '\\n')
		.replace(/\t/g, '\\t');
}

/**
 * Render the template.
 *
 * Repeated strings become one entry carrying every reference, in the order
 * they were first seen. Lines are not wrapped, matching the file this
 * replaced: an unwrapped msgid is one grep away from the string in the code.
 *
 * @param {string} header  Header block, up to but excluding the first entry.
 * @param {Array}  strings Output of stringsIn(), concatenated.
 * @return {string} Whole template.
 */
function render(header, strings) {
	var order = [];
	var byText = {};

	strings.forEach(function (item) {
		var key = '@' + item.text;

		if (!Object.prototype.hasOwnProperty.call(byText, key)) {
			byText[key] = { text: item.text, refs: [] };
			order.push(byText[key]);
		}

		byText[key].refs.push(item.file + ':' + item.line);
	});

	var blocks = order.map(function (entry) {
		var lines = entry.refs.map(function (ref) { return '#: ' + ref; });

		if (PLACEHOLDER.test(entry.text)) {
			lines.push('#, php-format');
		}

		lines.push('msgid "' + escapePo(entry.text) + '"');
		lines.push('msgstr ""');

		return lines.join('\n');
	});

	return header + '\n\n' + blocks.join('\n\n') + '\n';
}

/**
 * The header block of an existing template.
 *
 * @param {string} pot Template contents.
 * @return {string} Everything before the first entry.
 */
function headerOf(pot) {
	var at = pot.indexOf('\n\n#:');

	return -1 === at ? pot.replace(/\s+$/, '') : pot.slice(0, at);
}

/**
 * Compare ignoring the generation stamp.
 *
 * The date is the one line that changes without the strings changing, so
 * comparing it would make the check fail on a rebuild that found nothing.
 *
 * @param {string} value Template contents.
 * @return {string} Contents with the stamp blanked.
 */
function withoutStamp(value) {
	return value.replace(/POT-Creation-Date: [^\\]*\\n/, 'POT-Creation-Date: \\n');
}

function main() {
	var root = path.resolve(__dirname, '..');
	var write = -1 !== process.argv.indexOf('--write');
	var strings = [];

	SOURCES.forEach(function (rel) {
		var full = path.join(root, rel);

		if (!fs.existsSync(full)) {
			return;
		}

		strings = strings.concat(stringsIn(rel, fs.readFileSync(full, 'utf8')));
	});

	var templatePath = path.join(root, TEMPLATE);
	var current = fs.existsSync(templatePath) ? fs.readFileSync(templatePath, 'utf8') : '';
	var header = headerOf(current);

	if (write) {
		var stamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + '+0000';
		header = header.replace(/POT-Creation-Date: [^\\]*\\n/, 'POT-Creation-Date: ' + stamp + '\\n');
	}

	var expected = render(header, strings);

	if (withoutStamp(expected) === withoutStamp(current)) {
		console.log(TEMPLATE + ' is up to date (' + strings.length + ' calls).');
		return;
	}

	if (write) {
		fs.writeFileSync(templatePath, expected, 'utf8');
		console.log('Wrote ' + TEMPLATE + '.');
		return;
	}

	/*
	 * Naming what differs, because "the template is stale" sends whoever reads
	 * the failure back to a 270-entry file to work out which line matters.
	 */
	var inCode = {};
	var inPot = {};

	strings.forEach(function (item) { inCode['@' + item.text] = item.text; });

	current.split(/\n\n+/).forEach(function (block) {
		var found = /^msgid "((?:[^"\\]|\\.)*)"$/m.exec(block);

		if (found && '' !== found[1]) {
			inPot['@' + found[1]] = found[1];
		}
	});

	var missing = Object.keys(inCode).filter(function (k) { return !(k in inPot); });
	var extra = Object.keys(inPot).filter(function (k) { return !(k in inCode); });

	console.error(TEMPLATE + ' is out of date.');

	if (missing.length) {
		console.error('  Not in the template (' + missing.length + '):');
		missing.slice(0, 20).forEach(function (k) { console.error('    ' + JSON.stringify(inCode[k])); });
	}

	if (extra.length) {
		console.error('  No longer in the code (' + extra.length + '):');
		extra.slice(0, 20).forEach(function (k) { console.error('    ' + JSON.stringify(inPot[k])); });
	}

	if (!missing.length && !extra.length) {
		console.error('  The strings match; the line references or their order do not.');
	}

	console.error('\n  Run: node tools/check-pot.js --write');
	process.exitCode = 1;
}

if (require.main === module) {
	main();
}

module.exports = { readLiteral: readLiteral, stringsIn: stringsIn, render: render, headerOf: headerOf, escapePo: escapePo };
