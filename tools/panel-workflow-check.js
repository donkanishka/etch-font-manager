#!/usr/bin/env node
/*
 * Exercise the panel workflows that can otherwise lose buffered edits or strand
 * successful files behind one failed upload. No framework or browser required.
 *
 *   node tools/panel-workflow-check.js [path/to/panel.js]
 */
'use strict';

var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var panel = process.argv[2] || path.join(__dirname, '..', 'assets', 'panel.js');
var source = fs.readFileSync(panel, 'utf8');
var cssSource = fs.readFileSync(path.join(path.dirname(panel), 'panel.css'), 'utf8');
var passed = 0;

function extract(name) {
	var start = source.indexOf('\tfunction ' + name + '(');
	var end;

	assert.ok(start >= 0, 'Function missing: ' + name);
	end = source.indexOf('\n\t}', start);
	assert.ok(end > start, 'Function end missing: ' + name);

	return source.slice(start, end + 3);
}

async function test(name, run) {
	try {
		await run();
		passed++;
		console.log('PASS ' + name);
	} catch (error) {
		console.error('FAIL ' + name);
		throw error;
	}
}

function context(values, functions) {
	var box = vm.createContext(Object.assign({
		Promise: Promise,
		console: console
	}, values));

	vm.runInContext(functions.map(extract).join('\n'), box);
	return box;
}

function formData() {
	this.values = [];
}
formData.prototype.append = function (key, value, filename) {
	this.values.push({ key: key, value: value, filename: filename });
};

function uploadContext(dirty) {
	var attempts = [];
	var adopted = [];
	var statuses = [];
	var saves = 0;
	var files = [];
	var state = {
		convertLog: [],
		convert: false,
		families: [{ name: 'Buffered family' }],
		saved: 'buffered-families',
		settings: { buffered: true },
		savedSettings: 'buffered-settings',
		files: [],
		unused: [],
		missing: []
	};
	var box = context({
		state: state,
		FormData: formData,
		isDirty: 'function' === typeof dirty ? dirty : function () { return dirty; },
		alreadyHeld: function () { return ''; },
		converterAvailable: function () { return false; },
		convertible: function () { return false; },
		prepareUpload: function (file) {
			return Promise.resolve({
				blob: file,
				filename: file.name,
				converted: false,
				from: file.size,
				to: file.size,
				axes: null
			});
		},
		request: function (route, options) {
			var name = options.body.values[0].filename;
			var error;

			assert.equal(route, '/upload');
			attempts.push(name);

			if (name === 'bad.ttf') {
				error = new Error('File contents do not match the font type.');
				error.fromServer = true;
				return Promise.reject(error);
			}

			files.push({ name: name, size: 100, ext: 'ttf' });
			return Promise.resolve({
				file: { name: name },
				state: {
					families: [{ name: 'Stored family' }],
					settings: { buffered: false },
					files: files.slice(),
					unused: files.slice(),
					missing: []
				}
			});
		},
		adoptUploads: function (names) {
			adopted = names.slice();
			return { families: ['Uploaded family'], variants: names.length };
		},
		logConversion: function () {},
		logNote: function () {},
		render: function () {},
		setStatus: function (message, type) { statuses.push({ message: message, type: type }); },
		saveFamilies: function () { saves++; return Promise.resolve(true); },
		failing: function (message) {
			return function () { statuses.push({ message: message, type: 'error' }); };
		},
		s: function (key, fallback) { return fallback; }
	}, ['applyFileState', 'uploadFiles']);

	return {
		box: box,
		state: state,
		attempts: attempts,
		getAdopted: function () { return adopted; },
		statuses: statuses,
		getSaves: function () { return saves; }
	};
}

