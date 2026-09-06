# Multisite storage regression coverage

Run with PHP 7.4 or newer: `php tests/run.php`. The existing entrypoint includes
`storage.php`; no dependencies or workflow changes are required. Storage tests
use real temporary files and small site-scoped WordPress stubs, not a live WP install.

## Storage contract

Single-site directory and URL are unchanged. Multisite, including blog 1, appends
`efm-sites/{blog_id}/` after both existing base-directory and URL filters. Filters
remain trusted server configuration and must point to corresponding locations.
Paths are resolved per call and the upgrade also runs on `switch_blog`.

Automatic upgrades run the storage migration independently of the plugin version.
A site-scoped snapshot of existing references is recorded once. Valid referenced
font files are copied, never moved; existing destinations are never overwritten.
Shared originals, unmapped files and the shared stylesheet are never modified.
Missing, linked or invalid source files remain missing rather than being adopted.
Failed destination writes retry from the snapshot, not subsequent library edits.
Copies are written and hash-verified in a locked staging file before atomic,
no-overwrite publication with link(). A retry replaces partial staging data and
recovers an interruption between publication and staging-name removal. Tests cover
failed writes, lock contention and that post-publication recovery. Filesystems must
support local locking and hard links; unsupported publication fails closed and retries.
The migration marker deliberately survives uninstall to prevent re-adoption of
shared files after reinstall. A filter-base change does not reset the marker:
operators must copy existing isolated storage when deliberately relocating it.

Linked namespace directories, linked files (including broken links), and hard-linked
multisite files are rejected by the common containment check. The configured base
may itself be a trusted symlink or mount. This does not sandbox malicious PHP filters
or an OS user concurrently replacing filesystem objects; those actors already have
server-level access. Filesystem check/use races cannot be eliminated by these PHP
path checks. Copying also requires local readable/writable filesystem access.

Uninstall retains existing current-site-only cleanup semantics. Opt-in purge reaches
only that site's isolated files; it never sweeps the network or shared legacy folder.
Unvisited sites migrate on their next request. Old hardcoded shared URLs keep working
because originals are retained, but future changes are published at the isolated URL.

Before release: run the suite plus PHP lint and PHPCS on PHP 7.4/8.3, regenerate POT
line references, and smoke-test a real multisite including automatic upgrades,
network activation, switching sites, custom paths and uninstall. PHP was unavailable
in the implementation sandbox; these tests have not been executed there.
