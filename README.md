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
- **Subset support** — choose which subsets to download (latin, latin-ext, sinhala, tamil, cyrillic, greek, vietnamese and so on). Each `@font-face` gets a matching `unicode-range`, so browsers only fetch the scripts a page actually uses.
- **Filename detection** — weight and style are read from uploaded file names (`Inter-SemiBoldItalic.woff2`, `Roboto-300.woff2`, variable axes) and applied when the file is mapped.
- **Delivery controls** — per-family `font-display`, a preload toggle for above-the-fold fonts, and a fallback stack that is written into the Automatic.css variables.
- **Enable, disable and trash** — switch a family off without deleting it (no `@font-face`, no custom property, no preload, but files and mapping are kept), or move it to a trash you can restore from. Deleting permanently drops the record only; font files are always removed by a separate explicit action.
- **Guard rails** — warnings before closing with unsaved edits, removing a family that is assigned as the heading or text font, or deleting a file that variants still map.
- **Family and variant mapping** — assign files to weights and styles, all inline in the panel.
- **A CSS variable per family** — every family is published as `--efm-family-{slug}`, so `"Noto Sans Sinhala"` is usable as `var(--efm-family-noto-sans-sinhala)` in an Etch style record, an ACSS override or any stylesheet. The value carries the family's fallback stack, and the family editor shows the variable ready to copy.
- **Portable import and export** — export chosen families as JSON, optionally with the font files bundled in, and preview exactly what an import will add, overwrite and remove before applying it. Bundled files are validated by their format signature before being written.
- **Stylesheet delivery** — the generated CSS is cached to a file and enqueued, or printed inline if you prefer one less request. Shows when it was last built, with a regenerate action.
- **Blocks other plugins' Google Fonts** — an optional privacy setting that dequeues any stylesheet pointing at `fonts.googleapis.com` and strips the matching preconnect hints.
- **Apply to your own selectors** — give a family a selector list such as `h1, .site-title` and the rule is written for you.
- **Generated CSS preview** — see exactly what a family contributes, live as you edit it.
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

1. Download the zip from the [latest release](https://github.com/donkanishka/etch-font-manager/releases/latest).
2. In WordPress go to **Plugins > Add New > Upload Plugin**, upload it and activate.
3. Open the Etch builder. The **Fonts** icon appears in the Settings Bar with Etch's other managers.

## Updates

After the first install the plugin updates itself from GitHub releases. New versions show up on the normal
**Dashboard > Updates** screen with the release notes in the details modal, so there is no zip to upload again.

The routine check reads `update.json` from the raw CDN, which has no API rate limit. GitHub's REST API is only
used as a fallback, because it allows 60 unauthenticated requests an hour **per IP address** and every site
behind a shared host address draws on the same budget. A failed lookup keeps the last known release rather
than discarding it, and a rate-limited response backs off until the reported reset time.

Lookups are cached for six hours. WordPress itself only asks for update information roughly hourly on the
Plugins screen, about every minute on the Updates screen, and twice daily on cron, and both the manual
**Check for updates** link and a forced check bypass the cache, so an active check is always live.

Point the updater at a fork with `efm_updater_repo`, change the manifest branch with `efm_updater_branch`,
turn updates off with `efm_enable_updates`, or change the cache window with `efm_release_cache_ttl`.

Update packages are only accepted when they come from this repository's own releases, so a tampered manifest
cannot redirect WordPress to another download.

On activation, existing data from the older *Etch Custom Fonts* plugin is imported automatically when present.

## Usage

The manager opens from the **Fonts** icon in the Settings Bar and has four sections.

**Library** — a specimen grid of your font families with a filter box. *Manage* opens a family editor for
renaming the family and mapping files to weights and styles. Edits are buffered; Save and Discard appear in
the header while there are unsaved changes.

**Upload fonts** — drag and drop `.woff2`, `.woff`, `.ttf` or `.otf` files, and review everything currently in
the fonts folder with type, size and delete.

**Google Fonts** — browse the whole library by category and popularity, or search it. Results page in 24 at a time and specimen webfonts load lazily as cards scroll into view. Families with a weight axis can be installed as a **variable** cut: one file per subset instead of one per weight. Pick the
subsets you need first: `latin` is preselected, and families that carry other scripts expose them as toggles.
Installing downloads every weight and style for the chosen subsets locally and wires the family up for you.
Already installed? Use **Reinstall** to add a subset later.

> Subsets matter. A family such as Noto Sans Sinhala carries `sinhala`, `latin-ext` and `latin`. Installing
> latin alone gives you a font with no Sinhala glyphs, and the browser silently falls back to a system font.

**Family editor → Delivery** — set `font-display`, opt a family into preloading, and give it a fallback stack.

**Import & export** — download the whole configuration as JSON and load it on another site, in replace or merge mode. Any font file a family references but that is missing from the destination is listed after the import.

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
| `efm_updater_repo` | GitHub repository used for updates, in `owner/repo` form. |
| `efm_enable_updates` | Return `false` to disable GitHub updates. |
| `efm_release_cache_ttl` | Seconds to cache the release lookup. Default 21600. |
| `efm_updater_branch` | Branch holding `update.json`. Default `main`. |

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
`POST /files/prune`, `POST /css/regenerate`, `GET /export`, `POST /import`,
`GET /google/search`, `POST /google/install`.

## Maintenance surface

- Core WordPress APIs (REST, options, filesystem) — very stable.
- Etch Controls API and canvas hooks — if Etch changes them, fonts keep working on the frontend; only the
  in-builder panel or canvas preview would need an update.
- Google Fonts endpoints — used for search and install only. Installed fonts are local files and keep
  working regardless.

## Development

```bash
composer global require squizlabs/php_codesniffer wp-coding-standards/wpcs:^3
phpcs          # coding standards, configured by phpcs.xml.dist
node --check assets/panel.js
```

The same checks run in CI on every push.

## License

GPL-2.0-or-later.
