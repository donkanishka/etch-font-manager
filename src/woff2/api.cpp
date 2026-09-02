/* Etch Font Manager — Emscripten entry points for google/woff2.

   Compiled to assets/wasm/woff2.js + assets/wasm/woff2.wasm by
   .github/workflows/build-wasm.yml. Nothing in this file is shipped as source
   in the plugin zip; only the compiled artefacts are.

   Both directions are exposed. The encoder is what the converter uses. The
   decoder exists for one narrow reason: a variable font uploaded as WOFF2, or
   already sitting in the fonts folder as one, carries its axes in an fvar table
   the panel cannot read without unwrapping the container first. Without it the
   only honest answer was to show no axes at all.

   Ownership: both entry points allocate the output buffer and keep it in the
   same static. The caller reads it with efm_output() and must call
   efm_release() once the bytes have been copied out of the WASM heap. Each
   call releases the previous buffer first, so a caller that forgets cannot leak
   more than one font.

   Distributed under GPL-2.0-or-later, linking google/woff2 and google/brotli,
   both MIT.
*/

#include <emscripten/emscripten.h>

#include <stdint.h>
#include <stdlib.h>

#include <woff2/decode.h>
#include <woff2/encode.h>

namespace {

uint8_t* g_output = nullptr;
size_t g_output_length = 0;

void release_output() {
	if ( g_output != nullptr ) {
		free( g_output );
		g_output = nullptr;
	}

	g_output_length = 0;
}

}  // namespace

extern "C" {

/* Compress an sfnt font (TrueType or CFF OpenType) to WOFF2.

   Returns the length of the result, or 0 if the input could not be converted.
   On success the bytes live at efm_output() until the next call.
*/
EMSCRIPTEN_KEEPALIVE
size_t efm_ttf_to_woff2( const uint8_t* data, size_t length ) {
	release_output();

	if ( data == nullptr || length < 4 ) {
		return 0;
	}

	size_t capacity = woff2::MaxWOFF2CompressedSize( data, length );

	if ( capacity == 0 ) {
		return 0;
	}

	g_output = static_cast<uint8_t*>( malloc( capacity ) );

	if ( g_output == nullptr ) {
		return 0;
	}

	g_output_length = capacity;

	if ( ! woff2::ConvertTTFToWOFF2( data, length, g_output, &g_output_length ) ) {
		release_output();
		return 0;
	}

	return g_output_length;
}

/* Decompress a WOFF2 font back to its sfnt form.

   Returns the length of the result, or 0 if the input could not be decoded.
   On success the bytes live at efm_output() until the next call.

   The reconstructed sfnt is not byte-identical to whatever was compressed --
   WOFF2 normalises table order and drops padding -- which does not matter here,
   because the only caller reads one table out of it and throws it away.
*/
EMSCRIPTEN_KEEPALIVE
size_t efm_woff2_to_sfnt( const uint8_t* data, size_t length ) {
	release_output();

	if ( data == nullptr || length < 4 ) {
		return 0;
	}

	size_t capacity = woff2::ComputeWOFF2FinalSize( data, length );

	/* A malformed header can claim an absurd size, and this runs on whatever a
	   user drops on the upload screen. 256MB is far past any real font and well
	   inside what the heap is allowed to grow to. */
	if ( capacity == 0 || capacity > ( 256u * 1024u * 1024u ) ) {
		return 0;
	}

	g_output = static_cast<uint8_t*>( malloc( capacity ) );

	if ( g_output == nullptr ) {
		return 0;
	}

	g_output_length = capacity;

	if ( ! woff2::ConvertWOFF2ToTTF( g_output, g_output_length, data, length ) ) {
		release_output();
		return 0;
	}

	return g_output_length;
}

/* Address of the last conversion result inside the WASM heap. */
EMSCRIPTEN_KEEPALIVE
uint8_t* efm_output() {
	return g_output;
}

/* Free the last conversion result. Safe to call more than once. */
EMSCRIPTEN_KEEPALIVE
void efm_release() {
	release_output();
}

}  // extern "C"
