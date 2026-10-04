# Local bounded braces fork

This is a private SimAgents fork of the MIT-licensed `braces@3.0.3`, not an
upstream release. `3.0.4-simagents.1` identifies this local patched artifact.
The upstream JavaScript file hashes are retained in `upstream-hashes.json`.

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
has no published upstream fix as of 2026-10-04. Its recursive AST walkers can
exhaust the stack below the existing character limit. This fork bounds nested
patterns before parsing and iteratively validates AST depth/node count before
compile, expand and stringify, including direct internal-module callers.
The limits are 128 nested levels and 65,536 AST nodes. Complexity errors are
explicit (`BRACES_COMPLEXITY_LIMIT`); expansion/regex semantics are preserved
for ordinary patterns. Excessively nested literal/quoted patterns are also
rejected conservatively. No advisory is ignored in the audit.

Run `node --test scripts/braces-security.test.mjs` from the repository root.
The documentation's npm lockfile resolves every `braces` consumer to this
fork; CI installs from that lockfile, runs the regression and audits/builds
the documentation. Keep the original license and replace the fork with a
verified upstream fix when one becomes available.
