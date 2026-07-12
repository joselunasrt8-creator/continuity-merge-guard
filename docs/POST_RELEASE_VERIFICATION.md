# StateGate Post-Release Verification

Use this checklist after maintainers create the intended corrective exact StateGate release and update the floating `v1` tag. These checks are intentionally consumer-facing and do not require rewriting historical `v1.0.0` provenance.

## Tag model

- `v1.0.0` is the immutable historical pre-StateGate release and must remain bound to source commit `bbc8ad7eb48645530542db85eb12a6c26b461404`.
- `v1.1.1` is the intended corrective exact StateGate release. Do not claim it exists until maintainers have actually created it.
- `v1` is the floating major tag. After the `v1.1.1` release is created, `v1` must resolve to the same release commit as `v1.1.1`.
- No historical tag may be moved or rewritten to make older provenance appear newer.

## Tag resolution

- Inspect the floating, intended exact, and historical exact tags:

  ```bash
  git ls-remote --tags https://github.com/joselunasrt8-creator/stategate.git refs/tags/v1 refs/tags/v1.1.1 refs/tags/v1.0.0 'refs/tags/v1^{}' 'refs/tags/v1.1.1^{}' 'refs/tags/v1.0.0^{}'
  ```

- If `v1.1.1` has not been created yet, record that result as expected pre-release state and do not treat `v1` as verified for StateGate consumers.
- After `v1.1.1` exists, confirm `v1` and `v1.1.1` dereference to the same release commit.
- Confirm `v1.0.0` still dereferences to `bbc8ad7eb48645530542db85eb12a6c26b461404`.
- Confirm no historical tag was moved, deleted, or rewritten during the StateGate release process.

## Marketplace rendering

- Open the GitHub Marketplace listing and verify the name is exactly `Continufy StateGate`.
- Verify the Marketplace description is exactly `Govern repository state transitions. VALID | NULL | PROOF.`
- Search GitHub Marketplace for `StateGate`, `Continufy StateGate`, and `repository state transitions`; confirm the listing is visible and not shown under obsolete public-facing product branding.

## Independent consumer install

Create or use an unrelated repository and add the workflow from `examples/consumer-workflow.yml` without replacing the action reference. The install reference must remain:

```yaml
uses: joselunasrt8-creator/stategate@v1
```

Run the workflow manually and verify:

- The load-bearing required check/job name is `stategate`.
- The `stategate-valid` fixture job completes with `result=VALID`.
- The `stategate-null` fixture job intentionally receives malformed diff input, fails closed with `result=NULL`, and reports `DIFF_MALFORMED`.
- The VALID proof artifact is present as `stategate-valid-proof` and contains `MERGE_GUARD_PROOF.json`.
- The NULL proof artifact is present as `stategate-null-proof` and contains `MERGE_GUARD_PROOF.json`.

## Compatibility-sensitive proof identifiers

Inspect a downloaded proof artifact and confirm these compatibility identifiers remain unchanged unless a future major release deliberately changes proof semantics:

- `record_type`: `MERGE_GUARD_PROOF`
- Proof filename: `MERGE_GUARD_PROOF.json`
- Artifact name emitted by the action: `MERGE_GUARD_PROOF`
- Proof ID prefix: `MERGE_GUARD-`
- Canonical algorithm version: `merge-guard-v1`
- Environment variable/input compatibility surface: `MERGE_GUARD_*`

## Release metadata consistency

- Verify `action.yml` still renders the Marketplace name and description used above.
- Verify `release/validator-metadata.json` for the published `v1.1.1` release uses `validator_version: "1.1.1"` and does not report `development`.
- Verify the `v1.1.1` release manifest source tree matches the exact `v1.1.1` tag target release-content tree.
- Verify the historical `v1.0.0` manifest remains bound to source commit `bbc8ad7eb48645530542db85eb12a6c26b461404`.
- Do not edit historical `v1.0.0` metadata to claim a newer StateGate rename commit if the immutable tag did not use that source.

## Rollback if `v1` points to the wrong commit

1. Stop recommending `@v1` until the pointer is corrected; temporarily instruct consumers to pin the known-good exact StateGate tag or full commit SHA.
2. Identify the intended `v1.1.1` target commit and verify its release manifest, validator metadata, changelog entry, and proof-contract tests.
3. Move only the floating `v1` tag back to the verified `v1.1.1` commit through the repository maintainer release process.
4. Re-run the tag-resolution, Marketplace, independent consumer install, VALID/NULL, proof artifact, and compatibility-sensitive identifier checks above.
5. Publish a corrective release note or advisory if consumers may have installed from the wrong `v1` target.
