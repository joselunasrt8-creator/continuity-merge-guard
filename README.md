<div align="center">

<img
  src="./assets/images/01-hero.jpeg"
  alt="StateGate — Deterministic validation for repository state transitions"
  width="100%">

</div>

# StateGate

StateGate is a deterministic GitHub Action that validates the exact pull request state before it becomes eligible to change repository state.

## Purpose

CI can test repository contents without proving which pull request state was evaluated. A review can also become stale when the head commit changes.

StateGate closes that boundary by evaluating one explicit pull request object and returning one of two results:

- `VALID` — the supplied object and enabled policies are internally consistent.
- `NULL` — required data is missing, malformed, stale, unavailable, or inconsistent.

Every action or CLI evaluation writes `MERGE_GUARD_PROOF.json`, which binds the result to the evaluated head SHA, base SHA, canonical diff, attribution evidence, and enabled review policy. StateGate fails closed: incomplete evidence produces `NULL`, not an inferred success.

## Getting Started

### Add the action

Create `.github/workflows/stategate.yml` in the consuming repository:

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
      - name: Validate pull request state
        id: stategate
        uses: joselunasrt8-creator/stategate@v1
        with:
          repo: ${{ github.repository }}
          pr-number: ${{ github.event.pull_request.number }}
          head-sha: ${{ github.event.pull_request.head.sha }}
          base-sha: ${{ github.event.pull_request.base.sha }}
          actor: ${{ github.event.pull_request.user.login }}
```

The five inputs shown above are required. When `pr-diff` is omitted, StateGate uses `github.token` to acquire the pull request object and diff, then verifies the acquired SHAs.

`contents: read` and `pull-requests: read` support evidence acquisition. `actions: write` allows `actions/upload-artifact@v4` to upload the proof artifact.

For reproducible installations, replace the moving `@v1` reference with an exact release or full commit SHA:

```yaml
uses: joselunasrt8-creator/stategate@v1.1.1
# or
uses: joselunasrt8-creator/stategate@<full-commit-sha>
```

### Verify the repository locally

StateGate has no package-install step. With Node.js available:

```bash
node --check canonical.mjs
node --check attribution.mjs
node --check guard.mjs
node --check check.mjs
node test.mjs
```

See the maintained [consumer workflow](examples/consumer-workflow.yml) for deterministic `VALID` and bounded `NULL` examples.

## Doesn't GitHub Already Solve This?

GitHub already provides strong repository governance through branch protection, required checks, CODEOWNERS, merge queues, and repository rules.

StateGate operates at a different boundary. Rather than governing the merge workflow, it deterministically validates the exact pull request state that is eligible to mutate repository state and emits replayable proof of that decision.

## Every Merge Changes Repository State

Every merge is a repository state transition.

A pull request proposes a new repository state. Before that transition is allowed to occur, StateGate deterministically validates the complete evaluated pull request object—including identity, policy, attribution, evidence, and replay integrity—and returns either VALID or NULL.

Only validated state transitions become eligible to mutate repository state.

## Every Merge Is a Repository State Transition
<p align="center">
  <img src="./assets/images/02-state-transition.png" width="100%">
</p>

## Deterministic Validation Pipeline
<p align="center">
  <img src="./assets/images/03-validation-pipeline.jpeg" width="100%">
</p>

## When Does a Transition Become Eligible?
<p align="center">
  <img src="./assets/images/04-transition-eligibility.jpeg" width="100%">
</p>

## What Does StateGate Produce?
<p align="center">
  <img src="./assets/images/05-validation-evidence.jpeg" width="100%">
</p>

## Scope

StateGate governs the state supplied to a single validation run. Its boundary includes:

- repository and pull request identity;
- head and base commit SHAs;
- canonical pull request diff bytes and provenance;
- actor and author-attribution evidence;
- optional review evidence bound to the current head SHA;
- optional expected hashes used for replay checks.

The deterministic boundary begins after external evidence has been acquired. Network retrieval is not deterministic; the acquired values and their provenance are included in the validated object.

## Overview

StateGate is a dependency-free Node.js validator packaged as a composite GitHub Action.

```text
GitHub pull request event
          |
          v
 action.yml (input adapter)
          |
          v
 check.mjs (evidence acquisition and output adapter)
          |
          v
 guard.mjs (canonical validation decision)
      /          \
     v            v
 VALID          NULL
      \          /
       v        v
  MERGE_GUARD_PROOF.json
