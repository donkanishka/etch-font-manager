# Changelog

All notable changes to Etch Font Manager are documented here.

## 1.16.0

Finishes the last item from the fonts.google.com review: the specimen detail view, held back from 1.15.0 rather
than shipped untested.

### Added

- **Type tester per family.** Click a family name in the Google Fonts browser to open it full width, with a
  live slider for **every** variable axis it carries. Axes are labelled from Google's own registry, so
  `YTLC` reads as *Lowercase Height* and each slider steps at the axis's real precision rather than always by 1.
  Roboto Flex gives all thirteen. The exact `font-variation-settings` is shown as you drag, ready to paste.
- **Install from the tester.** Subsets, weights, the variable toggle and Install are all present, so a face can
  be auditioned and installed without going back to the grid.
- Family metadata in one place: designers, category, classifications, style or axis count, size, date added, and
  a link to the family on Google Fonts.

### Fixed

- **Non-Latin families installed with no glyphs for their own script.** The subset default was latin-only, so
  installing Gemunu Libre, Yaldevi, Maname or Noto Sans Sinhala in one click produced a family that silently
  fell back to a system font. The family's own primary script is now preselected alongside latin, and an active
  writing-system filter counts as asking for that script too. This is gotcha #4 in the project notes, and the
  latin-only default was reintroducing it on every install where the user did not think to tick the box.
- Subset defaults are recomputed when the writing-system filter changes. They were cached per family on first
  render, so a family already on screen before the filter was applied kept its latin-only default. Choices the
  user has made by hand are never overwritten.

### Notes

- The tester requests the variable face under a **private alias**. Requesting `family=Inter` alone returns a
  **static instance**, not the variable font, so sliders against it would move with nothing happening; and
  injecting the variable face under the real family name leaves the browser free to keep matching the static
  preview face already loaded for the grid. Both were measured against the live API, not assumed.

## 1.15.0

A rebuild of the Google Fonts browser, modelled on fonts.google.com. Almost all of it is presentation over
metadata the plugin already downloaded and cached and then discarded before storing: the index request is
unchanged, and there is still no API key.

### Added

- **Row, Grid and Compact layouts** for both the Library and the Google Fonts browser, with the choice
  remembered between sessions. Row gives each family a full-width line for judging a face at reading length,
  Grid is the scanning view, Compact is one family per line for finding a known name. Track sizing is intrinsic,
  so every mode still collapses to a single column when the manager is narrow.
- **Writing-system filter.** Filter the catalogue by the subsets a family actually ships glyphs for, with the
  number of families beside each entry. Sinhala narrows 1,942 families to 8, Tamil to 17. Previously the only
  way to find them was to already know their names.
- **Per-family script previews.** Each card previews in the family's own primary script rather than a Latin
  pangram, so a family that does not really carry the script it claims is obvious immediately instead of after
  installing. Preset chips switch every card at once between Auto, Latin, සිංහල, தமிழ் and numerals.
- **Variable-only and static-only filtering**, and cards now read `Variable (2 axes)` where that is the truthful
  description, instead of a style count that says 18 whether those cuts are 18 files or one variable file.
- **Trending and Newest sort orders**, alongside the existing Most popular and A to Z.
- **Multi-select with bulk install.** Tick several families and install them in one action. Installs run one at
  a time on purpose; a dozen concurrent downloads from Google is a good way to get rate limited or to time out
  on shared hosting. A family that fails stays selected so it can be retried without re-picking it.
- **Family size and designers** on each card. The size is the whole family as Google publishes it, which is why
  it is labelled as such: what actually lands on disk depends on the subsets and weights chosen.
- **Reset all**, disabled until something is actually filtering.

### Changed

- The cached Google Fonts index now keeps the designers, byte size, date added, trending rank, classifications,
  primary script and the **full axis list** rather than only the `wght` range. The cache key moves to
  `efm_google_fonts_index_v3`, so the first search after updating refetches the index once.
- `GET /google/search` accepts `subset` and `variable`, and its `sort` enum gains `trending` and `newest`. The
  response carries a `subsetList`. `variable` is a string rather than a boolean because it is tri-state: an
  absent value must mean "do not filter", which a boolean would collapse into "static only".

### Notes

- The specimen detail view with live variable-axis sliders is **not** in this release. It is the one item from
  the review that needs its own pass rather than being bolted on untested.
- Google's Feeling, Appearance and Seasonal filters are deliberately not implemented. Those tags are editorial
  and are not present in the metadata; only `category`, `stroke` and `classifications` are, and
  `classifications` covers just 1,088 of the 1,942 families.

## 1.14.0

### Fixed

