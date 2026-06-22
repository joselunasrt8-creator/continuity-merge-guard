#!/usr/bin/env node
// actions/continuity-merge-guard/test.mjs
// Deterministic conformance test for the Merge Guard decision logic.
// No network, no GitHub API — runs evaluate() directly against fixtures.

import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluate } from './check.mjs'

const dir = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(dir, 'fixtures')
let passCount = 0
let failCount = 0

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
  const decision = evaluate(fixture.input)

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
    const decisionAgain = evaluate(fixture.input)
    if (decision.canonical_hash !== decisionAgain.canonical_hash) {
      recordFail(file, `canonical_hash not deterministic: ${decision.canonical_hash} vs ${decisionAgain.canonical_hash}`)
      continue
    }
    recordPass(file, `${fixture.description} [sha256: ${decision.canonical_hash.slice(0, 16)}...]`)
    continue
  }
  recordPass(file, fixture.description)
}

const total = passCount + failCount
console.log(`\nTotal: ${total} | PASS: ${passCount} | FAIL: ${failCount}`)
if (failCount > 0) process.exitCode = 1
else console.log('MERGE_GUARD_CONFORMANCE_COMPLETE')
