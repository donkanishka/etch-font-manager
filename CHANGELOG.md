# Changelog

All notable changes to Etch Font Manager are documented here.

## 0.35.0

An eleventh pass, eight items, driven a screenshot at a time. Its spine is that a control should mean what it
says: a checkbox should belong to something, a label should describe what is true, and a switch should change
something.

The largest finding was not in the list it came from. Asked why the typography tokens did nothing, the answer
was that they had never done anything on any site: the feature declared a custom property and stopped, and
nothing was there to read it.

### Added

- **The typography tokens now apply themselves.** Ticking a role wrote `--heading-font-family` and stopped,
  leaving the rule that uses it to Automatic.css -- which only writes one once its Typography section is
  configured, and which is not present at all on a site without ACSS. Measured on a live install: nothing read
  either token, so "Use for headings" was a switch that changed no pixels. The block now carries the rule as
  well, on the same selectors ACSS uses, so a configured ACSS site gets two rules that agree and every other
  site gets one that works.
- **A search field and format chips on Font files.** The screen lists the whole shared fonts folder and has no
  ceiling, so it gained the toolbar its sibling screens already had. The chips filter the tables by format and
  carry a count in the sidebar's own badge.
- **A select-all in each file table's head**, scoped to that group, beside the one in the bulk bar that answers
  for every group at once.
- **A notice when Etch is not active.** The panel opens from the Etch Settings Bar and nowhere else, so without
  Etch the plugin activated, kept serving the fonts it had already generated, and offered no way in. The Plugins
  screen now says so, and says the fonts are still loading.

### Fixed

- **The Automatic.css bridge never fired.** The token block was attached to ACSS's own stylesheet handle at
  priority 99 and bailed when that handle was not registered yet, leaving an empty
  `<style id="automaticcss-core-inline-css">` on the page and the tokens only in `efm-fonts.css`, which loads
  well before ACSS. That ordering matters now the block carries a `body` rule, because ACSS sets
  `body { font-family: system-ui }` directly. It uses a handle of its own, enqueued last, so it no longer
  depends on another plugin's timing.
- **Files in the trash claimed to be in use.** "In use" was true of any file a family mapped, including a family
  that is trashed or disabled and therefore emits no `@font-face` at all. Three states now: in use, not loaded,
  and unused. What counts as safe to delete is unchanged -- a trashed family's files are still protected,
  because restoring it needs them.
- **A select-all in one file table answered for the others.** The box compared how many files were selected
  against how many the table held, so choosing two files anywhere made a two-file table read as fully selected;
  and unticking any of them cleared the selection in all three. It is compared by membership now.
- **`Apply to` no longer writes a selector its own role already covers.** Both would have set `font-family` on
  the same element, leaving source order to decide. The field keeps what was typed and the stylesheet drops the
  duplicate, so unticking the role brings it back.
- **Tested up to** said 6.8 while the plugin runs on 7.0.

### Changed

- **The select-all checkbox that floated above the grid is gone.** It sat outside the cards it selected with no
  label and nothing to head, so it read as a stray control. Select all is a word in the bulk bar now, which only
  exists once something is picked, and it counts what a filter left on screen.
- **Taking a typography token from another family says so**, in a warning under the toggle rather than a toast:
  it is unsaved state, so it behaves like unsaved state and Discard is what puts it back. Derived from the saved
  snapshot, so handing the token back by hand clears the warning on its own.

## 0.34.1

A hotfix. 0.34.0 could not be opened at all.

### Fixed

- **The Font Manager control never appeared.** The settings key list added in 0.34.0 was declared beside the
  functions that read it, several hundred lines below the state object that fingerprints the settings as it is
  built. `var` hoisting supplies the name but not the value, so the fingerprint read `undefined`, `panel.js`
  threw before it could register its Settings Bar control, and the plugin was unreachable from the builder. The
  list is now declared above the state it feeds.
- **CI could not have caught it.** `node --check` parses a file and stops there, so it passed happily on a script
  that died on its first line of real work. `tools/boot-check.js` now boots the panel against a stubbed DOM and
  fails the build if it throws; run against 0.34.0 it reproduces the exact error.

## 0.34.0

A tenth pass, sixteen items, driven a screenshot at a time. Its spine is that a screen should be named for what
it holds and should say what it is about to cost you.

Half of it came out of questions rather than bug reports. "Does the variable axes panel help anyone?" turned out
to mean the axes changed the stylesheet while the preview sat still. "Should Google fonts appear under Upload
fonts?" turned out to mean the screen had been listing the whole folder for its entire life under a name that
claimed otherwise. "Do static fonts need variable axes?" caught a notice, added an hour earlier, that would have
appeared on every family on every install.

### Added

- **Uploaded variable fonts get their axes.** The panel reads the `fvar` table in the browser at upload, which is
  the only moment it can: conversion to WOFF2 happens before anything is sent, and the encoder we ship has no
  decoder to undo it. TTF, OTF and WOFF are read; a font uploaded already as WOFF2 says so rather than showing an
  empty space where sliders should be.
- **Typography tokens.** A family can be published as the site's heading or body font, writing
  `--heading-font-family` and `--text-font-family` -- the names Etch's documentation tells you to declare and
  Automatic.css reads without ever declaring. The block is attached to ACSS's own stylesheet handle so it wins on
  order; the mapping removed in 0.17.0 needed `!important` because it loaded first and had no other way through.
  Each token belongs to one family, enforced in the panel, on every save and in the generator.
- **Multi-select on the Font library**, with bulk move to trash, in the style the Trash and the file tables
  already use.
- **Font files are grouped by origin** -- Uploaded, From Google Fonts, Not in the library -- because the right
  answer to "can I delete this" differs by group.
- **Two collision warnings.** The save bar names both sides when a typography token changes hands, and the Apply
  to field names any other family writing a rule for the same selector.

### Changed

- **Library is now Font library, and Upload fonts is now Font files.** The second had listed every file in
  `wp-content/fonts` since it was written, most of them not uploads; its own badge gave it away.