- **Preload did nothing for many families.** It only accepted a weight of exactly `400` or the full `100 900`
  range. A family installed without a regular weight preloaded nothing at all, and from 1.8.0 — when narrow
  variable ranges stopped being rewritten to `400` — neither did any variable family with an axis such as
  Alegreya's `400 900` or Akshar's `300 700`. **This was a regression introduced by 1.8.0** for the variable
  case. Preload now picks the upright weight nearest regular, preferring latin, so it always chooses something
  sensible.
- **Inline CSS was rebuilt on every page load.** The option added in 1.12.0 regenerated the stylesheet from
  scratch on each request. It is now cached and keyed to the generated file's timestamp, so it is rebuilt only
  when the fonts actually change. The file itself still cannot be inlined directly: it is written with relative
  `src` URLs, which would resolve against the page rather than the stylesheet.

### Added

- **A behavioural test suite, running in continuous integration.** 70-odd assertions covering weight parsing,
  font signature checks, selector sanitising, the enabled/trashed rules, preload selection and family
  sanitising. No Composer, no PHPUnit, no WordPress test suite: it stubs the few WordPress functions it reaches
  and runs anywhere PHP does, with `php tests/run.php`. Tests are excluded from the release zip.
- **Override theme styles** per family, adding `!important` to its selector rule, matching what the
  Automatic.css mapping has always done.
- **Restore all** and **Empty trash**.
- A bundled export now shows its approximate size before you download it, and a bundled import refuses more than
  50 MB of font data with a clear message rather than failing somewhere further down.

### Changed

- The Google Fonts blocking setting now also drops any link tag that survives the dequeue, and its description
  is honest about what it cannot reach: an `@import` inside a theme stylesheet, or a link printed straight into
  the page. Covering those would need output buffering, which is not worth the risk it brings.

## 1.13.0

### Added

- **Export only the families you want.** Pick them from a list rather than always taking everything, for moving
  one typeface to another site without dragging the whole library along.
- **Optionally bundle the font files.** The export has always been configuration only, which is small and
  rebuilds Google families on the other end but leaves hand-uploaded fonts to be uploaded again. Ticking
  **Include the font files** embeds them, producing a much larger file that rebuilds anywhere.
- **See what an import will do before it does it.** Choosing a file now shows what would be added, overwritten
  and removed, how many font files the file carries and how many would still be missing afterwards. Nothing is
  written until **Import now** is pressed, and Cancel walks away cleanly.
- The import report says how many font files were written from the bundle, and names anything it refused.
- The export payload carries a `schema` number so a future importer can tell formats apart.

### Security

- Bundled font files are checked before they are written: the name is sanitised, the extension must be a font
  format, the destination must resolve inside the fonts directory, the decoded size must be within the upload
  limit, and the bytes must start with that format's own signature. A PHP payload renamed to `.woff2` is
  rejected, as is anything trying to climb out of the fonts folder. Existing files are never overwritten.

## 1.12.0

### Added

- **Inline or external stylesheet.** The generated CSS has always been written to a cached file and enqueued;
  it can now be printed inline instead, trading a cacheable request for one less round trip. Sensible on a small
  font set, a bad trade on a large one, so it is a choice rather than a default.
- **Regenerate on demand.** The Theme section shows when the stylesheet was last written and offers to rebuild
  it, for when a file has been edited or lost outside the plugin.
- **Block Google Fonts loaded by other plugins.** A privacy setting that dequeues any theme or plugin stylesheet
  pointing at `fonts.googleapis.com`, and strips the matching `preconnect` and `dns-prefetch` hints — leaving the
  hint behind still tells the browser to open a connection to Google, which defeats the point. Your own local
  fonts are untouched.
- **Apply a family to your own selectors.** An optional comma separated selector list per family, written into
  the stylesheet as a `font-family` rule, so assigning a font to `h1, .site-title` no longer means writing the
  rule by hand. Input is restricted to selector characters, so a value cannot escape the rule it is written
  into; anything that tries becomes an invalid selector the browser ignores.
- **Read the CSS a family generates.** The family editor shows the `@font-face` blocks, the custom property and
  any selector rule it contributes, updating live as fields change, and says so plainly when a family is
  disabled or has no variants mapped.

## 1.11.0

### Added

- **Import can now fetch the font files it is missing.** The export has always been configuration only, so
  importing it on another site produced a list of files that were referenced but absent. For any family that
  came from Google Fonts the import now offers to download them again, reusing the **same subsets and the same
  weights** the family had on the original site — which the record already carries. One button, families fetched
  one at a time rather than all at once, and a clear report of anything that failed.
