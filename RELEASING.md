# Releasing Document Lens

A release is two phases: build the artefact, then record the DOI it earns.
The DOI cannot exist before the release, so the write-back is always a second,
post-tag commit on `main`.

`scripts/check-release.sh` enforces the mechanical part. CI runs it on every
push and pull request, and the release workflow runs it with `--tag`, so a tag
that does not match `package.json` fails before anything is built.

## 1. Before tagging

- [ ] Bump the version in all four places:
      `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`,
      `CITATION.cff` (`version` and `date-released`)
- [ ] Refresh the lockfiles (`npm install --package-lock-only`, `cargo check`)
- [ ] Run `bash scripts/check-release.sh` — all versions must agree
- [ ] Commit
- [ ] Tag and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
- [ ] The release workflow builds, signs, publishes, and Zenodo archives it

## 2. After Zenodo mints the DOI

The version DOI is on the Zenodo record; the concept DOI ("all versions") is
under *Cite all versions*.

- [ ] `CITATION.cff`: add `doi: "10.5281/zenodo.<version>"`
- [ ] `README.md` `## Citation`: version, version DOI, and concept DOI
- [ ] `docs/research/index.html`: BibTeX version, date, and DOI
- [ ] The GitHub release notes: both DOIs
- [ ] If the DSR paper pins this release: update its §4.2 and
      `dsr-document-lens/README.md`
- [ ] Commit and push — this is necessarily *after* the tag

## Set once, never touched

- The README DOI badge uses the **concept DOI**, so it never changes
- `.zenodo.json` carries no version or DOI — Zenodo takes the version from the tag

## Do not

- Rewrite or move a tag once Zenodo has archived it — the record is immutable
  and the DOI would no longer describe the code
- Publish a release whose tag disagrees with `package.json` — the tag guard in
  `.github/workflows/tauri.yml` rejects it

## Verify

- `https://doi.org/<version-doi>` resolves to the record
- `releases/latest` points at the new tag
- The Zenodo record lists `michael-borck/document-lens-vX.Y.Z.zip`