```

`guard.mjs` is the only decision surface. The action, CLI, tests, and library exports all enter `validateMergeGuard(input)`. Canonicalization and SHA-256 hashing live in `canonical.mjs`; attribution normalization lives in `attribution.mjs`.

See [Architecture](docs/ARCHITECTURE.md) for the execution-path audit and determinism boundary.

## Core Runtime

```text
explicit inputs
    |
    +-- supplied diff/review evidence ------------------+
    |                                                   |
    +-- or GitHub API acquisition                       |
                                                        v
                                              normalize evidence
                                                        |
                                                        v
                                              validate identity
                                                        |
                                                        v
                                            canonicalize and hash
                                                        |
                                                        v
                                            evaluate enabled policy
                                                        |
                                                        v
                                             compare replay hashes
                                                        |
                                                        v
                                               VALID or NULL
                                                        |
                                                        v
                                               emit exact proof
```

The proof is projected from the canonical decision. There is no separate proof-building decision path. A `NULL` result writes the same proof format with bounded `null_reasons` and exits non-zero.

## Key Concepts

| Term | Definition |
| --- | --- |
| **Validated object** | The normalized identity, diff, attribution, policy, and review fields evaluated in one run. |
| **Canonical diff** | A normalized unified diff with deterministic line endings and terminal newline handling. |
| **Canonical hash** | SHA-256 of the canonical validated payload; also exposed as `proof_hash`. |
| **Diff hash** | SHA-256 of the canonical diff text. |
| **Proof** | `MERGE_GUARD_PROOF.json`, the serialized record projected from the decision. |
| **Replay guard** | An expected diff, proof, validated-object, or review-evidence hash that must match the current evaluation. |
| **Attribution evidence** | Explicit and heuristic signals used to classify work as agent-authored, agent-assisted, human-authored, or unknown. |
| **Review binding** | Optional validation that normalized approval evidence applies to the evaluated head SHA. |
| **`VALID`** | All required inputs and enabled policies passed. It is not a statement about code quality or merge authority. |
| **`NULL`** | Validation failed closed for one or more bounded reasons. |

Compatibility identifiers such as `MERGE_GUARD_PROOF.json`, `MERGE_GUARD_*`, and `merge-guard-v1` are intentionally retained because they are part of the replay-sensitive v1 contract.

## Responsibilities

StateGate is responsible for:

- validating required pull request identity fields;
- checking acquired head and base SHAs against the requested state;
- normalizing and hashing unified diff content deterministically;
- classifying and binding attribution evidence;
- enforcing explicit agent-authorship policy when enabled;
- normalizing review evidence and rejecting stale approvals when review binding is enabled;
- comparing optional replay hashes;
- emitting GitHub Action outputs and a proof for the exact decision;
- returning a non-zero status for `NULL`.

## Non-Responsibilities

StateGate does not:

- determine whether code is correct, secure, tested, or deployable;
- configure branch protection, repository rulesets, merge queues, or required checks;
- grant merge authority or merge a pull request;
- replace CODEOWNERS, required reviewers, CI, security scanning, or deployment controls;
- establish that an asserted human or agent identity is authentic beyond the supplied evidence;
- make GitHub API acquisition deterministic;
- provide long-term artifact retention or external evidence storage.

To make StateGate load-bearing, configure the repository to require the workflow check named `stategate` after the workflow has run at least once.

## Features

- Exact pull request identity validation.
- Deterministic JSON and diff canonicalization.
- Stable SHA-256 proof, diff, attribution, and review-evidence hashes.
- Optional proof and validated-object replay checks.
- Fail-closed GitHub diff acquisition with SHA continuity checks.
- Explicit agent-attribution policy and ambiguity detection.
- Optional approval thresholds bound to the current head SHA.
- Fixture-based conformance and release-manifest verification.
- No npm installation or compiled distribution step.

## Repository Structure

```text
.
├── action.yml            # Composite action contract and adapter
├── check.mjs             # CLI, API acquisition, proof/output emission
├── guard.mjs             # Canonical validation and proof projection
├── canonical.mjs         # Canonicalization and SHA-256 helpers
├── attribution.mjs       # Attribution evidence normalization
├── test.mjs              # Conformance test harness
├── fixtures/             # VALID, NULL, policy, and evidence cases
├── examples/             # Consumer workflow example
├── docs/                 # Architecture, operation, and release guides
├── schemas/              # External adoption evidence schema
├── scripts/              # Release and evidence verification tools
└── release/              # Versioned manifests and validator metadata
```

The complete packaging map is maintained in [File Manifest](docs/FILE_MANIFEST.md).

## Example Workflow

A typical run follows this sequence:

1. A pull request is opened or its head SHA changes.
2. The workflow passes the pull request identity to StateGate.
3. `check.mjs` acquires the current pull request JSON and diff unless exact evidence was supplied.
4. `guard.mjs` validates the identity and hashes the canonical diff.
5. If enabled, attribution and review policies are evaluated against normalized evidence.
6. StateGate writes `MERGE_GUARD_PROOF.json` and exposes `result`, `proof_id`, `proof_hash`, `diff_hash`, and policy outputs.
7. `VALID` exits successfully. `NULL` exits non-zero and reports bounded reason codes.
8. GitHub uploads the file as artifact `MERGE_GUARD_PROOF`.
9. Repository rules decide whether the `stategate` check is required for merge.

Example result boundary:

```text
same validated object + same validator semantics
                     |
                     v
          same canonical proof hash

