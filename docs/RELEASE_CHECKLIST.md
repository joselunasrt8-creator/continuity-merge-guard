# Release Checklist

- [ ] All tests pass.
- [ ] Working tree clean before tagging.
- [ ] Change `release/validator-metadata.json` from `development` to the intended exact semantic version.
- [ ] `release/validator-metadata.json` version matches the intended exact tag.
- [ ] `CHANGELOG.md` includes the intended version.
- [ ] `node scripts/build-release-manifest.mjs` generated `release/RELEASE_MANIFEST.json`.
- [ ] `node scripts/verify-release.mjs --published --tag=vX.Y.Z` passes without rewriting the manifest.
- [ ] Source commit recorded in `release/RELEASE_MANIFEST.json`.
- [ ] Exact tag `vX.Y.Z` created at the recorded source commit.
- [ ] Release title exactly matches the tag.
- [ ] Release notes exactly match the tag and changelog entry.
- [ ] Major tag update is deliberate and verified.
- [ ] GitHub Marketplace rendering inspected.
- [ ] Fresh consumer install verified.
- [ ] Exact-tag rollback verified.
- [ ] Issue #34 evidence recorded, including blocked criteria if any remain.
