=== Etch Font Manager ===
Contributors: donkanishka
Tags: fonts, etch, google fonts, typography, automatic.css
Requires at least: 6.0
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 0.36.1
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Manage self-hosted custom fonts directly inside the Etch builder, with a native Fonts panel in the Settings Bar.

== Description ==

Etch Font Manager adds a Fonts control to the Etch builder Settings Bar using Etch's official Controls API. Upload font files, install Google Fonts locally, map families to weights and styles, and publish each one as a CSS variable you can use anywhere, without leaving the builder.

Features:

* Native Settings Bar control, grouped with Etch's own managers
* Full-screen manager styled from Etch's own design tokens
* Drag and drop uploads for woff2, woff, ttf and otf
* Built-in TTF, OTF and WOFF to WOFF2 converter that runs in your browser, so nothing is sent to a third-party service
* Google Fonts search, preview and one-click local install
* A CSS variable per family, --efm-family-{slug}, ready to drop into Automatic.css or any style record
* Fonts load on the frontend, in the Etch canvas iframe and in the block editor
* Self-hosted files, so no frontend requests to Google

== Installation ==

1. Upload the plugin to /wp-content/plugins/etch-font-manager/
2. Activate it through the Plugins screen
3. Open the Etch builder and click the Fonts icon in the Settings Bar

== Frequently Asked Questions ==

= Does this require Etch? =

The in-builder panel requires Etch 1.6 or newer. Font delivery on the frontend works regardless.

= Are fonts self-hosted? =

Yes. Google Fonts are downloaded to your own fonts directory on install, so the frontend never calls Google.

= What happens if I uninstall? =

Plugin options are removed. Everything in wp-content/fonts is left alone by default — your font files and the stylesheet that declares them — so the site keeps its typography if the plugin is deleted by mistake. Import & export shows the one @import line that keeps them loading without the plugin.

Settings > Removal has the opt-out. Tick "Delete the font files when the plugin is deleted" and deleting the plugin also removes the stylesheet and every font file your families map. Files nothing maps are left, and so is anything else in that folder, because Etch shares it. Deactivating never deletes anything.

Reinstalling leaves the kept stylesheet in place rather than regenerating over it, so the site carries on loading its fonts. The library itself starts empty — restore it from Import & export.

== Changelog ==

= 0.36.1 =
* Fixed: the WebAssembly module could not load in a browser at all, so font conversion, the WOFF2 decoder and the metrics reader were all dead in 0.36.0. The decoder had added an import the glue leaves undefined; building with NDEBUG removes it.
* Fixed: the build's smoke test ran in Node and passed on a binary browsers reject. It now checks the imports the way a browser does.
* Fixed: Generated CSS, Variants and Add variant were missing from every Google family's editor, because the panel threw partway through drawing it.
* Fixed: the Font Manager restyled its own headings, because the panel injected the site stylesheet into the builder as well as the canvas.
* Fixed: Etch's settings-bar tooltips were hidden behind the panel.
* Fixed: the Apply to field was hard to type in, and a font read that could not answer waited two minutes instead of twenty seconds.
* Changed: Override theme styles stays visible and disabled when Apply to is empty, and a family's typography role now reads as a badge rather than plain text.

= 0.36.0 =
* Fixed: the typography tokens were restyling the Etch builder interface itself. The builder shell and the block editor now get the font declarations without the rules that paint a page; the canvas and the front end are unchanged.
* Fixed: the Google weights row removed weights. Unticking one and pressing Download selection downloaded nothing and deleted it. Installed weights are locked, the row only adds, and the button counts what it will fetch.
* Fixed: variable axis sliders were shown for static installs, because the axes were read from Google's catalogue rather than from the files actually installed.
* Fixed: Apply to now refuses any selector a typography token already covers, whichever family holds it. A second family naming h1 used to silently win.
* Fixed: the warnings under Apply to update as you type instead of sitting stale.
* Fixed: a disabled family counted as holding its token in the panel but not in the stylesheet, so the two disagreed about what was written.
* Fixed: the panel sat below overlays painted by other plugins and is now above them, while staying below Etch's own menus and toasts.
* Added: the WOFF2 decoder, so a variable font uploaded already compressed gets its axes read.
* Added: reading the axes of files already on the server, for families installed before the panel could open their format.
* Added: an optional metric-matched fallback per family, so text does not shift when the web font arrives.
* Changed: the format filter on Font files shows even when there is only one format, and an already-installed Google weight is ticked.

