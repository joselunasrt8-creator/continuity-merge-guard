#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { releaseContentTreeFromGitRef, releaseContentTreeFromWorkingTree } from './build-release-manifest.mjs'

const published = process.argv.includes('--published')
const metadata = readJson('release/validator-metadata.json')
const tag = process.argv.find(a => a.startsWith('--tag='))?.slice('--tag='.length) || (published ? `v${metadata.validator_version}` : 'development')
const majorTag = process.argv.find(a => a.startsWith('--major-tag='))?.slice('--major-tag='.length) || ''
const expectedMajorTarget = process.argv.find(a => a.startsWith('--expected-major-target='))?.slice('--expected-major-target='.length) || ''

function fail(message) {
  console.error(`release verification failed: ${message}`)
  process.exit(1)
}
function sha256(data) { return createHash('sha256').update(data).digest('hex') }
function readJson(path) {
  if (!existsSync(path)) fail(`missing ${path}`)
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch (err) { fail(`malformed ${path}: ${err.message}`) }
}
function requireString(obj, field, path) {
  if (typeof obj[field] !== 'string' || obj[field].trim() === '') fail(`${path} missing string ${field}`)
}
function tagTarget(name) {
  try { return execFileSync('git', ['rev-list', '-n', '1', name], { encoding: 'utf8' }).trim() } catch { fail(`cannot resolve tag ${name}`) }
}
function gitTree(ref) {
  try { return execFileSync('git', ['rev-parse', `${ref}^{tree}`], { encoding: 'utf8' }).trim() } catch { fail(`cannot resolve tree for ${ref}`) }
}

for (const field of ['validator_name', 'validator_version', 'canonical_algorithm_version', 'proof_schema_version', 'compatibility_range']) requireString(metadata, field, 'release/validator-metadata.json')
if (metadata.validator_name !== 'stategate') fail('unexpected validator_name')
if (published && metadata.validator_version === 'development') fail('published verification cannot use development metadata')
if (published && tag !== `v${metadata.validator_version}`) fail(`validator_version ${metadata.validator_version} does not match tag ${tag}`)

const changelog = existsSync('CHANGELOG.md') ? readFileSync('CHANGELOG.md', 'utf8') : fail('missing CHANGELOG.md')
if (published && !changelog.includes(`## [${metadata.validator_version}]`)) fail(`CHANGELOG.md lacks ${metadata.validator_version}`)
if (!published && metadata.validator_version === 'development' && !changelog.includes('## [Unreleased]')) fail('CHANGELOG.md lacks Unreleased development section')
if (!published && metadata.validator_version !== 'development' && !changelog.includes(`## [${metadata.validator_version}]`)) fail(`CHANGELOG.md lacks ${metadata.validator_version}`)

const archivedV100 = readJson('release/manifests/v1.0.0.json')
if (archivedV100.release !== 'v1.0.0' || archivedV100.source_commit !== 'b26c7c29b1f52ac78f6112f9b1a2f1180b00a600') fail('v1.0.0 provenance changed')
if (metadata.canonical_algorithm_version !== 'merge-guard-v1') fail('canonical_algorithm_version changed')
if (metadata.compatibility_range !== '>=1.0.0 <2.0.0') fail('compatibility_range changed')

const manifest = readJson('release/RELEASE_MANIFEST.json')
if (!Array.isArray(manifest.files) || manifest.files.length === 0) fail('manifest has no files')
requireString(manifest, 'release', 'release/RELEASE_MANIFEST.json')
requireString(manifest, 'release_hash', 'release/RELEASE_MANIFEST.json')
requireString(manifest, 'source_tree', 'release/RELEASE_MANIFEST.json')
if (manifest.release !== (metadata.validator_version === 'development' ? 'development' : `v${metadata.validator_version}`)) fail('manifest release does not match validator_version')
if ('source_commit' in manifest) fail('release manifest must not bind v1.1.0 to a source_commit')

if (manifest.release !== 'development') {
  const archivedCurrentPath = `release/manifests/${manifest.release}.json`
  const archivedCurrent = readJson(archivedCurrentPath)
  if (JSON.stringify(archivedCurrent) !== JSON.stringify(manifest)) fail(`${archivedCurrentPath} does not match release/RELEASE_MANIFEST.json`)
}
const sorted = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path))
if (JSON.stringify(sorted) !== JSON.stringify(manifest.files)) fail('manifest paths are not sorted')
for (const entry of manifest.files) {
  requireString(entry, 'path', 'release manifest file entry')
  requireString(entry, 'sha256', `release manifest ${entry.path}`)
  if (!existsSync(entry.path)) fail(`runtime file missing: ${entry.path}`)
  const actual = sha256(readFileSync(entry.path))
  if (actual !== entry.sha256) fail(`runtime file hash differs: ${entry.path}`)
}
const aggregate = `sha256:${sha256(JSON.stringify({ files: manifest.files }))}`
if (aggregate !== manifest.release_hash) fail(`aggregate release hash differs: ${aggregate} !== ${manifest.release_hash}`)

const manifestPaths = manifest.files.map(entry => entry.path)
const workingTree = releaseContentTreeFromWorkingTree(manifestPaths)
if (workingTree !== manifest.source_tree) fail(`release content tree differs: ${workingTree} !== ${manifest.source_tree}`)

if (published) {
  const target = tagTarget(tag)
  gitTree(target)
  const tagContentTree = releaseContentTreeFromGitRef(target, manifestPaths)
  if (tagContentTree !== manifest.source_tree) {
    fail(`manifest source_tree ${manifest.source_tree} does not match ${tag} release content tree ${tagContentTree}`)
  }
}

if (majorTag || expectedMajorTarget) {
  if (!published) fail('major tag verification is only valid in --published mode')
  if (!majorTag || !expectedMajorTarget) fail('major tag verification requires --major-tag and --expected-major-target')
  if (tagTarget(majorTag) !== tagTarget(expectedMajorTarget)) fail(`${majorTag} does not target ${expectedMajorTarget}`)
}
console.log(`release verification passed for ${published ? tag : metadata.validator_version} ${manifest.release_hash} ${manifest.source_tree}`)
