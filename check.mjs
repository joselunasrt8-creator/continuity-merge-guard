#!/usr/bin/env node
// actions/continuity-merge-guard/check.mjs
// ContinuityOS Merge Guard — v1
// Self-contained: no external npm dependencies.

import { writeFileSync, appendFileSync } from 'node:fs'
import { canonicalize, sha256Hex, diffHash } from './canonical.mjs'
import { normalizeString, proofFromDecision, validateMergeGuard } from './guard.mjs'

export { canonicalize, sha256Hex, diffHash, validateMergeGuard }
export const evaluate = validateMergeGuard

export async function acquirePullRequestDiff(input) {
  const repo = normalizeString(input.repo)
  const pr_number = normalizeString(input.pr_number)
  const token = normalizeString(input.github_token)
  const apiUrl = normalizeString(input.github_api_url) || 'https://api.github.com'
  if (!repo || !pr_number || !token) {
    return { ok: false, reason: 'DIFF_ACQUISITION_FAILED', pr_diff: '', evaluated_head_sha: '' }
  }
  const prUrl = `${apiUrl.replace(/\/$/, '')}/repos/${repo}/pulls/${pr_number}`
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'user-agent': 'continuity-merge-guard',
    'x-github-api-version': '2022-11-28',
  }
  try {
    const prRes = await fetch(prUrl, { headers })
    if (!prRes.ok) return { ok: false, reason: 'DIFF_ACQUISITION_FAILED', pr_diff: '', evaluated_head_sha: '' }
    const pr = await prRes.json()
    const evaluated_head_sha = normalizeString(pr?.head?.sha)
    const evaluated_base_sha = normalizeString(pr?.base?.sha)
    if (!evaluated_head_sha || evaluated_head_sha !== normalizeString(input.head_sha)) {
      return { ok: false, reason: 'HEAD_SHA_MISMATCH', pr_diff: '', evaluated_head_sha, evaluated_base_sha }
    }
    if (evaluated_base_sha && evaluated_base_sha !== normalizeString(input.base_sha)) {
      return { ok: false, reason: 'BASE_SHA_MISMATCH', pr_diff: '', evaluated_head_sha, evaluated_base_sha }
    }
    const diffRes = await fetch(prUrl, { headers: { ...headers, accept: 'application/vnd.github.diff' } })
    if (!diffRes.ok) return { ok: false, reason: 'DIFF_ACQUISITION_FAILED', pr_diff: '', evaluated_head_sha, evaluated_base_sha }
    return {
      ok: true,
      reason: null,
      pr_diff: await diffRes.text(),
      diff_source: 'github_pull_request_diff_api',
      evaluated_head_sha,
      evaluated_base_sha,
    }
  } catch {
    return { ok: false, reason: 'DIFF_ACQUISITION_FAILED', pr_diff: '', evaluated_head_sha: '' }
  }
}

