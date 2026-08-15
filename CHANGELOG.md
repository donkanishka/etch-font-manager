# Changelog

All notable changes to Etch Font Manager are documented here.

## 0.25.0

A pass over the interface against Etch's own managers, measured on a live builder rather than eyeballed. One
real bug turned up while testing it.

### Fixed

- **Typing in a search field lost the caret.** `render()` rebuilds the content pane wholesale, so the field you
  were typing in was destroyed and replaced one debounce after each keystroke, and focus fell to the document
  body. Measured: focus was still on the input immediately after the key, and on `<body>` 400ms later. Focus and
  selection are now carried across a re-render by a `data-efm-focus` key, which the Library filter, the Google
  Fonts search and the four filter selects opt into. The pane is not scrolled to the restored field, so a long
  page does not jump.

### Changed

- **Back buttons match Etch's.** Measured on the Loop Manager: Etch uses its plain outline button at 40x28 with a
  14px arrow, not a square icon button, and the glyph is an arrow rather than a bare chevron. Ours was a 28x28
  square with a 16px chevron. All three back buttons in the panel are now that same control, and the two inside
  the panel say where they land — "Back to Library" and "Back to Google Fonts" — instead of just "Back".

- **A search with no matches answers like Etch's Asset Manager.** The library filter used to reply with one line
  of small print under the toolbar. Both it and the Google Fonts search now centre Etch's own state in the pane:
  the term repeated back at 24px in bold italic, with "Please check your spelling." under it. Measured off
  `.asset-core__search-empty`. Google Fonts keeps its "Reset all" button under the message when filters are
  also active, and a filter with no search term keeps the old wording, since there is no term to quote back.

- **Tooltips on the controls that needed them.** Ten of them, where before only the header back button had one:
  every icon-only button, the "+3" chip disclosure, the Enable button of a disabled family, and the two
  explanatory hints that were sitting on native `title` attributes. Long copy wraps at 240px and controls at the
  pane's edges anchor their tooltip to that edge, because the pane scrolls and a centred one is clipped rather
  than drawn over. Three native `title`s are deliberately kept: the two file names and the Google family link
  live inside `overflow: hidden` containers, which clip a CSS tooltip entirely. Verified by trying it.

- **Clicking a text field no longer rings it.** A text field matches `:focus-visible` even when clicked, because
  the browser expects typing to follow, so a plain click lit the full focus ring. The panel now records whether
  the pointer or the keyboard is driving it and suppresses the ring on text entry for the pointer. Only Tab
  switches it back, so the ring never appears mid-word in a field you had just clicked into. Etch itself does
  ring on click; this is deliberately quieter.

- **Smaller things in the sidebar and on cards.** The "Manage" heading above the sidebar is gone and the items
  start at the top of the pane; the gap between them goes from 2px to 4px; the stat card labels are capitalised
  (in CSS, because the same translated words are reused mid-sentence elsewhere); and the "Disabled" pill is
  padded to 24px so it sits under the 28px buttons beside it rather than looking cramped against them.

### Removed

- **The Compact layout.** Row and Grid remain. `LAYOUTS` doubles as the allowlist a stored preference is checked
  against, so an install that saved Compact falls back to Grid rather than restoring a mode with no button.

### Versioning

Every version in this file has been renumbered from `1.x` to `0.x`. The plugin has only ever been installed
by its author, and the `1.x` series was never a public release; the numbering now says so. `1.0.0` is reserved
for the first public release. Nothing about the code changed with the renumber, and the earlier GitHub releases
and tags were removed, since their zips carried the old numbers. The history itself is unchanged and complete,
both here and in the repository's commits.

### Translators

`manage` and `layoutCompact` are gone. `back` and `backToBrowse` are replaced by `backToLibrary` and
`backToGoogle`, and `noMatches` by `noResultsFor` and `checkSpelling`. Every other string is unchanged.

## 0.24.1

Two follow-ups from reviewing the finished interface, plus a modifier that never had a rule.

### Fixed

- **Grid specimens were cut mid-word.** Row already wrapped its sample and Compact is deliberately one line, so
  only the grid layout truncated, with an ellipsis at anything above roughly 30px. Specimens now clamp to two
  lines with the box held at exactly that height, so a one-line family and a two-line family still line up beside
  each other. Measured on the live grid afterwards: every sampled card reports the same specimen height and the
  footers stay put, so the row alignment added in 0.23.0 is unaffected.

