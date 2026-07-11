# Changelog

Stable format: each release records semantic version, release date, source commit, canonical algorithm version, proof schema version, added, changed, fixed, compatibility impact, and replay impact.

## [Unreleased]

- Development identity: `validator_version` is `development`.
- Canonical algorithm version: `merge-guard-v1`
- Proof schema version: `1.1.0`
- Compatibility range: `>=1.0.0 <2.0.0`

### Added
- Validator proof envelope and release-governance tooling are staged for the next compatible release; this branch must not identify itself as the already-published `v1.0.0` implementation.

### Compatibility impact
- Expected next release line: `v1.1.0` candidate because the proof envelope gains backward-compatible validator identity fields.

### Replay impact
- Canonical decision hashes remain bound to the validated merge object and enabled policies; development proofs use `validator_release_hash: null`.

## [1.0.0] - 2026-07-11

- Source commit: see `release/RELEASE_MANIFEST.json` `source_commit` for the reproducible release commit recorded by the manifest builder.
- Canonical algorithm version: `merge-guard-v1`
- Proof schema version: `1.0.0`

### Added
- Initial GitHub Action, CLI, tests, and library entrypoints using the canonical `validateMergeGuard(input) -> VALID | NULL -> proofFromDecision(decision) -> MERGE_GUARD_PROOF.json` runtime path.
- Initial release artifacts that existed at the immutable `v1.0.0` tag.

### Compatibility impact
- Compatible within `>=1.0.0 <2.0.0`; no Merge Guard validation outcome changes are intended.

### Replay impact
- Historical canonical decision hashes remain bound to the validated merge object and enabled policies. New proofs add validator identity for implementation provenance.