(async function () {
	await test('file delete guard saves before continuing', async function () {
		var action = 0;
		var saves = 0;
		var box = context({
			isDirty: function () { return true; },
			s: function (key, fallback) { return fallback; },
			askConfirm: function () { return Promise.resolve('confirm'); },
			saveFamilies: function () { saves++; return Promise.resolve(true); }
		}, ['withSavedBuffer', 'withSavedFileBuffer']);

		box.withSavedFileBuffer(function () { action++; });
		await new Promise(function (resolve) { setImmediate(resolve); });
		assert.equal(saves, 1);
		assert.equal(action, 1);
	});

	await test('every file-delete entry point uses the guard', function () {
		var guarded = 0;
		var box = context({
			state: { pickedFiles: ['one.ttf'], unused: [{ name: 'loose.ttf' }] },
			isDirty: function () { return true; },
			withSavedFileBuffer: function () { guarded++; },
			fileRecord: function () { return null; },
			confirmFileDelete: function () { throw new Error('single delete bypassed guard'); }
		}, ['deleteOneFile', 'deletePickedFiles', 'pruneFiles']);

		box.deleteOneFile({ name: 'one.ttf' });
		box.deletePickedFiles();
		box.pruneFiles();
		assert.equal(guarded, 3);
	});

	await test('single delete drops a file record that went stale while saving', function () {
		var confirmed = 0;
		var state = { files: [] };
		var box = context({
			state: state,
			withSavedFileBuffer: function (action) { action(); },
			confirmFileDelete: function () { confirmed++; }
		}, ['fileRecord', 'deleteOneFile']);

		box.deleteOneFile({ name: 'gone.ttf' });
		assert.equal(confirmed, 0);

		state.files.push({ name: 'kept.ttf' });
		box.deleteOneFile({ name: 'kept.ttf' });
		assert.equal(confirmed, 1);
	});

	await test('one failed upload does not stop later files or strand earlier successes', async function () {
		var run = uploadContext(false);

		await run.box.uploadFiles([
			{ name: 'first.ttf', size: 100 },
			{ name: 'bad.ttf', size: 100 },
			{ name: 'last.ttf', size: 100 }
		]);

		assert.deepEqual(run.attempts, ['first.ttf', 'bad.ttf', 'last.ttf']);
		assert.deepEqual(Array.from(run.getAdopted()), ['first.ttf', 'last.ttf']);
		assert.equal(run.getSaves(), 1);
		assert.equal(run.state.families[0].name, 'Buffered family');
		assert.equal(run.state.saved, 'buffered-families');
		assert.equal(run.state.settings.buffered, true);
		assert.equal(run.state.savedSettings, 'buffered-settings');
		assert.deepEqual(run.state.files.map(function (file) { return file.name; }), ['first.ttf', 'last.ttf']);
		assert.ok(run.statuses.some(function (status) { return /3\/3/.test(status.message); }));
		assert.match(run.statuses[run.statuses.length - 1].message, /bad\.ttf/);
		assert.equal(run.statuses[run.statuses.length - 1].type, 'warning');
	});

	await test('uploads preserve existing unsaved families and settings', async function () {
		var run = uploadContext(true);

		await run.box.uploadFiles([{ name: 'kept.ttf', size: 100 }]);
		assert.deepEqual(Array.from(run.getAdopted()), ['kept.ttf']);
		assert.equal(run.getSaves(), 0);
		assert.equal(run.state.families[0].name, 'Buffered family');
		assert.equal(run.state.saved, 'buffered-families');
		assert.equal(run.state.settings.buffered, true);
		assert.equal(run.state.savedSettings, 'buffered-settings');
		assert.match(run.statuses[run.statuses.length - 1].message, /review and save/);
	});

	await test('edits made during an upload are not auto-saved', async function () {
		var checks = 0;
		var run = uploadContext(function () {
			checks++;
			return checks > 1;
		});

		await run.box.uploadFiles([{ name: 'late-edit.ttf', size: 100 }]);
		assert.ok(checks > 1);
		assert.equal(run.getSaves(), 0);
		assert.match(run.statuses[run.statuses.length - 1].message, /review and save/);
	});

	await test('every state-replacing action uses the guard', function () {
		var guarded = 0;
		var box = context({
			// Enough of the browse screen for the unguarded path to reach the server,
			// so a missing guard fails as itself rather than as a stray TypeError.
			state: { picked: ['Inter'], busy: '', results: [{ family: 'Inter', wght: { min: 100, max: 900 } }] },
			isDirty: function () { return true; },
			withSavedBuffer: function () { guarded++; },
			wantsVariable: function () { return true; },
			selectedSubsets: function () { return ['latin']; },
			selectedCuts: function () { return []; },
			request: function () { throw new Error('server call made before the buffer was safe'); },
			render: function () {},
			setStatus: function () {},
			failing: function () { return function () {}; },
			s: function (key, fallback) { return fallback; }
		}, ['installPicked', 'recoverMissing', 'regenerateCss']);

		box.installPicked();
		box.recoverMissing([{ name: 'Inter' }]);
		box.regenerateCss();
		assert.equal(guarded, 3);
	});

	await test('regenerate waits for the save to land, then runs once', async function () {
		var calls = [];
		var dirty = true;
		var box = context({
			state: { busy: '' },
			isDirty: function () { return dirty; },
			askConfirm: function () { return Promise.resolve('confirm'); },
			saveFamilies: function () {
				calls.push('save');
				// The real save refreshes the fingerprints, so the retry is not dirty.
				dirty = false;
				return Promise.resolve(true);
			},
			request: function () { calls.push('request'); return Promise.resolve({}); },
			applyState: function () {},
			render: function () {},
			setStatus: function () {},
			failing: function () { return function () {}; },
			s: function (key, fallback) { return fallback; }
		}, ['withSavedBuffer', 'regenerateCss']);

		box.regenerateCss();

		for (var tick = 0; tick < 8; tick++) {
			await new Promise(function (resolve) { setImmediate(resolve); });
		}

		assert.deepEqual(calls, ['save', 'request']);
	});

	await test('a refused save never runs the action', async function () {
		var calls = [];
		var box = context({
			state: { busy: '' },
			isDirty: function () { return true; },
			askConfirm: function () { return Promise.resolve('cancel'); },
			saveFamilies: function () { calls.push('save'); return Promise.resolve(true); },
			request: function () { calls.push('request'); return Promise.resolve({}); },
			applyState: function () {},
			render: function () {},
			setStatus: function () {},
			failing: function () { return function () {}; },
			s: function (key, fallback) { return fallback; }
		}, ['withSavedBuffer', 'regenerateCss']);

		box.regenerateCss();

		for (var beat = 0; beat < 8; beat++) {
			await new Promise(function (resolve) { setImmediate(resolve); });
		}

		assert.deepEqual(calls, []);
	});

	await test('import reports how many families landed', async function () {
		var statuses = [];
		var state = { importPayload: { any: true }, importMode: 'replace', busy: '' };
		var box = context({
			state: state,
			request: function () {
				return Promise.resolve({ report: { families: 3, rejected: [], missing: [] }, state: {} });
			},
			applyState: function () {},
			plural: function (count, one, many) { return 1 === count ? one : many; },
			render: function () {},
			setStatus: function (message, type) { statuses.push({ message: message, type: type }); },
			failing: function () { return function () {}; },
			s: function (key, fallback) { return fallback; }
		}, ['confirmImport', 'sendFontFiles', 'withoutBundle']);

		box.confirmImport();

		for (var pass = 0; pass < 8; pass++) {
			await new Promise(function (resolve) { setImmediate(resolve); });
		}

		var last = statuses[statuses.length - 1];

		// A bare 'imported' said nothing; the count and a capitalised verb are the point.
		assert.equal(last.message, 'Imported \u00b7 3 families');
		assert.equal(state.importReport.families, 3);
	});

	await test('a single imported family is not pluralised', async function () {
		var statuses = [];
		var box = context({
			state: { importPayload: { any: true }, importMode: 'merge', busy: '' },
			request: function () {
				return Promise.resolve({ report: { families: 1 }, state: {} });
			},
			applyState: function () {},
			plural: function (count, one, many) { return 1 === count ? one : many; },
			render: function () {},
			setStatus: function (message, type) { statuses.push({ message: message, type: type }); },
			failing: function () { return function () {}; },
			s: function (key, fallback) { return fallback; }
		}, ['confirmImport', 'sendFontFiles', 'withoutBundle']);

		box.confirmImport();

		for (var beat = 0; beat < 8; beat++) {
			await new Promise(function (resolve) { setImmediate(resolve); });
		}

		assert.equal(statuses[statuses.length - 1].message, 'Imported \u00b7 1 family');
	});

	/*
	 * A whole library in one POST is refused by any server with a modest body
	 * limit -- 10 MiB is common on shared hosting -- and that refusal comes from
	 * the web server, before PHP runs, so the plugin never sees it. A 15.5 MB
	 * export failed exactly that way while every plugin-side check would have
	 * passed it. These cover the transport that replaced it.
	 */
	await test('the preview sends filenames without the font bytes', async function () {
		var payload = {
			families: [{ name: 'Google Sans' }],
			bundle: { 'a.ttf': 'QUFB', 'b.ttf': 'QkJC' }
		};
		var box = context({}, ['withoutFontBytes']);
		var lean = box.withoutFontBytes(payload);

		// The dry run reads the keys only, so the names must survive intact.
		assert.deepEqual(Object.keys(lean.bundle), ['a.ttf', 'b.ttf']);
		assert.deepEqual(Object.values(lean.bundle), ['', '']);
		assert.deepEqual(lean.families, payload.families);

		// And the caller still holds the real bytes for the import itself.
		assert.equal(payload.bundle['a.ttf'], 'QUFB');
	});

	await test('each font file is sent on its own request', async function () {
		var sent = [];
		var state = {
			importPayload: {
				families: [{ name: 'Google Sans' }],
				bundle: { 'a.ttf': 'QUFB', 'b.ttf': 'QkJC' }
			},
			importMode: 'replace',
			busy: ''
		};
		var box = context({
			state: state,
			request: function (path, options) {
				sent.push({ path: path, body: options.body });

				if ('/import/file' === path) {
					return Promise.resolve({ result: 'written', file: options.body.name });
				}

				return Promise.resolve({ report: { families: 1, restored: [], rejected: [] }, state: {} });
			},
			applyState: function () {},
			plural: function (count, one, many) { return 1 === count ? one : many; },
			render: function () {},
			setStatus: function () {},
			failing: function () { return function () {}; },
			s: function (key, fallback) { return fallback; }
		}, ['confirmImport', 'sendFontFiles', 'withoutBundle']);

		box.confirmImport();

		for (var beat = 0; beat < 12; beat++) {
			await new Promise(function (resolve) { setImmediate(resolve); });
		}

		assert.deepEqual(sent.map(function (call) { return call.path; }), ['/import/file', '/import/file', '/import']);
		assert.equal(sent[0].body.name, 'a.ttf');
		assert.equal(sent[0].body.data, 'QUFB');
		assert.equal(sent[1].body.name, 'b.ttf');

		// The configuration request carries no font bytes at all.
		assert.equal(sent[2].body.data.bundle, undefined);
		assert.deepEqual(sent[2].body.data.families, [{ name: 'Google Sans' }]);

		// The files were written by the staging requests, so the report has to
		// carry them across or it reports nothing written at all.
		assert.deepEqual(state.importReport.restored, ['a.ttf', 'b.ttf']);
	});

	await test('one rejected font does not stop the others', async function () {
		var state = {
			importPayload: {
				families: [{ name: 'Mixed' }],
				bundle: { 'good.ttf': 'QUFB', 'bad.ttf': 'bm9wZQ', 'also.ttf': 'QkJC' }
			},
			importMode: 'replace',
			busy: ''
		};
		var box = context({
			state: state,
			request: function (path, options) {
				if ('/import/file' === path) {
					return Promise.resolve(
						'bad.ttf' === options.body.name
							? { result: 'rejected', file: 'bad.ttf' }
							: { result: 'written', file: options.body.name }
					);
				}

				return Promise.resolve({ report: { families: 1, restored: [], rejected: [] }, state: {} });
			},
			applyState: function () {},
			plural: function (count, one, many) { return 1 === count ? one : many; },
			render: function () {},
			setStatus: function () {},
			failing: function () { return function () {}; },
			s: function (key, fallback) { return fallback; }
		}, ['confirmImport', 'sendFontFiles', 'withoutBundle']);

		box.confirmImport();

		for (var beat = 0; beat < 14; beat++) {
			await new Promise(function (resolve) { setImmediate(resolve); });
		}

		assert.deepEqual(state.importReport.restored, ['good.ttf', 'also.ttf']);
		assert.deepEqual(state.importReport.rejected, ['bad.ttf']);
	});

	await test('an import whose every file fails leaves the library alone', async function () {
		var paths = [];
		var applied = 0;
		var state = {
			importPayload: {
				families: [{ name: 'Google Sans' }],
				bundle: { 'a.ttf': 'QUFB', 'b.ttf': 'QkJC' }
			},
			importMode: 'replace',
			busy: ''
		};
		var box = context({
			state: state,
			request: function (path) {
				paths.push(path);

				if ('/import/file' === path) {
					return Promise.reject(new Error('too large'));
				}

				return Promise.resolve({ report: { families: 1 }, state: {} });
			},
			applyState: function () { applied++; },
			plural: function (count, one, many) { return 1 === count ? one : many; },
			render: function () {},
			setStatus: function () {},
			failing: function () { return function () {}; },
			s: function (key, fallback) { return fallback; }
		}, ['confirmImport', 'sendFontFiles', 'withoutBundle']);

		box.confirmImport();

		for (var beat = 0; beat < 14; beat++) {
			await new Promise(function (resolve) { setImmediate(resolve); });
		}

		// Replacing the library with references to files that never landed is
		// worse than refusing, so the configuration request is never made.
		assert.deepEqual(paths, ['/import/file', '/import/file']);
		assert.equal(applied, 0);
		assert.equal(state.importReport, undefined);
	});

	await test('a body the server refuses as too large says so', async function () {
		var box = context({
			cfg: { nonce: 'n', root: '/wp-json/efm/v1' },
			FormData: formData,
			fetch: function () {
				return Promise.resolve({
					ok: false,
					status: 413,
					json: function () { return Promise.reject(new Error('not json')); }
				});
			},
			s: function (key, fallback) { return fallback; }
		}, ['request']);

		var failure = null;

		try {
			await box.request('/import', { method: 'POST', body: { data: {} } });
		} catch (error) {
			failure = error;
		}

		// A 413 is the web server answering with HTML, so there is no message to
		// show and the panel used to fall back to a shrug.
		assert.ok(failure, 'expected the request to fail');
		assert.ok(/too large/.test(failure.message), 'expected the size to be named: ' + failure.message);
		assert.equal(failure.fromServer, true);
	});

	await test('only desktop formats are flagged as heavy', async function () {
		// The map the helper reads lives beside it in the panel.
		var box = context({ HEAVY: { ttf: true, otf: true } }, ['heavyFiles', 'extensionOf']);

		/*
		 * Array.from because the helper runs inside the vm realm, so an array it
		 * builds itself has that realm's prototype and strict deepEqual compares
		 * those. Nothing to do with the code under test.
		 */
		function listed(value) {
			return Array.from(value);
		}

		assert.deepEqual(
			listed(box.heavyFiles({ variants: [{ file: 'a.ttf' }, { file: 'b.otf' }, { file: 'c.woff2' }] })),
			['a.ttf', 'b.otf']
		);

		// WOFF saves about a fifth, not half. Flagging it would make the signal
		// worth ignoring.
		assert.deepEqual(listed(box.heavyFiles({ variants: [{ file: 'd.woff' }, { file: 'e.woff2' }] })), []);

		// A family that maps the same file twice says it once.
		assert.deepEqual(listed(box.heavyFiles({ variants: [{ file: 'a.ttf' }, { file: 'a.ttf' }] })), ['a.ttf']);

		// And nothing at all is not an error.
		assert.deepEqual(listed(box.heavyFiles({})), []);
		assert.deepEqual(listed(box.heavyFiles({ variants: [{ weight: '400' }] })), []);
	});

	/*
	 * 1.0.8 put this button inside a plain .efm-notice, which is a block with no
	 * layout, so the button became another inline box and flowed into the middle
	 * of the sentence. The structure is pinned here: the action is the last
	 * child of a column body, never a sibling of the prose inside a notice.
	 */
	await test('the heavy-format action sits under the text, not inside it', async function () {
		var source = fs.readFileSync(panel, 'utf8');

		// The action must be built into the callout body, not a bare notice.
		assert.ok(
			/efm-callout__body/.test(source),
			'expected the callout body column'
		);

		var callout = source.slice(source.indexOf('function heavyCallout('));
		callout = callout.slice(0, callout.indexOf('\n\t}'));

		assert.ok(/efm-callout__body/.test(callout), 'the button belongs in the body column');
		assert.ok(!/efm-notice/.test(callout), 'a plain notice cannot carry a button');

		// The button is pushed onto the body list after the two text spans, so
		// it renders below them rather than beside them.
		var pushAt = callout.indexOf('body.push(');
		var titleAt = callout.indexOf('efm-callout__title');
		assert.ok(pushAt > titleAt && titleAt > -1, 'the action must come after the text');

		// And the converter being unavailable leaves the note without an action
		// rather than offering one that cannot run.
		assert.ok(/converterAvailable\(\)/.test(callout), 'the action must be gated');
	});

	await test('no notice anywhere carries a button', async function () {
		var source = fs.readFileSync(panel, 'utf8');
		var offenders = [];
		var at = source.indexOf('efm-notice');

		/*
		 * .efm-notice is a plain block. Every use in the panel is text only, and
		 * the one that was not put its button in the middle of the prose. A
		 * short window after the class is enough to catch a button built into
		 * the same element without parsing the call.
		 */
		while (at !== -1) {
			if (source.slice(at, at + 300).indexOf('efm-btn') !== -1) {
				offenders.push(source.slice(at, at + 80).replace(/\s+/g, ' '));
			}

			at = source.indexOf('efm-notice', at + 1);
		}

		assert.deepEqual(offenders, [], 'a button inside a notice flows into the sentence');
	});

	/*
	 * Importing replaces the panel buffer wholesale and resets the saved
	 * fingerprints with it, so unsaved edits used to vanish without even leaving
	 * the save bar lit. The preview is the one chokepoint every import passes
	 * through, so that is where it has to be said -- and the two modes have to
	 * say different things, because "save first" only keeps the work in a merge.
	 */
	await test('the import preview says what unsaved work would cost', async function () {
		var source = fs.readFileSync(panel, 'utf8');
		var view = source.slice(source.indexOf("s('previewTitle'"));
		view = view.slice(0, view.indexOf("efm-card__actions"));

		assert.ok(/isDirty\(\)/.test(view), 'the preview must check the buffer');
		assert.ok(/changeSummary\(\)/.test(view), 'it must name the changes, not count them');
		assert.ok(/previewDirtyReplace/.test(view), 'replace needs its own sentence');
		assert.ok(/previewDirtyMerge/.test(view), 'merge needs its own sentence');

		// The wording has to differ, because saving first keeps the work in a
		// merge and cannot in a replace. One shared sentence would be a promise
		// the replace path cannot keep.
		var replaceAt = view.indexOf('previewDirtyReplace');
		var mergeAt = view.indexOf('previewDirtyMerge');
		assert.ok(replaceAt !== -1 && mergeAt !== -1 && replaceAt !== mergeAt, 'the two modes must not share one sentence');

		// And the mode decides which one, rather than both being emitted.
		assert.ok(/'merge' === \(state\.importMode/.test(view), 'the sentence must be chosen by mode');
	});

	await test('the import preview stays quiet when nothing is unsaved', async function () {
		var source = fs.readFileSync(panel, 'utf8');
		var view = source.slice(source.indexOf("s('previewTitle'"));
		view = view.slice(0, view.indexOf("efm-card__actions"));

		// The whole block hangs off isDirty(), so a clean buffer adds no line.
		var guardAt = view.indexOf('if (isDirty())');
		assert.ok(guardAt !== -1, 'expected the block to be guarded');
		assert.ok(view.indexOf('previewDirtyReplace') > guardAt, 'the sentence must sit inside the guard');
		assert.ok(view.indexOf('previewDirtyMerge') > guardAt, 'the sentence must sit inside the guard');
	});

	/*
	 * Automatic.css pins its dashboard beside the builder and writes
	 * `left: unset !important` onto this panel while it is pinned. Inline
	 * important cannot be outranked from a stylesheet, so the panel slid under
	 * Etch's settings bar, which paints above it and clipped the first character
	 * off every navigation label. The offset is therefore measured and written
	 * inline with the same weight.
	 */
	function chrome(barLeft, barWidth, dir) {
		var written = {};
		var manager = {
			style: {
				setProperty: function (k, v, p) { written[k] = { value: v, priority: p || '' }; },
				getPropertyValue: function (k) { return written[k] ? written[k].value : ''; }
			}
		};

		return {
			written: written,
			manager: manager,
			box: {
				isOpen: true,
				manager: manager,
				document: {
					documentElement: {},
					querySelector: function () {
						return { getBoundingClientRect: function () {
							return { left: barLeft, right: barLeft + barWidth, bottom: 777 };
						} };
					}
				},
				window: {
					innerHeight: 825,
					innerWidth: 1680,
					getComputedStyle: function () { return { direction: dir || 'ltr' }; }
				}
			}
		};
	}

	await test('the panel starts where the settings bar ends', async function () {
		var h = chrome(399, 46);
		var box = context(h.box, ['syncBounds']);

		box.syncBounds();

		// 399 + 46. Not the 48px default, and not the dashboard's own edge.
		assert.equal(h.written.left.value, '445px');
		assert.equal(h.written.left.priority, 'important', 'inline important is the only thing that outranks the neighbour');
		assert.equal(h.written['--efm-inset-bottom'].value, '48px');
	});

	await test('a settings bar at the viewport edge still measures correctly', async function () {
		var h = chrome(0, 46);
		var box = context(h.box, ['syncBounds']);

		box.syncBounds();

		// Unpinned: the bar sits at the left edge, so the panel starts at its width.
		assert.equal(h.written.left.value, '46px');
	});

	await test('re-measuring writes nothing when the chrome has not moved', async function () {
		var h = chrome(399, 46);
		var box = context(h.box, ['syncBounds']);

		box.syncBounds();

		var seen = [];
		h.manager.style.setProperty = function (k, v, p) { seen.push(k); };

		box.syncBounds();

		// The observer watches this element's own style attribute, so an
		// unguarded rewrite would drive it round in a loop.
		assert.deepEqual(seen, [], 'nothing should be rewritten when the measurement is unchanged');
	});

	/*
	 * Conversion on upload moved out of the Upload screen and into Settings, so
	 * the format that needs no conversion and the setting that governs the rest
	 * are both worth pinning down.
	 */
	function uploadPrep(convertUploads) {
		var converted = 0;
		var notes = [];
		var map = vm.runInNewContext('(' + /var CONVERTIBLE = (\{[^}]*\});/.exec(source)[1] + ')');
		var box = context({
			state: { settings: { convert_uploads: convertUploads } },
			CONVERTIBLE: map,
			window: { DecompressionStream: function () {} },
			converterAvailable: function () { return true; },
			axesFromFont: function () { return Promise.resolve(null); },
			convertUploadBuffer: function (buffer, file, plain) {
				converted++;
				plain.converted = true;
				return Promise.resolve(plain);
			},
			logNote: function (name, note) { notes.push(note); },
			s: function (key, fallback) { return fallback; }
		}, ['extensionOf', 'convertible', 'prepareUpload']);

		return {
			send: function (name) {
				return box.prepareUpload({
					name: name,
					size: 4096,
					arrayBuffer: function () { return Promise.resolve(new ArrayBuffer(8)); }
				});
			},
			notes: notes,
			getConverted: function () { return converted; }
		};
	}

	await test('an uploaded WOFF2 is never converted, and the report says so', async function () {
		var run = uploadPrep(true);
		var result = await run.send('already.woff2');

		assert.equal(run.getConverted(), 0, 'WOFF2 is the destination format, so there is nothing to run');
		assert.equal(result.converted, false);
		assert.equal(result.filename, 'already.woff2');
		assert.equal(result.to, result.from, 'the bytes are passed through untouched');

		// Silence here read as though the setting had not worked.
		assert.deepEqual(run.notes, ['Already WOFF2, uploaded unchanged']);
	});

	await test('the site setting decides whether an upload converts', async function () {
		var off = uploadPrep(false);
		await off.send('heavy.ttf');

		assert.equal(off.getConverted(), 0, 'a convertible font is left alone when the site says so');
		assert.deepEqual(off.notes, [], 'no WOFF2 note when conversion was never asked for');

		var on = uploadPrep(true);
		var result = await on.send('heavy.ttf');

		assert.equal(on.getConverted(), 1);
		assert.equal(result.converted, true);
	});

	await test('the conversion control lives in Settings, not above the dropzone', function () {
		var upload = extract('renderUpload');
		var settings = extract('renderSettings');

		assert.ok(
			!/efm-toggle--convert/.test(upload),
			'the Upload screen must not carry a control that only applies to the next files added'
		);
		assert.ok(/convert_uploads/.test(settings), 'Settings must carry it instead');

		// A browser-local copy would mean one site converting or not depending on
		// whose browser did the uploading.
		assert.ok(!/state\.convert\b/.test(source), 'the browser-local preference must be gone entirely');
	});

	/*
	 * The preview choice is per screen: Google compares candidates, so it wants
	 * one shared Latin sample, and the library verifies fonts you already own, so
	 * it wants each family in its own script. One shared record made each screen
	 * overwrite the other's.
	 */
	function previewBox(view, saved) {
		var box = context({
			state: {
				view: view,
				preview: {
					library: { custom: '', touched: false },
					google: { custom: '', touched: false }
				}
			},
			s: function (key, fallback) { return fallback; }
		}, ['previewScreen', 'previewPrefs', 'previewInForce']);

		if (saved) {
			box.state.preview = saved;
		}

		return box;
	}

	await test('Google Fonts opens on Latin and the library opens on Auto', function () {
		assert.equal(previewBox('google').previewInForce(), 'The quick brown fox');

		// Empty is Auto: every card falls back to a sample in its own script.
		assert.equal(previewBox('library').previewInForce(), '');
	});

	await test('a choice made in Google Fonts does not follow you into the library', function () {
		var shared = {
			library: { custom: '', touched: false },
			google: { custom: 'The quick brown fox', touched: true }
		};

		assert.equal(previewBox('google', shared).previewInForce(), 'The quick brown fox');

		/*
		 * The bug this replaces. A Latin pangram renders identically whether or not
		 * a family really carries its script, so a library forced to Latin hides
		 * exactly the fault the Auto default exists to show.
		 */
		assert.equal(previewBox('library', shared).previewInForce(), '');
	});

	await test('touching the library preview does not cost Google its Latin default', function () {
		var shared = {
			library: { custom: '', touched: true },
			google: { custom: '', touched: false }
		};

		assert.equal(previewBox('library', shared).previewInForce(), '', 'the library keeps the Auto it was asked for');
		assert.equal(previewBox('google', shared).previewInForce(), 'The quick brown fox');
	});

	await test('a screen that was given a choice keeps it', function () {
		var shared = {
			library: { custom: 'Sphinx of black quartz', touched: true },
			google: { custom: '', touched: true }
		};

		assert.equal(previewBox('library', shared).previewInForce(), 'Sphinx of black quartz');

		// Auto asked for explicitly in Google outranks the Latin default.
		assert.equal(previewBox('google', shared).previewInForce(), '');
	});

	await test('every screen other than Google Fonts previews as the library', function () {
		['library', 'upload', 'trash', 'tools'].forEach(function (view) {
			assert.equal(previewBox(view).previewInForce(), '', view + ' must not inherit the Latin default');
		});
	});

	/*
	 * A variable cut is stored as a CSS font-weight range -- two numbers and a
	 * space -- which is right in a stylesheet and reads as two separate weights
	 * in a list. It is shown as a range and stored unchanged.
	 */
	await test('a variable weight range reads as a range', function () {
		var box = context({}, ['weightLabel']);

		assert.equal(box.weightLabel('100 900'), '100-900');
		assert.equal(box.weightLabel('200 700'), '200-700');

		// A single weight is left exactly as it is.
		assert.equal(box.weightLabel('400'), '400');
		assert.equal(box.weightLabel(700), '700');

		// Absent means the CSS default, the same assumption every caller made.
		assert.equal(box.weightLabel(''), '400');
		assert.equal(box.weightLabel(undefined), '400');
	});

	await test('the stylesheet keeps the space-separated range CSS requires', function () {
		var css = extract('previewCss');

		/*
		 * font-weight: 100-900 is invalid and would drop the declaration, taking
		 * the variable face's whole weight axis with it. The hyphen is for reading.
		 */
		assert.ok(/font-weight: ' \+ \(variant\.weight/.test(css), 'the generated CSS must use the stored value');
		assert.ok(!/weightLabel/.test(css), 'the generated CSS must never use the display form');
	});

	await test('every weight the reader sees goes through the display form', function () {
		var card = extract('renderLibrary');
		var row = extract('fileRow');

		assert.ok(/weights\.map\(weightLabel\)/.test(card), 'the library card must show ranges as ranges');
		assert.ok(/weightLabel\(file\.weight\)/.test(row), 'a file row must show ranges as ranges');
	});

	await test('cards are the same height across rows, except in the list layout', function () {
		var css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'panel.css'), 'utf8');

		/*
		 * A grid row stretches its own cards already; this is what makes the second
		 * row agree with the first.
		 */
		assert.ok(
			/\.efm-grid:not\(\.efm-grid--row\) \{\s*grid-auto-rows: 1fr;/.test(css),
			'every card grid must resolve its rows to the tallest'
		);

		// One column means one card per row, so equalising would stretch them all.
		assert.ok(
			!/\.efm-grid--row \{[^}]*grid-auto-rows/.test(css),
			'the list layout must keep its rows sized to their content'
		);
	});

	await test('the card pins its subsets to the footer, not the specimen', function () {
		var card = extract('renderLibrary');
		var css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'panel.css'), 'utf8');

		assert.ok(/efm-chips efm-card__chips/.test(card), 'the chips row must carry the card modifier');

		// Pinning both would leave the gap between them instead of below them.
		assert.ok(
			/\.efm-card__chips \{\s*margin-block-start: auto;/.test(css),
			'the chips row must take the pin'
		);
		assert.ok(
			/\.efm-card:has\(\.efm-card__chips\) \.efm-card__meta \{\s*margin-block-start: 0;/.test(css),
			'the footer must give its pin up when the chips are there'
		);
	});

	/*
	 * A save writes the option and rewrites the stylesheet. The two can disagree,
	 * and when they do the panel used to report an unqualified success while the
	 * site went on serving the stylesheet it had before.
	 */
	function savedReport(response) {
		var statuses = [];
		var box = context({
			setStatus: function (message, type) { statuses.push({ message: message, type: type }); },
			s: function (key, fallback) { return fallback; }
		}, ['reportSaved']);

		box.reportSaved(response, 'Fonts saved.');

		return statuses;
	}

	await test('a save that could not write the stylesheet says so', function () {
		var warned = savedReport({ families: [], css_write_failed: true });

		assert.equal(warned.length, 1);
		assert.equal(warned[0].type, 'warning', 'the data did save, so this is not an error');
		assert.ok(/stylesheet could not be written/.test(warned[0].message));

		// Naming the remedy matters: nothing else in the panel reports this.
		assert.ok(/fonts folder is writable/.test(warned[0].message));
		assert.ok(!/^Fonts saved\.$/.test(warned[0].message), 'it must not read as an unqualified success');
	});

	await test('an ordinary save is unchanged', function () {
		var plain = savedReport({ families: [] });

		assert.deepEqual(plain, [{ message: 'Fonts saved.', type: undefined }]);

		// A server that never sets the flag behaves exactly as before.
		assert.deepEqual(savedReport(null), [{ message: 'Fonts saved.', type: undefined }]);
		assert.deepEqual(savedReport({ css_write_failed: false }), [{ message: 'Fonts saved.', type: undefined }]);
	});

	await test('both save paths report through the same check', function () {
		var save = extract('saveFamilies');

		// The families-only path and the families-then-settings path.
		assert.equal((save.match(/reportSaved\(/g) || []).length, 2);
		assert.ok(
			!/setStatus\(s\('saved'/.test(save) && !/setStatus\(bothChanged/.test(save),
			'no save path may report success without the stylesheet check'
		);
	});

	await test('a custom name previews beside the generated name and keeps the fallback', function () {
		var named = { name: 'Inter', slug: 'inter', css_variable: '--sans', fallback: 'sans-serif', variants: [{ file: 'inter.woff2' }] };
		var box = context({
			state: { families: [named], missing: [] },
			s: function (key, fallback) { return fallback; },
			isEnabled: function () { return true; },
			isTrashed: function () { return false; },
			fallbackFaceCss: function () { return ''; },
			formatOf: function () { return 'woff2'; },
			familyStack: function () { return '"Inter", sans-serif'; },
			ROLE_KEYS: [],
			splitSelectors: function () { return { kept: [] }; }
		}, ['customPropertyIssue', 'previewCss']);
		var css = box.previewCss(named);

		assert.match(css, /--efm-family-inter: "Inter", sans-serif;/);
		assert.match(css, /--sans: var\(--efm-family-inter\);/);
		named.css_variable = '';
		assert.doesNotMatch(box.previewCss(named), /--sans:/);
		named.slug = '';
		assert.match(box.previewCss(named), /Save this family to see its generated CSS variable/, 'unsaved family preview does not guess the server slug');
		named.variants = [];
		assert.doesNotMatch(box.previewCss(named), /--efm-family-inter:/, 'a family with no variants publishes no variable');
	});

	await test('custom CSS names are editable without claiming another family or a reserved token', function () {
		var box = context({
			state: { families: [
				{ name: 'Foo Bar', slug: 'foo-bar', css_variable: '--sans' },
				{ name: 'Foo-Bar', slug: 'foo-bar', css_variable: '--body' },
				{ name: 'New family', css_variable: '--new' }
			] },
			s: function (key, fallback) { return fallback; }
		}, ['customPropertyIssue', 'customPropertyName', 'customPropertyFromName']);

		assert.equal(box.customPropertyName('--sans'), 'sans', 'the field shows only the editable name');
		assert.equal(box.customPropertyName(''), '', 'the default stays a placeholder rather than input text');
		assert.equal(box.customPropertyFromName('sans', '--efm-family-foo-bar'), '--sans', 'the fixed prefix is restored for storage');
		assert.equal(box.customPropertyFromName('', '--efm-family-foo-bar'), '', 'a blank field keeps the generated variable');
		assert.equal(box.customPropertyFromName('efm-family-foo-bar', '--efm-family-foo-bar'), '', 'typing the generated name is the same as leaving it blank');
		assert.match(source, /text: 'var\(--'/, 'the field fixes var(-- before the editable name');
		assert.match(source, /fieldPlaceholder = generatedName \|\| 'name'/, 'an empty field displays the generated name or name placeholder');
		assert.match(source, /'inline-size': \(fieldName \|\| fieldPlaceholder\)\.length \+ 'ch'/, 'the closing bracket starts beside the visible name');
		assert.match(source, /setProperty\('inline-size', \(event\.target\.value \|\| fieldPlaceholder\)\.length \+ 'ch'\)/, 'the closing bracket follows edits');
		assert.match(cssSource, /\.efm-token--editable\s*{\s*gap:\s*0;/, 'fixed syntax has no artificial spaces');
		assert.match(cssSource, /\.efm-token--editable \.efm-btn\s*{\s*margin-inline-start:\s*auto;/, 'only the copy button moves to the far edge');
		assert.equal(box.customPropertyIssue('--sans', 0), '');
		assert.equal(box.customPropertyIssue('', 0), '');
		assert.match(box.customPropertyIssue('--sans', 1), /already uses/);
		assert.match(box.customPropertyIssue('--efm-family-inter', 0), /reserved/);
		assert.match(box.customPropertyIssue('--text-font-family', 0), /reserved/);
		assert.match(box.customPropertyIssue('--bad; color: red', 0), /Use a name/);
		assert.match(box.customPropertyIssue('--body', 1), /same generated name/, 'slug collisions cannot promise an alias PHP skips');
		assert.equal(box.customPropertyIssue('--new', 2), '', 'a new family can choose an alias before its first save');
	});

	console.log('\n' + passed + ' panel workflow regressions passed.');
}()).catch(function (error) {
	console.error(error.stack || error.message);
	process.exit(1);
});