changed SHA, diff, provenance, or enabled evidence
                     |
                     v
          changed hash or bounded NULL result
```

For approval binding, add explicit policy inputs:

```yaml
with:
  # required identity inputs omitted here for brevity
  require-review-approval: 'true'
  minimum-approvals: '1'
```

When `review-evidence` is omitted, StateGate fetches reviews and binds normalized approvals to the evaluated head SHA.

## Design Principles

### One decision path

All execution surfaces use `validateMergeGuard(input)`. Compatibility exports are aliases, not parallel implementations.

### Exact-object validation

The proof is derived from the decision object. The validated fields and emitted proof fields do not pass through independent policy logic.

### Deterministic replay

Canonical serialization, normalized evidence, explicit algorithm versions, and stable hashes allow equivalent inputs to be compared across runs. Exact release or commit pins also bind validator implementation provenance.

### Fail-closed boundaries

Missing, malformed, stale, ambiguous, or mismatched required evidence produces `NULL`. Acquisition errors do not silently reduce policy requirements.

### Explicit policy

Agent-authorship and review requirements are opt-in inputs. The runtime does not infer repository governance or modify GitHub settings.

### Compatibility-aware versioning

Replay-sensitive identifiers remain stable within the v1 compatibility range. See [Versioning](docs/VERSIONING.md) and [Upgrade and Rollback](docs/UPGRADE_AND_ROLLBACK.md).

## Roadmap

Near-term work is constrained to the existing architecture:

- preserve deterministic v1 validation and replay semantics;
- expand conformance fixtures for bounded edge cases;
- strengthen release provenance and post-release verification;
- improve external consumer evidence without treating sandbox use as independent adoption;
- document compatibility-impacting changes before implementation.

Roadmap items are directional and do not change the current action contract.

## Contributing

Contributions should preserve the single canonical validation path and keep behavioral changes explicit.

1. Create a focused branch and limit the change to one bounded concern.
2. Add or update fixtures for every decision-semantic change.
3. Run syntax checks and `node test.mjs`.
4. Document compatibility and replay impact when canonical fields, reason codes, hashes, or version identifiers change.
5. Update release manifests only through the documented release process.
6. Open a pull request that describes scope, preserved invariants, validation evidence, and remaining risks.

Maintainers should also follow the [Release Checklist](docs/RELEASE_CHECKLIST.md) for release-bound changes.

## Migration

### Migrating from Merge Guard

Update the prior action reference:

```yaml
# before
uses: joselunasrt8-creator/continuity-merge-guard@v1

# after
uses: joselunasrt8-creator/stategate@v1
```

The `MERGE_GUARD_*` environment variables, `MERGE_GUARD_PROOF` artifact name, `MERGE_GUARD_PROOF.json` filename, `MERGE_GUARD-` proof ID prefix, and `merge-guard-v1` canonical algorithm identifier remain compatibility-preserved.

## Documentation

- **Install and operate:** [Consumer Checklist](docs/EXTERNAL_CONSUMER_CHECKLIST.md), [Install Verification](docs/EXTERNAL_INSTALL_VERIFICATION.md), [Upgrade and Rollback](docs/UPGRADE_AND_ROLLBACK.md)
- **Understand the runtime:** [Architecture](docs/ARCHITECTURE.md), [Versioning](docs/VERSIONING.md), [File Manifest](docs/FILE_MANIFEST.md)
- **Release:** [Release Checklist](docs/RELEASE_CHECKLIST.md), [Post-release Verification](docs/POST_RELEASE_VERIFICATION.md)
- **Evidence:** [External Adoption Protocol](docs/EXTERNAL_ADOPTION_PROTOCOL.md), [Evidence Schema](schemas/external-adoption-evidence.schema.json)

## License

Licensed under the [Apache License 2.0](LICENSE).
