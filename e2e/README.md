# End-to-end acceptance suite

Drives the **built** Electron app through Playwright's Electron driver — the
same mechanism `scripts/capture-help-screenshots.mjs` uses, but with
assertions. Each test launches the real app in a throwaway `DOCLENS_USER_DATA`
profile (a temp dir), so the first-run seed runs clean and your real database is
never touched.

Playwright launches the app's **own** Electron binary, so there is **no browser
download** — `npm install` is all the setup needed.

## Run

```bash
npm run test:e2e         # builds the renderer, then runs every e2e spec
npm run test:e2e:smoke   # just the backend-free smoke spec (fast)
npm run test:e2e:only    # run against the already-built dist/ (skip the build)
```

## The two specs

| Spec | Needs backend? | What it proves |
|---|---|---|
| `smoke.spec.ts` | No | App boots (main + preload + IPC + SQLite + renderer + first-run seed) and a project can be created through the three-step wizard. Always runs. |
| `happy-path.spec.ts` | **Yes** | Import → classify → score over the bundled sample PDFs. **Skips itself** when the `document-analyser` backend isn't reachable, so CI without the ML stack stays green. |

The happy-path spec mocks the native file-open dialog (via `app.evaluate` on the
main process) so import picks `samples/*.pdf` headlessly, and gates on
`window.electron.getBackendStatus().phase === 'ready'`.

## Notes

- `workers: 1` — one Electron app at a time; each test still gets its own
  profile, so state never leaks between tests.
- Traces + screenshots are retained only on failure (`test-results/`, gitignored).
- The backend auto-spawns from a sibling `../document-analyser` checkout in dev;
  see the repo README's *Backend architecture* section.
