# Changelog

All notable changes to Etch Font Manager are documented here.

## 1.0.4

- **Fix builder-breaking bug:** register the canvas stylesheet only through `etch/canvas/additional_stylesheets`.
  Registering through `etch/canvas/enqueue_assets` as well produced two entries with the id `efm-fonts` in Etch's
  keyed canvas stylesheet list, throwing `each_key_duplicate` and leaving the builder canvas collapsed and unclickable.
- Skip the filter when an entry for the stylesheet already exists.
- Never rename or replace the canvas link element Etch owns; only its `href` is updated when fonts change.
- Remove the 1.0.3 DOM fallback control. The official Controls API works; the fallback inserted a foreign node
  into Etch's Svelte-managed Settings Bar.

## 1.0.3

- Detect the Etch 1.6.4 state where external controls enter the public store but its Svelte Settings Bar renderer does not consume them.
- In that specific state, render a native-shaped Fonts button directly after dark mode without mutating Etch's control store.
- Continue using the official Controls API on healthy Etch installations.

## 1.0.2

- Version builder panel assets by file modification time to prevent stale JavaScript after hotfixes.
- Add a URL-scoped diagnostic bypass for isolating third-party Settings Bar integrations.

## 1.0.1

- Wait for the exact Etch Settings Bar section to mount before registering the Fonts control.
- Add a page-level boot guard and guarantee a single Controls API registration, preventing Etch's Svelte `each_key_duplicate` crash.
- Store and serve fonts from the shared `wp-content/fonts/` directory so legacy Etch Custom Fonts files work immediately.

## 1.0.0

Initial release.

- Native **Fonts** control in the Etch Settings Bar via the official `window.etchControls` Controls API.
- Docked font manager panel styled from Etch's own design tokens, including light/dark scheme support.
- Font file uploads with magic-byte validation, 10 MB cap and path-traversal protection.
- Google Fonts search, live preview and one-click local install.
- Family and variant management (file, weight, style) with buffered edits and a save bar.
- Automatic.css mapping for `--heading-font-family` and `--text-font-family`.
- Generated stylesheet delivered to the frontend, the Etch canvas iframe and the block editor.
- Live canvas stylesheet refresh after every change, with no page reload.
- `theme.json` registration so Gutenberg font pickers list installed families.
- Automatic import of data from the legacy Etch Custom Fonts plugin on activation.
