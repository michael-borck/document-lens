# ADR-0001: Offline-first desktop app with an embedded Python analysis backend

**Status:** Accepted
**Date:** 2025-12-09 (matured through 2026-05)
**Evidence:** `645f300` (bundle backend into Electron), `1061dd1` (full ML in bundled binaries), `583028b` / `e2d6cc3` (microservices → single service), repo split `11f1a54` / `0041826`

## Context

The tool targets individual researchers analysing corpora of documents on their
own machines. The analysis needs heavy Python NLP/ML (text extraction,
sentence-transformers, spaCy). The original codebase (CiteSight → DocumentLens)
was a multi-container web service. Requiring researchers to run a server, or
depend on a hosted API, is a barrier and a privacy problem (their corpora may be
sensitive/unpublished).

## Decision

Ship a **single desktop application** (Electron) that **embeds the Python
analysis service** (`document-analyser`) as a PyInstaller binary. Electron
spawns it as a local child process; the renderer talks to it over `localhost`
HTTP. No server to run, no network dependency, no data leaves the machine.

## Alternatives considered

- **Hosted/cloud analysis API** — rejected: privacy, cost, and offline needs.
- **The planned multi-service "Lens" ecosystem** (Presentation/Media/Chart
  services + orchestrator) — scoped but not built; collapsed to one backend.
- **Reimplement analysis in JS/TS** — rejected: the ML stack is Python-native.

## Consequences

- Fully offline and private; installs as one app.
- Large binaries (bundled torch/transformers/spaCy) and cold-start cost — see
  ADR-0002 (lifecycle) and the CPU-only-torch size constraint.
- The backend is a separate repo, co-developed as a family — see ADR-0003.
- Any feature needing the network (e.g. AI observations, ADR-0014) is an
  explicit, opt-in exception to the offline default.
