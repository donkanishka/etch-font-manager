=== Etch Font Manager ===
Contributors: donkanishka
Tags: fonts, etch, google fonts, typography, automatic.css
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.20.0
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

Plugin options and the generated stylesheet are removed. Your uploaded font files are kept.

== Changelog ==

= 1.20.0 =
* Every icon in the manager is redrawn on Etch's own grid: 24x24 at 1.5 stroke, rendered at 16px, so the strokes now match the icons Etch draws in Content Hub and Asset Manager instead of looking heavier than them.
* Fixed: the Import & export icon never rendered at all, because the view asked for an icon that had never been defined.
* Manage, Restore, Restore all, Reset axes, Reset all, Clear and Empty trash now have icons. Their labels are unchanged.
* The Row / Grid / Compact toggle shows an icon beside each label. The labels stay, because the three layouts are not obvious from a glyph alone.
* Icon buttons and the spacing between a button's icon and its label now match Etch's own measurements instead of hardcoded values.
* No change to behaviour, settings or stored data.

= 1.19.4 =
* Fixed: the back button tooltip was partly hidden behind the Settings Bar, which paints above the panel. The panel is now lifted above the bar only while that tooltip is showing, so Etch's own Settings Bar tooltips are unaffected.

= 1.19.3 =
* The back button tooltip now sits below the button and centred on it, matching Etch's own, instead of off to the side.

= 1.19.2 =
* Fixed: the Settings Bar icon stayed looking active after the panel closed, so two buttons appeared active at once.
* Fixed: clicking the back button popped the "Font Manager" tooltip over the builder. Same cause as above, since Etch styles those buttons on focus and opens their tooltips on focus.
* Focus now returns to the control only when the panel is closed from the keyboard, which is the case that needs it.
* The back button has a proper tooltip matching the ones Etch renders, instead of the slow browser default.

= 1.19.1 =
* The Settings Bar control and the panel heading now read "Font Manager", matching how Content Hub, Asset Manager, Style Manager and Loop Manager name themselves.
* The back button says "Back to Builder" instead of "Close".
* Fixed: opening another Settings Bar manager now closes the Font Manager instead of leaving it on top with two buttons selected. The reverse case is fixed too, so exactly one panel is open at a time.

= 1.19.0 =
* WOFF files now convert to WOFF2 as well, so all four accepted formats behave the same way. Previously dropping three files could convert two and silently skip the third.
* Typical saving is 17 to 23%: Inter 21,420 to 16,708 bytes, Roboto 20,344 to 15,744. Smaller than for TTF and OTF because WOFF is already compressed.
* No extra download. The WOFF is unwrapped back to TTF or OTF using the browser's own DecompressionStream, then compressed by the existing converter.
* The unwrap is byte-exact, verified by round-tripping a font through WOFF and back with no change.
* A damaged WOFF is reported as damaged and the original file is uploaded instead.

= 1.18.0 =
* Drop a .ttf or .otf on the Upload screen and it is converted to WOFF2 before uploading, typically 30 to 65% smaller. Source Code Pro went 205 KB to 72 KB from TTF and 128 KB to 74 KB from OTF.
* Files already on the server get a Convert action, and every family variant mapping the old file is repointed at the new one automatically.
* Conversion runs entirely in your browser using google/woff2 compiled to WebAssembly. No font is ever sent to a third party, and the conversion is lossless: variable axes, named instances and OpenType features all survive.
* If a browser or a strict Content-Security-Policy cannot run the converter, the toggle is hidden and uploads behave exactly as before.

= 1.17.0 =
* BREAKING: the Automatic.css mapping is gone. The plugin no longer writes --heading-font-family or --text-font-family. Set them in Automatic.css itself using the per-family variable, for example --heading-font-family: var(--efm-family-inter).
* The Theme section is now called Settings and holds only stylesheet delivery and the privacy option.
* Removed everything the mapping was propping up: the live type sample, the heading/text role chips, and the warnings about disabling a family that was "assigned".

= 1.16.0 =
* Click a family to open a type tester with live sliders for every variable axis it has, named properly (Weight, Optical Size, Grade) rather than raw tags.
* Fixed non-Latin families installing with latin only. Gemunu Libre or Noto Sans Sinhala installed in one click previously shipped no Sinhala glyphs at all.
* Install controls now live in the type tester too, so you can audition a face and install it without going back.

= 1.15.0 =
* Row, Grid and Compact layouts for the Library and the Google Fonts browser, remembered between sessions.
* Filter Google Fonts by writing system, with a family count per script. Sinhala narrows 1,942 families to 8.
* Every family previews in its own script instead of a Latin pangram, with one-tap Sinhala, Tamil and numeral presets.
* Filter to variable or static families, and sort by Trending or Newest.
* Select several families and install them in one action.
* Cards now show the designers, the family size and the variable axis count.

= 1.14.0 =
* Fixed preload doing nothing for families without a regular weight, or with a narrow variable axis such as 400-900. The variable case was a regression from 1.8.0.
* Inline CSS is now cached instead of being rebuilt on every page load.
* Added a behavioural test suite that runs in continuous integration.
* Added an override option for selector rules, Restore all and Empty trash, and a size guard on bundled imports.