= 0.35.0 =
* Fixed: the typography tokens never did anything. Ticking a role declared a custom property and left the rule that uses it to Automatic.css, which only writes one when its Typography section is configured. The block now carries the rule too, on the same selectors ACSS uses.
* Fixed: the block meant to load after Automatic.css never did, so it could not have won the cascade it was written to win. It no longer depends on another plugin's timing.
* Fixed: files belonging to a trashed or disabled family said they were in use. Three states now: in use, not loaded, unused. Nothing new became deletable.
* Fixed: a select-all in one file table could report and clear the selection in the others.
* Fixed: Apply to no longer writes a selector the family's own typography role already covers.
* Added: a search field and format filter chips on Font files, and a select-all in each table head.
* Added: a notice on the Plugins screen when Etch is not active, since the panel opens from the Etch Settings Bar and nowhere else.
* Changed: the unlabelled select-all checkbox that floated above the grids is now a Select all button in the bulk bar.
* Changed: taking a typography token from another family warns under the toggle instead of in a toast. Discard puts it back.

= 0.34.1 =
* Fixed: the Font Manager control never appeared in 0.34.0. A list the settings fingerprint depends on was declared below the code that reads it, so the panel script threw before registering its control and the plugin could not be opened.
* Fixed: CI now boots the panel rather than only parsing it, so a script that loads and immediately throws fails the build.

= 0.34.0 =
* Added: uploaded variable fonts get their axes. The panel reads them from the file at upload, which is the only moment it can, since converting to WOFF2 happens before anything is sent.
* Added: a family can be published as the site's heading or body font, writing the typography tokens Etch documents and Automatic.css reads. Each token belongs to one family.
* Added: multi-select and bulk move to trash on the Font library.
* Added: font files are grouped by where they came from, because the right answer to "can I delete this" differs by group.
* Added: the save bar names both families when a typography token changes hands, and the Apply to field names any other family writing a rule for the same selector.
* Changed: Library is now Font library, and Upload fonts is now Font files. That screen has always listed every file in the fonts folder, most of them not uploads.
* Changed: Settings joined the save bar. It no longer commits on its own, so a changed toggle is an unsaved change like any other.
* Changed: variable axes moved directly under the preview, and unused files moved to the Font files screen beside the group that already listed them.
* Changed: sixteen failure messages replaced one generic line, and each copy button names what it copied.
* Fixed: dragging a variable axis rewrote the stylesheet and marked the panel unsaved while the preview never moved.
* Fixed: deleting a font file left the family behind with no variants, still named and still publishing a CSS variable while generating nothing.
* Fixed: the Settings screen said "Fonts saved." and its button read "Save fonts", and its Removal toggle updated nothing but itself.
* Fixed: card buttons stood at two heights with two glyph sizes, and axis names read "wdth wdth" unless Google Fonts had been opened first.

= 0.33.0 =
* Added: a variable font keeps the instance you tune. Installing records the family's axes, the family editor offers the same sliders the type tester does, and the tuning is written to the stylesheet instead of having to be copied out by hand.
* Added: converting shows what it did, original beside result, in the same shape Etch's Asset Manager reports a compression.
* Added: Settings has a Conversion option to delete the original once a font has been converted. Off by default, and it never deletes a file another family still uses.
* Fixed: exporting included families you had put in the Trash, and did so by default.
* Fixed: delete buttons looked like any other button. Every delete in the panel now matches the confirmation dialog's own Delete.
* Fixed: selecting a family in the Trash showed nothing but a ticked checkbox.
* Fixed: the preview script chips crowded the toolbar on the Google Fonts screen. They collapse past six now, and the preview field and size slider keep the first row.
* Fixed: the import preview ran together as one block of text.
* Fixed: a long name in a dropdown pushed the value out of the menu instead of shortening.
* The size slider is labelled, actions that free disk say how much they would free, and toolbar controls are all one height.