- **`.efm-toggle--inline` had no rule of its own.** The modifier was already in the markup and in the compact
  layout's hide list, but nothing styled it, so it rendered as the default stacked toggle. This is the third
  modifier found this way, after `.efm-btn--ghost` and `.efm-btn--block` in 0.21.0.

### Changed

- **The variable toggle is one line rather than two.** The axis range earns its place on a card, so
  "Variable 100–900" stays visible; the explanation behind it does not need repeating down twenty-four cards and
  moves to the label's tooltip. The detail view is one family on a full pane, so it keeps the whole sentence.

## 0.24.0

Loading, empty and status states. No new strings and no new stored data.

### Changed

- **The Google Fonts catalogue loads behind placeholder cards.** "Searching…" was a single line of text, so the
  pane collapsed while a search ran and reflowed when results landed. Six blocks of the same shape as a real card
  hold the grid still and show roughly how much is coming.

  The placeholder grid is hidden from assistive technology and a visually hidden live region carries the
  announcement, so a screen reader hears "Searching" once rather than a description of six empty boxes.

- **Status is a toast at the foot of the panel** rather than small print in the header, which is the furthest
  point from where most actions are taken. The element, its role and its `aria-live` are unchanged, so
  announcements behave exactly as they did before; only its position and appearance moved.

- **Google Fonts has a real empty state.** "No fonts found." was a bare paragraph and a dead end. It now offers
  **Reset all** whenever a filter is responsible, which is the usual cause. That button is the only accent
  action on an otherwise empty screen.

### Fixed

- **The reduced-motion guard only covered transitions.** It now covers animations too, which is what the
  placeholder pulse and the toast entrance use; without that they would have kept moving for anyone who had
  asked for less motion.

### Left alone on purpose

- Upload's "No files uploaded yet." stays a plain line rather than becoming an empty-state block, because the
  dropzone directly above it is already the call to action.
- Import & export's "Every font file on the server is in use." is a status line and reads correctly as one.

### Checked

Keyboard behaviour was audited on a live panel rather than assumed. Of 261 focusable elements none lacks an
accessible name, there are no positive `tabindex` values, no invalid `aria-pressed` or `aria-expanded`
values, and nothing focusable sits inside an `aria-hidden` subtree. Tab from the last control wraps to the
first and Shift+Tab from the first wraps to the last, both staying inside the dialog, and the focus ring
resolves to Etch's own focus shadow.

## 0.23.0

Screen-level composition. Behaviour, settings, stored data and the REST surface are unchanged; this is what the
cards and the two settings screens look like.

### Changed

- **Chip rows collapse past six.** Google Sans carries twenty-five subsets and Poppins eighteen weights. Rendered
  in full those turn a card into a wall of chips, and because a grid row is stretched to its tallest card, one
  such family left every neighbour half empty. A dashed `+18` opens the rest.

  A chip that is currently selected stays visible wherever it falls in the list, so a choice can never end up
  hidden behind the disclosure. Checked against the live catalogue: Google Sans keeps `latin` on show with
  eighteen collapsed behind it, and Poppins keeps both `400` and `700`.

- **Card footers are pinned to the foot of the card**, so the footers in a grid row line up instead of floating
  wherever each card's own content happened to end. Measured on the live grid: all eight sampled Google cards
  report their footer 13px from the bottom, and the three Library cards start their specimen at 49px.

- **Install is an outline button.** Twenty-four cards each shouting in the accent colour is not a hierarchy, and
  Etch keeps one accent action per screen. The Google Fonts screen now carries no primary button at all until
  families are picked, at which point the bulk bar takes it.

- **A disabled family is marked with a badge beside its name** rather than a full-width notice. That notice sat
  between the title and the specimen, so every disabled card pushed its specimen down and broke the row it was
  in. The wording moved to the button's tooltip, where it is still reachable.

- **Cards take a border on hover**, since a grid of them is a list of targets.

- **Settings and Import & export are grouped into boxes.** Both were flat runs of headings, checkboxes and
  buttons on a single surface, with nothing to show where one concern ended and the next began. Settings is two
  boxes with Save changes outside them, because saving covers both; Import & export is three, one per tool.

### Not changed, deliberately

