# Etch Font Manager

Manage self-hosted custom fonts **inside the Etch builder**. No trips back to the WordPress dashboard.

The plugin registers a **Fonts** control in the Etch Settings Bar using Etch's official
[Controls API](https://docs.etchwp.com/integrations/controls) and opens a docked panel that follows the
builder's own panel conventions (sizing, tokens, typography, focus styles, light/dark scheme).

## Features

- **Native Settings Bar control** — registered through `window.etchControls.builder.settingsBar`, placed directly after the dark mode toggle by default.
- **Docked panel** — matches Etch's own panel geometry (53px header, 28px controls, 6px radii, Inter 12/13px) and reads Etch CSS custom properties, so it follows the builder's colour scheme.
- **Upload fonts** — drag and drop `.woff2`, `.woff`, `.ttf`, `.otf` files.
- **Google Fonts** — search, live preview, and one-click install. Files are downloaded locally, so the frontend makes no requests to Google.
- **Family and variant mapping** — assign files to weights and styles, all inline in the panel.
- **Automatic.css integration** — map families to `--heading-font-family` and `--text-font-family`.
- **Instant canvas refresh** — the generated stylesheet is reloaded in the builder shell and canvas iframe after every change; no page reload.
- **Self-hosted and GDPR friendly** — everything is served from your own fonts directory.
- **Block editor aware** — family names are registered in `theme.json` so Gutenberg font pickers list them (without duplicate `@font-face` output).

## Requirements

- WordPress 6.0+
- PHP 7.4+
- Etch 1.6+ (the Controls API is required for the in-builder panel)
- Automatic.css is optional

## Installation

1. Download or clone this repository into `/wp-content/plugins/etch-font-manager/`.
2. Activate **Etch Font Manager** in Plugins.
3. Open the Etch builder. The **Fonts** icon appears in the Settings Bar, right after the dark mode toggle.

On activation, existing data from the older *Etch Custom Fonts* plugin is imported automatically when present.

## Usage

**Library tab** — lists your font families. Expand one to rename it, map files to weights and styles, add or
remove variants. Changes are buffered, and a save bar appears while there are unsaved edits.

**Add tab** — drop font files into the upload zone, or search Google Fonts and install a family with one
click. Installing downloads every available latin variant and wires the family up for you.

**Theme tab** — pick the heading and text families. These are written as `--heading-font-family` and
`--text-font-family`, which Automatic.css consumes directly.

## How fonts are delivered

| Context | Mechanism |
| --- | --- |
| Frontend | `efm-fonts.css` enqueued on `wp_enqueue_scripts` |
| Etch canvas iframe | `etch/canvas/additional_stylesheets` filter and `etch/canvas/enqueue_assets` action |
| Block editor | `enqueue_block_assets` plus `theme.json` family registration |
| Builder panel previews | Same stylesheet, refreshed with a cache-busting query after each change |

The static stylesheet uses **relative** `src` URLs, which avoids cross-origin issues inside iframes.

## Security

- All REST routes require `manage_options` (filterable via `efm_capability`) and a valid `wp_rest` nonce.
- Uploads are validated by magic bytes, not just by extension.
- File paths are resolved and confirmed to be inside the fonts directory.
- Family names are stripped of characters that could break out of a CSS declaration.
- Uploads are capped at 10 MB per file.

## Filters

| Filter | Purpose |
| --- | --- |
| `efm_capability` | Capability required to manage fonts. Default `manage_options`. |
| `efm_control_placement` | `after-dark-mode` (default), `top-start`, `top-end`, `center-start`, `center-end`, `bottom-start`, `bottom-end`. |
| `efm_control_icon` | Iconify icon for the control. Default `ph:text-aa-duotone`. |
| `efm_font_css` | Filter the generated CSS before it is written. |
| `efm_fonts_dir` | Change the absolute font-storage directory. Default `wp-content/fonts/`. |
| `efm_fonts_url` | Change the public URL corresponding to `efm_fonts_dir`. |

### Placement note

Etch's Controls API can only add a control at the **start** or **end** of a Settings Bar section. To place the
icon exactly after the dark mode toggle, the plugin registers the control officially and then pins its
position once, re-applying it if the builder re-renders that section. Any other placement value uses the
plain API behaviour with no DOM adjustment.

Etch 1.6.4 can expose a control store that accepts external controls while its Svelte Settings Bar renderer
fails to display them. The plugin detects this using the already-registered ACSS control. Only in that broken
state, it inserts a native-shaped button after dark mode without adding another item to Etch's store. Healthy
Etch installations remain on the official Controls API path.

## REST API

Namespace `etch-font-manager/v1`:

`GET /state`, `POST /families`, `POST /settings`, `POST /upload`, `POST /files/delete`,
`GET /google/search`, `POST /google/install`.

## Maintenance surface

- Core WordPress APIs (REST, options, filesystem) — very stable.
- Etch Controls API and canvas hooks — if Etch changes them, fonts keep working on the frontend; only the
  in-builder panel or canvas preview would need an update.
- Google Fonts endpoints — used for search and install only. Installed fonts are local files and keep
  working regardless.

## License

GPL-2.0-or-later.
