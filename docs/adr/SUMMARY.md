# ADR Summary — one-page decision table

A paper-ready overview of the design decisions behind Document Lens and its
co-developed backend. Full records (context, alternatives rejected, consequences,
commit evidence) are in the numbered ADRs in this directory. Dates are the
decision's commit date; a `→` marks a decision that matured over a range.

| # | Decision | Date | Status | Driving force |
|---|---|---|---|---|
| 0001 | Offline-first desktop app with an embedded Python backend | 2025-12 | Accepted | Private, offline analysis of (often unpublished) corpora on the researcher's own machine |
| 0002 | Backend lifecycle: spawn-only, auto-restart, no orphans | 2026-05 | Accepted | Silently adopting an external backend caused unrecoverable failures and orphan processes |
| 0003 | Always build against the latest backend (no version pin) | 2026-07 | Accepted | The lens family is co-developed; pinning just lets the backend drift |
| 0004 | Greenfield database: no migrations, wipe on schema change | 2026-05 | Accepted | Pre-release tool, no data to preserve; migration scripts are overhead + risk |
| 0005 | Multi-axis tag model (keyword-attached vs document-context) | 2026-05 | Accepted | Some classifications belong to the keyword (SDG), others to a region of the document (Function) |
| 0006 | Positive + counter keywords in one polarity-flagged list | 2026-05 | Accepted | Greenwashing analysis needs the two signals related and co-located, not in separate lists |
| 0007 | Section classification via sentence embeddings, not an LLM | 2026-05 | Accepted | Deterministic, cheap, offline classification of hundreds of varied-format reports |
| 0008 | Wedding Cake scoring: modes, generalisation, X/12 ratio | 2026-05→07 | Accepted | Encode the methodology; generalise beyond sustainability; separate broad-but-shallow from empty |
| 0009 | 2D coverage matrix as the Map's advanced view | 2026-05 | Accepted | Cross-tabulate a keyword-attached axis against a document-context axis |
| 0010 | Tone–Substance Gap (keyword polarity ≠ text sentiment) | 2026-05 | Accepted | Uniformly positive tone hides performative disclosure; the gap is the signal |
| 0011 | Deterministic "substance" signals as notability metrics | 2026-07 | Accepted | Give the researcher repeatable direction instead of stumbling onto the interesting document |
| 0012 | Focus / auto-research mode (bounded, ranked) | 2026-07 | **Proposed** | Unbounded permutation space; "interesting" can't be defined absolutely; must be reproducible |
| 0013 | DOCX report is a format with three scopes, not a mode | 2026-07 | Accepted | Resolve confusion between "the report" and "Focus mode" |
| 0014 | BYOK AI: main-process-only, encrypted keys, always flagged | 2026-07 | Accepted | Optional AI must not leak keys or hit CORS, and must stay transparent + reproducible |
| 0015 | IPC security boundary: keyed query registry + fs-guard | 2026-05 | Accepted | Untrusted document content could escalate (XSS) to arbitrary SQL/DDL and file access |
| 0016 | First-run seeding: generalise, ship sustainability defaults | 2026-05 | Accepted | Domain-general structures vs. day-one value with zero configuration |
| 0017 | v2 greenfield rewrite of the renderer around a new IA | 2026-05 | Accepted | v1's single-axis model couldn't express the multi-axis tag + scoring methodology |
| 0018 | Terminology is a durable decision (Lens → Axis, Focus → Lens) | 2026-01→06 | Accepted | "Lens" was used for two levels at once; naming collisions confused users and code |
| 0019 | Architecture deepening: data seam, corpus, score evaluator | 2026-05 | Accepted | Analysis layer was untestable (SQL over IPC); scoring math was triplicated and could disagree |
| 0020 | Extraction: markitdown for DOCX/text, pdfplumber for PDF, per-page | 2026-04→05 | Accepted | PDF needs per-page text for citation; store it now to avoid a corpus-wide re-import later |
| 0021 | Embedded PDF viewer: iframe + Chromium PDFium (drop pdfjs) | 2026-05 | Accepted | pdfjs-dist's bleeding-edge APIs were an endless polyfill fight against Electron's Chromium |
| 0022 | CPU-only Torch on Linux | 2026-05 | Accepted | The CUDA wheel ballooned the AppImage to 3.17 GB, over GitHub's 2 GiB per-file limit |
| 0023 | Release pipeline: tag-only, macOS signed/notarized on tags | 2026-05 | Accepted | macOS signing needs secrets a PR can't use; don't build/sign macOS on every push |
| 0024 | *(backend)* `api` package + lens-contract family contract | 2026-05 | Accepted | Consistent health/manifest/CORS/auth and a canonical public surface across the family |
| 0025 | *(backend)* Optional ML via extras, graceful degradation | 2026-05→06 | Accepted | Full ML is brittle in one process; not every deployment needs every capability |
| 0026 | *(backend)* Fail loudly on included-but-broken ML, not silently | 2026-05→07 | Accepted | A silent model-load failure hid a recurring, near-undiagnosable clean-machine bug |

**Cross-cutting principle** running through 0007 / 0010 / 0011 / 0012 / 0014:
every computed signal is **deterministic and reproducible**; generative AI is an
**opt-in, always-flagged interpretation layer**, never used to compute a signal.