- **Settings joined the save bar.** The screen no longer commits on its own, so a changed toggle shows as an
  unsaved change like everything else and is named in the bar.
- **Variable axes sit under the preview**, where they were 702px away in a pane 711px tall.
- **Unused files moved to the Font files screen**, under the group that already listed them, leaving Import &
  export doing exactly that.
- Sixteen toast messages replaced one generic failure line, and each copy button names what it put on the
  clipboard.

### Fixed

- **Dragging a variable axis never moved the preview.** It rewrote the generated CSS and marked the panel
  unsaved while the specimen stayed at the default cut.
- **Deleting a font file left the family behind with no variants** -- a card that still named a family and
  published a CSS variable while generating no `@font-face`. The confirmation now names the family it empties and
  offers to trash it, and an empty family is badged.
- **The Settings screen reported "Fonts saved."** and its button read "Save fonts", both from sharing one string
  key with the library's save bar.
- **A toggle in Settings updated nothing but itself.** Removal's checkbox re-rendered neither the screen nor the
  save bar.
- Card buttons stood at two heights and carried two glyph sizes; `.efm-btn--sm` declared a 24px height matching
  nothing in Etch, whose only small control is 28px.
- Axis names read "wdth wdth" unless the Google Fonts screen had been opened first.

## 0.33.0

A ninth pass, driven a screenshot at a time. Its spine is that the panel should show its work: a delete should
look like one, an action that frees disk should say how much, and a font tuned in the type tester should still
be tuned after it is installed.

Three of the twelve items turned out to be rules that had never once applied. All three were the same mistake --
a modifier declared above the base class it modifies, tying on specificity and losing on source order -- and a
sweep of all 281 rules afterwards found no fourth.

### Added

- **A variable family keeps the instance you tuned.** The type tester has always let you drag a font's axes and
  shown you the `font-variation-settings` line it produced, and that line died the moment you left the Google
  Fonts view: the axes lived only in the search results, so your only way to keep the tuning was to paste the
  declaration into a stylesheet by hand.

  Installing now records the family's whole axis list, and the family editor offers the same sliders afterwards.
  The instance is written to the stylesheet as `font-variation-settings` on the family's own selector, and as a
  `--efm-family-{slug}-variation` custom property beside the existing font-stack token, so it can be applied
  anywhere the family already is.

  It is deliberately not written into the `@font-face` rule, which is where it looks like it belongs. Measured in
  Chrome against a real variable face: a rule carrying `font-variation-settings: "wght" 900` rendered identically
  to one carrying none, both at 229.29px, where genuine weight 900 measured 240.05px. Declaring it there would
  have shipped a line that does nothing. Leaving `@font-face` alone also keeps its weight range intact, so
  `font-weight` still works everywhere the family is used.

  An axis sitting on its default is left out, so a family nobody has tuned writes nothing, and dragging a slider
  back where it started undoes the edit properly.

  Google installs only. An uploaded font's axes would have to be read back out of the file, and the converter
  writes WOFF2 without being able to read it.

- **Converting reports what it did, the way Etch's Asset Manager does.** Original on the left, result on the
  right, over a wash that deepens toward the result. The component is Etch's own `.results`, taken from the
  builder bundle rather than judged from a screenshot: its padding, its 0.05em label tracking, its 16px
  monospaced value and all four of its gradient stops.

- **Settings > Conversion decides what happens to the original.** Off by default, because converting is one-way
  here -- there is an encoder and no decoder -- and for an uploaded font the original may be the only copy on the
  site. On, the source is deleted once the conversion has been remapped. A source another family still maps is
  never deleted either way, which matters because the server answers a duplicate upload with the twin it already
  holds.

  A setting rather than a question at each conversion: whether the original is worth keeping is a fact about how
  a site is run, not a judgement to make again for every file.

### Fixed

- **Exporting carried the Trash with it.** The export list was built from every family rather than the live ones,
  so a family you had deleted was offered, pre-selected, alongside the rest -- and because the panel sends no
  filter when everything is picked, the default export took the trash to whatever site you imported it on. Fixed
  in the panel and in `export_payload()`, the second being the half that actually guarantees it. Disabled
  families still export: those are kept on purpose.

- **Icon-only delete buttons were indistinguishable from any other icon button.** A danger rule existed and had
  never applied: at (0,2,0) it lost to the generic `:hover:not(:disabled)` above it. Measured on a live builder,
  hovering a delete gave the ordinary near-white icon hover and not one pixel of danger. Every delete in the
  panel now stands on the same ladder as the confirmation dialog's own Delete button -- the danger colour at a
  fifth of an alpha inside a full-strength border, deepening to twice the alpha on hover.

- **Labelled deletes were dressed as ordinary buttons.** `.efm-btn--danger` sat six hundred lines above the base
  `.efm-btn`, tied it on specificity and lost on order, so all three of its properties were overwritten and every
  "Delete selected" rendered neutral. Empty trash and Delete unused files were wearing the outline variant and
  now wear this one.

- **Nothing marked a selected card in the Trash.** `.efm-card` reserves a transparent border for exactly this and
  `.is-picked` colours it; the trash card simply never asked for the class.

- **The preset chip row crowded the toolbar.** On the Google Fonts view it reached fifteen chips and 823px,
  sharing a row with the preview field and the size slider. It now collapses past six behind the same dashed +N
  disclosure the install cards use, and a selected chip stays visible whatever its position.

- **A `flex-wrap: nowrap` on that row had never applied either**, losing to `.efm-chips` six hundred lines below.
  It is removed rather than put into force: the chips no longer share a group with the preview field, so they can
  only fold onto their own line instead of taking width from the controls beside them.

- **The import preview ran together as one block of text.** Its container carried a class with no rule, and
  everything inside it is a `.efm-muted` paragraph, which zeroes its own margins.

- **A long name in a dropdown pushed the value out of the menu** instead of ellipsing.

### Changed

- **The toolbar is two rows when the chips need it.** The preview field and the size slider hold the first row's
  right corner and are not moved by anything else on it; past four presets the chips drop to a row of their own.
  Decided on how many presets exist rather than how many are showing, so opening the collapsed set cannot move
  the controls.

