#!/usr/bin/env node
/*
 * Exercise the actual panel decoder with real RFC 1950 streams, no framework.
 * node tools/woff-check.js [path/to/saved-original-panel.js]
 * The optional source must fail the same security checks. Allocation guards and
 * a 256 KiB bomb keep negative verification safe even against the old decoder.
 */
'use strict';

var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var assert = require('node:assert/strict');
var zlib = require('node:zlib');
var PANEL = process.argv[2] || path.join(__dirname, '..', 'assets', 'panel.js');
var source = fs.readFileSync(PANEL, 'utf8');
var tests = [];
var failed = 0;

function extract(name) {
	var start = source.indexOf('\tfunction ' + name + '(');
	if (start < 0) { return ''; }
	var end = source.indexOf('\n\t}', start);
	assert.ok(end > start, 'Function end missing: ' + name);
	// These top-level IIFE functions end at one tab; nested functions do not.
	return source.slice(start, end + 3);
}

function decoder() {
	var stats = { allocations: [], copies: 0, slices: 0, streams: 0, active: 0, peak: 0, reads: 0, bytes: 0, cancels: 0 };
	class Bytes extends Uint8Array {
		constructor(...args) {
			if (typeof args[0] === 'number') {
				stats.allocations.push(args[0]);
				if (args[0] > 1024 * 1024) { throw new Error('Harness allocation guard'); }
			}
			super(...args);
		}
		set(...args) { stats.copies++; return super.set(...args); }
		slice(...args) { stats.slices++; return super.slice(...args); }
	}
	function Stream(format) {
		stats.streams++;
		stats.active++;
		stats.peak = Math.max(stats.peak, stats.active);
		var stream = new DecompressionStream(format);
		var originalReader = stream.readable.getReader.bind(stream.readable);
		var ended = false;
		function end() { if (!ended) { ended = true; stats.active--; } }
		stream.readable.getReader = function () {
			var reader = originalReader();
			return {
				read: function () {
					stats.reads++;
					return reader.read().then(function (chunk) {
						if (chunk.done) { end(); } else { stats.bytes += chunk.value.length; }
						return chunk;
					}, function (error) { end(); throw error; });
				},
				cancel: function () { stats.cancels++; end(); return reader.cancel(); },
				releaseLock: function () { reader.releaseLock(); }
			};
		};
		return stream;
	}
	var constants = ['WOFF_HEADER', 'WOFF_ENTRY'].map(function (name) {
		var match = source.match(new RegExp('var ' + name + ' = [0-9]+;'));
		assert.ok(match, name + ' declaration missing');
		return match[0];
	}).join('\n');
	var context = vm.createContext({
		Uint8Array: Bytes, DataView: DataView, Blob: Blob, Response: Response,
		window: { DecompressionStream: Stream }, s: function (key, fallback) { return fallback; }
	});
	vm.runInContext(constants + '\n' + ['isWoff', 'inflate', 'assembleSfnt', 'woffToSfnt', 'toSfnt'].map(extract).join('\n'), context);
	return { run: context.toSfnt, direct: context.woffToSfnt, stats: stats };
}

function pad(n) { return Math.ceil(n / 4) * 4; }
function fixture(tables, flavor) {
	var offset = 44 + tables.length * 20;
	var total = 12 + tables.length * 16;
	var entries = tables.map(function (table, i) {
		var data = Buffer.from(table.data || Buffer.alloc(128, i + 1));
		var bytes = table.compressed ? zlib.deflateSync(data) : data;
		var entry = { tag: 0x61616161 + i, offset: offset, bytes: bytes, data: data, original: table.original === undefined ? data.length : table.original };
		offset += pad(bytes.length);
		total += pad(entry.original);
		return entry;
	});
	var buffer = new ArrayBuffer(offset);
	var view = new DataView(buffer);
	view.setUint32(0, 0x774f4646);
	view.setUint32(4, flavor || 0x00010000);
	view.setUint32(8, offset);
	view.setUint16(12, entries.length);
	view.setUint32(16, total >>> 0);
	entries.forEach(function (e, i) {
		var at = 44 + i * 20;
		view.setUint32(at, e.tag);
		view.setUint32(at + 4, e.offset);
		view.setUint32(at + 8, e.bytes.length);
		view.setUint32(at + 12, e.original);
		view.setUint32(at + 16, 0x12345678 + i);
		new Uint8Array(buffer).set(e.bytes, e.offset);
	});
	return { buffer: buffer, view: view, entries: entries };
}
function test(name, fn) { tests.push({ name: name, fn: fn }); }
function invalid(name, mutate, tables, direct) {
	test(name, async function () {
		var f = fixture(tables || [{ compressed: true }, { compressed: true }]);
		mutate(f);
		var d = decoder();
		await assert.rejects(Promise.resolve().then(function () { return (direct ? d.direct : d.run)(f.buffer); }), /This WOFF file is damaged/);
		assert.equal(d.stats.streams, 0, 'must reject before inflation');
		assert.equal(d.stats.copies + d.stats.slices, 0, 'must reject before copying');
		assert.deepEqual(d.stats.allocations, [], 'must reject before output allocation');
	});
}