= 0.32.0 =
* Fixed: deleting the plugin used to keep your font files but delete the stylesheet that declares them, which broke the site's typography anyway. Everything in wp-content/fonts is left alone now, and Import & export shows the one line that keeps it loading without the plugin.
* Fixed: a disabled family previewed in the wrong typeface, because disabling removes it from the stylesheet the preview reads from.
* Fixed: Reset axes never became clickable, however far the sliders were moved.
* Fixed: the Google Fonts count read "24 of 1942" on every page but the last. It shows the range you are looking at now.
* Fixed: reinstalling the plugin regenerated the kept stylesheet from nothing.
* You cannot upload the same font twice. It used to land beside itself under a random suffix.
* Uploaded files, the Trash and the variants table can all be multi-selected, for converting, deleting, restoring or removing together.
* Font files already sitting on the server can be taken into the library in one click, from the library's empty state or from the Upload screen.
* Settings has a Removal option: deleting the plugin can also delete the font files your families use. Off by default, and it never touches files it did not put there.
* Converting a file now says which original it left unused, and the file list names both states rather than only "in use".
* New icons throughout, count badges are properly round, and the Fallback stack field behaves like the dropdowns beside it.
* The preview script buttons now follow the fonts you have installed, each labelled in its own script, instead of a fixed Latin/Sinhala/Tamil row.

= 0.31.0 =
* Fixed: installing a Google font quietly threw away every unsaved change in the panel. It now asks, and can save your work first instead of only offering to lose it.
* Fixed: the save bar could stay lit after you undid an edit by hand. It compares against the last saved copy now rather than remembering that something once changed.
* Fixed: the tooltip explaining why an already-converted file cannot be converted again was drawn at 30% and read through the row beneath it.
* Fixed: Download selection was clickable on families where it could only re-download identical files. It says which reason applies instead.
* Closing the panel no longer asks anything. Your changes are kept, and the warning moved to leaving the builder, which is where they were actually being lost.
* Families now record whether they came from Google Fonts or an upload, so deleting one can offer to remove its files when they are a click from coming back.
* A confirmation now marks the family, row or files it is about to delete, the way Etch's Asset Manager does.
* The Fallback stack field opens its suggestions when you click anywhere in it, and the arrow is no longer a separate control.
* Every dialog is down to two buttons.
* A button inside a section box keeps its own width instead of stretching across the panel.

= 0.30.0 =
* Fixed: a font could be converted to WOFF2 again after it had already been converted, redoing the work to overwrite the file it produced last time. The button now names the file holding the result instead.
* Fixed: the generated CSS preview labelled every file as WOFF2, so a .ttf was shown as format("woff2"). The stylesheet itself was always correct; only the preview was wrong.
* Fixed: the preview also showed rules for files that are not on the server, which the real stylesheet leaves out.
* The Fallback stack field no longer opens a browser-drawn list. It is the panel's own menu now, and still accepts any stack you type.
* Deleting a family permanently, or emptying the trash, can now delete its font files too. It is off by default, lists only files no other family uses, and runs after the delete is saved.
* Confirmations that delete files say so plainly: the Trash holds families, not files.
* The delete button in a confirmation now has a hover state.
* The family name in Manage font gets the same heading rule as everywhere else.
* Unused files fill the width of the confirmation they appear in.
* Discard has its border back, and both buttons sit beside the message rather than at the far corner.
* Converting now says what it is converting to.

= 0.29.0 =
* Fixed: importing a configuration exported without the font files produced families that looked installed and loaded nothing. The stylesheet no longer writes rules for files that are not on the server, and any family missing its files now says so in the Library.
* Fixed: the Google Fonts search dropped characters and threw the cursor backwards if you kept typing while it searched.
* Fixed: the "None" button in Export did nothing. Deselecting the last family silently reselected them all.
* Fixed: the cross in the clear button sat off centre in the Library filter and the Google Fonts search, and stayed dim when hovered.
* Confirmation dialogs now match Etch's own, including the icon in the heading and two equal buttons across the foot.
* A confirmation that lists file names now shows them as a list rather than as more sentences.
* Unused files in Import & export are shown in a proper block instead of unstyled text.
* The save bar says what is unsaved -- which family, and what changed about it -- instead of "Unsaved changes", and Discard no longer competes with Save fonts.
* The family name in the type tester gets the same heading rule as every other heading.
* Primary buttons hover to Etch's --e-base-light.