- The Upload screen was reviewed and left alone. Its dropzone already had an icon, a title and a hint from the
  earlier work, and adding a button and format chips that repeat that hint would have been change for its own
  sake.

## 0.22.0

Layout and hierarchy, measured against a live Asset Manager and Style Manager rather than guessed at. Nothing
about behaviour, settings or stored data changed.

### Changed

- **The Google Fonts toolbar was two rows and ten controls.** Category, writing system, technology and sort now
  sit behind a **Filters** button carrying a badge of how many are active. Search, the layout toggle, preview
  text and preview size stay on the surface, because those are adjusted constantly while the others are set once
  and left alone. The badge deliberately ignores the search box, which is already visible next to it.

  Escape closes the popover before it closes the manager, a press anywhere outside dismisses it, and leaving the
  view resets it. Closing it returns focus to the button.

- **The content pane matches Etch's own.** `.asset-core__main` is a bordered pane on `--e-base` with a 6px
  radius, not a raised fill, so cards, table headers, the preview box and the delivery box became the raised
  `--e-base-light` elements sitting on it. Code blocks went sunken instead, a deliberate departure: Etch's
  `--e-code-background-color` resolves to the same value a card now uses, so code inside one would have had no
  contrast at all.

- **Navigation items carry Etch's count badge**, including the way it inverts on the active item to a light fill
  with dark text against a raised fill with muted text elsewhere. Library, Upload fonts and Trash are counted;
  the tools are not, matching how Etch badges its collections but not its tools. "Trash (1)" loses its bracketed
  number now that the badge carries it.

- **The three figures at the foot of the sidebar became stat cards**: a bold value over a label on a raised fill
  at a 4px radius, with a muted icon opposite. Etch fits two across a 300px column; three carrying icons will not
  fit across 256px, so they stack one per row and keep the card's own arrangement.

- **Prose is capped at 72ch.** Help text on Settings and Import & export had been running the full width of the
  builder, which is unreadable.

- **The primary button's hover settles on `--e-base-light`.** Etch's own default variant drops to near-black on
  hover, which is measurably what the builder does, but it reads as a glitch rather than a state change.

### Fixed

- A claim in the stylesheet that Etch uses "a 256px inner navigation column". Measured, it is 300px. This panel
  keeps 256px on purpose, because its labels are fixed and short and the Google Fonts grid wants the width, and
  the comment now says that instead of asserting something untrue.

## 0.21.0

The panel's styling now runs off a single declared set of Etch tokens instead of an ad-hoc mix of tokens and
literals. Appearance only: no behaviour, markup or stored data changed.

### Changed

- **Every value the panel uses is declared in one bridge** at the top of `.efm-manager`, each reading an Etch
  token first and only then falling back to a literal. Fifteen properties, all of them consumed. The control
  height is derived the way Etch derives it — one icon plus the input padding on each side — which resolves to
  the 28px Etch uses for both `.etch-input-wrapper` and its own buttons.

- **The active navigation item no longer uses the accent.** Measured off a live Asset Manager sidebar: Etch fills
  it with `--e-base-light` behind near-white text, at a 6px radius with 6px/8px padding and a 6px gap. Inactive
  items were muted, where Etch keeps them at full foreground strength so only the active fill marks where you
  are.

- **Section headings are 13px/600 in near-white**, matching Etch. They were 11px muted uppercase with added
  tracking, a treatment that appears nowhere in the builder. The same uppercasing and tracking came off the
  navigation group label, the subsets label and the table header.

- **Buttons mirror `.etch-builder-button`**: the same 4px icon-to-label gap, 6px radius, `--e-transition`
  timing and 30% disabled opacity. The primary variant's hover drops to near-black with light text, copied off
  Etch rather than invented.

- **Inputs follow `.etch-input-wrapper`**, taking `--e-input-padding-block` and `--e-input-padding-inline`,
  and selects take the `--e-base-light` fill Etch gives its select trigger, so a chooser reads differently from
  a text field.

- **The accent is a signal again, not a surface.** Etch floods with the accent in exactly one place — its default
  button variant — and otherwise uses it as a text or border colour. The panel had been filling the active nav
  item, the layout toggle and the subset chips with it. Those now take a raised fill and colour the accent
  instead.

- The panel's typeface reads `--e-font-interface` instead of hardcoding Inter, and every transition uses Etch's
  `--e-transition` rather than a slightly quicker curve of its own.

