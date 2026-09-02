/**
 * Etch Font Manager — WOFF2 conversion worker.
 *
 * Runs the google/woff2 encoder compiled to WebAssembly. Font bytes are
 * converted here and never leave the browser; the plugin uploads the WOFF2
 * result exactly as if the user had picked that file themselves.
 *
 * This has to be a worker. Compressing a font takes on the order of a second
 * or two per file, and the Etch builder is sitting on the same main thread.
 *
 * Protocol
 *   in  { id, type: 'convert', buffer }   ArrayBuffer, transferred
 *   in  { id, type: 'decode', buffer }    ArrayBuffer, transferred
 *   out { type: 'ready' }
 *   out { id, type: 'done', buffer }      ArrayBuffer, transferred
 *   out { id, type: 'error', error }
 *
 * Decoding is not the converter's job and never reaches a file the user keeps:
 * it unwraps a WOFF2 far enough to read one table out of it, because a variable
 * font that arrives already compressed carries its axes where nothing can see
 * them otherwise.
 *
 * woff2.js and woff2.wasm are built by .github/workflows/build-wasm.yml.
 */

/* eslint-env worker */
/* global EFMWoff2 */

'use strict';

self.importScripts('woff2.js');

var modulePromise = null;

/**
 * Instantiate the WASM module once, lazily.
 *
 * locateFile is set explicitly rather than trusting Emscripten's own guess:
 * some hosts and CDNs rewrite script URLs, and resolving against this worker's
 * location is the one thing we know is right.
 *
 * @return {Promise} Resolves with the Emscripten module.
 */
function boot() {
	if (!modulePromise) {
		modulePromise = EFMWoff2({
			locateFile: function (file) {
				return new URL(file, self.location.href).href;
			}
		});
	}

	return modulePromise;
}

/**
 * Run one direction of the codec.
 *
 * Both share an output buffer and a release call inside the module, so they
 * share this too rather than being written twice with one word different.
 *
 * @param {Object} module Emscripten module.
 * @param {ArrayBuffer} buffer Source font bytes.
 * @param {string} entry Exported function name.
 * @param {string} failure Message when it returns nothing.
 * @return {ArrayBuffer} Result bytes.
 */
function run(module, buffer, entry, failure) {
	var input = new Uint8Array(buffer);
	var address = module._malloc(input.byteLength);

	if (!address) {
		throw new Error('Out of memory.');
	}

	var length;

	try {
		module.HEAPU8.set(input, address);
		length = module[entry](address, input.byteLength);
	} finally {
		module._free(address);
	}

	if (!length) {
		// The module has already released its own buffer on the failure path,
		// so there is nothing to clean up here.
		throw new Error(failure);
	}

	var output;

	try {
		// slice() copies out of the WASM heap. A subarray would be a view onto
		// the whole linear memory, which cannot be transferred and would be
		// invalidated by the next allocation anyway.
		var start = module._efm_output();
		output = module.HEAPU8.slice(start, start + length);
	} finally {
		module._efm_release();
	}

	return output.buffer;
}

var JOBS = {
	convert: {
		entry: '_efm_ttf_to_woff2',
		failure: 'Conversion failed. The file may be invalid or corrupted.'
	},
	decode: {
		entry: '_efm_woff2_to_sfnt',
		failure: 'This WOFF2 file could not be read.'
	}
};

self.onmessage = function (event) {
	var message = event.data;
	var job = message && JOBS[message.type];

	if (!job) {
		return;
	}

	boot().then(function (module) {
		var result = run(module, message.buffer, job.entry, job.failure);
		self.postMessage({ id: message.id, type: 'done', buffer: result }, [result]);
	}).catch(function (error) {
		self.postMessage({
			id: message.id,
			type: 'error',
			error: (error && error.message) || String(error)
		});
	});
};

boot().then(function () {
	self.postMessage({ type: 'ready' });
}).catch(function (error) {
	self.postMessage({
		type: 'error',
		error: (error && error.message) || String(error)
	});
});
