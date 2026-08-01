=== Etch Font Manager ===
Contributors: donkanishka
Tags: fonts, etch, google fonts, typography, automatic.css
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Manage self-hosted custom fonts directly inside the Etch builder, with a native Fonts panel in the Settings Bar.

== Description ==

Etch Font Manager adds a Fonts control to the Etch builder Settings Bar using Etch's official Controls API. Upload font files, install Google Fonts locally, map families to weights and styles, and wire them into Automatic.css without leaving the builder.

Features:

* Native Settings Bar control, placed after the dark mode toggle by default
* Docked panel styled from Etch's own design tokens
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

= 1.0.0 =
* Initial release.
