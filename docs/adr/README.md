# Architecture Decision Records

This directory records the significant, durable decisions behind Document Lens
and its co-developed backend (`document-analyser`) — the *why* behind the
architecture and the analysis methodology. It complements
[`../design/`](../design/) (which holds the information architecture, user
stories, and forward-looking design docs).

Each ADR is a short, standalone record: **Context** (the forces), **Decision**
(what was chosen), **Alternatives considered** (what was rejected and why), and
**Consequences**. Where possible each cites the **evidence** — commit hashes or
files — so the decision trail is auditable. Use
[`0000-adr-template.md`](0000-adr-template.md) for new records.

These were backfilled 2026-07-10 from the git history of both repositories.
Dates are the decision's commit date; a decision may have matured over several
commits.

## Status legend

- **Accepted** — in effect.
- **Proposed** — decided in principle, not yet (fully) implemented.
- **Superseded by ADR-XXXX** — replaced; kept for the record.

## Index

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-offline-first-embedded-backend.md) | Offline-first desktop app with an embedded Python analysis backend | Accepted |
| [0002](0002-backend-lifecycle.md) | Backend lifecycle: bundled binary, spawn-only, auto-restart | Accepted |
| [0003](0003-lens-family-always-latest.md) | Lens family co-development: always build against the latest backend | Accepted |
| [0004](0004-greenfield-database.md) | Greenfield database: no migrations, wipe on schema change | Accepted |
| [0005](0005-multi-axis-tag-model.md) | Multi-axis tag model: keyword-attached vs document-context axes | Accepted |
| [0006](0006-polarity-in-one-list.md) | Positive and counter keywords in one polarity-flagged list | Accepted |
| [0007](0007-embedding-classification.md) | Section classification via sentence embeddings, not an LLM | Accepted |
| [0008](0008-wedding-cake-scoring.md) | Wedding Cake scoring: modes, generalisation, and the X/12 ratio | Accepted |
| [0009](0009-two-axis-matrix.md) | The 2D coverage matrix as the Map's advanced view | Accepted |
| [0010](0010-tone-substance-gap.md) | Tone–Substance Gap: keyword polarity is not text sentiment | Accepted |
| [0011](0011-substance-signals.md) | Deterministic "substance" signals as reusable notability metrics | Accepted |
| [0012](0012-focus-auto-research-mode.md) | Focus / auto-research mode: bounded, ranked, deterministic + flagged AI | Proposed |
| [0013](0013-docx-report-format-not-mode.md) | The DOCX report is a format with three scopes, not a mode | Accepted |
| [0014](0014-byok-ai-architecture.md) | BYOK AI: main-process-only, encrypted keys, always flagged | Accepted |
| [0015](0015-ipc-security-boundary.md) | IPC security boundary: keyed query registry + fs-guard | Accepted |
| [0016](0016-first-run-seeding.md) | First-run seeding: generalise the structure, ship sustainability defaults | Accepted |
