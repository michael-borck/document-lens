# ADR-0023: Release pipeline — tag-only, macOS signed+notarized on tags only

**Status:** Accepted
**Date:** 2026-05-14 → 2026-05-23
**Evidence:** `12b8d9b` / `99c4d7f` (release trigger), `1058e05` / `6be20de` / `fcc587d`, `d2bbf30` (code signing); `.github/workflows/build.yml`

## Context

macOS code-signing and notarization are slow and need signing secrets a pull
request can't (and shouldn't) use. Building/signing macOS on every push wastes CI
and can't succeed on PRs.

## Decision

- **Tag-only release trigger** (`v*`); no build on main-push. PRs to `main`
  validate the JS build on **unsigned Linux + Windows** (the JS steps are
  identical across OSes).
- macOS is built, **signed, and notarized only on release tags**.
- A **concurrency block** dedupes runs for the same ref.
- (Related: the release build tracks the latest backend, ADR-0003, and the
  matrix is chosen per event.)

## Alternatives considered

- **Build/sign macOS on every push/PR** — rejected: needs secrets PRs lack, and
  wastes ~20-min × 3-platform runs for no extra signal.

## Consequences

- PRs get fast cross-platform validation; releases are fully signed/notarized.
- A release is a tag push; a failed release can be re-cut by moving the tag
  (the pipeline anticipates delete + re-push).