[0x00010000, 0x4f54544f].forEach(function (flavor) {
	[false, true].forEach(function (compressed) {
		test((flavor === 0x4f54544f ? 'CFF' : 'TrueType') + ' ' + (compressed ? 'compressed' : 'uncompressed') + ' byte-exact tables', async function () {
			var f = fixture([{ compressed: compressed, data: Buffer.alloc(131, 7) }, { compressed: compressed, data: Buffer.alloc(259, 3) }], flavor);
			var d = decoder();
			var result = await d.run(f.buffer);
			var view = new DataView(result);
			assert.equal(view.getUint32(0), flavor);
			assert.equal(result.byteLength, f.view.getUint32(16));
			assert.equal(view.getUint16(4), 2);
			assert.equal(view.getUint16(6), 32);
			assert.equal(view.getUint16(8), 1);
			assert.equal(view.getUint16(10), 0);
			f.entries.forEach(function (entry, i) {
				var at = 12 + i * 16;
				assert.equal(view.getUint32(at), entry.tag);
				assert.equal(view.getUint32(at + 4), 0x12345678 + i);
				assert.equal(view.getUint32(at + 12), entry.data.length);
				var start = view.getUint32(at + 8);
				assert.deepEqual(Buffer.from(result, start, entry.data.length), entry.data);
				assert.ok(new Uint8Array(result, start + entry.data.length, pad(entry.data.length) - entry.data.length).every(function (byte) { return byte === 0; }));
			});
		});
	});
});
invalid('bad signature', function (f) { f.view.setUint32(0, 0); }, undefined, true);
invalid('header/file length mismatch', function (f) { f.view.setUint32(8, f.buffer.byteLength - 4); });
invalid('reserved header field', function (f) { f.view.setUint16(14, 1); });
invalid('zero table count', function (f) { f.view.setUint16(12, 0); });
invalid('too many tables for sfnt search fields', function () {}, Array.from({ length: 4096 }, function () { return { data: Buffer.alloc(0) }; }));
invalid('truncated directory', function (f) { f.view.setUint16(12, 100); });
invalid('table overlaps directory', function (f) { f.view.setUint32(48, 44); });
invalid('compressed tables overlap', function (f) { f.view.setUint32(68, f.entries[0].offset); });
invalid('uncompressed tables overlap', function (f) { f.view.setUint32(68, f.entries[0].offset); }, [{}, {}]);
invalid('later table overlaps after valid first table', function (f) { f.view.setUint32(88, f.entries[1].offset); }, [{ compressed: true }, { compressed: true }, { compressed: true }]);
invalid('unaligned table', function (f) { f.view.setUint32(48, f.entries[0].offset + 1); });
invalid('table outside input', function (f) { f.view.setUint32(48, 0xfffffffc); });
invalid('compressed length exceeds original', function (f) { f.view.setUint32(56, 1); });
invalid('zero compressed/nonzero original', function (f) { f.view.setUint32(52, 0); });
invalid('duplicate tags', function (f) { f.view.setUint32(64, f.view.getUint32(44)); });
invalid('metadata overlaps table', function (f) { f.view.setUint32(24, f.entries[0].offset); f.view.setUint32(28, 4); f.view.setUint32(32, 4); });
invalid('private data overlaps directory', function (f) { f.view.setUint32(36, 44); f.view.setUint32(40, 4); });
invalid('metadata missing offset', function (f) { f.view.setUint32(28, 4); f.view.setUint32(32, 4); });
invalid('private missing offset', function (f) { f.view.setUint32(40, 4); });
invalid('metadata outside input', function (f) { f.view.setUint32(24, 0xfffffffc); f.view.setUint32(28, 4); f.view.setUint32(32, 4); });
invalid('metadata missing original length', function (f) { f.view.setUint32(24, f.entries[0].offset); f.view.setUint32(28, 4); });
invalid('private outside input', function (f) { f.view.setUint32(36, 0xfffffffc); f.view.setUint32(40, 4); });
invalid('table padding beyond input', function (f) { f.view.setUint32(48, f.buffer.byteLength - 4); f.view.setUint32(52, 5); f.view.setUint32(56, 5); });
invalid('sfnt size mismatch', function (f) { f.view.setUint32(16, f.view.getUint32(16) + 4); });
invalid('uint32 padding overflow', function () {}, [{ compressed: true, original: 0xffffffff }]);
invalid('aggregate exceeds 64 MiB (small input)', function () {}, [{ compressed: true, original: 40 * 1024 * 1024 }, { compressed: true, original: 40 * 1024 * 1024 }]);
invalid('single table exceeds 64 MiB (small input)', function () {}, [{ compressed: true, original: 64 * 1024 * 1024 }]);