= 0.28.0 =
* The Width and Weight sliders in the type tester have been rebuilt to match Etch's own slider, and are no longer painted in the accent colour.
* Each axis now shows its value over its own track, its range under the two ends of it, and its default as a small tick, instead of a line of small print.
* "Reset axes" sits with the sliders it resets, and is greyed out until an axis has been moved.
* A family name on a Google Fonts card no longer turns yellow and underlined under the pointer; it brightens and shows an arrow, and its tooltip is the panel's own rather than the browser's.
* "View on Google Fonts" is a proper button beside Install, not a browser-blue link stranded at the bottom of the panel.
* Trash is always in the sidebar now, so a family you deleted can be found without having to remember it is there.
* The Library and Trash screens answer with a full empty state, like the Upload screen already did, and the Library offers both ways to add a font rather than one.
* Sections in Import & export have more room inside them.
* Fixed: hovering a primary button turned it the same colour as the pane behind it, so it seemed to disappear. Measured at 1.24:1 against the background; it is now 6.07:1.
* Fixed: the clear button inside a filter field lit up brighter than the identical buttons beside it.
* The Loading behaviour menu is capitalised.

= 0.27.0 =
* Confirmation dialogs now match the builder instead of being your browser's grey system boxes.
* Save and Discard moved to the bottom of the panel, next to where you are working, and the save now reads "Save fonts" so it is not confused with Etch's own Save button.
* The Upload screen has been rebuilt to match Etch's Assets Library, including the supported formats.
* Google Fonts now pages through results instead of piling them up behind a "Load more" button.
* Every text field can be cleared with a button inside it: preview text, the library filter and the Google Fonts search.
* Fixed: tooltips on the last row of a table were cut in half by the table's own edge.
* Tables have separators between columns, and the Weights and Subsets rows on a font card now line up.
* No change to your fonts, settings or stored data.

= 0.26.0 =
* Uploading a font now creates its family in the library for you, with the weights and styles already mapped, instead of leaving you to build it by hand.
* Fixed: in the family editor the font preview and the variants table could render with no height at all, so they looked missing. They were being squashed by the panel's own layout.
* Opening a font from Google Fonts and pressing back now returns you to where you were in the list, and "Load more" no longer jumps you to the top.
* Messages now appear at the top of the screen the way Etch's own do, coloured by what they are: green for done, red for a problem, amber for a partial result. They can be dismissed, and hovering pauses the timer.
* Every dropdown is now drawn by the panel instead of by your operating system, so they match the builder and can be used from the keyboard.
* Section headings have a separator under them, so sections no longer run together.
* The CSS variable is shown as a value to copy, with a copy button, rather than as a text box you cannot type in.
* No change to your fonts, settings or stored data.

= 0.25.0 =
* Fixed: typing in the Library filter or the Google Fonts search lost the cursor after a moment, so you had to click back into the field to keep typing.
* Back buttons now look and behave like the ones in Etch's own managers, and the ones inside the panel say where they take you: "Back to Library", "Back to Google Fonts".
* Searching for something with no matches now shows what you searched for, in the middle of the panel, the way the Asset Manager does.
* Tooltips on every icon button and on the options that needed an explanation.
* Clicking into a text field no longer draws a blue focus ring around it. Tabbing to it still does.
* The Compact layout is gone; Row and Grid remain. If you had Compact selected, you will see Grid.
* Tidier sidebar and cards: no "Manage" heading, a little more room between menu items, and a roomier "Disabled" badge.
* Version numbers move to a 0.x series while the plugin is still in testing. 1.0.0 will be the first public release.
* No change to your fonts, settings or stored data.

= 0.24.1 =
* Fixed: in the grid layout the preview text was cut off mid-word. It now wraps to two lines, and cards still line up with each other.
* Fixed: the "Variable" option had lost its styling and was rendering across two lines with its explanation repeated on every card. It is one line now, with the explanation on hover.
* No change to behaviour, settings or stored data.

