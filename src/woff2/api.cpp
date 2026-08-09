/* Etch Font Manager — Emscripten entry points for google/woff2.

   Compiled to assets/wasm/woff2.js + assets/wasm/woff2.wasm by
   .github/workflows/build-wasm.yml. Nothing in this file is shipped as source
   in the plugin zip; only the compiled artefacts are.

   Only the encoder is exposed. The plugin converts TTF/OTF to WOFF2 and never
   needs the reverse direction, and leaving the decoder out keeps the binary
   meaningfully smaller.

   Ownership: efm_ttf_to_woff2() allocates the output buffer and keeps it in a
   static. The caller reads it with efm_output() and must call efm_release()
   once the bytes have been copied out of the WASM heap. Each conversion
   releases the previous buffer first, so a caller that forgets cannot leak
   more than one font.

   Distributed under GPL-2.0-or-later, linking google/woff2 and google/brotli,
   both MIT.
*/

#include <emscripten/emscripten.h>

#include <stdint.h>
#include <stdlib.h>

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
