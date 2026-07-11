// actions/continuity-merge-guard/guard.mjs
// Canonical Merge Guard validation surface. Every execution path (library,
// CLI, and GitHub Action) must enter through validateMergeGuard() so the
// validated object, proof object, and emitted decision share one canonical flow.

import { canonicalize, sha256Hex, diffHash } from './canonical.mjs'
import { classifyAttribution } from './attribution.mjs'

export const REQUIRED_FIELDS = ['repo', 'pr_number', 'head_sha', 'base_sha', 'actor']
export const AUTHOR_KINDS = ['agent', 'human', 'unknown']
export const REQUIRE_AGENT_VALUES = ['true', 'false']
export const DIFF_CANONICALIZATION = 'line_endings_lf_terminal_lf_preserve_order_and_patch_text'
export const RECORD_TYPE = 'MERGE_GUARD_PROOF'

export function normalizeString(v) {
  return typeof v === 'string' ? v.trim() : ''
}

function normalizeAuthorKind(v) {
  return normalizeString(v).toLowerCase() || 'unknown'
}

function normalizeRequireAgentAuthored(v) {
  return normalizeString(v).toLowerCase() || 'false'
}

export function boolInput(v) {
  return v === true || normalizeString(v).toLowerCase() === 'true'
}

function canonicalPayload(input, diff_hash, diff_source, author_kind, require_agent_authored, attribution) {
  const payload = REQUIRED_FIELDS.reduce((o, f) => {
    o[f] = input[f] ?? null
    return o
  }, {})
  payload.diff_hash = diff_hash
  payload.diff_source = diff_source
  payload.author_kind = author_kind
  payload.require_agent_authored = require_agent_authored
  payload.attribution_status = attribution.attribution_status
  payload.attribution_classification = attribution.attribution_classification
  payload.attribution_evidence_hash = attribution.attribution_evidence_hash
  return payload
}

function proofId(input) {
  const head_sha = input.head_sha ?? ''
  return `MERGE_GUARD-${input.pr_number ?? 'unknown'}-${head_sha.slice(0, 8) || 'unknown'}`
}

export function validateMergeGuard(input = {}) {
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
  if (boolInput(input.diff_acquisition_failed)) null_reasons.push('DIFF_ACQUISITION_FAILED')

  const evaluated_head_sha = normalizeString(input.evaluated_head_sha || input.head_sha)
  if (normalizeString(input.head_sha) && evaluated_head_sha && normalizeString(input.head_sha) !== evaluated_head_sha) {
    null_reasons.push('HEAD_SHA_MISMATCH')
  }
  const evaluated_base_sha = normalizeString(input.evaluated_base_sha || input.base_sha)
  if (normalizeString(input.base_sha) && evaluated_base_sha && normalizeString(input.base_sha) !== evaluated_base_sha) {
    null_reasons.push('BASE_SHA_MISMATCH')
  }

  const diff = diffHash(input.pr_diff)
  if (!diff.ok) null_reasons.push(diff.reason)

  const diff_source = normalizeString(input.diff_source) || 'github_pull_request_diff'
  const expected_diff_hash = normalizeString(input.expected_diff_hash)
  if (expected_diff_hash && diff.diff_hash && expected_diff_hash !== diff.diff_hash) null_reasons.push('DIFF_HASH_MISMATCH')

  const agent_author_required = require_agent_authored === 'true'
  if (agent_author_required && author_kind !== 'agent') null_reasons.push('AGENT_AUTHOR_REQUIRED')

  const attribution = classifyAttribution({
    actor: input.actor,
    pr_author: input.pr_author ?? input.actor,
    head_ref: input.head_ref,
    pr_body: input.pr_body,
    pr_labels: input.pr_labels,
    commit_trailers: input.commit_trailers,
    operator_id: input.operator_id,
  })
  if (attribution.attribution_status === 'identity_ambiguous') null_reasons.push('ATTRIBUTION_AMBIGUOUS')

  const canonical_payload = canonicalPayload(input, diff.diff_hash, diff_source, author_kind, require_agent_authored, attribution)
  const canonical_hash = sha256Hex(canonicalize(canonical_payload))
  const expected_proof_hash = normalizeString(input.expected_proof_hash)
  if (expected_proof_hash && expected_proof_hash !== canonical_hash) null_reasons.push('PROOF_HASH_MISMATCH')
  const expected_validated_object_hash = normalizeString(input.expected_validated_object_hash)
  if (expected_validated_object_hash && expected_validated_object_hash !== canonical_hash) null_reasons.push('VALIDATED_OBJECT_MUTATION')

  const result = null_reasons.length === 0 ? 'VALID' : 'NULL'
  return {
    proof_id: proofId(input),
    repo: input.repo ?? null,
    canonical_payload,
    canonical_hash,
    diff_hash: diff.diff_hash,
    diff_source,
    diff_canonicalization: DIFF_CANONICALIZATION,
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
    record_type: RECORD_TYPE,
  }
}

export function proofFromDecision(decision) {
  return {
    proof_id: decision.proof_id,
    repo: decision.repo,
    canonical_payload: decision.canonical_payload,
    canonical_hash: decision.canonical_hash,
    diff_hash: decision.diff_hash,
    diff_source: decision.diff_source,
    diff_canonicalization: decision.diff_canonicalization,
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
    record_type: decision.record_type,
  }
}