- **The size slider says what it is.** It carried an `aria-label` and nothing a sighted reader could see, on all
  four screens this toolbar appears on, and it was the only bare slider in the panel. It takes the split from
  Etch's own slider heading: a quiet name, a full-strength value. The readout is tabular now, so it stops
  twitching mid-drag.

- **Actions that free disk say how much.** "Delete unused files (7)" is the count and the size, and the Uploaded
  files heading carries the folder's total.

- **Toolbar controls are one height.** The Google Fonts Filters button was 24px against its neighbours' 28, and
  the layout toggle was 26 in both panels -- a number matching nothing, since Etch has no segmented control.

- **The Variants stat takes Tabler's text-resize**, replacing an Aa that was the one glyph in the table not drawn
  on the 24 grid and needed a padded 512 box to stop out-weighing its neighbours.

- **`.efm-icon-btn` resets its user-agent padding.** Chrome's `1px 6px` left a content box exactly as wide as the
  icon, which held only by coincidence: this site applies `max-inline-size: 100%` to svg, so adding a border
  squeezed a 16x16 glyph to 14x16 rather than overflowing.

## 0.32.0

An eighth pass. Half of it came out of questions rather than reports, and the questions were better than the
reports: two of them found a plugin working against itself.

### Added

- **Files can be selected.** The Uploaded files table, the Trash and the variants table each carry a checkbox per
  row and a select-all that goes indeterminate when the selection is partial, which is what Etch's own bulk bar
  does. Uploaded files can be converted or deleted together, trashed families restored or deleted, variants
  removed.

  Selections are held by name rather than by index, because a row moves underneath one constantly -- a delete
  splices the list, an upload re-sorts it -- and an index would then point at whatever took its place. Variants
  are the exception: they have no id, so the selection holds positions and carries the family they belong to,
  and switching families abandons it rather than reinterpreting those positions against a different list.

  The bulk delete asks `orphanedBy()` about the whole selection at once, which is what makes it correct: deleting
  two families together frees only the files no surviving family maps, where one at a time would have offered a
  file the other still needs.

- **Font files already on the server can be taken into the library.** They were always listed on the Upload
  screen and nothing ever offered to make families of them, so an empty library sitting on a full folder read as
  a plugin that could not see its own fonts. That folder fills up on its own: Etch shares it, the legacy plugin
  used it, and an uninstall now leaves files behind by design.

  Offered from the library's empty state and from the Upload selection. Family names are guessed from file
  names, so it lands in the buffer for review rather than being saved.

- **Deleting the plugin no longer breaks the site's typography.** The uninstall routine kept the font files on
  purpose -- "so sites do not lose typography on an accidental uninstall" -- and then deleted the stylesheet that
  declared them, which is the same outcome as losing them. Everything in wp-content/fonts is left alone now, and
  Import & export shows the one `@import` line that keeps it all loading without the plugin.

  Settings > Removal carries the opt-out for a site that means it. It removes the stylesheet and the files the
  stored families map, and nothing else: that folder is shared, so emptying it would take Etch's fonts too.

- **A font already in the library cannot be uploaded again.** It used to land beside itself under a random
  suffix, so uploading a folder twice doubled the library. Blocked in the browser before anything is sent, on
  two tests: the same name at the same size, or a convertible file whose WOFF2 twin is already here. The server
  compares contents as a backstop, size first and hash second, and reports a duplicate rather than failing so one
  repeat in the middle of a folder does not abandon the rest.

### Changed

- **Icons.** Library, Google Fonts, Upload fonts, Trash, the convert action, Restore and the three statistics
  each took a new mark. `icon()` grew with them: an entry may declare its own viewBox, and the stroke width is
  derived from that grid rather than fixed at 1.5, so a glyph drawn on 256 or 512 keeps the panel's weight
  without being rescaled.

  Two glyphs were split rather than edited, because they had been carrying two meanings each: the library mark
  is now separate from the statistics one, and restoring is separate from undoing. Editing one entry is what
  keeps every place a glyph appears in step, so divergence has to be deliberate.

- **The count badges are round.** They were three different widths -- "1" came out 16.57px against "2" at 18.78
  -- because a proportional face lets the glyph set the box. The digits are monospaced now, which is what Etch's
  own sidebar badge does, and a floor equal to the height makes a single digit a circle rather than nearly one.

- **The preview scripts are the ones you have installed.** The chip row above every card was a fixed Latin,
  Sinhala and Tamil -- the author's own two scripts rather than a general choice, so a reader in Athens or Osaka
  got two writing systems they cannot read and none for their own. The panel carries samples for fourteen scripts
  and already picks the right one per family, so the row is derived from the installed families now, each chip
  labelled in its own script. A Latin-only library gets three chips; nothing offers a script the install does not
  hold.

  Google results count only while that screen is open. state.results is written by a search and never cleared, so
  counting it everywhere would have put a script on the Library's row that the library does not contain -- and
  opening Google Fonts runs a search, so it would have happened to anyone who looked at the screen once.

- **The Fallback stack field matches the dropdowns beside it.** Its chevron was lifting on hover, on focus and
  permanently once the field held a value; the nine dropdowns keep theirs flat and answer with the field's border
  instead. This one does the same now.

- **A converted file's source is named rather than deleted.** Converting leaves the original an orphan, and
  nothing said so. Both file states are named in the list now -- `in use` against `unused` -- and the result says
  which file it just made redundant. It is still not deleted automatically: there is no decoder here, so a WOFF2
  cannot become a TTF again and the original is often the only copy.

### Fixed

- **A disabled family previewed in the wrong face.** Disabling removes a family from the generated stylesheet,
  which is what disabling is for, but its card still labelled a specimen with the family name -- so the preview
  fell through to the interface font and showed the wrong typeface under the right name. Those faces are loaded
  into the panel's own font set now, which leaves the stylesheet and the site untouched.