- Families that were uploaded by hand are correctly left out of that offer: there is nowhere to fetch them from,
  so they still need their files uploading. Families whose files are all present are not offered either.

### Notes

- Nothing about the export format changed, and none was needed. `enabled`, `trashed` and the Google block added
  in 1.8.0 and 1.10.0 already survive a round trip, because the export writes the stored records and the import
  runs them back through the same sanitiser. Verified rather than assumed.

## 1.10.0

### Added

- **Disable a family without deleting it.** Every family now has an on/off switch, in the library card and in
  the family editor. A disabled family produces **no output at all** — no `@font-face`, no `--efm-family-` custom
  property, no preload, and it is not offered in the block editor — while its record, its weight mapping and
  every font file stay exactly where they are. Turning it back on costs nothing.
- **A trash you can restore from.** The delete button now moves a family to the trash instead of destroying it.
  A Trash entry appears in the navigation with a count, listing what is in there with **Restore** and **Delete
  permanently**. Deleting permanently drops the record only; the files remain on disk and show up under unused
  files in Import & export, so bytes are still only ever deleted by an explicit, separate action.
- Disabling or trashing a family that is assigned as the heading or text font warns first, and notes that the
  assignment comes back when the family is restored. Trashing keeps the assignment; deleting permanently clears
  it, which is what already happened on delete.

### Notes

- Existing families are unaffected. A record saved before this release carries neither flag, and a missing flag
  is read as enabled and not trashed, so nothing changes on upgrade.

## 1.9.0

### Added

- **A CSS custom property for every family.** Each family is published as `--efm-family-{slug}`, so
  `"Noto Sans Sinhala"` becomes `var(--efm-family-noto-sans-sinhala)` and can be used anywhere a font family is
  expected — an Etch style record, an ACSS override, a custom stylesheet — without retyping the name and
  fallback stack every time.
- The value is the family's **full stack**, matching what the Automatic.css mapping already writes, so
  `font-family: var(--efm-family-inter)` gives you `"Inter", sans-serif` rather than a bare family name with no
  fallback.
- The family editor shows the variable for the family being edited, as a read-only field that selects on click.
  The slug is generated server-side and sent to the panel, so what is shown can never drift from the CSS that is
  actually written.
- Families with no variants are skipped, and if two names reduce to the same slug the first one wins rather than
  the second silently overwriting it.

## 1.8.0

### Added

- **Choose which weights to download.** Installing a Google font previously fetched every weight and italic the
  family offered — eighteen files per subset for a family like Inter. The install card now has a weight picker,
  preselected at regular and bold, so a latin install of Inter downloads **two files instead of eighteen**. The
  request sent to Google is built from the selection rather than filtered afterwards.
- **Change the selection later.** A family installed from Google gains a Google Fonts section in the editor
  listing every weight the family offers, with the installed ones marked. Toggle and download again to add or
  drop weights without searching the library. Deselecting leaves the file on disk, so re-enabling costs nothing.
- **Delete unused font files.** Import & export lists any font file on the server that no family refers to, with
  its size, and removes them on request. Always confirmed, since deleting bytes cannot be undone.

### Fixed

- **Narrow variable weight ranges were rewritten to 400.** Only the full `100 900` range was accepted, so a
  variable family declaring anything narrower — Alegreya at `400 900`, Akshar at `300 700` — had its
  `font-weight` descriptor silently replaced with `400`, and the browser could no longer use the rest of the
  axis. **366 of the 538 variable families on Google Fonts declare a narrower axis**, so this affected most
  variable installs. Any weight range between 1 and 1000 is now preserved, and the editor's weight menu keeps a
  stored range instead of discarding it on save.

### Notes

- Narrowing a variable font's axis at install was investigated and deliberately **not** built: Google serves
  the same file whatever range is requested. Measured on Inter, Alegreya, Roboto Flex and Open Sans, the
  downloaded file is byte-identical, so the option would have saved nothing.

## 1.7.3

- Use `WP_Filesystem::move()` rather than `rename()` when a font file that is not a real upload is moved into place, so hosts with restricted filesystem access are respected.
- Continuous integration now fails on coding standard **errors** and reports warnings without blocking. Almost all remaining warnings are whitespace alignment, which `phpcbf` applies automatically.

## 1.7.2

- Cleared the last two coding standards violations, so continuous integration is green. No functional change.

## 1.7.1

- Fixed the coding standards violations the new CI run reported: block comment formatting, a missing doc comment on `sanitize_family_name()`, an undocumented `$variable` parameter, and `count()` evaluated inside a loop condition. No functional change.

## 1.7.0

### Added