= 0.24.0 =
* Google Fonts now loads behind placeholder cards instead of collapsing to a line of text and jumping when results arrive.
* Messages like "Inter installed" appear as a small toast at the bottom of the panel rather than as small print in the header, where they were easy to miss.
* Searching for something with no matches now offers a Reset all button instead of leaving you at a dead end.
* Fixed: the reduced-motion setting only stopped transitions, not animations, so the new loading pulse would have kept moving for anyone who had asked for less motion.
* No change to behaviour, settings or stored data.

= 0.23.0 =
* Font cards line up. Long lists of subsets or weights now collapse behind a "+18" you can open, so one family with twenty-five subsets no longer leaves every card beside it half empty. Anything you have selected stays visible.
* Card footers sit at the bottom of each card, so a row of them reads evenly instead of ragged.
* Install is a quieter outline button. The accent colour is kept for the one main action on a screen, which on Google Fonts is the bulk install bar once you pick families.
* A disabled family is marked with a small badge beside its name instead of a full-width notice that pushed the preview out of line.
* Settings and Import & export are grouped into boxes, one per concern, instead of one long run of controls.
* No change to behaviour, settings or stored data.

= 0.22.0 =
* The Google Fonts toolbar is one row instead of two. Category, writing system, technology and sort moved into a Filters popover with a badge showing how many are active; search, layout, preview text and size stay on the surface.
* The panel's content area now matches Etch's own managers: a bordered pane with cards, table headers and boxes raised on top of it, rather than the other way round.
* Sidebar sections show a count badge, styled the way Etch styles its own, and the three figures at the bottom are now stat cards with icons.
* Help text no longer runs the full width of the builder.
* The primary button's hover is softer.
* No change to behaviour, settings or stored data.

= 0.21.0 =
* The panel's colours, spacing, typography and motion now come from one declared set of Etch tokens instead of a mix of tokens and hardcoded values.
* The active section in the sidebar is marked the way Etch marks it, with a raised fill and near-white text, rather than flooded with the accent colour. Same for the layout toggle and the subset chips.
* Section headings match Etch's own: 13px semi-bold, with no uppercasing and no added letter spacing.
* Buttons and inputs now match Etch's measurements for height, padding, corner radius, icon spacing and transition timing.
* Fixed: the quiet "ghost" button style had no rule at all, so Reset all, Clear and Load more rendered as filled buttons by mistake.
* Fixed: Load more was never full width, the conversion log's error colour fell back to a hardcoded red, and the input corner radius never tracked Etch's radius token.
* No change to behaviour, settings or stored data.

= 0.20.0 =
* Every icon in the manager is redrawn on Etch's own grid: 24x24 at 1.5 stroke, rendered at 16px, so the strokes now match the icons Etch draws in Content Hub and Asset Manager instead of looking heavier than them.
* Fixed: the Import & export icon never rendered at all, because the view asked for an icon that had never been defined.
* Manage, Restore, Restore all, Reset axes, Reset all, Clear and Empty trash now have icons. Their labels are unchanged.
* The Row / Grid / Compact toggle shows an icon beside each label. The labels stay, because the three layouts are not obvious from a glyph alone.
* Icon buttons and the spacing between a button's icon and its label now match Etch's own measurements instead of hardcoded values.
* No change to behaviour, settings or stored data.

= 0.19.4 =
* Fixed: the back button tooltip was partly hidden behind the Settings Bar, which paints above the panel. The panel is now lifted above the bar only while that tooltip is showing, so Etch's own Settings Bar tooltips are unaffected.

= 0.19.3 =
* The back button tooltip now sits below the button and centred on it, matching Etch's own, instead of off to the side.

= 0.19.2 =
* Fixed: the Settings Bar icon stayed looking active after the panel closed, so two buttons appeared active at once.
* Fixed: clicking the back button popped the "Font Manager" tooltip over the builder. Same cause as above, since Etch styles those buttons on focus and opens their tooltips on focus.
* Focus now returns to the control only when the panel is closed from the keyboard, which is the case that needs it.
* The back button has a proper tooltip matching the ones Etch renders, instead of the slow browser default.

= 0.19.1 =
* The Settings Bar control and the panel heading now read "Font Manager", matching how Content Hub, Asset Manager, Style Manager and Loop Manager name themselves.
* The back button says "Back to Builder" instead of "Close".
* Fixed: opening another Settings Bar manager now closes the Font Manager instead of leaving it on top with two buttons selected. The reverse case is fixed too, so exactly one panel is open at a time.