- **Reset axes never enabled.** Dragging a slider deliberately does not re-render -- that would destroy the input
  mid-drag -- so the button was created disabled and nothing ever touched it again, however far the axes moved.
  It also asked the wrong question: it tested whether an axis had been stored rather than whether one sits away
  from its default, so it would have stayed live after dragging back.

- **The Google Fonts count did not change with the page.** It counted the page rather than locating it, so every
  page but the last read "24 of 1942". It is a range now.

- **Reinstalling regenerated the kept stylesheet from nothing**, which would have destroyed the file that was
  deliberately left behind. A missing families option and an empty one mean different things, and only the second
  should produce an empty stylesheet.

### Notes

`icon()` keeps its support for filled icon sets even though nothing in the table uses it after the Aa went back
to strokes. Phosphor is fill-only and this panel now draws from four icon sets, so it is a capability with a
named use rather than machinery kept in case.

## 0.31.0

A seventh pass. Three of the ten items came out of questions rather than bug reports, and one of those questions
turned a dialog into no dialog at all.

### Added

- **Families record where they came from.** Every family now carries a `source` of `google` or `upload`, and the
  offer to delete its font files defaults to ticked when they can be downloaded again. The trash card says which
  it is, because that is the one fact deciding the answer.

  An earlier note in this project said origin could only be guessed from a file name. That was wrong for anything
  installed since the Google block existed: the installer writes the chosen subsets, the available cuts and the
  axis onto every family it downloads, and nothing else ever writes one. So the block is the signal, and the
  filename heuristic was never needed. Records stored before the field existed are filled in on read rather than
  by an upgrade routine, since the answer is derived from what the record already holds and is the same every
  time it is asked.

- **A confirmation marks what it is about to delete.** Copied from Etch's Asset Manager, whose
  `.collection-list__item--delete-target` stripes the row a dialog is asking about: hairlines at -45 degrees, the
  danger colour at 8% on a 2px/4px cycle, over a flat 20% of the same. The single delete marks its card, Delete
  file marks its row, and Empty trash marks the lot, so "every family in the trash" is a claim you can count
  without dismissing the question.

  No border and no radius, both deliberate. Etch's rule has neither; what reads as an edge is the stripe pattern
  meeting the element's own corner.

- **Leaving the builder with unsaved font changes now warns you.** Etch guards its own work with a single
  `beforeunload` checking five of its stores, and this panel was in none of them, so a refresh dropped the buffer
  without a word.

- **The translation template is regenerated by a tool and checked by CI.** `tools/check-pot.js` walks the PHP,
  merges repeats, and either reports drift or rewrites the file. It had drifted badly: 23 strings were missing,
  3 named strings that no longer existed, and 178 of 260 line references pointed at the wrong line. Adding or
  moving a string without rebuilding now fails the build.

### Changed

- **Closing the panel no longer asks anything.** It never needed to. `shutPanel()` hides the DOM and flips a
  flag, and `open()` re-renders from the same state without re-fetching, so the buffer survives a close and the
  save bar is still lit when the panel comes back. The dialog that used to appear was warning about a harmless
  act, and the only way out it offered besides staying was to throw the work away. The warning moved to the event
  that actually costs you something, and Discard keeps its home on the save bar where it is chosen deliberately.

- **The Fallback stack field is the trigger for its own suggestions.** Clicking anywhere in it opens the list and
  keeps the caret where you put it; a second click does not close it. Down Arrow opens the list and moves into it.
  The arrow is no longer a separate tab stop or a separately hovered control -- it follows the field, muted at
  rest and full when the field holds a value. All of that is what Etch's own combobox does, read from its bundle:
  one handler bound to both `onclick` and `onfocus`, and an arrow lit by hovering the input.

  Focus-to-open was left out on purpose. `render()` rebuilds the pane and restores focus by key, so opening on
  focus risks a loop, and it would pop a menu every time you tab through the family editor.

- **Every dialog in the panel is two answers.** Which is what Etch's own `.confirm-dialog` renders. A question
  with three ways out is usually two questions wearing one coat.

- **A button in a section box keeps its natural width.** The box is a flex column, so a button in it stretched
  the full width of the pane and read as a bar across the section rather than an action inside it.

### Fixed

- **The save bar could sit lit over a diff with nothing in it.** `state.dirty` was set true in twenty places and
  cleared by almost nothing, so editing a family and changing it back by hand left the bar up until you saved or
  discarded. It is derived now, comparing a canonical form of the library against the last copy the server
  confirmed.

  Canonical matters in both directions: key order follows insertion, so a family the server sent and the same
  family after the editor rebuilt part of it could differ by nothing but ordering, and a record saved before
  `enabled` existed carries no such key while anything the editor touches carries `enabled: true`. Both mean
  enabled, and comparing them as they stood read as an edit that never happened.

- **Installing a Google font silently discarded every unsaved edit in the panel.** `install()` reads the stored
  family list, rewrites one family and saves the lot, and the panel then replaces its buffer with the result. The
  browser never sends what it is holding. The converter had asked about this since it was written; the installer
  never did, and all three of its call sites shared the fault. It asks now, from inside the function so a fourth
  call site cannot miss it, and it can save your work first rather than only offering to lose it.

- **The tooltip on an already-converted file was drawn at 30%.** `.efm-icon-btn:disabled` faded the button, and
  the tooltip is a `::after` on that same button, so the one sentence explaining why it could not be pressed came
  out faded too, legible through the row beneath it. The fade lands on the glyph now.

- **Download selection was live on families where it could do nothing.** For a family Google publishes at one
  weight, the only possible outcome was re-downloading an identical file. It is disabled when the selection
  matches what is on disk, and says which of the two reasons applies.

### Notes

The amber level added earlier in this batch for questions that discard unsaved work was removed again before
release: by the time closing stopped asking and the install guard could save instead, no dialog in the panel
discarded anything, and the colour had nothing left to mark. Red still means "removes something from the server"
and is spent on the four questions that do.

## 0.30.0

A sixth pass, and three bugs. One of the three surfaced as a question about what a line of generated CSS meant,
which turned out to be the best way to find it.

### Added

