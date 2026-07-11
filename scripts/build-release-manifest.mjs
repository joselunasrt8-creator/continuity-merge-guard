#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const manifestPath = 'release/RELEASE_MANIFEST.json'
const includedPaths = [
  'action.yml',
  'attribution.mjs',
  'canonical.mjs',
  'check.mjs',
  'guard.mjs',
  'test.mjs',
  'release/validator-metadata.json',
]

function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

function gitHead() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() } catch { return 'unknown' }
}

function sourceCommit() {
  try {
    const metadata = JSON.parse(readFileSync('release/validator-metadata.json', 'utf8'))
    return metadata.validator_version === 'development' ? 'development' : gitHead()
  } catch {
    return 'development'
  }
}

function fixturePaths() {
  try {
    return execFileSync('git', ['ls-files', 'fixtures/*.json'], { encoding: 'utf8' })
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

export function buildReleaseManifest() {
  const paths = [...new Set([...includedPaths, ...fixturePaths()])].sort()
  const files = paths.map(path => {
    if (!existsSync(path)) throw new Error(`release manifest input missing: ${path}`)
    return { path, sha256: sha256(readFileSync(path)) }
  })
  const canonical = JSON.stringify({ files })
  return {
    manifest_version: '1.0.0',
    source_commit: sourceCommit(),
    release_hash: `sha256:${sha256(canonical)}`,
    files,
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const manifest = buildReleaseManifest()
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`${manifestPath} ${manifest.release_hash}`)
}