test('valid metadata/private data dropped without inflation', async function () {
	var f = fixture([{ compressed: true }]);
	var buffer = new ArrayBuffer(f.buffer.byteLength + 12);
	new Uint8Array(buffer).set(new Uint8Array(f.buffer));
	var v = new DataView(buffer);
	v.setUint32(8, buffer.byteLength);
	v.setUint32(24, f.buffer.byteLength); v.setUint32(28, 5); v.setUint32(32, 999);
	v.setUint32(36, f.buffer.byteLength + 8); v.setUint32(40, 4);
	var d = decoder();
	await d.run(buffer);
	assert.equal(d.stats.streams, 1);
	v.setUint32(36, f.buffer.byteLength + 4);
	d = decoder();
	await assert.rejects(d.run(buffer));
	assert.equal(d.stats.allocations.length + d.stats.streams + d.stats.copies, 0);
});
test('bounded small decompression bomb cancels on first excess chunk', async function () {
	var f = fixture([{ compressed: true, data: Buffer.alloc(256 * 1024, 1), original: 512 }]);
	assert.ok(f.buffer.byteLength < 1024, 'fixture remains small');
	var d = decoder();
	await assert.rejects(d.run(f.buffer), /This WOFF file is damaged/);
	assert.equal(d.stats.cancels, 1, 'overflow must cancel the reader');
	assert.equal(d.stats.reads, 1, 'stop at first oversized chunk');
	assert.equal(d.stats.copies, 0, 'oversized chunk must not be copied');
	assert.deepEqual(d.stats.allocations, [540], 'only declared output allocated');
	assert.equal(d.stats.active, 0);
});
test('inflate rejects excess after an exact declared-length chunk', async function () {
	var f = fixture([{ compressed: true, data: Buffer.alloc(256 * 1024, 2), original: 16384 }]);
	var d = decoder();
	await assert.rejects(d.run(f.buffer), /This WOFF file is damaged/);
	assert.equal(d.stats.cancels, 1);
	assert.ok(d.stats.reads <= 2, 'stop at the first excess, including after exact output');
	assert.ok(d.stats.copies <= 1);
	assert.equal(d.stats.active, 0);
});
test('short inflate rejected', async function () {
	var f = fixture([{ compressed: true, original: 512 }]);
	await assert.rejects(decoder().run(f.buffer), /This WOFF file is damaged/);
});
test('invalid zlib stream translated', async function () {
	var f = fixture([{ compressed: true }]);
	new Uint8Array(f.buffer)[f.entries[0].offset] = 0;
	await assert.rejects(decoder().run(f.buffer), /This WOFF file is damaged/);
});
test('mixed tables processed sequentially without retained table copies', async function () {
	var f = fixture([{ compressed: true }, {}, { compressed: true }, { compressed: true }]);
	var d = decoder();
	await d.run(f.buffer);
	assert.equal(d.stats.streams, 3);
	assert.equal(d.stats.peak, 1, 'one active decompressor');
	assert.equal(d.stats.active, 0);
	assert.equal(d.stats.slices, 0, 'no per-table slice copies');
	assert.deepEqual(d.stats.allocations, [f.view.getUint32(16)]);
});
test('non-WOFF dispatch unchanged', async function () {
	var buffer = new ArrayBuffer(8);
	assert.equal(await decoder().run(buffer), buffer);
});
test('short WOFF rejected', async function () {
	var buffer = new ArrayBuffer(4);
	new DataView(buffer).setUint32(0, 0x774f4646);
	await assert.rejects(decoder().run(buffer), /This WOFF file is damaged/);
});

(async function () {
	for (var t of tests) {
		try { await t.fn(); console.log('PASS ' + t.name); }
		catch (error) { failed++; console.error('FAIL ' + t.name + ': ' + error.message); }
	}
	console.log((tests.length - failed) + '/' + tests.length + ' passed: ' + PANEL);
	process.exitCode = failed ? 1 : 0;
})();
