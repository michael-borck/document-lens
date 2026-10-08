# End-to-end acceptance suite

Runs the **real renderer bundle** in plain Chromium (served by `vite preview`)
with `window.electron` answered by a Node-side host — the post-Tauri
replacement for driving the Electron binary. The host
(`harness/node-host.ts`) stands in for the Rust shell:

- **db\*** — the real keyed Query Registry (`src/db/queries.ts`) executed
  against a throwaway `:memory:` SQLite built from the real schema
  (`src/db/schema.ts`, via `node:sqlite`). The Rust shell runs the generated
  twin of that registry (`db_generated.rs`, drift-checked in CI), so
  renderer ↔ registry ↔ schema agreement is genuinely tested.
- **fs\*** — real filesystem reads, so import works on real sample PDFs.
- **dialog\*** — stubbed per test (`host.mockOpenFileDialog(paths)`).
- **backend\*** — a real `document-analyser` uvicorn spawned from the sibling
  checkout with the same program/args/env as the Rust dev-mode spawn,
  including the per-launch auth token.

Each test gets a fresh in-memory database — the old suite's throwaway
`DOCLENS_USER_DATA` profile equivalent — so the app's own first-run seed runs
clean on every boot and your real database is never touched.

Setup needs a Chromium download once: `npx playwright install chromium`.

## Run

```bash
npm run test:e2e         # builds the renderer, then runs every e2e spec
npm run test:e2e:smoke   # just the backend-free smoke spec (fast)
npm run capture:help     # not a test: captures docs/screenshots/*.png
                         # (playwright.capture.config.ts)
```

## The specs

| Spec | Needs backend? | What it proves |
|---|---|---|
| `smoke.spec.ts` | No | App boots (renderer + bridge + first-run seed through the real registry/schema) and a project can be created through the three-step wizard. Always runs. |
| `happy-path.spec.ts` | **Yes** | Import → extraction → docs attached to the project over the bundled sample PDFs (classification/score best-effort). **Skips itself** when the `document-analyser` backend isn't reachable, so CI without the ML stack stays green. |
| `corpus.spec.ts` | **Yes** | Imports the synthetic test corpus (ADR-0028) and checks Compare + Focus against `samples/test-corpus/corpus-manifest.json` — orderings, trends, per-signal extremes — through the full pipeline. Also skips itself when the corpus PDFs aren't built (`npm run build:corpus`). |

Backend-gated specs call `bootWithBackend(page, host)`, which spawns the
backend and reloads the app onto it; `false` means "skip". CI runs the whole
suite on every push/PR — the gated specs skip there (no ML stack).

## Notes

- `workers: 1` — the backend port (8765) is fixed, and each test gets its own
  in-memory database anyway, so there is nothing to parallelise over.
- Traces + screenshots are retained only on failure (`test-results/`, gitignored).
- **Stale-backend gotcha:** if something else already owns port 8765 (a
  running dev app, an orphaned uvicorn), backend-gated specs skip rather than
  fight over it. Check with `lsof -nP -i :8765` and kill the orphan.
- **AppleDouble junk:** the exFAT dev volume drops `._*` sidecars everywhere;
  `testIgnore: ['**/._*']` in `playwright.config.ts` keeps them out of
  discovery (delete any that appear: `find e2e -name '._*' -delete`).
