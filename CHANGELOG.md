# Changelog

Stable format: each release records semantic version, release date, source commit, canonical algorithm version, proof schema version, added, changed, fixed, compatibility impact, and replay impact.

## [Unreleased]

- No unpublished changes after the v1.1.1 corrective release-candidate handoff.

## [1.1.1] - 2026-07-12

- Source tree: recorded in `release/RELEASE_MANIFEST.json` and `release/manifests/v1.1.1.json` as the deterministic release-content tree.
- Release manifest: `release/RELEASE_MANIFEST.json`; archived copy `release/manifests/v1.1.1.json` is committed with the finalized release content.
- Canonical algorithm version: `merge-guard-v1`
- Proof schema version: `1.1.0`
- Compatibility range: `>=1.0.0 <2.0.0`

### Fixed
- Corrected archived `v1.0.0` provenance metadata and verification assertions to match the exact immutable tag target `bbc8ad7eb48645530542db85eb12a6c26b461404`.
- Documented that the exact historical `v1.0.0` tag was not moved and must remain unchanged while the corrective `v1.1.1` release and floating `v1` verification carry the provenance fix forward.

### Compatibility impact
- Compatible within `>=1.0.0 <2.0.0`; compatibility-sensitive identifiers are preserved and `merge-guard-v1` is not renamed.
- `v1.0.0` remains the immutable historical pre-StateGate release bound to `bbc8ad7eb48645530542db85eb12a6c26b461404`; this release corrects repository metadata without moving that exact tag.

### Replay impact
- Release provenance replay now validates the actual historical `v1.0.0` tag target rather than the previously archived false commit assertion.
- Runtime VALID/NULL decision semantics are unchanged.

## [1.1.0] - 2026-07-12

- Source tree: recorded in `release/RELEASE_MANIFEST.json` and `release/manifests/v1.1.0.json` as the deterministic release-content tree.
- Release manifest: `release/RELEASE_MANIFEST.json`; archived copy `release/manifests/v1.1.0.json` is committed with the finalized release content.
- Canonical algorithm version: `merge-guard-v1`
- Proof schema version: `1.1.0`
- Compatibility range: `>=1.0.0 <2.0.0`

### Added
- First exact release under the StateGate identity with canonical validator metadata finalized as `validator_name: stategate` and `validator_version: 1.1.0`.
- Canonical PR diff binding and review approval binding in deterministic proof output, preserving the validated object as the executed object.
- Deterministic proof and validator identity fields for release provenance while preserving `MERGE_GUARD_PROOF.json`, `MERGE_GUARD_PROOF`, `MERGE_GUARD-`, and `MERGE_GUARD_*` compatibility identifiers.
- Release manifests and verification tooling for deterministic file hashes, published tag/content-tree matching, changelog/version matching, runtime hash checking, and v1.0.0 provenance checks.
- Marketplace identity finalized as `Continufy StateGate` without claiming that Marketplace rendering has been observed for this release.
- Deterministic consumer VALID and NULL fixtures for replay of accepted and rejected consumer workflow states.
- Post-release verification and rollback procedures for exact `v1.1.0`, floating `v1`, Marketplace rendering, consumer workflows, and rollback of `v1` without moving `v1.1.0`.

### Changed
- Release metadata moved from development identity to `validator_version: 1.1.0`; `canonical_algorithm_version: merge-guard-v1`, `proof_schema_version: 1.1.0`, and `compatibility_range: >=1.0.0 <2.0.0` are preserved.

### Compatibility impact
- Compatible within `>=1.0.0 <2.0.0`; compatibility-sensitive identifiers are preserved and `merge-guard-v1` is not renamed.
- `v1.0.0` remains the immutable historical pre-StateGate release bound to `bbc8ad7eb48645530542db85eb12a6c26b461404`; this release does not rewrite or reinterpret that provenance.

### Replay impact
- Canonical decision hashes remain bound to the validated state-transition object and enabled policies.
- Published proofs identify the deterministic validator identity and release hash rather than development metadata.

## [1.0.0] - 2026-07-11

- Source commit: `bbc8ad7eb48645530542db85eb12a6c26b461404`
- Release manifest: `release/manifests/v1.0.0.json`
- Canonical algorithm version: `merge-guard-v1`
- Proof schema version: `1.0.0`

### Added
- Initial GitHub Action, CLI, tests, and library entrypoints using the canonical `validateMergeGuard(input) -> VALID | NULL -> proofFromDecision(decision) -> MERGE_GUARD_PROOF.json` runtime path.
- Initial release artifacts that existed at the immutable `v1.0.0` tag.

### Compatibility impact
- Compatible within `>=1.0.0 <2.0.0`; no StateGate validation outcome changes are intended.

### Replay impact
- Historical canonical decision hashes remain bound to the validated state-transition object and enabled policies. New proofs add validator identity for implementation provenance.
