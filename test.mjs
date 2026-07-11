#!/usr/bin/env node
// actions/continuity-merge-guard/test.mjs
// Deterministic conformance test for the Merge Guard decision logic.
// No network, no GitHub API — runs evaluate() directly against fixtures.

import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluate } from './check.mjs'
import { proofFromDecision, validateMergeGuard } from './guard.mjs'

const dir = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(dir, 'fixtures')
let passCount = 0
let failCount = 0

const DEFAULT_DIFF = [
  'diff --git a/README.md b/README.md',
  'index 1111111..2222222 100644',
  '--- a/README.md',
  '+++ b/README.md',
  '@@ -1 +1 @@',
  '-old',
  '+new',
  '',
].join('\n')

function withDefaultDiff(input) {
  if ('pr_diff' in input || input.diff_acquisition_failed) return input
  return { ...input, pr_diff: DEFAULT_DIFF, diff_source: 'test_fixture_pull_request_diff' }
}

function recordPass(name, message) {
  passCount++
  console.log(` ${name} PASS — ${message}`)
}

function recordFail(name, message) {
  failCount++
  console.error(` ${name} FAIL — ${message}`)
}

console.log('=== ContinuityOS Merge Guard — conformance test ===\n')
for (const file of readdirSync(fixturesDir).sort()) {
  if (!file.endsWith('.json')) continue
  const fixture = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'))
  const decision = evaluate(withDefaultDiff(fixture.input))

  if (decision.result !== fixture.expected_result) {
    recordFail(file, `expected result ${fixture.expected_result}, got ${decision.result}`)
    continue
  }
  if (JSON.stringify(decision.missing_fields) !== JSON.stringify(fixture.expected_missing_fields)) {
    recordFail(file, `expected missing_fields ${JSON.stringify(fixture.expected_missing_fields)}, got ${JSON.stringify(decision.missing_fields)}`)
    continue
  }
  if ('expected_invalid_fields' in fixture && JSON.stringify(decision.invalid_fields) !== JSON.stringify(fixture.expected_invalid_fields)) {
    recordFail(file, `expected invalid_fields ${JSON.stringify(fixture.expected_invalid_fields)}, got ${JSON.stringify(decision.invalid_fields)}`)
    continue
  }
  if ('expected_null_reasons' in fixture && JSON.stringify(decision.null_reasons) !== JSON.stringify(fixture.expected_null_reasons)) {
    recordFail(file, `expected null_reasons ${JSON.stringify(fixture.expected_null_reasons)}, got ${JSON.stringify(decision.null_reasons)}`)
    continue
  }
  if (fixture.expected_author_kind && decision.author_kind !== fixture.expected_author_kind) {
    recordFail(file, `expected author_kind ${fixture.expected_author_kind}, got ${decision.author_kind}`)
    continue
  }
  if (fixture.expected_require_agent_authored && decision.require_agent_authored !== fixture.expected_require_agent_authored) {
    recordFail(file, `expected require_agent_authored ${fixture.expected_require_agent_authored}, got ${decision.require_agent_authored}`)
    continue
  }

  const attr = decision.actor_attribution
  const attrKeys = ['actor_kind', 'actor_id', 'operator_id', 'attribution_source', 'confidence', 'evidence']
  const attrShapeOk = attr && typeof attr === 'object' && attrKeys.every(k => k in attr) && Array.isArray(attr.evidence)
  if (!attrShapeOk) {
    recordFail(file, 'missing/malformed actor_attribution object')
    continue
  }
  if (!/^[0-9a-f]{64}$/.test(decision.attribution_evidence_hash || '')) {
    recordFail(file, `attribution_evidence_hash is not a sha256 hex: ${decision.attribution_evidence_hash}`)
    continue
  }
  if (fixture.expected_attribution_status && decision.attribution_status !== fixture.expected_attribution_status) {
    recordFail(file, `expected attribution_status ${fixture.expected_attribution_status}, got ${decision.attribution_status}`)
    continue
  }
  if (fixture.expected_actor_kind && attr.actor_kind !== fixture.expected_actor_kind) {
    recordFail(file, `expected actor_kind ${fixture.expected_actor_kind}, got ${attr.actor_kind}`)
    continue
  }
  if (fixture.expected_attribution_classification && decision.attribution_classification !== fixture.expected_attribution_classification) {
    recordFail(file, `expected attribution_classification ${fixture.expected_attribution_classification}, got ${decision.attribution_classification}`)
    continue
  }
  if (fixture.check_type === 'deterministic_hash') {
    const decisionAgain = evaluate(withDefaultDiff(fixture.input))
    if (decision.canonical_hash !== decisionAgain.canonical_hash) {
      recordFail(file, `canonical_hash not deterministic: ${decision.canonical_hash} vs ${decisionAgain.canonical_hash}`)
      continue
    }
    recordPass(file, `${fixture.description} [sha256: ${decision.canonical_hash.slice(0, 16)}...]`)
    continue
  }
  recordPass(file, fixture.description)
}