- **Import & export.** A new section downloads every family, variant mapping and assignment as a JSON file, and loads one back on another site. Import runs in **replace** or **merge** mode, and reports any file a family references that is not present in the fonts folder, so a half-migrated setup is obvious rather than silent. Font files are deliberately not included: a family installed from Google can simply be reinstalled.
- **Translation support.** `load_plugin_textdomain()` on `init`, plus a generated `languages/etch-font-manager.pot` covering all 125 strings.
- **Continuous integration.** A GitHub Action runs `php -l` on 7.4 and 8.3, PHPCS against the WordPress standard, and checks that `panel.js` parses and `update.json` is valid. `phpcs.xml.dist` ships with the plugin.

### Fixed

- **Outline buttons had an invisible border.** The hairline colour resolved to the same value as the raised content surface, so *New family*, *Add variant*, *Load more* and *Choose a file* had no visible edge. The hairline is now derived from the foreground colour.

### Accessibility

- The manager is a takeover, so keyboard focus is now trapped inside it while open and wraps at both ends.

## 1.6.0

Google Fonts is now a browser rather than a search box.

### Added

- **Browse the full library.** Opening Google Fonts lists the most popular families straight away instead of waiting for a search term. The index carries close to two thousand families.
- **Category filter** (Sans Serif, Serif, Display, Handwriting, Monospace) and **sort** by popularity or A to Z.
- **Paging.** Results load 24 at a time with a Load more button, and the header shows how many of the total you are looking at.
- **Variable fonts.** Families with a weight axis install as one file per subset with `font-weight: 100 900`, instead of one file per weight. For Inter with latin that is 2 files rather than 18. The toggle is on by default where a variable cut exists, and the axis is read from the index rather than trusted from the request.

### Changed

- **Specimen webfonts load lazily.** Previously every result pulled a Google stylesheet whether or not it was ever seen; now they load per card as it scrolls into view, batched.

## 1.5.0

Typography and delivery controls, per family, in a new **Delivery** section of the family editor.

### Added

- **Loading behaviour** per family (`font-display`). `swap` stays the default; `optional` skips the font entirely on slow connections, which removes the layout shift it would have caused.
- **Preload** toggle per family. It emits a `<link rel="preload" ... crossorigin>` early in `wp_head` for that family's regular upright weight, preferring the latin subset. Capped at four hints in total, because preloading everything delays the rest of the page.
- **Fallback stack** per family, shown while the font loads and if it fails. The stack is written into `--heading-font-family` and `--text-font-family`, so Automatic.css now receives a complete stack rather than a bare family name.

### Security

- Fallback stacks are stripped of every character a font stack does not need, so the value cannot terminate the declaration it is written into.

## 1.4.0

Hardening for public distribution, where many sites can sit behind one outbound IP.

### Fixed

- **A failed update lookup no longer discards a release that was already known.** Previously any failure, including a GitHub rate limit, cached an empty result, so an available update silently disappeared until the next successful check.

### Changed

- The routine update check now reads `update.json` from the raw CDN, which carries no API rate limit. The REST API is only a fallback. GitHub allows 60 unauthenticated API requests an hour **per IP**, shared by every site behind that address, so shared hosting could exhaust it.
- A rate-limited response now backs off until the reported reset time instead of a fixed window.
- The update package is only accepted when it comes from this repository's releases, so a tampered manifest cannot point WordPress at another download.
- Default cache raised to six hours. Both the manual check and a forced check bypass the cache, so an active check is still live.

### Note

Conditional requests do **not** help here. Testing against the live API showed 304 responses still decrement the rate limit.

## 1.3.5

### Fixed

- **The update notice stayed after updating.** The version check compared the latest release against `EFM_VERSION`, which is the constant from the copy of the plugin loaded at the start of the request. During an update the files on disk are already newer than that constant, so WordPress was told the update still needed installing and cached that answer. The installed version is now read from the plugin header on disk.
- A stored update entry that the installed version already satisfies is now corrected when the transient is read, so a stale notice clears on the next page load instead of lingering for hours.
- Finishing an update also removes the plugin's own entry from the update transient.

### Changed

- Release lookups are cached for ten minutes instead of six hours, and a failed lookup backs off for fifteen minutes instead of thirty, so a new release surfaces on its own instead of waiting for a long cache to expire.
- New `efm_release_cache_ttl` filter to tune that window. Raise it when many sites share an outbound IP, since GitHub allows 60 unauthenticated requests an hour per IP.

## 1.3.4

- Restored the **Check for updates** plugin row link, which 1.3.3 removed. Testing showed a forced check from the WordPress Updates screen did not reliably reach the plugin with a fresh lookup, while this action clears both the release cache and the WordPress update transient before re-checking. 1.3.3 is superseded, do not run it.

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
