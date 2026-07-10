# ADR-0003: Lens family co-development — always build against the latest backend

**Status:** Accepted
**Date:** 2026-07-09
**Evidence:** `981ff1c` (always build against latest document-analyser / track main); prior pins `e3f7895` (v0.3.1 for CVEs), backend `api` package via lens-contract `77a0fbf`

## Context

Document Lens is one member of a co-developed "lens family": the app
(`document-lens`), the analysis backend (`document-analyser`), and shared
packages `lens-contract` (auth/CORS/manifest/health contract) and `lens-embed`
(embeddings). They are tightly coupled and maintained together by a single
developer. The CI release build had **pinned** the backend to a specific tag
(v0.3.1 → v0.7.0 → a v0.7.1 hotfix) to keep builds reproducible and to clear
CVEs. In practice the pin let the backend drift behind the app and forced
version-hotfix ceremony on the maintainer.

## Decision

The release build **always checks out `document-analyser` at `main`** — never a
pinned version. The family moves together, so "latest" is the correct pairing;
there is nothing to keep in lockstep. Backend fixes reach the app automatically.

## Alternatives considered

- **Pin the backend version** (previous approach) — rejected: for a
  co-developed family it just introduces drift and manual bumping; reproducib
  ility of a *release* is served by the release tag itself, not by pinning a
  sibling repo.

## Consequences

- Releases always ship the latest backend; upstream fixes are automatic.
- Release builds are not byte-reproducible against a moving `main` — an accepted
  trade-off for a solo-maintained, co-developed family.
- One **non-family** pin remains — `setuptools<81` — a temporary workaround for
  a PyInstaller `pyi_rth_pkgres` hook that calls a `pkg_resources` API removed
  in setuptools 81. It is explicitly *not* a version pin of a family tool and
  should be removed when PyInstaller's hook supports newer setuptools.