function assertCase(name, condition, message) {
  if (condition) recordPass(name, message)
  else recordFail(name, message)
}

console.log('\n=== Canonical PR diff binding tests ===\n')

const baseInput = {
  repo: 'owner/repo',
  pr_number: '32',
  head_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  base_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  actor: 'some-contributor',
  pr_diff: DEFAULT_DIFF,
  diff_source: 'test_fixture_pull_request_diff',
}
const changedLineDiff = DEFAULT_DIFF.replace('+new', '+newer')
const addedFileDiff = [
  'diff --git a/new.txt b/new.txt',
  'new file mode 100644',
  'index 0000000..3333333',
  '--- /dev/null',
  '+++ b/new.txt',
  '@@ -0,0 +1 @@',
  '+hello',
  '',
].join('\n')
const deletedFileDiff = [
  'diff --git a/old.txt b/old.txt',
  'deleted file mode 100644',
  'index 4444444..0000000',
  '--- a/old.txt',
  '+++ /dev/null',
  '@@ -1 +0,0 @@',
  '-goodbye',
  '',
].join('\n')


const canonicalEntry = validateMergeGuard(baseInput)
const compatibilityEntry = evaluate(baseInput)
assertCase('canonical-entrypoint-compatibility', canonicalEntry.canonical_hash === compatibilityEntry.canonical_hash && canonicalEntry.result === compatibilityEntry.result, 'legacy evaluate export delegates to canonical validateMergeGuard path')


const differentSource = validateMergeGuard({ ...baseInput, diff_source: 'alternate_provenance' })
assertCase('canonical-diff-source-bound-to-proof', differentSource.diff_hash === canonicalEntry.diff_hash && differentSource.canonical_hash !== canonicalEntry.canonical_hash, 'same diff text with different provenance keeps diff hash but changes proof hash')

const humanAttribution = validateMergeGuard({ ...baseInput, pr_labels: 'human-authored' })
assertCase('canonical-attribution-bound-to-proof', humanAttribution.result === 'VALID' && humanAttribution.canonical_hash !== canonicalEntry.canonical_hash && humanAttribution.attribution_evidence_hash !== canonicalEntry.attribution_evidence_hash, 'attribution evidence changes canonical proof identity')

const proof = proofFromDecision(canonicalEntry)
assertCase('canonical-proof-object-exactness', proof.canonical_hash === canonicalEntry.canonical_hash && proof.record_type === 'MERGE_GUARD_PROOF' && !('github_token' in proof), 'proof object is derived from canonical decision without runtime-only inputs')

const expectedProofAccepted = validateMergeGuard({ ...baseInput, expected_proof_hash: canonicalEntry.canonical_hash, expected_validated_object_hash: canonicalEntry.canonical_hash })
assertCase('canonical-expected-proof-success', expectedProofAccepted.result === 'VALID', 'current proof and validated-object hashes are accepted')

const invalidPolicyBoth = validateMergeGuard({ ...baseInput, author_kind: 'robot', require_agent_authored: 'yes' })
assertCase('canonical-invalid-policy-fields', invalidPolicyBoth.result === 'NULL' && invalidPolicyBoth.invalid_fields.join(',') === 'author_kind,require_agent_authored' && invalidPolicyBoth.null_reasons.includes('INVALID_POLICY_FIELD'), 'invalid policy inputs fail through canonical validation')

const mismatchedBase = validateMergeGuard({ ...baseInput, evaluated_base_sha: 'dddddddddddddddddddddddddddddddddddddddd' })
assertCase('canonical-base-sha-mismatch', mismatchedBase.result === 'NULL' && mismatchedBase.null_reasons.includes('BASE_SHA_MISMATCH'), 'evaluated base SHA mismatch fails closed')

