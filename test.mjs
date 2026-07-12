#!/usr/bin/env node
// actions/stategate/test.mjs
// Deterministic conformance test for the StateGate decision logic.
// No network, no GitHub API — runs evaluate() directly against fixtures.

import { readdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { acquireReviewEvidence, evaluate } from './check.mjs'
import { proofFromDecision, validateMergeGuard, validatorIdentity } from './guard.mjs'

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

console.log('=== StateGate — conformance test ===\n')
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




console.log('\n=== StateGate branding and compatibility contract tests ===\n')

const actionMetadata = readFileSync(join(dir, 'action.yml'), 'utf8')
assertCase('action-metadata-stategate-name', /^name:\s*['"]Continufy StateGate['"]\s*$/m.test(actionMetadata), 'action metadata exposes the Continufy StateGate Marketplace name')
assertCase('action-metadata-stategate-description', /^description:\s*['"]Govern repository state transitions\. VALID \| NULL \| PROOF\.['"]\s*$/m.test(actionMetadata), 'action metadata exposes the canonical StateGate description')

const readme = readFileSync(join(dir, 'README.md'), 'utf8')
const consumerWorkflow = readFileSync(join(dir, 'examples/consumer-workflow.yml'), 'utf8')
const postReleaseVerification = readFileSync(join(dir, 'docs/POST_RELEASE_VERIFICATION.md'), 'utf8')
assertCase('documented-install-uses-stategate', readme.includes('uses: joselunasrt8-creator/stategate@v1') && consumerWorkflow.includes('uses: joselunasrt8-creator/stategate@v1'), 'documented install examples use the stategate repository')
assertCase('consumer-workflow-uses-floating-v1-only', !consumerWorkflow.includes('joselunasrt8-creator/stategate@v1.0.0') && !consumerWorkflow.includes('joselunasrt8-creator/continuity-merge-guard'), 'consumer verification fixture uses only the canonical floating v1 install reference')
assertCase('consumer-workflow-null-diff-is-deterministic', !/pr-diff:\s*['"]{2}/.test(consumerWorkflow) && consumerWorkflow.includes('not a valid git unified diff') && consumerWorkflow.includes('DIFF_MALFORMED'), 'NULL fixture uses malformed local diff input and asserts DIFF_MALFORMED')
assertCase('consumer-workflow-splits-fixture-jobs', /^  stategate-valid:/m.test(consumerWorkflow) && /^  stategate-null:/m.test(consumerWorkflow) && /^  stategate:/m.test(consumerWorkflow), 'consumer workflow has separate VALID, NULL, and aggregate required-check jobs')
const validJob = consumerWorkflow.match(/^  stategate-valid:[\s\S]*?(?=^  stategate-null:)/m)?.[0] || ''
const nullJob = consumerWorkflow.match(/^  stategate-null:[\s\S]*?(?=^  stategate:)/m)?.[0] || ''
const aggregateJob = consumerWorkflow.match(/^  stategate:[\s\S]*$/m)?.[0] || ''
assertCase('consumer-workflow-invokes-stategate-once-per-fixture-job', (validJob.match(/uses: joselunasrt8-creator\/stategate@v1/g) || []).length === 1 && (nullJob.match(/uses: joselunasrt8-creator\/stategate@v1/g) || []).length === 1 && !aggregateJob.includes('uses: joselunasrt8-creator/stategate@v1'), 'StateGate action is invoked once in each fixture job and not in the aggregate job')
assertCase('post-release-tag-model-v11-floating', !/v1\s*(?:==|=|same commit as|resolve to the same commit as)\s*v1\.0\.0/i.test(postReleaseVerification) && postReleaseVerification.includes('refs/tags/v1.1.0') && postReleaseVerification.includes('After `v1.1.0` exists, confirm `v1` and `v1.1.0` dereference to the same release commit'), 'post-release checklist compares v1 with v1.1.0 instead of v1.0.0')
assertCase('post-release-preserves-v100-historical-source', postReleaseVerification.includes('v1.0.0` is the immutable historical pre-StateGate release') && postReleaseVerification.includes('b26c7c29b1f52ac78f6112f9b1a2f1180b00a600'), 'post-release checklist preserves historical v1.0.0 source commit')
assertCase('migration-documents-legacy-action-reference', readme.includes('uses: joselunasrt8-creator/continuity-merge-guard@v1') && readme.includes('uses: joselunasrt8-creator/stategate@v1'), 'migration notes document the legacy action reference and canonical StateGate replacement')

const publicFacingFiles = ['action.yml', 'README.md', 'docs/ARCHITECTURE.md', 'docs/FILE_MANIFEST.md', 'docs/UPGRADE_AND_ROLLBACK.md', 'docs/VERSIONING.md', 'docs/RELEASE_CHECKLIST.md', 'docs/EXTERNAL_INSTALL_VERIFICATION.md', 'docs/POST_RELEASE_VERIFICATION.md', 'examples/consumer-workflow.yml']
const unintendedLegacyBranding = []
for (const relative of publicFacingFiles) {
  const text = readFileSync(join(dir, relative), 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    const allowedMigration = (relative === 'README.md' && (line.includes('Migrating from Merge Guard') || line.includes('prior Merge Guard action') || line.includes('continuity-merge-guard')))
      || (relative === 'docs/POST_RELEASE_VERIFICATION.md' && line.includes('MERGE_GUARD'))
    if (!allowedMigration && /ContinuityOS Merge Guard|\bMerge Guard\b|continuity-merge-guard/.test(line)) {
      unintendedLegacyBranding.push(`${relative}:${index + 1}:${line.trim()}`)
    }
  })
}
assertCase('no-unintended-public-merge-guard-branding', unintendedLegacyBranding.length === 0, `legacy branding limited to migration notes (${unintendedLegacyBranding.join('; ') || 'none'})`)

assertCase('compatibility-aliases-retained', typeof evaluate === 'function' && evaluate(baseInput).canonical_hash === validateMergeGuard(baseInput).canonical_hash, 'legacy evaluate alias remains compatible with validateMergeGuard')
assertCase('legacy-proof-contract-retained', proof.proof_id.startsWith('MERGE_GUARD-') && proof.record_type === 'MERGE_GUARD_PROOF', 'legacy proof id prefix and record type remain stable for proof consumers')

console.log('\n=== Release metadata and manifest tests ===\n')

const identityA = validatorIdentity()
const identityB = validatorIdentity()
assertCase('validator-metadata-deterministic', JSON.stringify(identityA) === JSON.stringify(identityB) && identityA.validator_name === 'stategate' && identityA.validator_version === 'development' && identityA.proof_schema_version === '1.1.0', 'validator identity is deterministic and uses development metadata on the branch')


const archivedV100Manifest = JSON.parse(readFileSync(join(dir, 'release/manifests/v1.0.0.json'), 'utf8'))
assertCase('archived-v100-manifest-version-consistency', archivedV100Manifest.release === 'v1.0.0' && archivedV100Manifest.manifest_version === '1.0.0' && archivedV100Manifest.source_commit === 'b26c7c29b1f52ac78f6112f9b1a2f1180b00a600', 'archived v1.0.0 manifest preserves exact historical release metadata')
assertCase('compatibility-identifiers-not-renamed', actionMetadata.includes('MERGE_GUARD_PROOF') && actionMetadata.includes('MERGE_GUARD_REPO') && identityA.canonical_algorithm_version === 'merge-guard-v1', 'compatibility-sensitive proof and environment identifiers remain stable')

const proofWithValidator = proofFromDecision(canonicalEntry)
assertCase('proof-includes-validator-identity', proofWithValidator.validator?.validator_version === identityA.validator_version && proofWithValidator.validator?.validator_release_hash === identityA.validator_release_hash, 'proof contains validator identity envelope')
assertCase('validator-metadata-preserves-result-and-hash-boundary', canonicalEntry.result === 'VALID' && proofWithValidator.canonical_hash === canonicalEntry.canonical_hash && !('validator' in canonicalEntry.canonical_payload), 'validator metadata does not alter VALID/NULL outcome or canonical payload hash')

function runNode(args) {
  return spawnSync(process.execPath, args, { encoding: 'utf8' })
}

function runGit(args) {
  return spawnSync('git', args, { encoding: 'utf8' })
}

const manifestBefore = readFileSync(join(dir, 'release/RELEASE_MANIFEST.json'), 'utf8')
const buildOnce = runNode(['scripts/build-release-manifest.mjs'])
const manifestAfterFirst = readFileSync(join(dir, 'release/RELEASE_MANIFEST.json'), 'utf8')
const buildTwice = runNode(['scripts/build-release-manifest.mjs'])
const manifestAfterSecond = readFileSync(join(dir, 'release/RELEASE_MANIFEST.json'), 'utf8')
assertCase('release-manifest-stable-generation', buildOnce.status === 0 && buildTwice.status === 0 && manifestAfterFirst === manifestAfterSecond, 'release manifest generation is stable across repeated runs')

const verifyOk = runNode(['scripts/verify-release.mjs'])
assertCase('release-verification-current-tree', verifyOk.status === 0, 'development release verification accepts current metadata, changelog, hashes, and aggregate release hash')

const publishedWithDevelopment = runNode(['scripts/verify-release.mjs', '--published', '--tag=v1.1.0'])
assertCase('release-verification-rejects-development-as-published', publishedWithDevelopment.status !== 0, 'published release verification rejects development metadata')

function withRestoredFile(path, mutate, check) {
  const full = join(dir, path)
  const original = readFileSync(full, 'utf8')
  try {
    writeFileSync(full, mutate(original))
    return check()
  } finally {
    writeFileSync(full, original)
  }
}



function decisionWithTemporaryFileMove(path, movedPath) {
  const full = join(dir, path)
  const moved = join(dir, movedPath)
  renameSync(full, moved)
  try {
    return validateMergeGuard(baseInput)
  } finally {
    renameSync(moved, full)
  }
}

const baselineForMetadataBoundary = validateMergeGuard(baseInput)
const missingMetadataDecision = decisionWithTemporaryFileMove('release/validator-metadata.json', 'release/validator-metadata.json.test-missing')
assertCase('decision-boundary-missing-metadata', missingMetadataDecision.result === baselineForMetadataBoundary.result && missingMetadataDecision.canonical_hash === baselineForMetadataBoundary.canonical_hash, 'missing validator metadata does not change canonical decision result or hash')

const malformedMetadataDecision = withRestoredFile('release/validator-metadata.json', () => '{ malformed metadata', () => validateMergeGuard(baseInput))
assertCase('decision-boundary-malformed-metadata', malformedMetadataDecision.result === baselineForMetadataBoundary.result && malformedMetadataDecision.canonical_hash === baselineForMetadataBoundary.canonical_hash, 'malformed validator metadata does not change canonical decision result or hash')

const missingManifestDecision = decisionWithTemporaryFileMove('release/RELEASE_MANIFEST.json', 'release/RELEASE_MANIFEST.json.test-missing')
assertCase('decision-boundary-missing-manifest', missingManifestDecision.result === baselineForMetadataBoundary.result && missingManifestDecision.canonical_hash === baselineForMetadataBoundary.canonical_hash, 'missing release manifest does not change canonical decision result or hash')

const devProof = proofFromDecision(baselineForMetadataBoundary)
assertCase('proof-development-checkout-identity', devProof.validator.validator_version === 'development' && devProof.validator.validator_release_hash === null, 'development checkout proof uses development identity and no release hash')

const publishedReleaseMode = (() => {
  const originalMetadata = readFileSync(join(dir, 'release/validator-metadata.json'), 'utf8')
  const originalChangelog = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')
  const originalManifest = readFileSync(join(dir, 'release/RELEASE_MANIFEST.json'), 'utf8')
  try {
    writeFileSync(join(dir, 'release/validator-metadata.json'), JSON.stringify({
      validator_name: 'stategate',
      validator_version: '1.1.0',
      canonical_algorithm_version: 'merge-guard-v1',
      proof_schema_version: '1.1.0',
      compatibility_range: '>=1.0.0 <2.0.0',
    }, null, 2) + '\n')
    writeFileSync(join(dir, 'CHANGELOG.md'), originalChangelog.replace('## [Unreleased]', '## [Unreleased]\n\n## [1.1.0] - 2026-07-11'))
    runGit(['tag', '-f', 'v1.1.0', 'HEAD'])
    const build = runNode(['scripts/build-release-manifest.mjs'])
    if (build.status !== 0) return build
    return runNode(['scripts/verify-release.mjs', '--published', '--tag=v1.1.0'])
  } finally {
    runGit(['tag', '-d', 'v1.1.0'])
    writeFileSync(join(dir, 'release/validator-metadata.json'), originalMetadata)
    writeFileSync(join(dir, 'CHANGELOG.md'), originalChangelog)
    writeFileSync(join(dir, 'release/RELEASE_MANIFEST.json'), originalManifest)
  }
})()
assertCase('release-verification-published-checkout-mode', publishedReleaseMode.status === 0, 'published release verification accepts complete non-development release metadata when explicitly requested')

const publishedMissingTag = (() => {
  const originalMetadata = readFileSync(join(dir, 'release/validator-metadata.json'), 'utf8')
  const originalChangelog = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')
  const originalManifest = readFileSync(join(dir, 'release/RELEASE_MANIFEST.json'), 'utf8')
  try {
    writeFileSync(join(dir, 'release/validator-metadata.json'), JSON.stringify({
      validator_name: 'stategate',
      validator_version: '1.1.0',
      canonical_algorithm_version: 'merge-guard-v1',
      proof_schema_version: '1.1.0',
      compatibility_range: '>=1.0.0 <2.0.0',
    }, null, 2) + '\n')
    writeFileSync(join(dir, 'CHANGELOG.md'), originalChangelog.replace('## [Unreleased]', '## [Unreleased]\n\n## [1.1.0] - 2026-07-11'))
    const build = runNode(['scripts/build-release-manifest.mjs'])
    if (build.status !== 0) return build
    return runNode(['scripts/verify-release.mjs', '--published', '--tag=v1.1.0'])
  } finally {
    writeFileSync(join(dir, 'release/validator-metadata.json'), originalMetadata)
    writeFileSync(join(dir, 'CHANGELOG.md'), originalChangelog)
    writeFileSync(join(dir, 'release/RELEASE_MANIFEST.json'), originalManifest)
  }
})()
assertCase('release-verification-published-requires-existing-tag', publishedMissingTag.status !== 0, 'published release verification rejects a missing exact tag')

const publishedMismatchedTag = (() => {
  const originalMetadata = readFileSync(join(dir, 'release/validator-metadata.json'), 'utf8')
  const originalChangelog = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')
  const originalManifest = readFileSync(join(dir, 'release/RELEASE_MANIFEST.json'), 'utf8')
  try {
    writeFileSync(join(dir, 'release/validator-metadata.json'), JSON.stringify({
      validator_name: 'stategate',
      validator_version: '1.1.0',
      canonical_algorithm_version: 'merge-guard-v1',
      proof_schema_version: '1.1.0',
      compatibility_range: '>=1.0.0 <2.0.0',
    }, null, 2) + '\n')
    writeFileSync(join(dir, 'CHANGELOG.md'), originalChangelog.replace('## [Unreleased]', '## [Unreleased]\n\n## [1.1.0] - 2026-07-11'))
    const build = runNode(['scripts/build-release-manifest.mjs'])
    if (build.status !== 0) return build
    runGit(['tag', '-f', 'v1.1.0', 'HEAD~1'])
    return runNode(['scripts/verify-release.mjs', '--published', '--tag=v1.1.0'])
  } finally {
    runGit(['tag', '-d', 'v1.1.0'])
    writeFileSync(join(dir, 'release/validator-metadata.json'), originalMetadata)
    writeFileSync(join(dir, 'CHANGELOG.md'), originalChangelog)
    writeFileSync(join(dir, 'release/RELEASE_MANIFEST.json'), originalManifest)
  }
})()
assertCase('release-verification-published-rejects-tag-source-mismatch', publishedMismatchedTag.status !== 0, 'published release verification rejects tag target mismatch with manifest source_commit')



const malformedMetadata = withRestoredFile('release/validator-metadata.json', original => original.replace('"validator_name"', '"validator_name_broken"'), () => runNode(['scripts/verify-release.mjs']))
assertCase('release-verification-rejects-malformed-metadata', malformedMetadata.status !== 0, 'malformed metadata fails release verification')

const changedRuntime = withRestoredFile('check.mjs', original => `${original}\n// temporary release verification mutation\n`, () => runNode(['scripts/verify-release.mjs']))
assertCase('release-verification-detects-runtime-hash-change', changedRuntime.status !== 0, 'changed runtime file invalidates release verification')

const changelogMismatch = withRestoredFile('CHANGELOG.md', original => original.replace('## [Unreleased]', '## [Development Missing]'), () => runNode(['scripts/verify-release.mjs']))
assertCase('release-verification-detects-changelog-mismatch', changelogMismatch.status !== 0, 'changelog/version mismatch fails release verification')

writeFileSync(join(dir, 'release/RELEASE_MANIFEST.json'), manifestBefore)

const total = passCount + failCount
console.log(`\nTotal: ${total} | PASS: ${passCount} | FAIL: ${failCount}`)
if (failCount > 0) process.exitCode = 1
else console.log('MERGE_GUARD_CONFORMANCE_COMPLETE')

console.log('\n=== Review evidence binding tests ===\n')
const reviewEvidence = (head, reviews) => ({ head_sha: head, reviews })
const approval = (reviewer, commit_id = baseInput.head_sha, submitted_at = '2026-01-01T00:00:00Z', state = 'APPROVED') => ({ reviewer, state, submitted_at, commit_id })
const reviewBase = { ...baseInput, require_review_approval: 'true', minimum_approvals: '1' }

const disabled = validateMergeGuard({ ...baseInput, require_review_approval: 'false' })
assertCase('review-disabled-preserves-valid', disabled.result === 'VALID' && disabled.review_status === 'not_required' && !('review_policy' in disabled.canonical_payload), 'review policy disabled preserves existing VALID behavior')


const disabledInvalidMinimum = validateMergeGuard({ ...baseInput, require_review_approval: 'false', minimum_approvals: 'not-a-number' })
assertCase('review-disabled-ignores-invalid-minimum', disabledInvalidMinimum.result === 'VALID' && disabledInvalidMinimum.review_status === 'not_required' && disabledInvalidMinimum.minimum_approvals === null && !('review_policy' in disabledInvalidMinimum.canonical_payload), 'disabled review policy ignores review-only inputs completely')

const validReview = validateMergeGuard({ ...reviewBase, review_evidence: reviewEvidence(baseInput.head_sha, [approval('alice')]) })
assertCase('review-valid-current-head-approval', validReview.result === 'VALID' && validReview.approval_count === 1 && validReview.review_head_sha === baseInput.head_sha && validReview.review_evidence_hash?.startsWith('sha256:'), 'one current-head approval satisfies review binding')

const missingReview = validateMergeGuard(reviewBase)
assertCase('review-required-missing', missingReview.result === 'NULL' && missingReview.null_reasons.includes('REVIEW_EVIDENCE_MISSING'), 'missing required review evidence returns NULL')

const staleHead = validateMergeGuard({ ...reviewBase, review_evidence: reviewEvidence('cccccccccccccccccccccccccccccccccccccccc', [approval('alice', 'cccccccccccccccccccccccccccccccccccccccc')]) })
assertCase('review-stale-head-evidence', staleHead.result === 'NULL' && staleHead.null_reasons.includes('REVIEW_HEAD_SHA_MISMATCH'), 'evidence bound to stale head SHA returns NULL')

const oldCommitReview = validateMergeGuard({ ...reviewBase, review_evidence: reviewEvidence(baseInput.head_sha, [approval('alice', 'cccccccccccccccccccccccccccccccccccccccc')]) })
assertCase('review-new-commit-invalidates-approval', oldCommitReview.result === 'NULL' && oldCommitReview.null_reasons.includes('REVIEW_STALE') && oldCommitReview.null_reasons.includes('INSUFFICIENT_APPROVALS'), 'approval attached to older commit cannot satisfy current head')

const dismissed = validateMergeGuard({ ...reviewBase, review_evidence: reviewEvidence(baseInput.head_sha, [approval('alice', baseInput.head_sha, '2026-01-01T00:00:00Z', 'DISMISSED')]) })
assertCase('review-dismissed-approval', dismissed.result === 'NULL' && dismissed.null_reasons.includes('REVIEW_DISMISSED'), 'dismissed latest review returns NULL')

const changesAfterApproval = validateMergeGuard({ ...reviewBase, review_evidence: reviewEvidence(baseInput.head_sha, [approval('alice'), approval('alice', baseInput.head_sha, '2026-01-02T00:00:00Z', 'CHANGES_REQUESTED')]) })
assertCase('review-changes-requested-after-approval', changesAfterApproval.result === 'NULL' && changesAfterApproval.null_reasons.includes('REVIEW_CONFLICT') && changesAfterApproval.approval_count === 0, 'later changes-requested review supersedes approval')

const conflicting = validateMergeGuard({ ...reviewBase, review_evidence: reviewEvidence(baseInput.head_sha, [approval('alice', baseInput.head_sha, '2026-01-01T00:00:00Z', 'APPROVED'), approval('alice', baseInput.head_sha, '2026-01-01T00:00:00Z', 'CHANGES_REQUESTED')]) })
assertCase('review-conflicting-evidence', conflicting.result === 'NULL' && conflicting.null_reasons.includes('REVIEW_CONFLICT'), 'ambiguous same-reviewer same-time states return NULL')

const insufficient = validateMergeGuard({ ...reviewBase, minimum_approvals: '2', review_evidence: reviewEvidence(baseInput.head_sha, [approval('alice')]) })
assertCase('review-insufficient-approval-count', insufficient.result === 'NULL' && insufficient.null_reasons.includes('INSUFFICIENT_APPROVALS'), 'minimum approvals are enforced')


const commentedOnly = validateMergeGuard({ ...reviewBase, review_evidence: reviewEvidence(baseInput.head_sha, [approval('alice', baseInput.head_sha, '2026-01-01T00:00:00Z', 'COMMENTED')]) })
assertCase('review-commented-only-requires-approval', commentedOnly.result === 'NULL' && commentedOnly.null_reasons.includes('REVIEW_APPROVAL_REQUIRED') && commentedOnly.null_reasons.includes('INSUFFICIENT_APPROVALS'), 'comment-only current-head reviews do not satisfy required approval')

const duplicate = validateMergeGuard({ ...reviewBase, review_evidence: reviewEvidence(baseInput.head_sha, [approval('alice'), approval('alice', baseInput.head_sha, '2026-01-02T00:00:00Z')]) })
assertCase('review-duplicate-reviewer-latest-only', duplicate.result === 'VALID' && duplicate.approval_count === 1, 'duplicate reviews by one reviewer count once using the latest review')

const orderA = validateMergeGuard({ ...reviewBase, review_evidence: reviewEvidence(baseInput.head_sha, [approval('bob'), approval('alice')]) })
const orderB = validateMergeGuard({ ...reviewBase, review_evidence: reviewEvidence(baseInput.head_sha, [approval('alice'), approval('bob')]) })
assertCase('review-deterministic-ordering-equivalent', orderA.review_evidence_hash === orderB.review_evidence_hash && orderA.canonical_hash === orderB.canonical_hash, 'equivalent review evidence ordering canonicalizes deterministically')

const malformed = validateMergeGuard({ ...reviewBase, review_evidence: '{nope' })
assertCase('review-malformed-evidence', malformed.result === 'NULL' && malformed.null_reasons.includes('REVIEW_EVIDENCE_MALFORMED'), 'malformed review evidence returns NULL')

const changedReviewEvidence = validateMergeGuard({ ...reviewBase, review_evidence: reviewEvidence(baseInput.head_sha, [approval('alice'), approval('bob')]), expected_review_evidence_hash: validReview.review_evidence_hash })
assertCase('review-replay-old-hash-changed-evidence', changedReviewEvidence.result === 'NULL' && changedReviewEvidence.null_reasons.includes('REVIEW_EVIDENCE_HASH_MISMATCH'), 'old review evidence hash cannot replay against changed evidence')

const reviewProof = proofFromDecision(validReview)
assertCase('review-proof-from-decision-exactness', reviewProof.review_required === true && reviewProof.minimum_approvals === 1 && reviewProof.approval_count === 1 && reviewProof.review_evidence_hash === validReview.review_evidence_hash && !('review_evidence' in reviewProof), 'review proof projection is derived from the canonical decision only')

const reviewCompatibility = evaluate({ ...reviewBase, review_evidence: reviewEvidence(baseInput.head_sha, [approval('alice')]) })
assertCase('review-evaluate-alias-matches-validate', reviewCompatibility.canonical_hash === validReview.canonical_hash && reviewCompatibility.result === validReview.result, 'evaluate compatibility alias still matches validateMergeGuard with review evidence')



const originalFetch = globalThis.fetch
try {
  const page1Url = 'https://api.github.com/repos/owner/repo/pulls/32/reviews?per_page=100'
  const page2Url = 'https://api.github.com/reviews?page=2'
  const fetchedUrls = []
  globalThis.fetch = async url => {
    fetchedUrls.push(url)
    if (url === page1Url) {
      return {
        ok: true,
        headers: { get: name => name === 'link' ? `<${page2Url}>; rel="next"` : '' },
        json: async () => [{ user: { login: 'alice' }, state: 'APPROVED', submitted_at: '2026-01-01T00:00:00Z', commit_id: baseInput.head_sha }],
      }
    }
    if (url === page2Url) {
      return {
        ok: true,
        headers: { get: () => '' },
        json: async () => [{ user: { login: 'bob' }, state: 'APPROVED', submitted_at: '2026-01-02T00:00:00Z', commit_id: baseInput.head_sha }],
      }
    }
    return { ok: false, headers: { get: () => '' }, json: async () => [] }
  }
  const acquiredReviews = await acquireReviewEvidence({ ...baseInput, github_token: 'token' })
  const acquiredEvidence = JSON.parse(acquiredReviews.review_evidence)
  assertCase('review-acquisition-pagination', acquiredReviews.ok && fetchedUrls.length === 2 && acquiredEvidence.reviews.length === 2, 'GitHub review acquisition follows pagination links before normalization')
} finally {
  globalThis.fetch = originalFetch
}

const reviewTotal = passCount + failCount
console.log(`\nReview-inclusive Total: ${reviewTotal} | PASS: ${passCount} | FAIL: ${failCount}`)
if (failCount > 0) process.exitCode = 1
