# ContinuityOS Merge Guard

![ContinuityOS Merge Guard](7894E300-3D37-45CC-BDA5-3B6C6D90E118.png)

> Deterministically validate pull request identity and the exact canonical textual diff before merge.

ContinuityOS Merge Guard is a portable GitHub Action that validates canonical pull request identity, binds it to the exact canonical pull-request diff, applies explicit author policy, emits a proof artifact, and exposes a load-bearing GitHub status check.

## Hero Architecture

```text
PR
↓
Canonical PR Identity
+ Canonical PR Diff
+ Explicit Author Policy
+ Optional Review Approval Evidence
↓
Canonicalization
↓
VALID / NULL
↓
Proof
↓
Required Status Check
```

## Governance vocabulary

- `VALID` → Merge Eligible
- `NULL` → Blocked
- `PROOF` → Verifiable Evidence

## Repository Boundary

This action owns:

- canonical PR identity normalization
- canonical pull-request diff binding
- explicit author-policy validation
- canonical hashing
- proof emission
- GitHub status reporting

This action does not own:

- code review quality judgments
- security analysis
- CI validation
- repository approval policy
- runtime governance
- merge authorization

Merge Guard validates identity and the exact textual patch it evaluated. Final merge decisions remain the responsibility of GitHub branch protection and repository policy.

## What this proves

This proves the PR identity object, exact canonical diff, explicit author-policy scope, diff provenance, normalized attribution evidence, and when enabled normalized review evidence are complete, canonicalized, hashed, and proof-bound before merge eligibility:

```text
validated_object == merge_guard_object
validated_diff == diff_bound_to_validated_head_sha
```

Boundary statements:

- Diff binding proves which textual patch was evaluated. It does not prove that the patch is correct or safe.
- When review binding is enabled, Merge Guard can verify that normalized review evidence was bound to the validated head SHA: `reviewed_head_sha == validated_head_sha`.
- Merge Guard does not determine whether reviewed code is correct or safe, and it does not replace CODEOWNERS, required reviewers, branch protection, GitHub review dismissal settings, or GitHub merge authority.
- The action does not classify humans or agents from hidden platform authority.
- The action does not bind the final merge commit.
- It is an identity legitimacy check, not a review system or policy engine.

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

When `pr-diff` is omitted, the action fetches the pull request JSON and GitHub diff for the supplied `repo`, `pr-number`, `base-sha`, and `head-sha` using `github-token`. The fetched pull-request `head.sha` and `base.sha` must match the evaluated inputs or the action fails closed to `NULL`.

## Enforce as a required check

After committing the workflow, configure branch protection to require the `merge-guard` job before merge. The action exits non-zero for `NULL`, so GitHub branch protection can use this job directly as the load-bearing required status check.

## Runtime

```text
Pull Request / CLI Environment / Test Fixture
        ↓
Input Acquisition
        ↓
validateMergeGuard(input)
        ↓
proofFromDecision(decision)
        ↓
MERGE_GUARD_PROOF.json + GitHub Outputs + Status Check
```

All repository-local Merge Guard validation entrypoints use the same canonical validation flow in `guard.mjs`. `check.mjs` is the runtime adapter: it acquires inputs, optionally fetches the GitHub diff, delegates validation to `validateMergeGuard(input)`, derives the proof with `proofFromDecision(decision)`, and exits non-zero when the canonical result is `NULL`.

## Output

Each run produces:

| Output | Description |
|--------|-------------|
| `result` | `VALID` or `NULL` |
| `proof_id` | `MERGE_GUARD-{pr_number}-{head_sha[:8]}` |
| `proof_hash` | sha256 of the canonical payload |
| `diff_hash` | sha256 of the canonical pull request diff |
| `proof_url` | path to `MERGE_GUARD_PROOF.json` |
| `author_kind` | normalized `agent`, `human`, or `unknown` author scope |
| `null_reasons` | comma-separated NULL reason codes, empty for `VALID` |
| `attribution_status` | `identity_present`, `identity_missing`, or `identity_ambiguous` |
| `attribution_classification` | `AGENT_AUTHORED`, `AGENT_ASSISTED`, `HUMAN_AUTHORED`, or `UNKNOWN` |
| `actor_kind` | normalized actor kind `human`, `agent`, `bot`, or `unknown` |
| `attribution_evidence_hash` | sha256 of the canonicalized attribution evidence |
| `review_status` | Review binding status derived from the canonical decision |
| `review_evidence_hash` | sha256 of canonical normalized review evidence when review binding is enabled |
| `approval_count` | Count of distinct latest approvals bound to the validated head SHA |

