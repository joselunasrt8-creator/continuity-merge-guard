# ContinuityOS Merge Guard

Govern AI-generated pull requests before they merge.

A packaged, portable GitHub Action implementing the smallest installable ContinuityOS dependency wedge:

```text
PR
 ↓
canonical identity object {repo, pr_number, head_sha, base_sha, actor}
+ explicit author policy {author_kind, require_agent_authored}
 ↓
canonicalize → sha256
 ↓
VALID  (identity complete and policy satisfied)
  | NULL (missing field, invalid policy input, policy mismatch, or ambiguous attribution — fail-closed)
 ↓
PROOF  (MERGE_GUARD_PROOF.json)
 ↓
required status check
```

## Governance vocabulary

- `VALID` → Merge Eligible
- `NULL` → Blocked
- `PROOF` → Verifiable Evidence

## What this proves

This proves the PR identity object and explicit author-policy scope are complete, canonicalized, hashed, and proof-bound before merge eligibility:

```text
validated_object == merge_guard_object
```

The action does not inspect the PR diff, validate review approvals, classify humans/agents from hidden platform authority, or bind the final merge commit. It is an identity legitimacy check, not a review system or policy engine.

## Installation

```yaml
name: ContinuityOS Merge Guard

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  merge-guard:
    runs-on: ubuntu-latest
    steps:
      - uses: joselunasrt8-creator/continuity-merge-guard@v1
        id: merge-guard
        with:
          repo: ${{ github.repository }}
          pr-number: ${{ github.event.pull_request.number }}
          head-sha: ${{ github.event.pull_request.head.sha }}
          base-sha: ${{ github.event.pull_request.base.sha }}
          actor: ${{ github.event.pull_request.user.login }}
```

## Agent-authored required lane

For an agent-authored PR lane, make the check load-bearing by setting `require-agent-authored: 'true'` and providing the explicit `author-kind` value from the workflow policy:

```yaml
      - uses: joselunasrt8-creator/continuity-merge-guard@v1
        id: merge-guard
        with:
          repo: ${{ github.repository }}
          pr-number: ${{ github.event.pull_request.number }}
          head-sha: ${{ github.event.pull_request.head.sha }}
          base-sha: ${{ github.event.pull_request.base.sha }}
          actor: ${{ github.event.pull_request.user.login }}
          author-kind: agent
          require-agent-authored: 'true'
```

## Output

Each run produces:

- `result`: `VALID` or `NULL`
- `proof_id`: `MERGE_GUARD-{pr_number}-{head_sha[:8]}`
- `proof_hash`: sha256 of the canonical payload
- `proof_url`: path to `MERGE_GUARD_PROOF.json`
- `author_kind`: normalized `agent`, `human`, or `unknown` author scope
- `null_reasons`: comma-separated NULL reason codes, empty for `VALID`
- `attribution_status`: `identity_present`, `identity_missing`, or `identity_ambiguous`
- `attribution_classification`: `AGENT_AUTHORED`, `AGENT_ASSISTED`, `HUMAN_AUTHORED`, or `UNKNOWN`
- `actor_kind`: normalized actor kind `human`, `agent`, `bot`, or `unknown`
- `attribution_evidence_hash`: sha256 of the canonicalized attribution evidence

The proof is written to the job step summary and uploaded as a workflow artifact named `MERGE_GUARD_PROOF`.

## File manifest and verification

See [`docs/FILE_MANIFEST.md`](docs/FILE_MANIFEST.md) for the complete file manifest, intentional root-packaging adaptations, canonical source reference, and verification notes.

## Publishing status

This repository has been prepared for human review only. No release, tag, or Marketplace listing has been created.
