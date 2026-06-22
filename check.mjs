#!/usr/bin/env node
// actions/continuity-merge-guard/check.mjs
// ContinuityOS Merge Guard — v1
// Self-contained: no external npm dependencies.

import { writeFileSync, appendFileSync } from 'node:fs'
import { canonicalize, sha256Hex } from './canonical.mjs'
import { classifyAttribution } from './attribution.mjs'

export { canonicalize, sha256Hex }

const REQUIRED_FIELDS = ['repo', 'pr_number', 'head_sha', 'base_sha', 'actor']
const AUTHOR_KINDS = ['agent', 'human', 'unknown']
const REQUIRE_AGENT_VALUES = ['true', 'false']

function normalizeString(v) {
  return typeof v === 'string' ? v.trim() : ''
}

function normalizeAuthorKind(v) {
  return normalizeString(v).toLowerCase() || 'unknown'
}

function normalizeRequireAgentAuthored(v) {
  return normalizeString(v).toLowerCase() || 'false'
}

export function evaluate(input) {
  const missing_fields = REQUIRED_FIELDS.filter(f => {
    const v = input[f]
    return v === undefined || v === null || v === ''
  })
  const author_kind = normalizeAuthorKind(input.author_kind)
  const require_agent_authored = normalizeRequireAgentAuthored(input.require_agent_authored)
  const invalid_fields = []
  if (!AUTHOR_KINDS.includes(author_kind)) invalid_fields.push('author_kind')
  if (!REQUIRE_AGENT_VALUES.includes(require_agent_authored)) invalid_fields.push('require_agent_authored')

  const null_reasons = []
  if (missing_fields.length > 0) null_reasons.push('MISSING_REQUIRED_FIELD')
  if (invalid_fields.length > 0) null_reasons.push('INVALID_POLICY_FIELD')

  const agent_author_required = require_agent_authored === 'true'
  if (agent_author_required && author_kind !== 'agent') {
    null_reasons.push('AGENT_AUTHOR_REQUIRED')
  }

  const attribution = classifyAttribution({
    actor: input.actor,
    pr_author: input.pr_author ?? input.actor,
    head_ref: input.head_ref,
    pr_body: input.pr_body,
    pr_labels: input.pr_labels,
    commit_trailers: input.commit_trailers,
    operator_id: input.operator_id,
  })
  if (attribution.attribution_status === 'identity_ambiguous') {
    null_reasons.push('ATTRIBUTION_AMBIGUOUS')
  }

  const canonical_payload = REQUIRED_FIELDS.reduce((o, f) => {
    o[f] = input[f] ?? null
    return o
  }, {})
  canonical_payload.author_kind = author_kind
  canonical_payload.require_agent_authored = require_agent_authored
  const canonical_hash = sha256Hex(canonicalize(canonical_payload))
  const result = null_reasons.length === 0 ? 'VALID' : 'NULL'
  const head_sha = input.head_sha ?? ''
  const proof_id = `MERGE_GUARD-${input.pr_number ?? 'unknown'}-${head_sha.slice(0, 8) || 'unknown'}`

  return {
    proof_id,
    repo: input.repo ?? null,
    canonical_payload,
    canonical_hash,
    result,
    missing_fields,
    invalid_fields,
    author_kind,
    require_agent_authored,
    agent_author_required,
    null_reasons,
    actor_attribution: attribution.actor_attribution,
    attribution_classification: attribution.attribution_classification,
    attribution_status: attribution.attribution_status,
    attribution_evidence_hash: attribution.attribution_evidence_hash,
    record_type: 'MERGE_GUARD_PROOF',
  }
}

function main() {
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
  }
  const decision = evaluate(input)
  const generated_at = new Date().toISOString()
  const proof = {
    proof_id: decision.proof_id,
    repo: decision.repo,
    canonical_payload: decision.canonical_payload,
    canonical_hash: decision.canonical_hash,
    result: decision.result,
    missing_fields: decision.missing_fields,
    invalid_fields: decision.invalid_fields,
    author_kind: decision.author_kind,
    require_agent_authored: decision.require_agent_authored,
    agent_author_required: decision.agent_author_required,
    null_reasons: decision.null_reasons,
    actor_attribution: decision.actor_attribution,
    attribution_classification: decision.attribution_classification,
    attribution_status: decision.attribution_status,
    attribution_evidence_hash: decision.attribution_evidence_hash,
    generated_at,
    record_type: decision.record_type,
  }
  const proofPath = 'MERGE_GUARD_PROOF.json'
  writeFileSync(proofPath, JSON.stringify(proof, null, 2))

  console.log(`ContinuityOS Merge Guard — result=${decision.result}`)
  console.log(`proof_id=${decision.proof_id}`)
  console.log(`canonical_hash=${decision.canonical_hash}`)
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
if (isMain) main()
