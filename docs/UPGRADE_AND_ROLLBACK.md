# Upgrade and Rollback

## Upgrade channels

Use `uses: joselunasrt8-creator/continuity-merge-guard@v1` to follow the moving v1 channel after maintainers deliberately update the major tag. Use `@v1.0.0` or another exact semantic-version tag for reproducible patch selection.

## Exact patch upgrade

Change the workflow pin from one exact tag to another, review the changelog entry, verify `release/RELEASE_MANIFEST.json`, and compare `validator.validator_release_hash` in emitted proofs.

## Exact tag rollback

Revert the workflow pin to the prior exact tag, rerun the workflow, and confirm the proof `validator_version`, `validator_commit`, and `validator_release_hash` match the intended release.

## Commit-SHA rollback

For emergency replay, pin `uses:` to a known commit SHA. Treat SHA pins as implementation-specific and verify the generated proof envelope before relying on it as a release proof.

## Proof interpretation

Across compatible versions, `canonical_hash` remains the decision hash for the validated merge object and enabled policies. `validator_release_hash` identifies the validator implementation. If `canonical_algorithm_version` differs, do not assume historical replay compatibility; follow the major-version migration notes.

## Deprecation policy

Deprecated compatible inputs remain accepted through the current major line. Removal or reinterpretation requires a major version.

## Development checkouts

Development branch proofs identify `validator_version` as `development` and set `validator_release_hash` to `null`. Do not treat a development proof as evidence of an exact published release.