= 0.19.0 =
* WOFF files now convert to WOFF2 as well, so all four accepted formats behave the same way. Previously dropping three files could convert two and silently skip the third.
* Typical saving is 17 to 23%: Inter 21,420 to 16,708 bytes, Roboto 20,344 to 15,744. Smaller than for TTF and OTF because WOFF is already compressed.
* No extra download. The WOFF is unwrapped back to TTF or OTF using the browser's own DecompressionStream, then compressed by the existing converter.
* The unwrap is byte-exact, verified by round-tripping a font through WOFF and back with no change.
* A damaged WOFF is reported as damaged and the original file is uploaded instead.

= 0.18.0 =
* Drop a .ttf or .otf on the Upload screen and it is converted to WOFF2 before uploading, typically 30 to 65% smaller. Source Code Pro went 205 KB to 72 KB from TTF and 128 KB to 74 KB from OTF.
* Files already on the server get a Convert action, and every family variant mapping the old file is repointed at the new one automatically.
* Conversion runs entirely in your browser using google/woff2 compiled to WebAssembly. No font is ever sent to a third party, and the conversion is lossless: variable axes, named instances and OpenType features all survive.
* If a browser or a strict Content-Security-Policy cannot run the converter, the toggle is hidden and uploads behave exactly as before.

= 0.17.0 =
* BREAKING: the Automatic.css mapping is gone. The plugin no longer writes --heading-font-family or --text-font-family. Set them in Automatic.css itself using the per-family variable, for example --heading-font-family: var(--efm-family-inter).
* The Theme section is now called Settings and holds only stylesheet delivery and the privacy option.
* Removed everything the mapping was propping up: the live type sample, the heading/text role chips, and the warnings about disabling a family that was "assigned".

= 0.16.0 =
* Click a family to open a type tester with live sliders for every variable axis it has, named properly (Weight, Optical Size, Grade) rather than raw tags.
* Fixed non-Latin families installing with latin only. Gemunu Libre or Noto Sans Sinhala installed in one click previously shipped no Sinhala glyphs at all.
* Install controls now live in the type tester too, so you can audition a face and install it without going back.

= 0.15.0 =
* Row, Grid and Compact layouts for the Library and the Google Fonts browser, remembered between sessions.
* Filter Google Fonts by writing system, with a family count per script. Sinhala narrows 1,942 families to 8.
* Every family previews in its own script instead of a Latin pangram, with one-tap Sinhala, Tamil and numeral presets.
* Filter to variable or static families, and sort by Trending or Newest.
* Select several families and install them in one action.
* Cards now show the designers, the family size and the variable axis count.

= 0.14.0 =
* Fixed preload doing nothing for families without a regular weight, or with a narrow variable axis such as 400-900. The variable case was a regression from 0.8.0.
* Inline CSS is now cached instead of being rebuilt on every page load.
* Added a behavioural test suite that runs in continuous integration.
* Added an override option for selector rules, Restore all and Empty trash, and a size guard on bundled imports.

= 0.13.0 =
* Export only the families you choose, and optionally bundle the font files with them.
* Importing now previews what would be added, overwritten and removed before anything is written.
* Bundled font files are validated by their signature before being written; a disguised payload is rejected.

= 0.12.0 =
* Choose inline or external delivery for the generated stylesheet, see when it was last built and regenerate it on demand.
* New privacy setting blocks Google Fonts loaded by any other theme or plugin, including their preconnect hints.
* Apply a family to your own CSS selectors without writing the rule yourself.
* The family editor now shows the CSS each family generates.

= 0.11.0 =
* Importing a configuration can now download the missing font files for any family that came from Google Fonts, reusing the same subsets and weights it had before.
* Hand-uploaded families are excluded from that offer, since there is nowhere to fetch them from.

= 0.10.0 =
* Disable a family without deleting it. A disabled family produces no CSS, no custom property and no preload, but keeps its files and mapping.
* Deleting a family now moves it to a trash you can restore from, with a separate Delete permanently action.
* Disabling or trashing a family assigned as the heading or text font warns first.

