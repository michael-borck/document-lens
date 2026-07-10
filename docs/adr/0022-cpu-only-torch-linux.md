# ADR-0022: CPU-only Torch on Linux (a release-size architectural constraint)

**Status:** Accepted
**Date:** 2026-05-14
**Evidence:** `2eb1640` "CPU-only torch on Linux — drop AppImage from 3.17 GB to ~1 GB"; `.github/workflows/build.yml` (torch CPU index install)

## Context

Bundling the full ML stack (ADR-0001) made the Linux AppImage **3.17 GB** —
PyPI's default Linux `torch` wheel bundles ~1 GB of NVIDIA CUDA libraries, but the
backend runs inference on CPU only (no GPU path). The artefact also exceeded
GitHub Releases' **2 GiB per-file** upload limit, blocking releases.

## Decision

In CI, **install CPU-only torch from PyTorch's dedicated CPU index *before* the
NLP extras**, so the resolver sees torch already satisfied and does not pull the
CUDA wheel. Drops the Linux AppImage from ~3.17 GB to ~1 GB (under the release
limit). macOS/Windows PyPI wheels are CPU-only by default — no special handling.

## Alternatives considered

- **Ship the default (CUDA) torch wheel** — rejected: dead weight (no GPU path)
  and it breaks the GitHub Releases upload limit.

## Consequences

- Releasable Linux artefact; smaller download.
- The backend is CPU-only by design; a future GPU path would need a separate
  build variant.
