# StateGate v1.1.1 Release Handoff

Status: release candidate prepared locally with deterministic release-content tree binding; remote tag, Marketplace, and consumer checks remain unverified until the maintainer performs them.

## Invariants

- `v1.0.0` remains the immutable historical pre-StateGate release and must continue resolving to `bbc8ad7eb48645530542db85eb12a6c26b461404`.
- Do not rewrite `release/manifests/v1.0.0.json`.
- Do not rename `merge-guard-v1`, `MERGE_GUARD_PROOF.json`, `MERGE_GUARD_PROOF`, `MERGE_GUARD-`, or `MERGE_GUARD_*` compatibility surfaces.
- Create immutable `v1.1.1` before moving the floating `v1` tag.
- Remote observations are unverified until actually run against GitHub and Marketplace.

## Maintainer commands

```sh
git checkout main
git pull --ff-only origin main
git status --short
git log --oneline --decorate -5
```

Verify the historical release remains unchanged:

```sh
node -e 'const m=require("./release/manifests/v1.0.0.json"); if (m.source_commit !== "bbc8ad7eb48645530542db85eb12a6c26b461404") process.exit(1); console.log("v1.0.0 provenance ok")'
```

Generate the deterministic manifest and run the local release checks before tagging:

```sh
for f in *.mjs scripts/*.mjs; do node --check "$f"; done
ruby -e 'require "yaml"; ARGV.each { |f| YAML.load_file(f) }; puts "yaml ok"' action.yml examples/consumer-workflow.yml
node test.mjs
node scripts/build-release-manifest.mjs
node scripts/verify-release.mjs
git diff --check
```

Create the final release commit if these files changed during finalization:

```sh
git status --short
git add CHANGELOG.md release/validator-metadata.json release/RELEASE_MANIFEST.json release/manifests/v1.1.1.json scripts/build-release-manifest.mjs scripts/verify-release.mjs test.mjs docs/V1_1_1_RELEASE_HANDOFF.md
git commit -m "Prepare StateGate v1.1.1 release"
```

Confirm the committed release-content tree equals the manifest source tree, then record the exact candidate commit:

```sh
node scripts/verify-release.mjs
release_commit=$(git rev-parse HEAD)
printf '%s\n' "$release_commit"
```

Create the immutable exact tag first:

```sh
git tag -a v1.1.1 "$release_commit" -m "StateGate v1.1.1"
node scripts/verify-release.mjs --published --tag=v1.1.1
```

If published verification succeeds, push the exact tag:

```sh
git push origin main
git push origin v1.1.1
```

Only after `v1.1.1` is published and verified, create or move the floating major tag:

```sh
git tag -f -a v1 "$release_commit" -m "StateGate v1"
git push origin refs/tags/v1 --force
```

Confirm exact and floating tags resolve to the same commit:

```sh
test "$(git rev-list -n 1 v1)" = "$(git rev-list -n 1 v1.1.1)"
```

Confirm `v1.0.0` remains historical:

```sh
test "$(git rev-list -n 1 v1.0.0)" = "bbc8ad7eb48645530542db85eb12a6c26b461404"
```

Create the GitHub release from `v1.1.1` after the tag exists. Remote check: unverified.

Verify Marketplace rendering for `Continufy StateGate` after GitHub indexes the release. Remote check: unverified.

Run the consumer workflow pinned to `joselunasrt8-creator/stategate@v1`. Remote check: unverified.

Rollback floating `v1` without moving immutable `v1.1.1`:

```sh
git tag -f -a v1 <prior-good-commit> -m "Rollback StateGate v1 floating tag"
git push origin refs/tags/v1 --force
```

## Release identity model

A committed file cannot contain the SHA of the same Git commit without a hash fixed point. The release manifests therefore do not store a v1.1.1 `source_commit`. They store `source_tree`, the deterministic Git tree for the release payload files listed in the manifest. The exact immutable tag supplies the release commit identity, and published verification resolves the tag target and requires its release-content tree to match `manifest.source_tree`.