= 1.13.0 =
* Export only the families you choose, and optionally bundle the font files with them.
* Importing now previews what would be added, overwritten and removed before anything is written.
* Bundled font files are validated by their signature before being written; a disguised payload is rejected.

= 1.12.0 =
* Choose inline or external delivery for the generated stylesheet, see when it was last built and regenerate it on demand.
* New privacy setting blocks Google Fonts loaded by any other theme or plugin, including their preconnect hints.
* Apply a family to your own CSS selectors without writing the rule yourself.
* The family editor now shows the CSS each family generates.

= 1.11.0 =
* Importing a configuration can now download the missing font files for any family that came from Google Fonts, reusing the same subsets and weights it had before.
* Hand-uploaded families are excluded from that offer, since there is nowhere to fetch them from.

= 1.10.0 =
* Disable a family without deleting it. A disabled family produces no CSS, no custom property and no preload, but keeps its files and mapping.
* Deleting a family now moves it to a trash you can restore from, with a separate Delete permanently action.
* Disabling or trashing a family assigned as the heading or text font warns first.

= 1.9.0 =
* Every font family is now published as a CSS custom property, so a family can be used as var(--efm-family-slug) anywhere a font family is expected.
* The value includes the family's fallback stack, and the family editor shows the variable for quick copying.

= 1.8.0 =
* Choose which weights and italics to download when installing a Google font, instead of always getting all eighteen. A latin install of Inter now downloads two files rather than eighteen.
* Change the selection later from the family editor, without searching the library again.
* List and delete font files that no family uses.
* Fixed variable families with a narrower axis than 100-900 having their font-weight rewritten to 400.

= 1.7.3 =
* Use WP_Filesystem when moving a non-upload font file into place.

= 1.7.2 =
* Cleared the last coding standards violations. No functional change.

= 1.7.1 =
* Fixed coding standards violations reported by continuous integration. No functional change.

= 1.7.0 =
* Added import and export of the whole font configuration as JSON, with replace or merge modes and a missing-file report.
* Added translation support and a POT file.
* Fixed outline buttons having an invisible border on the content surface.
* Keyboard focus is now trapped inside the manager while it is open.

= 1.6.0 =
* Browse the whole Google Fonts library with category and sort filters and paging.
* Install variable fonts as one file per subset instead of one per weight.
* Specimen previews now load lazily as cards scroll into view.

= 1.5.0 =
* Added per-family loading behaviour (font-display), preload and fallback stack controls.
* Automatic.css variables now receive a full font stack instead of a bare family name.

= 1.4.0 =
* Update checks read a manifest from the raw CDN instead of the GitHub API, so sites sharing an outbound IP are not blocked by the API rate limit.
* A failed lookup no longer discards a release that was already known.
* Update packages are only accepted from this repository's releases.
* Default cache raised to six hours; manual and forced checks still bypass it.

= 1.3.5 =
* Fixed the update notice remaining visible after the plugin had already been updated.
* A stale update entry is now corrected on read instead of lingering.
* Release lookups are cached for ten minutes, so new releases appear on their own, with a filter to tune the window.

= 1.3.4 =
* Restored the Check for updates plugin row link. It is the reliable way to pick up a release immediately; 1.3.3 is superseded.

= 1.3.3 =
* Removed the Check for updates plugin row link, now redundant with the WordPress Updates screen.

= 1.3.2 =
* A forced update check now bypasses the plugin's release cache, so Check again picks up a release immediately.

= 1.3.1 =
* Added a Check for updates link to the plugin row.

= 1.3.0 =
* Added updates from GitHub releases, so new versions install from the normal WordPress Updates screen.
* Release notes appear in the plugin details modal.
* Added the Update URI header and filters to repoint or disable updates.

= 1.2.0 =
* Fixed: Google Fonts installs downloaded only the latin subset, so Sinhala, Tamil, Cyrillic, Greek and Vietnamese families installed without their glyphs.
* Added subset selection with unicode-range output, and a reinstall action to add subsets later.
* Weight and style are now detected from font file names on upload.
* Added guards for unsaved changes, removing an assigned family, and deleting a file still in use.

= 1.1.0 =
* Rebuilt as a full-screen font manager matching Etch's native manager pattern.
* Library, Upload fonts, Google Fonts and Theme sections with an inner navigation column.
* Specimen grids with editable preview text and a size slider.
* The Fonts control now sits with Etch's other managers at the top of the Settings Bar.

= 1.0.4 =
* Fix a builder-breaking conflict: the canvas stylesheet was registered twice, producing duplicate keys in Etch's canvas stylesheet list and freezing the builder.
* Only update the canvas stylesheet link Etch owns, never replace it.
* Remove the 1.0.3 DOM fallback control in favour of the official Controls API.

= 1.0.3 =
* Detect the Etch 1.6.4 external-controls renderer regression and use a guarded native DOM fallback.
* Keep healthy Etch installations on the official Controls API path.

= 1.0.2 =
* Use file modification times for builder assets so hotfixes never remain cached.
* Add a URL-scoped diagnostic bypass for isolating third-party Settings Bar integrations.

= 1.0.1 =
* Wait for the mounted Etch Settings Bar before registering the Fonts control.
* Prevent duplicate control IDs when builder assets are evaluated more than once.
* Use the shared wp-content/fonts directory so legacy font files load correctly.

= 1.0.0 =
* Initial release.
