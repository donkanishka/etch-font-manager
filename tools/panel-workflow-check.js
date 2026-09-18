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
		}, ['confirmImport']);

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
		}, ['confirmImport']);

		box.confirmImport();

		for (var beat = 0; beat < 8; beat++) {
			await new Promise(function (resolve) { setImmediate(resolve); });
		}

		assert.equal(statuses[statuses.length - 1].message, 'Imported \u00b7 1 family');
	});

	console.log('\n' + passed + ' panel workflow regressions passed.');
}()).catch(function (error) {
	console.error(error.stack || error.message);
	process.exit(1);
});
