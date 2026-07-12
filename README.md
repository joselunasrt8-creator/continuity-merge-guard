# StateGate

StateGate is a deterministic GitHub Action that validates the exact identity and policy state of a pull request before merge.

It governs one object: the evaluated pull request state supplied to the action (`repo`, pull request number, head SHA, base SHA, actor, diff, and enabled policy evidence). It reports `VALID` or `NULL` and emits a proof artifact for the evaluated object.

Current stable validator version: **v1.1.1**. Recommended install reference: **`joselunasrt8-creator/stategate@v1`** for the latest compatible v1 release, or **`@v1.1.1`** for an exact release pin.

## Why install it?

Normal CI tests repository content, but it may not bind the exact reviewed pull request state that is about to become mergeable. StateGate addresses operational merge risks:

- a pull request may be mergeable without a preserved validation object;
- review state may become stale after the reviewed head SHA changes;
- agent-attributed work may require explicit repository policy;
- the evaluated diff, head SHA, base SHA, attribution evidence, and optional review evidence need deterministic binding;
- failed acquisition, missing evidence, stale evidence, malformed diffs, or mismatched replay hashes should fail closed.

StateGate turns that boundary into a check result:

```text
VALID | NULL + MERGE_GUARD_PROOF.json
```

## Five-minute install

Use the canonical consumer workflow in [`examples/consumer-workflow.yml`](examples/consumer-workflow.yml) as the maintained workflow source. It exercises both `VALID` and bounded `NULL` behavior and aggregates the load-bearing check as `stategate`.

For a pull-request workflow in your repository, the smallest live installation is:

```yaml
name: StateGate

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: read
  actions: write

jobs:
  stategate:
    name: stategate
    runs-on: ubuntu-latest
    steps:
      - uses: joselunasrt8-creator/stategate@v1
        id: stategate
        with:
          repo: ${{ github.repository }}
          pr-number: ${{ github.event.pull_request.number }}
          head-sha: ${{ github.event.pull_request.head.sha }}
          base-sha: ${{ github.event.pull_request.base.sha }}
          actor: ${{ github.event.pull_request.user.login }}
```

Required permissions:

- `contents: read` to allow repository context access;
- `pull-requests: read` so StateGate can fetch pull request JSON, diff, and review evidence when those inputs are not supplied directly;
- `actions: write` so the composite action can upload the proof artifact through `actions/upload-artifact@v4`.

Required inputs: `repo`, `pr-number`, `head-sha`, `base-sha`, and `actor`.

Optional inputs include `pr-diff`, `github-token`, `author-kind`, `require-agent-authored`, `require-review-approval`, `minimum-approvals`, `review-evidence`, and the expected replay hashes. When `pr-diff` is omitted, the action fetches the pull request JSON and GitHub diff and requires the fetched `head.sha` and `base.sha` to match the evaluated inputs.

Expected check name: `stategate`.

Expected proof artifact: artifact `MERGE_GUARD_PROOF` containing `MERGE_GUARD_PROOF.json`.

## Expected behavior

| Result | Check behavior | What happens |
| --- | --- | --- |
| `VALID` | The `stategate` job succeeds. | A proof artifact is emitted; the pull request may proceed subject to the repository's other rules. |
| `NULL` | The `stategate` job exits non-zero. | The pull request is blocked only if repository branch protection or rulesets require the `stategate` check; `null_reasons` surfaces the bounded failure reason. |

StateGate does **not** configure GitHub branch protection, merge queues, or repository rulesets for you.

## Make it load-bearing

Installed is not the same as required.

After the workflow has run at least once on a pull request, configure GitHub to require the check named `stategate`:

1. Open the repository's **Settings**.
2. Open **Rules** or **Branches** depending on the repository's GitHub configuration.
3. Create or edit the branch protection rule or ruleset for the protected branch.
4. Enable required status checks.
5. Select the check named `stategate`.
6. Save the rule and verify that a `NULL` StateGate run blocks merging.

## Proof artifact

The action uploads artifact `MERGE_GUARD_PROOF` with file `MERGE_GUARD_PROOF.json`.

Key proof fields include:

- `result`: `VALID` or `NULL`;
- `proof_id`: `MERGE_GUARD-{pr_number}-{head_sha[:8]}`;
- `canonical_hash` / `proof_hash`: deterministic hash of the canonical validated object;
- `diff_hash`: deterministic hash of the canonical pull request diff;
- `base_sha` and `head_sha`: evaluated pull request identity;
- `attribution_*`: normalized attribution status, classification, and evidence hash;
- `review_*` and `approval_count`: normalized review evidence when review binding is enabled;
- `validator`: validator name, version, release hash, canonical algorithm version, and proof schema version;
- `null_reasons`: bounded reasons when the result is `NULL`.