const tamperedDiff = validateMergeGuard({ ...baseInput, expected_diff_hash: canonicalEntry.diff_hash, pr_diff: changedLineDiff })
assertCase('canonical-replay-tampered-diff', tamperedDiff.result === 'NULL' && tamperedDiff.null_reasons.includes('DIFF_HASH_MISMATCH'), 'replayed validation rejects tampered diff with old diff hash')

const sameA = evaluate(baseInput)
const sameB = evaluate({ ...baseInput })
assertCase('diff-binding-same-pr-same-diff', sameA.diff_hash === sameB.diff_hash && sameA.canonical_hash === sameB.canonical_hash, 'same identity and diff produce same hashes')

const lf = evaluate(baseInput)
const crlf = evaluate({ ...baseInput, pr_diff: DEFAULT_DIFF.replace(/\n/g, '\r\n') })
assertCase('diff-binding-line-endings', lf.diff_hash === crlf.diff_hash, 'CRLF and LF normalize to same diff hash')

const changed = evaluate({ ...baseInput, pr_diff: changedLineDiff })
assertCase('diff-binding-changed-source-line', sameA.diff_hash !== changed.diff_hash, 'changed source line changes diff hash')

const added = evaluate({ ...baseInput, pr_diff: addedFileDiff })
assertCase('diff-binding-added-file', sameA.diff_hash !== added.diff_hash, 'added file changes diff hash')

const deleted = evaluate({ ...baseInput, pr_diff: deletedFileDiff })
assertCase('diff-binding-deleted-file', sameA.diff_hash !== deleted.diff_hash, 'deleted file changes diff hash')

const changedHead = evaluate({ ...baseInput, head_sha: 'cccccccccccccccccccccccccccccccccccccccc' })
assertCase('diff-binding-changed-head-sha', sameA.canonical_hash !== changedHead.canonical_hash && sameA.proof_id !== changedHead.proof_id, 'changed head SHA changes proof identity')

const missingDiff = evaluate({ ...baseInput, pr_diff: '' })
assertCase('diff-binding-missing-diff', missingDiff.result === 'NULL' && missingDiff.null_reasons.includes('DIFF_MISSING'), 'missing diff returns NULL')

const malformedDiff = evaluate({ ...baseInput, pr_diff: 'not a unified git diff\n' })
assertCase('diff-binding-malformed-diff', malformedDiff.result === 'NULL' && malformedDiff.null_reasons.includes('DIFF_MALFORMED'), 'malformed diff returns NULL')

const acquisitionFailure = evaluate({ ...baseInput, pr_diff: '', diff_acquisition_failed: true })
assertCase('diff-binding-acquisition-failure', acquisitionFailure.result === 'NULL' && acquisitionFailure.null_reasons.includes('DIFF_ACQUISITION_FAILED'), 'diff acquisition failure returns NULL')

const oldProofOnNewDiff = evaluate({ ...baseInput, pr_diff: changedLineDiff, expected_diff_hash: sameA.diff_hash, expected_proof_hash: sameA.canonical_hash })
assertCase('diff-binding-old-proof-new-diff', oldProofOnNewDiff.result === 'NULL' && oldProofOnNewDiff.null_reasons.includes('DIFF_HASH_MISMATCH'), 'old proof no longer satisfies current diff')

const postValidationMutation = evaluate({ ...baseInput, actor: 'mutated-actor', expected_validated_object_hash: sameA.canonical_hash })
assertCase('diff-binding-post-validation-mutation', postValidationMutation.result === 'NULL' && postValidationMutation.null_reasons.includes('VALIDATED_OBJECT_MUTATION'), 'post-validation object mutation returns NULL')

const replayA = evaluate(baseInput)
const replayB = evaluate(JSON.parse(JSON.stringify(baseInput)))
assertCase('diff-binding-deterministic-replay', replayA.result === replayB.result && replayA.canonical_hash === replayB.canonical_hash, 'deterministic replay produces identical result and proof hash')

const total = passCount + failCount
console.log(`\nTotal: ${total} | PASS: ${passCount} | FAIL: ${failCount}`)
if (failCount > 0) process.exitCode = 1
else console.log('MERGE_GUARD_CONFORMANCE_COMPLETE')
