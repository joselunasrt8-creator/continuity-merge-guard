#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const manifestPath = 'release/RELEASE_MANIFEST.json'
const archivedManifestDir = 'release/manifests'
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

function git(args, options = {}) {
  return execFileSync('git', args, { encoding: 'utf8', ...options }).trim()
}

function gitFileMode(path) {
  try {
    const staged = git(['ls-files', '--stage', '--', path])
    return staged.split(/\s+/)[0] || '100644'
  } catch {
    return '100644'
  }
}

function writeSyntheticTree(entries) {
  const indexDir = mkdtempSync(join(tmpdir(), 'stategate-release-index-'))
  const indexPath = join(indexDir, 'index')
  const env = { ...process.env, GIT_INDEX_FILE: indexPath }
  try {
    for (const entry of entries) {
      execFileSync('git', ['update-index', '--add', '--cacheinfo', entry.mode, entry.blob, entry.path], { env })
    }
    return git(['write-tree'], { env })
  } finally {
    rmSync(indexDir, { recursive: true, force: true })
  }
}

function blobFromRef(ref, path) {
  const output = git(['ls-tree', ref, '--', path])
  const match = output.match(/^(\d+) blob ([0-9a-f]{40})\t(.+)$/)
  if (!match || match[3] !== path) throw new Error(`release manifest input missing from ${ref}: ${path}`)
  return { mode: match[1], blob: match[2], path }
}

export function releasePaths() {
  return [...new Set([...includedPaths, ...fixturePaths()])].sort()
}

export function releaseContentTreeFromWorkingTree(paths = releasePaths()) {
  const entries = paths.map(path => {
    if (!existsSync(path)) throw new Error(`release manifest input missing: ${path}`)
    const blob = git(['hash-object', '-w', '--', path])
    return { mode: gitFileMode(path), blob, path }
  })
  return writeSyntheticTree(entries)
}

export function releaseContentTreeFromGitRef(ref, paths) {
  return writeSyntheticTree(paths.map(path => blobFromRef(ref, path)))
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
  const paths = releasePaths()
  const files = paths.map(path => {
    if (!existsSync(path)) throw new Error(`release manifest input missing: ${path}`)
    return { path, sha256: sha256(readFileSync(path)) }
  })
  const canonical = JSON.stringify({ files })
  const metadata = JSON.parse(readFileSync('release/validator-metadata.json', 'utf8'))
  const release = metadata.validator_version === 'development' ? 'development' : `v${metadata.validator_version}`
  return {
    manifest_version: '1.0.0',
    release,
    source_tree: releaseContentTreeFromWorkingTree(paths),
    release_hash: `sha256:${sha256(canonical)}`,
    files,
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const manifest = buildReleaseManifest()
  const rendered = `${JSON.stringify(manifest, null, 2)}\n`
  writeFileSync(manifestPath, rendered)
  if (manifest.release !== 'development') {
    mkdirSync(archivedManifestDir, { recursive: true })
    writeFileSync(`${archivedManifestDir}/${manifest.release}.json`, rendered)
  }
  console.log(`${manifestPath} ${manifest.release_hash} ${manifest.source_tree}`)
}