The proof demonstrates which pull request object and policy evidence StateGate evaluated. It does not prove that the code is correct, safe, approved by the right CODEOWNERS, deployed, or finally merged. GitHub artifact retention is controlled by repository and organization retention settings, so download or archive proof artifacts when long-term evidence is required.

## Policy capabilities

Currently supported behavior includes:

- exact pull request identity validation;
- deterministic diff canonicalization and hashing;
- proof/replay hash comparison;
- optional review approval binding to the validated head SHA;
- stale-review detection;
- agent attribution evidence classification;
- optional agent-authored and human-review policy gates;
- fail-closed validation for missing, malformed, stale, mismatched, or ambiguous required evidence.

For details, read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/VERSIONING.md`](docs/VERSIONING.md), and [`docs/FILE_MANIFEST.md`](docs/FILE_MANIFEST.md).

## Real consumer example

The canonical public reference consumer is `continuity-sandbox`.

Frame it as a **reference consumer**, not independent market adoption. The sandbox demonstrates published-release installation, consumer workflow configuration, `VALID` and `NULL` behavior, proof artifact handling, and removal/degradation analysis. It does not by itself prove an independent trust boundary or independent dependency; that requires the evidence path in [`docs/EXTERNAL_ADOPTION_PROTOCOL.md`](docs/EXTERNAL_ADOPTION_PROTOCOL.md).

## Adoption audit

| Surface | Audience | Current purpose | Status | Required change |
| --- | --- | --- | --- | --- |
| `README.md` | FIRST_TIME_USER | Product landing page and install path. | User-facing hub. | Keep the front door focused on what it does, install, required check, proof, and routing. |
| `action.yml` | FIRST_TIME_USER | Published GitHub Action metadata, inputs, outputs, artifact upload. | User-facing execution contract. | Leave runtime contract unchanged; preserve compatibility names. |
| `examples/consumer-workflow.yml` | CONSUMER_OPERATOR | Canonical consumer verification workflow with VALID, NULL, and aggregate `stategate` jobs. | User-facing canonical example. | Use as maintained source instead of duplicating fixture logic in README. |
| `docs/EXTERNAL_CONSUMER_CHECKLIST.md` | CONSUMER_OPERATOR | Bounded evaluation checklist. | User-facing operator aid. | Link from documentation map; not prerequisite to first install. |
| `docs/UPGRADE_AND_ROLLBACK.md` | CONSUMER_OPERATOR | Pinning, upgrade, and rollback guidance. | Operator reference. | Link from documentation map. |
| `docs/EXTERNAL_INSTALL_VERIFICATION.md` | CONSUMER_OPERATOR | External install evidence template. | Operator/evidence bridge. | Keep routed behind install/operate section. |
| `docs/ARCHITECTURE.md` | PROJECT_MAINTAINER | Canonical validation flow and internals. | Maintainer reference. | Link for understanding, not install prerequisite. |
| `docs/VERSIONING.md` | PROJECT_MAINTAINER | Version, algorithm, and proof schema policy. | Maintainer reference. | Keep as detailed reference. |
| `docs/FILE_MANIFEST.md` | PROJECT_MAINTAINER | Package/source manifest and verification notes. | Maintainer reference. | Keep as detailed reference. |
| `docs/RELEASE_CHECKLIST.md` | RELEASE_OPERATOR | Release procedure. | Internal release surface. | Keep out of first-time path. |
| `docs/POST_RELEASE_VERIFICATION.md` | RELEASE_OPERATOR | Post-release checks and tag verification. | Internal/release surface. | Keep out of first-time path except documentation map. |
| `docs/V1_1_0_RELEASE_HANDOFF.md` | RELEASE_OPERATOR | Historical v1.1.0 handoff. | Historical release record. | Treat as historical unless release operators need it. |
| `docs/V1_1_1_RELEASE_HANDOFF.md` | RELEASE_OPERATOR | v1.1.1 release handoff. | Release record. | Keep release-operator scoped. |
| `release/` | RELEASE_OPERATOR | Machine-readable release manifests and metadata. | Release infrastructure. | Do not make first-time users read it. |
| `scripts/` | RELEASE_OPERATOR | Manifest, release, and schema validation scripts. | Maintainer/release tooling. | No first-time routing. |
| `schemas/external-adoption-evidence.schema.json` | RESEARCH_EVIDENCE | Adoption evidence validation schema. | Research evidence infrastructure. | Keep behind evidence documentation. |
| `fixtures/external-adoption/` | RESEARCH_EVIDENCE | Schema fixtures. | Research evidence tests. | Keep out of install path. |
| `docs/templates/*` | RESEARCH_EVIDENCE | Operator feedback, evidence, and degradation templates. | Evidence templates. | Link only from evidence protocol/checklist. |

## Documentation map

Install and operate:

- [Consumer workflow example](examples/consumer-workflow.yml)
- [External consumer checklist](docs/EXTERNAL_CONSUMER_CHECKLIST.md)
- [Upgrade and rollback](docs/UPGRADE_AND_ROLLBACK.md)
- [External install verification](docs/EXTERNAL_INSTALL_VERIFICATION.md)

Understand StateGate:

- [Architecture](docs/ARCHITECTURE.md)
- [Versioning](docs/VERSIONING.md)
- [File manifest](docs/FILE_MANIFEST.md)

Release maintainers:

- [Release checklist](docs/RELEASE_CHECKLIST.md)
- [Post-release verification](docs/POST_RELEASE_VERIFICATION.md)
- [v1.1.1 release handoff](docs/V1_1_1_RELEASE_HANDOFF.md)
- [v1.1.0 historical release handoff](docs/V1_1_0_RELEASE_HANDOFF.md)

External adoption evidence:

- [External adoption protocol](docs/EXTERNAL_ADOPTION_PROTOCOL.md)
- [Evidence schema](schemas/external-adoption-evidence.schema.json)
- [Evidence template](docs/templates/EXTERNAL_ADOPTION_EVIDENCE.json)
- [Operator feedback template](docs/templates/OPERATOR_FEEDBACK.md)
- [Removal/degradation report template](docs/templates/REMOVAL_DEGRADATION_REPORT.md)

## Terminology and compatibility

StateGate is the product name and `joselunasrt8-creator/stategate@v1` is the recommended action reference.

Migrating from Merge Guard:

- Repository: `joselunasrt8-creator/continuity-merge-guard` → `joselunasrt8-creator/stategate`
- Action reference: `uses: joselunasrt8-creator/continuity-merge-guard@v1` → `uses: joselunasrt8-creator/stategate@v1`
- Recommended workflow/check name: `merge-guard` → `stategate`

Compatibility-preserved names you may still encounter:

| Name | Decision | Reason |
| --- | --- | --- |
| StateGate | RENAME_NOW | Product, README, Marketplace, and install language should use StateGate. |
| legacy product name | HISTORICAL | Preserved only in migration notes or historical records. |
| Continuity Merge Guard / `continuity-merge-guard` | HISTORICAL | Historical repository identity; document only as migration context. |
| `MERGE_GUARD_*` environment variables | COMPATIBILITY_PRESERVE | Composite action adapter contract. |
| `MERGE_GUARD_PROOF` artifact and `MERGE_GUARD_PROOF.json` file | COMPATIBILITY_PRESERVE | Proof consumers and historical artifacts depend on these names. |
| `MERGE_GUARD-` proof ID prefix | COMPATIBILITY_PRESERVE | Proof identity contract. |
| `merge-guard-v1` canonical algorithm version | COMPATIBILITY_PRESERVE | Replay-sensitive validation semantics identifier. |
| `validateMergeGuard(input)` / `evaluate(input)` | COMPATIBILITY_PRESERVE | Library/runtime compatibility entrypoints. |
| `v1.0.0` release references | RELEASE_SPECIFIC | Historical pre-StateGate provenance must not be rewritten. |
| `v1.1.1` release references | RELEASE_SPECIFIC | Current stable release metadata. |

## Release channels

- `v1` — moving major-version tag for the latest compatible v1 release.
- `v1.1.1` — current exact stable release.
- full commit SHA — immutable source pin for maximum reproducibility.

For reproducible installations, pin an exact semantic version or commit SHA:

```yaml
uses: joselunasrt8-creator/stategate@v1.1.1
uses: joselunasrt8-creator/stategate@<full-commit-sha>
```

The moving `v1` tag may advance to newer backward-compatible v1 releases. Exact semantic-version tags are intended to remain immutable under the repository release policy.
