# Working in document-lens

This repo is a member of the lens workspace. The rules in
[`../AGENTS.md`](../AGENTS.md) apply: branch first, open a pull request, squash
merge, never commit to `main`. CI is the gate; there is no second reviewer.

## What this repo is

A Tauri desktop app: React/TypeScript renderer, Rust shell in `src-tauri/`, and a
Python sidecar built from the [`document-analyser`](https://github.com/michael-borck/document-analyser)
repo. It is not Electron, so there is no `app.config.cjs`. `scripts/build-sidecar.sh`
clones the analyser's `main` and freezes it with PyInstaller at release time, so a
release pins the engine by date, not by version.

Domain language: [`CONTEXT.md`](CONTEXT.md). Decisions: [`docs/adr/`](docs/adr/).
Deferred work: [`docs/OPEN-THREADS.md`](docs/OPEN-THREADS.md).

## Commands

- `npm run dev` — app with the sidecar
- `npm run typecheck`, `npm run lint`, `npm test`
- `npm run test:e2e` — Playwright, building the renderer first
- `npm run gen:rust-db` — regenerate the Rust twin after changing `src/db/queries.ts`
- `npm run build:manual` — the PDF manual

Sidecar tests belong in the analyser repo.

## Rules that bite

- Keyword matching has one seam: `src/services/_shared/keyword-match.ts`
  (ADR-0037). Do not add a second matcher; extend it, with tests.
- The Query Registry in `src/db/queries.ts` is mirrored into
  `src-tauri/src/db_generated.rs`. Change the registry, then run
  `npm run gen:rust-db`; CI fails on drift.
- Schema changes need a migration step and a `schema_version` bump. See the
  migration notes at the top of `src/db/schema.ts`.
- Study evidence does not live here. The calibration study and its data live with
  the paper (ADR-0042). This repo ships the instrument.
- Exports are data-driven: a coding-sheet profile maps columns, and a keyword
  list is imported. Do not hardcode one study's columns or vocabulary in the app
  or the engine.
- Local-first is the product: no telemetry, no network calls without the user's
  own provider keys.
- No comments in code unless asked.

## CI and releases

- Required checks: `Release metadata`, `Lint · Typecheck · Test`,
  `E2E (Playwright browser harness)`, `Tauri core (Rust check · test · drift)`.
  If you add or rename a job in `.github/workflows/ci.yml`, update branch
  protection in the same PR.
- Releases are tags only, through the shared app-hq Tauri workflow
  (`.github/workflows/tauri.yml`). Do not add a second release path.
- When a required check cannot run on a pull request, it blocks every merge.
  Keep tag-only jobs out of the required set.
