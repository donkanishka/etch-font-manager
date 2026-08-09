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
 *   out { type: 'ready' }
 *   out { id, type: 'done', buffer }      ArrayBuffer, transferred
 *   out { id, type: 'error', error }
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
 * Convert one font.
 *
 * @param {Object} module Emscripten module.
 * @param {ArrayBuffer} buffer Source font bytes.
 * @return {ArrayBuffer} WOFF2 bytes.
 */
function convert(module, buffer) {
	var input = new Uint8Array(buffer);
	var address = module._malloc(input.byteLength);

	if (!address) {
		throw new Error('Out of memory.');
	}

	var length;

	try {
		module.HEAPU8.set(input, address);
		length = module._efm_ttf_to_woff2(address, input.byteLength);
	} finally {
		module._free(address);
	}

	if (!length) {
		throw new Error('Conversion failed. The file may be invalid or corrupted.');
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

self.onmessage = function (event) {
	var message = event.data;

	if (!message || 'convert' !== message.type) {
		return;
	}

	boot().then(function (module) {
		var result = convert(module, message.buffer);
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