- **A permanent delete can take the font files with it.** Deleting a family for good, or emptying the trash,
  now offers a checkbox with the count and the total size, off by default and shaped like the export bundle's.

  It lists only files no surviving family maps, because two families can point at one file and deleting one of
  them must not pull the ground from under the other. It is offered rather than implied on purpose: a Google
  file is a click away from being downloaded again, an uploaded one is often the only copy in existence, and a
  family record carries nothing that says which of the two it holds.

  The timing is the part worth knowing. Removing a family is buffered like every other edit, so unlinking its
  files at the moment of asking would leave Discard able to restore a record whose files had already gone --
  precisely the family that looks installed and loads nothing. The names go into a queue that is only acted on
  once the removal has actually been saved, one file at a time; Discard throws the queue away with everything
  else, the queue is taken before the request fires so a second save cannot send it twice, and a file that is
  already gone does not stop the rest.

  `askConfirm()` grew an optional checkbox whose value the caller owns, so the promise still resolves a plain
  yes or no and the confirmations that do not need one are untouched.

### Fixed

- **A font could be converted to WOFF2 twice.** The button only asked whether the extension was convertible,
  never whether the work had already been done, so a `.ttf` kept offering it with its own `.woff2` sitting on
  the row below. Pressing it spent the entire conversion to overwrite the file it produced last time.

  The row now derives the twin with the same `woff2Name()` the converter uses and checks the file list. It is
  disabled rather than hidden, since a control that vanishes leaves the reader wondering, and its tooltip names
  the file holding the result. That needed one considered divergence: `.efm-btn:disabled` takes buttons out of
  the hit test as Etch does, but here the tooltip is the explanation, so `.efm-icon-btn:disabled` dims to the
  same 30% and stays hoverable. The disabled attribute still blocks the press.

- **The generated CSS preview labelled every file WOFF2.** It wrote `format("woff2")` literally, whatever the
  file was, so a `.ttf` was shown as `url("DancingScript-Bold.ttf") format("woff2")`. Its own docblock claimed
  it mirrored `build_css()`; it did not. The shipped stylesheet was always right, since `EFM_Fonts::FORMATS`
  maps `ttf` to `truetype` and `otf` to `opentype`, so only the preview lied -- which is the one thing that
  screen exists to avoid.

- **The preview also showed rules the stylesheet leaves out.** Since 0.29.0 the real generator skips a variant
  whose file is not on the server, and the preview did not, so it could show a face the stylesheet does not
  contain. It checks the same list now.

### Changed

- **The Fallback stack field is the panel's own menu.** It was a native `<datalist>`, and a datalist's list is
  drawn by the operating system, so it arrived with its own marker, type, spacing and scrollbar and ignored the
  stylesheet entirely. It was the last OS-drawn menu in the panel, missed when 0.26.0 replaced the nine selects
  because it is an input rather than a select.

  It is a combobox, not a dropdown, and the distinction is why `dropdown()` could not simply be reused: those
  nine hold closed sets and lock the value to an option, while a fallback stack is free text and must accept
  any valid CSS font list. The field keeps its own value and the four suggestions open beside it. The arrow-key
  handling `dropdown()` had inline is now one `walkMenu()` both call.

- **A confirmation that deletes files says so.** "The Trash holds families, not files, so this cannot be
  undone", last, where Etch puts the same warning. Two dialogs delete files and neither said which kind of
  Delete it was; the three family-level ones already explained where the files go and are untouched.

- **The delete button in a confirmation has a hover state.** It had none at all, so the only feedback was the
  cursor. Etch hovers it on the same colour at twice the alpha, `oklch(from var(--etch-danger) l c h / 0.4)`
  against the 0.2 it rests at, so the fill deepens without the button changing identity.

- **The family name in Manage font is a heading**, with the rule every other heading has. It shared a line with
  the back button, where a rule could only run as far as the word did, so it renders the same title element the
  type tester does rather than a second one that has to be kept in step.

- **Unused files fill the width of the confirmation** they appear in. Hugging the longest line is right on the
  Import & export pane, where the well sits in a wide section, and wrong in a 440px dialog where it was the
  only ragged edge in the stack.

- **Discard has its border back**, and the pair sits beside the message rather than at the far corner of a pane
  that can be two thousand pixels wide. Outline against a fill is the panel's own language for a secondary
  action beside a primary one; the ghost was the odd one out, and it made the control hard to find.

- **Converting says what it is converting to.** "Converting to WOFF2", in both the batch upload and the single
  file, from one shared string.

### Translators

Six new strings: `commonStacks`, `confirmPermanent`, `alsoDeleteFiles`, `fileSingular`, `filesLower`
and `convertedAlready`. `converting` is reworded to name the target format. Nothing was removed or renamed.

## 0.29.0

A fifth pass over the interface, and four bugs. Two of the four were reported as something looking wrong
rather than as something being broken, which is how the loading fault and the search fault were found at all.

### Added

- **The save bar says what is unsaved.** "Unsaved changes" reported a state the bar's own presence already
  announced, when the thing worth knowing before pressing either button is what is about to be saved or thrown
  away. The panel now keeps a stringified copy of what the server last confirmed and diffs against it, which is
  how Etch tracks its own unsaved state: every one of its stores holds a serialised snapshot and compares it
  against the live object.

  The diff reads in words: `Inter renamed to Inter Tight`, `Inter gained 1 variant`, `Roboto moved to trash`,
  `Lora disabled`, `Sekuya added`. Two are named in the bar and the rest counted, with the whole list on the
  label's tooltip. An empty diff falls back to the old wording, which is what `state.dirty` can still produce
  after an edit is undone by hand.

- **A family whose files are not on the server says so**, as a badge on its Library card naming the files and
  what to do about them. `/state` gained a `missing` list for it.

### Fixed

