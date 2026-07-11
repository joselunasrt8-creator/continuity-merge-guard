# Versioning Policy

ContinuityOS Merge Guard tracks three identifiers:

- `validator_version`: semantic version of the packaged validator implementation and distribution artifacts.
- `canonical_algorithm_version`: identifier for canonical validation semantics and decision-hash inputs.
- `proof_schema_version`: semantic version of the emitted proof document shape.

`release/validator-metadata.json` is the machine-readable source for these values. Development branches use `validator_version: development` and `validator_release_hash: null` in proofs until an exact release is cut. Patch releases update `validator_version`; minor releases update `validator_version` and may update `proof_schema_version` for compatible additions; major releases update `validator_version` and advance `canonical_algorithm_version` or `proof_schema_version` when semantics or proof compatibility change.

## Patch releases

Patch releases are for bug fixes, internal refactors, documentation corrections, deterministic hardening that preserves outcomes, and compatible proof-envelope additions. They must not change VALID/NULL decisions for existing enabled behavior and must preserve replay compatibility.

## Minor releases

Minor releases are for backward-compatible optional features, new optional inputs defaulting to disabled, new proof fields existing consumers may ignore, and new deterministic NULL reasons that do not alter enabled legacy behavior.

## Major releases

Major releases are required for canonical validation semantics changes, changed default behavior, incompatible proof-schema changes, removal or reinterpretation of inputs/outputs, or historical replay incompatibility.

## Metadata update discipline

- Patch: advance `validator_version`; keep `canonical_algorithm_version` unless semantics changed; keep or compatibly advance `proof_schema_version` for envelope-only additions.
- Minor: advance `validator_version`; keep `canonical_algorithm_version` when legacy enabled behavior is unchanged; advance `proof_schema_version` for compatible proof additions.
- Major: advance `validator_version`; advance `canonical_algorithm_version` for decision semantics changes; advance `proof_schema_version` for incompatible proof changes; adjust `compatibility_range`.
