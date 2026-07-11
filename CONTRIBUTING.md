# Contributing to Document Lens

Thanks for your interest. Document Lens is a research tool maintained by a
single developer; contributions, bug reports, and feature ideas are welcome.

## Reporting bugs and requesting features

Open an issue at
<https://github.com/michael-borck/document-lens/issues>. For a bug, please
include your OS, the app version (Help → About, or the release tag), what you
did, what you expected, and what happened. If it's analysis-related, a small
sample document or project helps.

## Getting help / questions

Open a GitHub issue with the `question` label, or email
<michael.borck@curtin.edu.au>.

## Development setup

Document Lens is an Electron + React (TypeScript) desktop app with a Python
analysis backend (`document-analyser`), part of a co-developed "lens family"
(see [`docs/adr/0003-lens-family-always-latest.md`](docs/adr/0003-lens-family-always-latest.md)).

```bash
# 1. This repo
npm install

# 2. The backend (sibling checkout), for `dev-auto` mode
git clone https://github.com/michael-borck/document-analyser ../document-analyser
cd ../document-analyser && uv sync   # or: pip install -e ".[nlp]"
cd -

# 3. Run the app (spawns the sibling backend automatically)
npm run dev

# Tests / typecheck / lint / build
npm test          # vitest (deterministic analysis engine)
npm run typecheck # tsc --noEmit
npm run lint      # eslint
npm run build     # vite + electron-builder (produces installers)
```

Production builds bundle the backend as a PyInstaller binary; developers run
against the sibling checkout.

## Project conventions

- **Decisions are recorded.** Significant architectural or methodological
  choices go in [`docs/adr/`](docs/adr/) (see the template); user-facing
  behaviour is tracked as stories in
  [`docs/design/user-stories.md`](docs/design/user-stories.md), with a
  verification map in [`docs/design/traceability.md`](docs/design/traceability.md).
  `CONTEXT.md` is the source of truth for naming.
- **Deterministic by default.** Every analytical signal must be deterministic
  and reproducible; generative-AI features are opt-in and always flagged (design
  principle #10; ADR-0011, ADR-0014). New signals belong in the tested service
  layer, not the UI.
- **Tests.** Add or update `vitest` tests for any change to the analysis engine.
  Keep the suite green (`npm test`), typecheck clean, and lint clean.
- **Data-layer access** goes through the keyed query registry
  (`electron/queries.ts`), never ad-hoc SQL over IPC (ADR-0015).

## Pull requests

1. Branch from `main`.
2. Keep the change focused; reference an ADR or a `US-*` story where relevant.
3. Ensure `npm test`, `npm run typecheck`, and `npm run lint` pass.
4. Describe what changed and why in the PR body.

By contributing you agree your contributions are licensed under the project's
MIT licence, and to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).