async function main() {
  const input = {
    repo: process.env.MERGE_GUARD_REPO || '',
    pr_number: process.env.MERGE_GUARD_PR_NUMBER || '',
    head_sha: process.env.MERGE_GUARD_HEAD_SHA || '',
    base_sha: process.env.MERGE_GUARD_BASE_SHA || '',
    actor: process.env.MERGE_GUARD_ACTOR || '',
    author_kind: process.env.MERGE_GUARD_AUTHOR_KIND || '',
    require_agent_authored: process.env.MERGE_GUARD_REQUIRE_AGENT_AUTHORED || '',
    pr_author: process.env.MERGE_GUARD_PR_AUTHOR || '',
    head_ref: process.env.MERGE_GUARD_HEAD_REF || '',
    pr_body: process.env.MERGE_GUARD_PR_BODY || '',
    pr_labels: process.env.MERGE_GUARD_PR_LABELS || '',
    commit_trailers: process.env.MERGE_GUARD_COMMIT_TRAILERS || '',
    operator_id: process.env.MERGE_GUARD_OPERATOR_ID || '',
    pr_diff: process.env.MERGE_GUARD_PR_DIFF || '',
    diff_source: process.env.MERGE_GUARD_DIFF_SOURCE || '',
    github_token: process.env.MERGE_GUARD_GITHUB_TOKEN || '',
    github_api_url: process.env.GITHUB_API_URL || '',
    expected_diff_hash: process.env.MERGE_GUARD_EXPECTED_DIFF_HASH || '',
    expected_proof_hash: process.env.MERGE_GUARD_EXPECTED_PROOF_HASH || '',
    expected_validated_object_hash: process.env.MERGE_GUARD_EXPECTED_VALIDATED_OBJECT_HASH || '',
  }
  if (!input.pr_diff) {
    const acquired = await acquirePullRequestDiff(input)
    input.pr_diff = acquired.pr_diff
    input.diff_source = acquired.diff_source || 'github_pull_request_diff_api'
    input.evaluated_head_sha = acquired.evaluated_head_sha
    input.diff_acquisition_failed = !acquired.ok
    input.evaluated_base_sha = acquired.evaluated_base_sha
  }
  const decision = validateMergeGuard(input)
  const proof = proofFromDecision(decision)
  const proofPath = 'MERGE_GUARD_PROOF.json'
  writeFileSync(proofPath, JSON.stringify(proof, null, 2))

  console.log(`ContinuityOS Merge Guard — result=${decision.result}`)
  console.log(`proof_id=${decision.proof_id}`)
  console.log(`canonical_hash=${decision.canonical_hash}`)
  console.log(`diff_hash=${decision.diff_hash || 'null'}`)
  console.log(`diff_source=${decision.diff_source}`)
  console.log(`author_kind=${decision.author_kind}`)
  console.log(`require_agent_authored=${decision.require_agent_authored}`)
  console.log(`attribution_status=${decision.attribution_status}`)
  console.log(`attribution_classification=${decision.attribution_classification}`)
  console.log(`actor_kind=${decision.actor_attribution.actor_kind}`)
  if (decision.missing_fields.length > 0) console.log(`missing_fields=${decision.missing_fields.join(',')}`)
  if (decision.invalid_fields.length > 0) console.log(`invalid_fields=${decision.invalid_fields.join(',')}`)
  if (decision.null_reasons.length > 0) console.log(`null_reasons=${decision.null_reasons.join(',')}`)

  const githubOutput = process.env.GITHUB_OUTPUT
  if (githubOutput) {
    appendFileSync(githubOutput, `result=${decision.result}\n`)
    appendFileSync(githubOutput, `proof_id=${decision.proof_id}\n`)
    appendFileSync(githubOutput, `proof_hash=${decision.canonical_hash}\n`)
    appendFileSync(githubOutput, `diff_hash=${decision.diff_hash || ''}\n`)
    appendFileSync(githubOutput, `proof_url=${proofPath}\n`)
    appendFileSync(githubOutput, `author_kind=${decision.author_kind}\n`)
    appendFileSync(githubOutput, `null_reasons=${decision.null_reasons.join(',')}\n`)
    appendFileSync(githubOutput, `attribution_status=${decision.attribution_status}\n`)
    appendFileSync(githubOutput, `attribution_classification=${decision.attribution_classification}\n`)
    appendFileSync(githubOutput, `actor_kind=${decision.actor_attribution.actor_kind}\n`)
    appendFileSync(githubOutput, `attribution_evidence_hash=${decision.attribution_evidence_hash}\n`)
  }

  const githubStepSummary = process.env.GITHUB_STEP_SUMMARY
  if (githubStepSummary) {
    const lines = [
      '### ContinuityOS Merge Guard',
      '',
      `result: \`${decision.result}\``,
      `proof_id: \`${decision.proof_id}\``,
      `proof_hash: \`${decision.canonical_hash}\``,
      `diff_hash: \`${decision.diff_hash || 'null'}\``,
      `author_kind: \`${decision.author_kind}\``,
      `require_agent_authored: \`${decision.require_agent_authored}\``,
      `attribution_status: \`${decision.attribution_status}\``,
      `attribution_classification: \`${decision.attribution_classification}\``,
      `actor_kind: \`${decision.actor_attribution.actor_kind}\``,
      `null_reasons: \`${decision.null_reasons.join(',') || 'none'}\``,
      '',
      '```json',
      JSON.stringify(proof, null, 2),
      '```',
      '',
    ].join('\n')
    appendFileSync(githubStepSummary, lines)
  }

  if (decision.result !== 'VALID') {
    console.error(`NULL — ${decision.null_reasons.join(', ') || 'policy_not_satisfied'}`)
    process.exitCode = 1
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
