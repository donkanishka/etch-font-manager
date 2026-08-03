=== Etch Font Manager ===
Contributors: donkanishka
Tags: fonts, etch, google fonts, typography, automatic.css
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.7.3
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Manage self-hosted custom fonts directly inside the Etch builder, with a native Fonts panel in the Settings Bar.

== Description ==

Etch Font Manager adds a Fonts control to the Etch builder Settings Bar using Etch's official Controls API. Upload font files, install Google Fonts locally, map families to weights and styles, and wire them into Automatic.css without leaving the builder.

Features:

* Native Settings Bar control, grouped with Etch's own managers
* Full-screen manager styled from Etch's own design tokens
* Drag and drop uploads for woff2, woff, ttf and otf
* Google Fonts search, preview and one-click local install
* Automatic.css mapping for --heading-font-family and --text-font-family
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