- **A configuration loaded without its font files produced a family that looked installed and loaded nothing.**
  `build_css()` wrote an `@font-face` for every mapped file without checking the file was there, and an export
  with the files unbundled carries the mapping and none of the bytes. A rule pointing at a 404 is worse than no
  rule: it declares the family, so the browser accepts `font-family` and then falls back silently, which looks
  correct in a browser already holding the face and wrong in a clean profile, incognito included.
  `preload_files()` had the same gap and emitted a `<link rel=preload>` at the same missing URL.

  Both now go through one `file_present()` guard, on the existing `path_is_inside()` check.

- **The Google Fonts search dropped characters and threw the caret backwards.** `state.query` was only assigned
  inside the debounce, so it trailed the field, and every render rebuilds the input from `state.query`. A search
  fires two renders, one for the skeleton and one for the results, so anything typed during the debounce or the
  round trip was overwritten. Simulated on a realistic burst, typing `seku`, pausing, then typing `ya` while the
  request is in flight, the field ended as **`seku`** with the caret pulled from 6 back to 4.

  The read is now immediate and only the search is deferred. The Library filter and the preview text field had
  the same shape and were brought into line. The debounce was also being rebuilt inside the handler on every
  render, so a timer pending on a discarded input could still fire and race its replacement; there is now one
  per concern for the session.

- **"None" in Export did nothing.** `state.exportPick` started as `[]` and empty was read back as "every
  family", so the button set the list empty and the next render turned that straight back into all of them.
  Deselecting the last family by hand did the same. `null` now means "not chosen yet" and an empty array means
  none. `exportConfig()` conflated the two as well, so even a held selection of nothing would have downloaded
  everything; it now refuses, and the button is disabled in that state.

- **The cross in a clear button sat off centre and never brightened**, in the Library filter and the Google
  Fonts search but not the preview text field. `.efm-search svg` was a descendant selector, and the clear button
  inside that wrapper carries an icon of its own, so the rule meant for the magnifier caught the cross too:
  absolutely positioned 8px from the button's left edge, which is 5px off centre in a 20px box, with its colour
  pinned to the muted token so the button's hover never reached it. Measured on a live builder, offset 8 against
  the preview field's 3. All three now sit at 3 and reach `rgb(225,225,229)`.

### Changed

- **Confirmation dialogs are Etch's, properly.** Measured from `.confirm-dialog` in the builder bundle rather
  than approximated from a screenshot: an 18px radius behind a 1px border, the icon beside a centred title, the
  message centred at three quarters opacity, and two buttons of equal width filling the foot. The destructive
  answer takes the danger colour at a fifth of an alpha behind a full-strength danger border, with near-white
  words and only the glyph in danger, so the border and the icon carry the warning and the label stays readable.

- **A dialog that lists file names shows them as a list.** The unused-files confirmation built its body by
  concatenating the question, two newlines and the names, so every line came out as an identical centred
  paragraph. `askConfirm()` takes a `list` separately now.

- **Unused files in Import & export are in that same block.** They were a `ul.efm-files` whose classes carry no
  CSS at all, so the one machine-written list in the panel was the only thing set as body copy. The report shown
  after loading a configuration had the same fault. All three now use one `.efm-filewell`: monospace on the
  sunken well, hugging its longest line, capped in height.

- **Primary buttons hover to `--e-base-light`**, with a divider-coloured border so they keep their edges inside
  a section box, which is filled with that same value, and a near-white label in place of the pane colour that
  only reads on the accent.

- **The family name in the type tester is a heading.** It was 13/500 with no rule, the only heading in the
  manager without a band, so the designers and chips under it read as a continuation of the name.

- **Discard is a ghost.** It and Save fonts were two boxes of near-equal mass, reading as a choice between
  equals when one of them throws work away. The label takes the row so the pair sits together at the end.

### Translators

Thirteen new strings: eleven for the save bar's vocabulary (`moreLabel`, `changeAdded`, `changeRemoved`,
`changeRenamed`, `changeEdited`, `changeEnabled`, `changeDisabled`, `changeTrashed`, `changeRestored`,
`changeGained`, `changeLost`) and two for the missing-files badge (`missingLabel`, `missingNotice`). Nothing was
removed or renamed.

## 0.28.0

The type tester's variable axes rebuilt around Etch's own slider, and nine more faults found by pointing at the
panel one screen at a time. Two of the fixes are things the measuring found rather than things that were
reported.

### Added

- **The trash is in the sidebar at all times.** It used to be pushed into the nav only once a family had been
  thrown away, so the one place a deleted family can be recovered from was missing from the sidebar exactly
  while somebody was looking for it, and the column changed length under the pointer as families came and went.
  It is an ordinary member of the view list now, and keeps its count at zero the way Library and Upload
  already do.

  Two things followed. A guard that bounced you out to the Library the moment the trash emptied is gone, so
  restoring the last family leaves you looking at the trash rather than somewhere else. And the view had to
  learn an empty state: opened empty it would have drawn a hint about restoring, above a "Restore all (0)", an
  "Empty trash" that empties nothing, and a grid of no cards.

### Fixed

- **A primary button turned into the pane behind it under the pointer.** The hover threw the accent fill away
  for `--efm-surface-raised`, which measures **1.24:1** against the pane the button sits on — the button
  effectively dissolved. It now does what Etch's own primary does: keeps hue and chroma and drops the lightness
  to .71, which is exactly how `--etch-primary-hover` is defined in the builder bundle. Measured on the
  default accent, hover goes from `rgb(54,54,58)` to `rgb(149,177,0)`, **6.07:1** against the pane, with the
  dark label on it clearing AA at the same ratio.

  Derived from `--efm-accent` rather than borrowed from Etch's token, because that token is built from
  `--etch-primary` while this button is painted from `--e-primary`; a site that themes one and not the other
  would have hovered to a different hue.

- **The clear button inside a field lit up brighter than the buttons beside it.** It carried a 12% wash lifting
  to the strong foreground, against the 10% and ordinary foreground every other ghost control uses. Measured in
  one toolbar: `rgb(68,68,71)` on the clear button against `rgb(63,63,66)` on a ghost icon button an inch
  away. Both are `rgb(63,63,66)` now.

- **A fallback that disagreed with Etch.** `--e-space-l` was given a 20px fallback while Etch defines it as
  16px, so any install that did not declare the token would have spaced one thing wrong. Found while opening
  the sections up, not reported.

