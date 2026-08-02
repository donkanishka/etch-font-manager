# Changelog

All notable changes to Etch Font Manager are documented here.

## 1.3.3

- Removed the **Check for updates** plugin row link. It existed to work around the cache bug fixed in 1.3.2; now that a forced check bypasses the release cache, WordPress's own **Check again** on the Updates screen does the same job. This also removes an `admin-post` endpoint, a nonce flow and an admin notice.

## 1.3.2

- A forced update check now bypasses the plugin's own release cache. Clicking **Check again** on the Updates screen, or running WP-CLI, previously kept returning the cached lookup for up to six hours, so a release published in that window stayed invisible.

## 1.3.1

- Added a **Check for updates** link to the plugin row, so a release can be picked up immediately instead of waiting for the six hour cache to expire. It reports whether a newer version is available.

## 1.3.0

### Added

- **Updates from GitHub.** The plugin now appears in the normal WordPress Updates screen and installs new versions from the latest GitHub release, so distributing a fix no longer means uploading a zip by hand.
- Release notes are shown in the plugin details modal.
- The extracted folder is renamed to the installed directory name, so an update replaces the existing plugin instead of installing a second copy next to it.
- `Update URI` header, so a plugin on wordpress.org with a matching slug can never hijack updates.
- Filters: `efm_updater_repo` to point at a fork, and `efm_enable_updates` to switch the behaviour off.

Release lookups are cached for six hours, with a thirty minute back-off after a failed request, so the GitHub API rate limit is never a concern.

## 1.2.0

### Fixed

- **Non-latin scripts were silently broken.** Google Fonts installs only ever downloaded the `latin` subset, so families such as Noto Sans Sinhala or Noto Sans Tamil installed without their Sinhala or Tamil glyphs and fell back to a system font. Installs now download every selected subset.
- Font assignments that pointed at a deleted family are cleared automatically, so the generated CSS never references a missing family.
- The cached Google Fonts index is versioned and flushed on upgrade, so sites that update do not keep serving an index without subset data.

### Added

- Subset selection per family in Google Fonts, with `unicode-range` written into each `@font-face` so browsers only download the scripts a page needs.
- Reinstall action to add subsets to an already installed family.
- Weight and style are detected from font file names on upload (`Inter-SemiBoldItalic.woff2`, `Roboto-300.woff2`, variable axes), and applied automatically when a file is mapped to a variant.
- Guard when closing the manager with unsaved changes.
- Warning when removing a family that is assigned as the heading or text font.
- Warning when deleting a file that variants still map, listing the affected families.
- Library cards show assignment and subset chips; file rows show detected weight and an in-use marker.

## 1.1.0

- Rebuilt the interface as a **full-screen font manager** matching Etch's own manager pattern: takeover surface beside the settings bar, 40px header and a 256px inner navigation column.
- Navigation split into Library, Upload fonts, Google Fonts and Theme.
- Library is now a specimen grid with a family filter, plus a dedicated family editor screen for renaming and mapping variants.
- Google Fonts results render as a large specimen grid with live previews.
- Added a shared preview toolbar: editable specimen text and a 14-72px size slider.
- Theme view gained a live heading and body sample rendered in the selected families.
- Moved the Settings Bar control to the end of Etch's manager group (top-end) via the official Controls API.
- Removed the DOM pinning logic entirely; the plugin no longer moves or inserts anything inside Etch's own DOM.

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