= 0.9.0 =
* Every font family is now published as a CSS custom property, so a family can be used as var(--efm-family-slug) anywhere a font family is expected.
* The value includes the family's fallback stack, and the family editor shows the variable for quick copying.

= 0.8.0 =
* Choose which weights and italics to download when installing a Google font, instead of always getting all eighteen. A latin install of Inter now downloads two files rather than eighteen.
* Change the selection later from the family editor, without searching the library again.
* List and delete font files that no family uses.
* Fixed variable families with a narrower axis than 100-900 having their font-weight rewritten to 400.

= 0.7.3 =
* Use WP_Filesystem when moving a non-upload font file into place.

= 0.7.2 =
* Cleared the last coding standards violations. No functional change.

= 0.7.1 =
* Fixed coding standards violations reported by continuous integration. No functional change.

= 0.7.0 =
* Added import and export of the whole font configuration as JSON, with replace or merge modes and a missing-file report.
* Added translation support and a POT file.
* Fixed outline buttons having an invisible border on the content surface.
* Keyboard focus is now trapped inside the manager while it is open.

= 0.6.0 =
* Browse the whole Google Fonts library with category and sort filters and paging.
* Install variable fonts as one file per subset instead of one per weight.
* Specimen previews now load lazily as cards scroll into view.

= 0.5.0 =
* Added per-family loading behaviour (font-display), preload and fallback stack controls.
* Automatic.css variables now receive a full font stack instead of a bare family name.

= 0.4.0 =
* Update checks read a manifest from the raw CDN instead of the GitHub API, so sites sharing an outbound IP are not blocked by the API rate limit.
* A failed lookup no longer discards a release that was already known.
* Update packages are only accepted from this repository's releases.
* Default cache raised to six hours; manual and forced checks still bypass it.

= 0.3.5 =
* Fixed the update notice remaining visible after the plugin had already been updated.
* A stale update entry is now corrected on read instead of lingering.
* Release lookups are cached for ten minutes, so new releases appear on their own, with a filter to tune the window.

= 0.3.4 =
* Restored the Check for updates plugin row link. It is the reliable way to pick up a release immediately; 0.3.3 is superseded.

= 0.3.3 =
* Removed the Check for updates plugin row link, now redundant with the WordPress Updates screen.

= 0.3.2 =
* A forced update check now bypasses the plugin's release cache, so Check again picks up a release immediately.

= 0.3.1 =
* Added a Check for updates link to the plugin row.

= 0.3.0 =
* Added updates from GitHub releases, so new versions install from the normal WordPress Updates screen.
* Release notes appear in the plugin details modal.
* Added the Update URI header and filters to repoint or disable updates.

= 0.2.0 =
* Fixed: Google Fonts installs downloaded only the latin subset, so Sinhala, Tamil, Cyrillic, Greek and Vietnamese families installed without their glyphs.
* Added subset selection with unicode-range output, and a reinstall action to add subsets later.
* Weight and style are now detected from font file names on upload.
* Added guards for unsaved changes, removing an assigned family, and deleting a file still in use.

= 0.1.0 =
* Rebuilt as a full-screen font manager matching Etch's native manager pattern.
* Library, Upload fonts, Google Fonts and Theme sections with an inner navigation column.
* Specimen grids with editable preview text and a size slider.
* The Fonts control now sits with Etch's other managers at the top of the Settings Bar.

= 0.0.4 =
* Fix a builder-breaking conflict: the canvas stylesheet was registered twice, producing duplicate keys in Etch's canvas stylesheet list and freezing the builder.
* Only update the canvas stylesheet link Etch owns, never replace it.
* Remove the 0.0.3 DOM fallback control in favour of the official Controls API.

= 0.0.3 =
* Detect the Etch 1.6.4 external-controls renderer regression and use a guarded native DOM fallback.
* Keep healthy Etch installations on the official Controls API path.

= 0.0.2 =
* Use file modification times for builder assets so hotfixes never remain cached.
* Add a URL-scoped diagnostic bypass for isolating third-party Settings Bar integrations.

= 0.0.1 =
* Wait for the mounted Etch Settings Bar before registering the Fonts control.
* Prevent duplicate control IDs when builder assets are evaluated more than once.
* Use the shared wp-content/fonts directory so legacy font files load correctly.

= 0.0.0 =
* Initial release.
