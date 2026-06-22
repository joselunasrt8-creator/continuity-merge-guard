# File Manifest

## Canonical source

- Repository: `joselunasrt8-creator/ContinuityOS-`
- Source path: `actions/continuity-merge-guard/`
- Source ref inspected: `main`
- Canonical source commit SHA: `0f31d1dbb1ea7a3b786ca848edef03c263536e66` (latest path-history commit inspected for `actions/continuity-merge-guard/` on `main`).

## Files copied / packaged

| Standalone path | Canonical source path | Purpose |
| --- | --- | --- |
| `action.yml` | `actions/continuity-merge-guard/action.yml` | Root GitHub Action metadata for Marketplace discovery and action execution. |
| `check.mjs` | `actions/continuity-merge-guard/check.mjs` | Canonical Merge Guard decision logic, proof artifact writer, outputs, and fail-closed CLI entrypoint. |
| `canonical.mjs` | `actions/continuity-merge-guard/canonical.mjs` | Deterministic canonicalization and SHA-256 implementation. |
| `attribution.mjs` | `actions/continuity-merge-guard/attribution.mjs` | Canonical Agent Identity attribution metadata classification. |
| `test.mjs` | `actions/continuity-merge-guard/test.mjs` | Canonical fixture-based conformance test harness. |
| `fixtures/*.json` | `actions/continuity-merge-guard/fixtures/*.json` | Local conformance fixtures for VALID/NULL, policy, attribution, and deterministic hash checks. |
| `README.md` | `actions/continuity-merge-guard/README.md` plus Marketplace adaptation | Root documentation with required Marketplace install path. |
| `LICENSE` | Existing standalone repository root | Root Apache-2.0 license. |
| `docs/FILE_MANIFEST.md` | New standalone packaging document | Extraction manifest and verification notes. |

## Intentional adaptations

- `action.yml` is kept at repository root for GitHub Marketplace compatibility.
- Runtime path is adapted from nested source execution to root execution: `node "${{ github.action_path }}/check.mjs"`.
- Marketplace metadata is preserved at root: action name, description, branding, and README install example using `joselunasrt8-creator/continuity-merge-guard@v1`.
- The previous invented `src/merge-guard.sh` keyword heuristic was removed; runtime behavior is Node-based canonical identity evaluation.

## Dependency notes

- Runtime: Node.js on the GitHub-hosted runner.
- Action dependency: `actions/upload-artifact@v4` for `MERGE_GUARD_PROOF` artifact upload.
- No npm package install, package manager, compiled `dist`, or external network dependency is required by the action logic.

## Verification

- Canonical source path located in the public repository browser view at `joselunasrt8-creator/ContinuityOS-/actions/continuity-merge-guard/`.
- Runtime files reconciled to the canonical Node implementation (`check.mjs`, `canonical.mjs`, `attribution.mjs`) instead of the previous shell reimplementation.
- Tests run locally:
  - `ruby -e 'require "yaml"; data=YAML.load_file("action.yml"); raise unless data["runs"]["using"] == "composite"; raise unless data["name"] == "ContinuityOS Merge Guard"'`
  - `node --check check.mjs`
  - `node --check canonical.mjs`
  - `node --check attribution.mjs`
  - `node test.mjs`
  - root action CLI smoke checks for `VALID` and `NULL` paths.