### Fixed

- **`.efm-btn--ghost` had no rule at all.** The markup had asked for it since it was written, so "Reset all",
  "Clear" and "Load more" all silently rendered as the default filled variant instead of quiet buttons.
- **`.efm-btn--block` had no rule either**, so "Load more" never spanned its row.
- **`--efm-danger` was referenced but never declared**, leaving the conversion log's error colour on its
  literal fallback.
- **The input corner radius read `--etch-input-radius`**, a property Etch does not define, so it never tracked
  `--e-border-radius` as intended.

## 0.20.0

The manager's icons were redrawn on Etch's own grid. Nothing about how the plugin behaves has changed.

### Changed

- **Every icon is now drawn on a 24x24 grid at 1.5 stroke and rendered at 16px**, which is the spec Etch uses
  for its own interface icons; at that size the stroke resolves to a single device pixel, exactly as Etch's do.
  The old set used the same 1.5 stroke on a 16x16 grid, making each stroke 2.25x heavier relative to the grid,
  which is why it read as cruder than the icons sitting beside it in Content Hub, Asset Manager and Style
  Manager.

  Paths come from [Iconoir](https://iconoir.com) (MIT), whose regular set is authored to precisely that spec, so
  no per-icon stroke correction is needed. They are inlined rather than fetched: the manager still renders with
  no network request and the plugin still has no build step. Nineteen icons, every one of them used.

- **Icon sizes moved out of the JavaScript and into CSS.** Call sites choose a step — 14px, 16px or 32px —
  instead of passing 11, 12, 13, 14 or 22 as they did before. `.efm-icon` reads `--e-icon-size-l` and
  `--e-icon-size-m` from Etch.

- **Seven actions that were text-only now carry an icon**: Manage, Restore, Restore all, Reset axes, Reset all,
  Clear and Empty trash. Their labels are unchanged.

- **The Row / Grid / Compact toggle shows an icon beside each label.** The labels were kept rather than replaced
  by glyphs alone, because the three layouts are not self-evident from a picture. The glyphs were picked by
  rendering candidates at the shipped 14px instead of at a comfortable size: a ruled-table glyph and a 3x3 dot
  grid both turned to mush that small, so Row is three bars, Grid is a 2x2 tile and Compact is a dot-and-line
  list.

- **Two measurements corrected against Etch's own controls.** Icon buttons are now
  `--e-icon-size-l + --e-icon-padding * 2`, which resolves to 28px and matches Etch's, instead of a hardcoded
  24px. The gap between a button's icon and its label is 4px, matching `.etch-builder-button`, instead of 6px.

### Fixed

- **The Import & export icon never rendered.** The view asked for an icon named `file` and no such icon was
  ever defined, so an empty `<svg>` shipped in its place. It has a proper icon now, and an unknown icon name
  logs a warning instead of silently producing nothing.

## 0.19.4

### Fixed

- **The back button tooltip was partly hidden behind the Settings Bar.** Centring it on a button that sits 8px
  from the panel edge pushes about 25 of its 95 pixels over the bar, and the bar paints on top: it is a flex
  item with `z-index: 102`, which applies to flex items even though it is `position: static`, while this panel
  sits at 60.

  A `::after` cannot escape its own stacking context, so the panel is lifted above the bar **only while the back
  button is hovered or focused**. Raising it permanently was measured first and rejected: it hides Etch's own
  Settings Bar tooltips behind the panel.

## 0.19.3

### Changed

- **The back button tooltip now sits below the button, centred on it**, instead of off to the side. Measured
  from Etch's own back button on a live builder: 5px below, horizontally centred to the pixel. Like Etch's, it
  overhangs the button on both sides and can reach over the Settings Bar.

## 0.19.2

Three follow-ups to 0.19.1, reported from a live builder. Two of them turned out to be the same root cause.

### Fixed

- **The Settings Bar icon stayed looking active after the panel closed.** Closing the manager returned focus to
  the control, and Etch styles those buttons on plain `:focus` rather than `:focus-visible` — so the icon kept a
  highlight while a different manager was open, showing two active buttons at once.
- **Clicking the back button popped the "Font Manager" tooltip** over the builder. Same cause: Etch's tooltips
  open on focus as well as hover.

  Focus is now only returned to the control when the manager is closed **from the keyboard** — Escape, or Enter
  on the back button, detected by a click event with `detail` 0. Keyboard users keep the focus return that
  matters for them; a mouse click leaves focus wherever the user actually put it.

### Added

- **The back button has a proper tooltip.** It previously relied on `title`, which renders the slow OS tooltip.
  It now matches the Settings Bar tooltips Etch renders, measured from a live builder and reproduced in CSS.
  `title` was dropped so the two cannot show at once. Etch labels its own back button "Back to Builder", which
  is what this one says.

## 0.19.1

### Changed

- **The control is called "Font Manager" now**, in the Settings Bar tooltip and as the panel heading. "Fonts"
  read like a section rather than a manager, and it sat next to Content Hub, Asset Manager, Style Manager and
  Loop Manager, which all name themselves that way.
- **The back button says "Back to Builder"** instead of "Close", which is what it actually does.

### Fixed

- **Opening another Settings Bar manager now closes this one.** Etch keeps its own managers mutually exclusive,
  but it does not apply that to a control registered through the Controls API, so the panel stayed on top of
  whatever you opened next and two buttons showed as selected at once.
- **The reverse case too.** Opening the Font Manager while another manager was open left that one selected and
  still rendered underneath. Exactly one Settings Bar panel is open at any time now, in both directions.

Unsaved edits are still protected: switching away asks before discarding, the same as the back button does.
If you cancel, the panel stays where it is.

## 0.19.0

### Added

- **WOFF converts to WOFF2 too.** 0.18.0 handled TTF and OTF and left `.woff` alone, so dropping three files
  could convert two and silently skip the third. All four accepted formats now behave the same way.

### How it works

WOFF is not a format the WOFF2 encoder can read. It is an sfnt whose tables have each been deflated
separately, so the file is unwrapped back to plain TTF/OTF first and then compressed. **This needs no extra
download** — the unwrapping is done with `DecompressionStream`, which the browser already provides.

The unwrap is byte-exact. Round-tripping Source Code Pro OTF through WOFF and back returned all 131,128 bytes
unchanged, and converting via WOFF produced a file byte-identical to converting the original OTF directly.

| Font | WOFF | WOFF2 | Saved |
|---|---|---|---|
| Inter 400 | 21,420 | 16,708 | 22% |
| Roboto 400 | 20,344 | 15,744 | 23% |
| Lora 400 | 23,304 | 19,068 | 18% |
| Source Serif 400 | 22,860 | 19,036 | 17% |

The saving is smaller than for TTF and OTF (40 to 65%) because WOFF is already compressed; the gain is the
difference between zlib and Brotli plus the glyf transform. Unwrapping adds about 2 ms.

### Notes

- A damaged WOFF is reported as damaged rather than failing somewhere inside the encoder. Truncated files,
  impossible table counts, corrupt table data and lengths that disagree with the data are all rejected up
  front, and the original file is uploaded instead.
- Format is detected from the file's signature rather than its extension, so a mislabelled file still converts.
- WOFF conversion is gated on `DecompressionStream` separately from everything else, so a browser without it
  keeps TTF and OTF conversion instead of losing the feature entirely.
- The metadata and private data blocks a WOFF may carry are dropped. They hold no glyph data and WOFF2 stores
  such things differently.

## 0.18.0

### Added

- **A font converter, in the builder.** Drop a `.ttf` or `.otf` on the Upload screen and it is converted to
  WOFF2 before it is uploaded. Typical saving is 30 to 65%: Source Code Pro measured 205 KB → 72 KB from TTF and
  128 KB → 74 KB from OTF. The toggle sits under the dropzone, is on by default, and is remembered per browser.
- **Convert files already on the server.** Each `.ttf` or `.otf` row in *Uploaded files* gets a Convert action.
  The WOFF2 is uploaded alongside the original and every family variant mapping the old file is repointed at the
  new one automatically. The original is left on disk — sweep it up through Tools → Unused files when you are
  happy with the result.

### How it works

- Conversion runs entirely in your browser: `google/woff2` compiled to WebAssembly, in a Web Worker. **No font
  is ever sent to a third party.** The plugin uploads the WOFF2 result to your own site exactly as if you had
  picked that file yourself, so nothing about the server side changed.
- The conversion is lossless. Only the container changes; glyphs, variable axes, named instances and OpenType
  features are carried through untouched. It is **not** a subsetter, so a font that is large because of its
  character coverage will still be large.
- The result is verified before it is uploaded. It has to carry the `wOF2` signature and it has to be smaller
  than the original, otherwise the original file is uploaded instead.
- If the browser cannot run the converter — no `WebAssembly`, no workers, or a Content-Security-Policy without
  `wasm-unsafe-eval` — the toggle disappears and uploads behave exactly as they did in 0.17.0. The feature can
  never block an upload.

### Build

- New `.github/workflows/build-wasm.yml` compiles `src/woff2/api.cpp` against pinned `google/woff2` and
  `google/brotli` with Emscripten, smoke-tests the result against a real TTF **and** a real OTF, and commits
  `assets/wasm/`. Provenance, sizes and SHA-256 sums are recorded in `assets/wasm/BUILD.txt`. Both upstreams are
  MIT; their licences ship alongside the binary.

## 0.17.0

> ### BREAKING CHANGE
>
> **The Automatic.css font mapping has been removed.** The plugin no longer writes
> `--heading-font-family` or `--text-font-family`. If a site relied on it, those variables disappear as soon as
> the stylesheet regenerates, and headings or body copy will fall back to whatever Automatic.css is otherwise
> set to.
>
> **What to do instead.** Every family is already published as `--efm-family-{slug}` (added in 0.9.0), carrying
> its full fallback stack. Set the ACSS variable from it, in Automatic.css itself:
>
> ```css
> :root {
>   --heading-font-family: var(--efm-family-inter);
>   --text-font-family: var(--efm-family-montserrat);
> }
> ```
>
> That is one line each, it lives where the rest of your typography already lives, and it no longer fights ACSS
> for ownership of the same variable. The old mapping wrote `!important` precisely because it was fighting.

### Removed

- **The Automatic.css mapping**: the heading and text font selects, the "Automatic.css was not detected" notice,
  and the generated `:root` block. The `heading_font`, `text_font` and `acss_enabled` settings and their REST
  arguments are gone with it, along with ACSS detection.
- **The live type sample.** It existed only to preview the two selects, and previewed nothing without them.
- **The "Heading font" / "Text font" role chips** on Library cards, and the confirmations warning that a family
  was "assigned" before disabling or trashing it. Nothing can be assigned any more, so they could never fire.
- Internals that had no remaining caller: `familyRoles()`, `familySelect()`, `EFM_Builder::acss_active()`,
  `acssActive` in the REST state, `EFM_Fonts::prune_settings()` (its only job was clearing stale assignments) and
  `EFM_Fonts::stack_for_name()`.
- The legacy *Etch Custom Fonts* importer no longer reads `ecf_acss_settings`. It existed only to copy those two
  assignments across, and then wrote an empty settings array. Families still import as before.

### Changed

- **Theme is now Settings**, with an icon that matches. It holds stylesheet delivery and the privacy option, which
  is all that was ever in it besides the mapping.

### Housekeeping found while auditing

- Removed **7 translation strings that were already unused** before this release: `add`, `googleHint`,
  `removeFamily`, `none`, `unsaved`, `confirmRemoveAssigned`, `confirmRemoveAssignedHint`.
- Removed a **stray duplicated docblock** in `class-efm-fonts.php` that had no function beneath it.
- **Rebuilt the translation template from source**, 208 strings with accurate line references. The previous file
  had drifted because entries were appended by hand in 0.15.0 and 0.16.0.
- Translation keys are now exactly **192 used and 192 defined**, with none missing and none unused.

## 0.16.0

Finishes the last item from the fonts.google.com review: the specimen detail view, held back from 0.15.0 rather
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

## 0.15.0

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

## 0.14.0

### Fixed

- **Preload did nothing for many families.** It only accepted a weight of exactly `400` or the full `100 900`
  range. A family installed without a regular weight preloaded nothing at all, and from 0.8.0 — when narrow
  variable ranges stopped being rewritten to `400` — neither did any variable family with an axis such as
  Alegreya's `400 900` or Akshar's `300 700`. **This was a regression introduced by 0.8.0** for the variable
  case. Preload now picks the upright weight nearest regular, preferring latin, so it always chooses something
  sensible.
- **Inline CSS was rebuilt on every page load.** The option added in 0.12.0 regenerated the stylesheet from
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

## 0.13.0

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

## 0.12.0

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

## 0.11.0

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
  in 0.8.0 and 0.10.0 already survive a round trip, because the export writes the stored records and the import
  runs them back through the same sanitiser. Verified rather than assumed.

## 0.10.0

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

## 0.9.0

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

## 0.8.0

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

## 0.7.3

- Use `WP_Filesystem::move()` rather than `rename()` when a font file that is not a real upload is moved into place, so hosts with restricted filesystem access are respected.
- Continuous integration now fails on coding standard **errors** and reports warnings without blocking. Almost all remaining warnings are whitespace alignment, which `phpcbf` applies automatically.

## 0.7.2

- Cleared the last two coding standards violations, so continuous integration is green. No functional change.

## 0.7.1

- Fixed the coding standards violations the new CI run reported: block comment formatting, a missing doc comment on `sanitize_family_name()`, an undocumented `$variable` parameter, and `count()` evaluated inside a loop condition. No functional change.

## 0.7.0

### Added

- **Import & export.** A new section downloads every family, variant mapping and assignment as a JSON file, and loads one back on another site. Import runs in **replace** or **merge** mode, and reports any file a family references that is not present in the fonts folder, so a half-migrated setup is obvious rather than silent. Font files are deliberately not included: a family installed from Google can simply be reinstalled.
- **Translation support.** `load_plugin_textdomain()` on `init`, plus a generated `languages/etch-font-manager.pot` covering all 125 strings.
- **Continuous integration.** A GitHub Action runs `php -l` on 7.4 and 8.3, PHPCS against the WordPress standard, and checks that `panel.js` parses and `update.json` is valid. `phpcs.xml.dist` ships with the plugin.

### Fixed

- **Outline buttons had an invisible border.** The hairline colour resolved to the same value as the raised content surface, so *New family*, *Add variant*, *Load more* and *Choose a file* had no visible edge. The hairline is now derived from the foreground colour.

### Accessibility

- The manager is a takeover, so keyboard focus is now trapped inside it while open and wraps at both ends.

## 0.6.0

Google Fonts is now a browser rather than a search box.

### Added

- **Browse the full library.** Opening Google Fonts lists the most popular families straight away instead of waiting for a search term. The index carries close to two thousand families.
- **Category filter** (Sans Serif, Serif, Display, Handwriting, Monospace) and **sort** by popularity or A to Z.
- **Paging.** Results load 24 at a time with a Load more button, and the header shows how many of the total you are looking at.
- **Variable fonts.** Families with a weight axis install as one file per subset with `font-weight: 100 900`, instead of one file per weight. For Inter with latin that is 2 files rather than 18. The toggle is on by default where a variable cut exists, and the axis is read from the index rather than trusted from the request.

### Changed

- **Specimen webfonts load lazily.** Previously every result pulled a Google stylesheet whether or not it was ever seen; now they load per card as it scrolls into view, batched.

## 0.5.0

Typography and delivery controls, per family, in a new **Delivery** section of the family editor.

### Added

- **Loading behaviour** per family (`font-display`). `swap` stays the default; `optional` skips the font entirely on slow connections, which removes the layout shift it would have caused.
- **Preload** toggle per family. It emits a `<link rel="preload" ... crossorigin>` early in `wp_head` for that family's regular upright weight, preferring the latin subset. Capped at four hints in total, because preloading everything delays the rest of the page.
- **Fallback stack** per family, shown while the font loads and if it fails. The stack is written into `--heading-font-family` and `--text-font-family`, so Automatic.css now receives a complete stack rather than a bare family name.

### Security

- Fallback stacks are stripped of every character a font stack does not need, so the value cannot terminate the declaration it is written into.

## 0.4.0

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

## 0.3.5

### Fixed

- **The update notice stayed after updating.** The version check compared the latest release against `EFM_VERSION`, which is the constant from the copy of the plugin loaded at the start of the request. During an update the files on disk are already newer than that constant, so WordPress was told the update still needed installing and cached that answer. The installed version is now read from the plugin header on disk.
- A stored update entry that the installed version already satisfies is now corrected when the transient is read, so a stale notice clears on the next page load instead of lingering for hours.
- Finishing an update also removes the plugin's own entry from the update transient.

### Changed

- Release lookups are cached for ten minutes instead of six hours, and a failed lookup backs off for fifteen minutes instead of thirty, so a new release surfaces on its own instead of waiting for a long cache to expire.
- New `efm_release_cache_ttl` filter to tune that window. Raise it when many sites share an outbound IP, since GitHub allows 60 unauthenticated requests an hour per IP.

## 0.3.4

- Restored the **Check for updates** plugin row link, which 0.3.3 removed. Testing showed a forced check from the WordPress Updates screen did not reliably reach the plugin with a fresh lookup, while this action clears both the release cache and the WordPress update transient before re-checking. 0.3.3 is superseded, do not run it.

## 0.3.3

- Removed the **Check for updates** plugin row link. It existed to work around the cache bug fixed in 0.3.2; now that a forced check bypasses the release cache, WordPress's own **Check again** on the Updates screen does the same job. This also removes an `admin-post` endpoint, a nonce flow and an admin notice.

## 0.3.2

- A forced update check now bypasses the plugin's own release cache. Clicking **Check again** on the Updates screen, or running WP-CLI, previously kept returning the cached lookup for up to six hours, so a release published in that window stayed invisible.

## 0.3.1

- Added a **Check for updates** link to the plugin row, so a release can be picked up immediately instead of waiting for the six hour cache to expire. It reports whether a newer version is available.

## 0.3.0

### Added

- **Updates from GitHub.** The plugin now appears in the normal WordPress Updates screen and installs new versions from the latest GitHub release, so distributing a fix no longer means uploading a zip by hand.
- Release notes are shown in the plugin details modal.
- The extracted folder is renamed to the installed directory name, so an update replaces the existing plugin instead of installing a second copy next to it.
- `Update URI` header, so a plugin on wordpress.org with a matching slug can never hijack updates.
- Filters: `efm_updater_repo` to point at a fork, and `efm_enable_updates` to switch the behaviour off.

Release lookups are cached for six hours, with a thirty minute back-off after a failed request, so the GitHub API rate limit is never a concern.

## 0.2.0

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

## 0.1.0

- Rebuilt the interface as a **full-screen font manager** matching Etch's own manager pattern: takeover surface beside the settings bar, 40px header and a 256px inner navigation column.
- Navigation split into Library, Upload fonts, Google Fonts and Theme.
- Library is now a specimen grid with a family filter, plus a dedicated family editor screen for renaming and mapping variants.
- Google Fonts results render as a large specimen grid with live previews.
- Added a shared preview toolbar: editable specimen text and a 14-72px size slider.
- Theme view gained a live heading and body sample rendered in the selected families.
- Moved the Settings Bar control to the end of Etch's manager group (top-end) via the official Controls API.
- Removed the DOM pinning logic entirely; the plugin no longer moves or inserts anything inside Etch's own DOM.

## 0.0.4

- **Fix builder-breaking bug:** register the canvas stylesheet only through `etch/canvas/additional_stylesheets`.
  Registering through `etch/canvas/enqueue_assets` as well produced two entries with the id `efm-fonts` in Etch's
  keyed canvas stylesheet list, throwing `each_key_duplicate` and leaving the builder canvas collapsed and unclickable.
- Skip the filter when an entry for the stylesheet already exists.
- Never rename or replace the canvas link element Etch owns; only its `href` is updated when fonts change.
- Remove the 0.0.3 DOM fallback control. The official Controls API works; the fallback inserted a foreign node
  into Etch's Svelte-managed Settings Bar.

## 0.0.3

- Detect the Etch 1.6.4 state where external controls enter the public store but its Svelte Settings Bar renderer does not consume them.
- In that specific state, render a native-shaped Fonts button directly after dark mode without mutating Etch's control store.
- Continue using the official Controls API on healthy Etch installations.

## 0.0.2

- Version builder panel assets by file modification time to prevent stale JavaScript after hotfixes.
- Add a URL-scoped diagnostic bypass for isolating third-party Settings Bar integrations.

## 0.0.1

- Wait for the exact Etch Settings Bar section to mount before registering the Fonts control.
- Add a page-level boot guard and guarantee a single Controls API registration, preventing Etch's Svelte `each_key_duplicate` crash.
- Store and serve fonts from the shared `wp-content/fonts/` directory so legacy Etch Custom Fonts files work immediately.

## 0.0.0

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