The proof is written to the job step summary and uploaded as a workflow artifact named `MERGE_GUARD_PROOF`.

## Canonical diff binding

The proof payload includes:

```json
{
  "base_sha": "...",
  "head_sha": "...",
  "diff_hash": "sha256:..."
}
```

The `diff_hash` is computed from canonical diff bytes using these deterministic normalization rules:

- input must be a non-empty Git-style unified diff containing at least one `diff --git` file header;
- CRLF and CR transport line endings are normalized to LF;
- the canonical byte stream ends with exactly one terminal LF;
- file order and hunk order are preserved exactly as received;
- patch text, paths, hunk headers, context lines, additions, deletions, mode lines, index lines, rename/copy metadata, and binary patch markers are preserved;
- no semantic equivalence is inferred between different textual patches.

Merge Guard fails closed to `NULL` when diff acquisition fails, the diff is missing or malformed, the fetched pull-request head/base SHA does not match the evaluated inputs, a supplied prior diff/proof hash no longer matches the current canonical object, or a post-validation object mutation is detected. Workflows can pass `expected-diff-hash`, `expected-proof-hash`, `expected-review-evidence-hash`, and `expected-validated-object-hash` when replaying or reconciling a prior proof; all four checks are enforced by the same canonical validation function. Diff provenance is intentionally bound into the proof hash: identical diff text keeps the same `diff_hash`, but different `diff_source` values produce different `proof_hash` values. Attribution is also decision-critical proof evidence; normalized attribution status, classification, and evidence hash are included in the canonical payload so changed attribution evidence changes proof identity.


## Optional review approval binding

Review approval binding is disabled by default (`require-review-approval: 'false'`) to preserve existing behavior. When enabled, callers may pass one structured `review-evidence` JSON object or allow `check.mjs` to acquire reviews from GitHub before deterministic validation. Network acquisition is outside the validation boundary; normalized evidence is then passed to `validateMergeGuard(input)`. Acquisition failure fails closed.

Minimal review evidence shape:

```json
{
  "head_sha": "...",
  "reviews": [
    {
      "reviewer": "alice",
      "state": "APPROVED",
      "submitted_at": "2026-01-01T00:00:00Z",
      "commit_id": "..."
    }
  ]
}
```

Merge Guard normalizes only review fields needed for legitimacy, sorts records deterministically, computes `review_evidence_hash`, and binds the review policy/result into the canonical decision when review binding is enabled. Deterministic review semantics are fail-closed: comments, reactions, labels, and heuristic metadata never count as approval; duplicate reviews by one reviewer count only the latest review; later `CHANGES_REQUESTED` supersedes approval; `DISMISSED`, stale-head, malformed, missing, conflicting, or insufficient evidence returns `NULL`. `REVIEW_APPROVAL_REQUIRED` means no qualifying current-head approval exists, and it may appear alongside `INSUFFICIENT_APPROVALS`.

Required invariant when enabled:

```text
reviewed_head_sha == validated_head_sha
```

Example:

```yaml
          require-review-approval: 'true'
          minimum-approvals: '1'
```

## Read outputs in later steps

```yaml
      - uses: joselunasrt8-creator/continuity-merge-guard@v1
        id: merge-guard
        with:
          repo: ${{ github.repository }}
          pr-number: ${{ github.event.pull_request.number }}
          head-sha: ${{ github.event.pull_request.head.sha }}
          base-sha: ${{ github.event.pull_request.base.sha }}
          actor: ${{ github.event.pull_request.user.login }}

      - name: Show proof binding
        if: always()
        run: |
          echo "result=${{ steps.merge-guard.outputs.result }}"
          echo "proof_hash=${{ steps.merge-guard.outputs.proof_hash }}"
          echo "null_reasons=${{ steps.merge-guard.outputs.null_reasons }}"
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

## File manifest and verification

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the canonical enforcement flow and sequence diagram. See [`docs/FILE_MANIFEST.md`](docs/FILE_MANIFEST.md) for the complete file manifest, intentional root-packaging adaptations, canonical source reference, and verification notes.

## Release Status

This repository has been prepared for human review only. No release, tag, or Marketplace listing has been created.
