# Etch Font Manager

Manage self-hosted custom fonts **inside the Etch builder**. No trips back to the WordPress dashboard.

The plugin registers a **Fonts** control in the Etch Settings Bar using Etch's official
[Controls API](https://docs.etchwp.com/integrations/controls) and opens a docked panel that follows the
builder's own panel conventions (sizing, tokens, typography, focus styles, light/dark scheme).

## Features

- **Native Settings Bar control** — registered through `window.etchControls.builder.settingsBar`, grouped with Etch's own managers at the end of the top section.
- **Full-screen manager** — mirrors Etch's native manager pattern (Content Hub, Style Manager, Asset Manager): a takeover surface beside the settings bar, a 40px header and a 256px inner navigation column, all built from Etch's own design tokens so it follows the builder's colour scheme.
- **Specimen-first browsing** — Library and Google Fonts render as specimen grids with editable preview text and a 14-72px size slider.
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

## Usage

The manager opens from the **Fonts** icon in the Settings Bar and has four sections.

**Library** — a specimen grid of your font families with a filter box. *Manage* opens a family editor for
renaming the family and mapping files to weights and styles. Edits are buffered; Save and Discard appear in
the header while there are unsaved changes.

**Upload fonts** — drag and drop `.woff2`, `.woff`, `.ttf` or `.otf` files, and review everything currently in
the fonts folder with type, size and delete.

**Google Fonts** — search the library and preview candidates as full specimens before installing. Installing
downloads every available latin variant locally and wires the family up for you.

**Theme** — pick the heading and text families and see them applied to a live sample. These are written as
`--heading-font-family` and `--text-font-family`, which Automatic.css consumes directly.

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
| `efm_control_placement` | `top-end` (default), `top-start`, `center-start`, `center-end`, `bottom-start`, `bottom-end`. |
| `efm_control_icon` | Iconify icon for the control. Default `ph:text-aa-duotone`. |
| `efm_font_css` | Filter the generated CSS before it is written. |
| `efm_fonts_dir` | Change the absolute font-storage directory. Default `wp-content/fonts/`. |
| `efm_fonts_url` | Change the public URL corresponding to `efm_fonts_dir`. |

### Placement note

Etch's Controls API adds a control at the **start** or **end** of a Settings Bar section. The default
`top-end` appends the Fonts control after Loop Manager, so it sits with Etch's other managers. The plugin
never moves or inserts nodes inside Etch's own DOM.

### Canvas stylesheet registration

Etch renders the canvas stylesheet list with a Svelte keyed each block keyed by `id`, and it also folds styles
enqueued on `etch/canvas/enqueue_assets` into that same list using the style handle as the id. Registering a
stylesheet through both that action and the `etch/canvas/additional_stylesheets` filter produces two entries
with the same id, which throws `each_key_duplicate` and breaks the entire builder canvas.

This plugin therefore registers the canvas stylesheet **only** through the filter, and the filter skips itself
if an entry for the stylesheet is already present.

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