### Changed

- **The variable axes, rebuilt.** Six things were wrong with them at once.

  The sliders were the browser's own control tinted with `accent-color`. They are now Etch's slider, taken
  from `.compression-slider` in the builder bundle: a 2px track on the border colour, the filled part and an
  8px round thumb in the text colour, and the thumb growing to 1.5x behind a 4px halo over 0.17s. Etch never
  fills a slider with the accent, so neither does this one — sampled across all three sliders in the panel,
  **zero accent pixels**, and only three colours present: the pane, the text colour and the border colour.

  Each axis was a `1fr` column, so on a wide builder an axis stretched to half the pane while its slider
  stayed a fixed 120px and its value sat parked a few hundred pixels away at the far edge, reading as though it
  belonged to the axis beside it. The column is capped at 260px, the slider fills it, and the value sits over
  the end of its own track.

  `75 – 100 · default 100` was a third line of small print under every slider. The two ends of the range are
  now under the two ends of the track, and the default is drawn as one of the graduations Etch puts under its
  own slider, at 2 by 6 in the control colour at a quarter opacity. It is positioned along the thumb's travel
  rather than the track's width, so it meets the thumb instead of drifting up to four pixels apart at the ends.

  "Reset axes" was a row of its own under the sliders, which read as a step that came after them. It sits in
  the next column along, level with the tracks, and is inert until an axis has actually been moved.

  `font-variation-settings` was a bare full-width code block holding forty characters with no way to lift them
  out. It sits on the same copyable well the CSS variable uses in the family editor, hugging its own text at
  374px rather than spanning the pane, so the copy button is beside the text rather than a screen away from it.

- **A family name on a card no longer answers in the accent.** Hover swapped the name to the accent colour and
  added the browser's underline, which sits on the baseline and cuts through descenders. Measured across Etch's
  bundle, nothing there recolours text to the accent on hover — `.bulk-bar__select-all` and
  `.settings-input-change-btn` both move on brightness alone. The name brightens and an arrow fades in beside
  it, the same arrow the detail view uses to come back, so going in and coming out share a vocabulary. The
  arrow is held in the layout rather than inserted, so the row cannot reflow under the pointer: 62.68px wide
  at rest and 62.68px on hover.

  Its hint moved from a native `title` to the panel's own tooltip. That is why the heading stopped clipping —
  a `::after` cannot escape an ancestor with hidden overflow — and the ellipsis moved to a span inside, which
  also stopped the focus ring being sliced.

- **"View on Google Fonts" is a control.** It was the only element in the panel not shaped like one: muted body
  text in its own paragraph below everything else, drawing in the browser's default blue and then the visited
  purple under a baseline underline. It takes the outline button every other secondary action uses and stands
  beside the Install it belongs with, with an icon saying it opens outside the builder.

- **The Library and the trash answer with a real empty state.** The library's was 13px of text sitting 56px
  down an otherwise empty pane, which reads as a stray line rather than as the state of the screen. Both now
  take the shape Etch's Assets Library uses and the Upload screen already followed: filling the pane, centred
  on it, 24/600 over 14/1.25 muted inside a 340px measure. Etch's own carries a dashed border and a radial
  wash; those are deliberately not here, because they belong to a drop target and nothing can be dropped on
  either view.

  The library also offers both routes now. It said "Upload a font file or install one from Google Fonts" over a
  single Google Fonts button, leaving the reader to go and find the other one.

- **Sections have room in them.** The box was inset at 12px with a 12px internal gap, and its description was
  pulled back up to 4px under the heading band, which read as text sitting on a line rather than under a
  heading. Both take `--e-space-l`, and the pull is gone. The inset is declared once as `--efm-section-pad`,
  because the band reaches the box's edges by negating it on three sides and the two numbers have to agree;
  they were four separate literals that could drift apart.

- **An "Install options" band in the type tester.** Everything below the tester ran on as one undifferentiated
  stack of rows. Section headings were introduced in 0.26.0 for exactly this and that view never got them.

- **The Loading behaviour menu is capitalised.** Five lowercase words read as code being echoed back rather
  than as a set of choices. Only the label changed: the value is still the CSS keyword and goes into the
  stylesheet exactly as before. Done in JavaScript rather than with `text-transform`, because the dropdown is
  shared with eight other menus and a blanket `capitalize` would have made "Replace everything" into "Replace
  Everything". The hint under it, which opened two sentences in lowercase, is capitalised with it.

### Removed

- **The Variable tooltip on a Google Fonts card.** It was the wrapping variant, so it opened downward across
  the Subsets row underneath and covered the chips the reader was on their way to. The type tester still spells
  the same thing out as visible text, where there is one family and room to say it.

### Translators

Four new strings: `variableAxes`, `installOptions`, `trashEmpty` and `trashEmptyHint`. `fontDisplayHint` is
reworded for capitalisation. `axisDefault` is removed, since the axis default is drawn rather than written.

## 0.27.0

The panel's own dialogs, its own dropdowns for paging, and the Upload screen rebuilt from Etch's Assets
Library. Two of the fixes are things the measuring found rather than things that were reported.

### Added

- **Every field that holds text can be emptied from a button inside it.** The preview text, the library filter
  and the Google Fonts search all carry the same clear button, shown only once there is something to clear and
  put there with the first character rather than after the field's own debounce. The browser's native clear on
  the two search fields is suppressed, since two of them in one field, one in the operating system's styling,
  is worse than none.

- **Pagination, in place of "Load more".** Following shadcn's Pagination for structure and semantics, drawn in
  this panel's controls: previous, page numbers with a gap marker, next, and `aria-current` on the page you are
  on. It always shows the first and last page and the current one with a neighbour each side, so the control is
  the same width at 3 pages or 80.

  The behaviour changed with it. "Load more" appended another 24 families per press, so a few presses left a
  hundred cards on screen, each with a live preview face. A page replaces instead, and the pane stays a fixed
  size however deep you go.

### Fixed

- **Tooltips were being cut in half on the last row of a table.** The table clipped its own overflow to round
  its corners, and a tooltip opens below its button, which on the final row is past that edge. Measured on the
  variants table: eight pixels of the tooltip were lost. The corners are rounded on the head and the last row
  instead, so nothing is clipped.

- **The clear button sat outside its field**, and **`.efm-tooltip` was quietly overriding `position: absolute`**
  on it. Both found while building the feature, neither visible until the layout was measured rather than
  looked at.

### Changed

- **Dialogs are the panel's own, not the browser's.** `window.confirm()` drew system chrome, system type and
  the site's hostname over the builder. All six confirmations now use Etch's dialog, taken from its component:
  centred on `--e-base` at a 6px radius under its six-stop shadow, over a blurred 40% overlay. Cancel holds
  focus so Enter never destroys anything, Escape closes the question without closing the panel underneath it,
  and Tab stays inside the dialog.

- **Save and Discard moved to a bar at the foot of the panel**, where the work is: the family editor runs long
  and its variants table sits at the bottom, so a header button meant scrolling back up. The save is labelled
  "Save fonts" and no longer uses the accent fill. Etch floods the accent in exactly one place, the builder's
  own Save, which sits nine pixels below this panel while it is open; measured with the panel dirty, that Save
  is now the only accent-filled button on the screen.

- **The Upload screen is shaped like Etch's Assets Library**: a dashed zone with the message centred in it, a
  button to open the picker, and the accepted formats as chips. It fills the pane while nothing is uploaded and
  steps back to a band above the files table once there is something to list. The zone is a drop target rather
  than a button, as Etch's is, which also removes a control nested inside a control.

- **Tables have column separators**, on the head and every row, in both the files table and the variants table.

- **Weights and Subsets line up on a Google Fonts card.** The label and its chips were two items in one wrapping
  row, so whether the chips sat beside the label or below it depended on whether they happened to fit: on the
  same card Weights went inline and Subsets stacked. The label now holds a column of its own.

- **The upload zone's hover takes the accent** rather than the focus blue, which this panel uses to mean
  "focused by keyboard".

### Translators

Sixteen new strings, mostly button labels for the dialogs and the pagination. `Load more` and `Save changes`
are gone; `Save fonts` replaces the latter.

## 0.26.0

Another pass over the interface, again measured against Etch rather than guessed at, and two bugs that the
measuring turned up. Uploading a font now leaves a family behind instead of a file.

### Added

- **A font upload creates its family.** Uploading used to leave the files in the table with the library still
  empty: a family had to be made by hand and each file picked from a dropdown. The family name is now read off
  the file name, which the server already parses for weight and style, and the variants are mapped for you.
  `Inter-SemiBoldItalic.woff2` resolves to Inter, `SourceCodePro-ExtraLightItalic.otf` to Source Code Pro,
  `Blackout-Bold.otf` to Blackout rather than Black. Files whose family is already in the library join it as
  further variants, and a file some family already maps is left alone.

  Saved immediately when nothing else was pending, so the upload really does finish the job. If edits were
  already waiting, the new family joins them in the buffer and says so, rather than flushing work you had not
  finished.

- **The panel remembers where each view was scrolled to.** Opening a family from the Google Fonts catalogue and
  pressing back returned you to the top of the list. Each place now keeps its own position — the catalogue, a
  type tester, a family editor — so leaving one and coming back lands where you left off. The same memory stops
  "Load more" and a filter keystroke throwing you to the top of the pane.

### Fixed

- **The content pane crushed its own children.** The pane is a flex column, so anything inside it shrank as soon
  as the content was taller than the pane, and anything with hidden overflow had no minimum size to stop it.
  Measured in the family editor with one variant mapped: the specimen preview rendered at **0px** and the
  variants table at **2px**, both invisible under headings that stayed put. This is why the font preview looked
  missing and why the variants table appeared to be an empty section. The pane now scrolls past its children
  rather than compressing them.

  `.efm-code` had carried a hand-written `flex: 0 0 auto` against this since 0.20.0, so the fault had been met
  before and patched in one place.

### Changed

- **Toasts are Etch's toast.** Taken from its component in the builder bundle rather than approximated: fixed to
  the top of the viewport and centred, 400px minimum, and a level shown as a dark fill behind a bright border of
  the same hue. Success is green, errors red, a partial result amber, work in progress blue. The bottom-right
  corner and one neutral fill for everything were this panel's own invention.

  They also carry Etch's dismiss button, with its countdown ring, and hovering pauses the countdown so a message
  cannot expire while it is being read.

- **Every dropdown is drawn by the panel.** A native select's list is drawn by the operating system, so it
  ignored the panel's colours, type and corner radius. All nine are now the same popover the Filters button
  uses: arrow keys walk the list, Escape closes it and returns focus to the trigger, a long list scrolls inside
  the menu, and one opening near the foot of the pane flips above its trigger.

- **Section headings are banded.** Etch starts a section with a 40px heading carrying a rule along its bottom;
  ours were bare lines of text, so sections ran together. Inside a raised box the rule takes Etch's divider
  colour, because `--e-border-color` resolves to the same value the box is filled with and was invisible there.

- **The CSS variable reads as a value, not a field.** It was a readonly input, which looks exactly like the
  editable ones beside it. It now sits on the sunken well Etch shows code on, with a copy button rather than a
  hidden click, and the async clipboard API falling back to a hidden textarea when the builder refuses it.

- **Family name and CSS variable share a row**, which returns 60px of vertical space, and they fall back to one
  per line when the panel is too narrow to hold both.

- **Smaller things.** "Add variant" takes a new larger button size, since it is a section's action rather than a
  row's. The variants heading is capitalised, through its own string: the plural label it used to borrow is
  reused mid-sentence in "6 variants", where a capital would be wrong.

### Translators

Six new strings: `copy`, `copied`, `copyFailed`, `dismiss`, `variantsTitle`, `addedToLibrary`,
`mappedToFamily` and `reviewAndSave`. Nothing was removed or renamed.

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
