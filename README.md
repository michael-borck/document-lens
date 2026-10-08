# Document Lens

[![CI](https://github.com/michael-borck/document-lens/actions/workflows/ci.yml/badge.svg)](https://github.com/michael-borck/document-lens/actions/workflows/ci.yml)
[![Build and Release](https://github.com/michael-borck/document-lens/actions/workflows/tauri.yml/badge.svg)](https://github.com/michael-borck/document-lens/actions/workflows/tauri.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Desktop app for keyword analysis of document corpora — built for
researchers studying corporate disclosure. The original use case was
sustainability reporting in Australian university annual reports
(does the document *talk* about a topic, and does it talk about it in
the *right* place?), but the analysis workflows generalise to any
keyword-driven study of unstructured text.

Cross-platform (macOS / Windows), local-first (SQLite + your
own files on disk), greenfield rebuild on Tauri 2 + React 18.

## Statement of need

Researchers studying corporate disclosure (sustainability reporting, regulatory
compliance, financial narratives) routinely ask: *does a document address a
framework's topics, and does it address them substantively or performatively?*
Answering this across a corpus of hundreds of long, varied-format reports is
usually a manual slog — read each document, tag keywords, score by hand, paste
into a spreadsheet — which is slow, hard to reproduce, and difficult to audit.
General text-analysis tools (concordancers, topic models, sentiment APIs) don't
encode the *framework* (e.g. the UN SDGs) or the *methodology* (e.g. a
completeness rubric), and cloud services raise privacy concerns for unpublished
corpora.

Document Lens fills that gap with a **local-first, offline** desktop tool whose
signals are **deterministic and reproducible**: it maps documents to a
user-configurable framework, classifies *where* topics appear via sentence
embeddings, and computes transparent measures — coverage, a Wedding Cake
completeness score, and "substance" signals (repetition, evidence reuse,
coverage spread, …) — every one of which is recomputable from the same inputs.
An optional, clearly-flagged AI layer interprets those deterministic signals but
never replaces them. It is domain-general (ships with sustainability/SDG
defaults, but the framework, axes, and scoring rule are all user-definable).

## Installation

**End users** — download the installer for your platform from the
[latest release](https://github.com/michael-borck/document-lens/releases/latest):
`.dmg` (macOS, Apple Silicon) or `Setup.exe` (Windows). The Python
analysis backend is bundled — there is nothing else to install, and no network
connection is required for analysis. macOS builds are signed and notarised;
Windows builds are currently unsigned, so SmartScreen will warn on first
install (signing is being arranged).

**From source** — see [Development](#development) and
[CONTRIBUTING.md](CONTRIBUTING.md).

## Quickstart

1. Launch the app. A first run seeds a working sustainability setup (the SDG
   keyword list, the Pillar and Function axes, and the Wedding Cake scoring
   rule) so you can be productive immediately.
2. **Library** → *Import* (or *Import folder*) to add your PDFs / DOCX / etc.
   Embedded images are extracted as you import — the gallery button on a
   Library row opens them.
3. Create a **Project**, add documents to it, and pick your keyword list, axes,
   and scoring rule in **Setup**. Click **Classify documents** to tag sections.
4. Open **Focus** — it lands there by default and ranks the documents worth
   looking at first. Click any finding to drill into the tool that explains
   it: a signal chip opens **Compare** on that metric, a document title opens
   **Read** on that document.
5. Adjust and re-rank, or go direct to any tool: **Coverage**, **Map**,
   **Read**, **Discover**, **Score**, **Track**, **Compare**, **Audit**, **Gap**.
6. **Setup → Export report** for a Word document, or use a BYOK provider under
   **Settings → AI provider** for optional, flagged AI observations.

## What it does

You assemble a **project** — a set of documents, a keyword list, a
few lenses (axes you want to break the analysis along, e.g. SDG /
Pillar / Function), and a scoring rule. The app then exposes twelve
purpose-built workflows over that project.

The shape is **hub-and-spoke, not a pipeline** (ADR-0029). Focus is the
hub: it ranks documents by notability and every finding it reports is a
link into the tool that explains it, so you rank, drill into the
evidence, adjust, and re-rank. The remaining phases still teach the
journey — explore what the corpus contains, measure it, verify the
evidence holds up — but you are never required to walk them in order.

| Workflow | The question it answers |
|---|---|
| **Overview** | Where is this project up to? |
| **Setup** | Assemble this project: documents, keywords, axes, scoring rule. |
| *Start* | |
| **Focus** | Which documents should you look at first? (Findings deep-link into the tools below.) |
| *Explore — see what the corpus contains* | |
| **Coverage** | Which of your documents discuss this framework? (per-document × per-keyword heatmap.) |
| **Map** | Where in this document does each topic appear, and how do topics overlap? (e.g. SDG × Function.) |
| **Read** | What does each document actually say about a topic? (Concordance with PDF preview.) |
| **Discover** | What words is your corpus using that you should know about? |
| *Measure — put numbers on it* | |
| **Score** | How does this document rate on your chosen rubric? (Wedding Cake completeness, framework score, etc.) |
| **Track** | How has this topic changed over the years? (per-company / sector overlay.) |
| **Compare** | Which document does best on this framework? (Track without the time dimension.) |
| *Verify — check the evidence holds up* | |
| **Audit** | Is each keyword being used in the right context? (Anomalies + Confirmations modes.) |
| **Gap** | Where does the tone run ahead of the substance? |

The catalogue lives in `src/components/project/workflows.ts` — the tab
strip, the Overview cards, and this table all describe the same list.

## Data model in one paragraph

Every keyword carries a **polarity** (positive — signals delivery;
counter — signals greenwashing / performative language) so the same
list can support both narratives without splitting into two
documents. Keywords carry **tags** against keyword-attached lenses
(SDG, Pillar). Documents carry **section tags** against
document-context lenses (Function — what KIND of activity each
section describes). The two-axis Map and Wedding Cake Score work by
intersecting these tag sets.

## The Wedding Cake Score (the headline scoring rule)

For each document, ask: of the five delivery **Functions**
(Research, Teaching/curriculum, Engagement, Campus operations,
Governance), how many deliver all three sustainability **Pillars**
(Biosphere, Society, Economy)?

- **Level 0** — none qualify
- **Level 5** — all five Functions cover all three Pillars

The score is grounded in the SDG Wedding Cake model (Rockström et al.).
Function classification is automatic via sentence embeddings against
the lens value descriptions — see Setup → Function classification.

## Tech stack

| Layer | Choice |
|---|---|
| Shell | Tauri 2 (Rust core; the React renderer talks to a `window.electron` contract backed by Tauri commands — see `src/lib/desktop-bridge.ts`) |
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind |
| State | Zustand |
| Charts | Recharts |
| Storage | SQLite (rusqlite in the Rust core; keyed Query Registry shared from `src/db/`) |
| PDF preview | Native webview PDF viewer (iframe + blob URL) |
| Backend | [`document-analyser`](https://github.com/michael-borck/document-analyser) (FastAPI, Python 3.11+) — embedded child process |

## Backend architecture

Document Lens does not implement document analysis itself. It embeds
the `document-analyser` Python service as a child process and talks
to it on `127.0.0.1:8765`.

- **Production builds** ship a PyInstaller bundle of `document-analyser`
  as a Tauri sidecar next to the executable. Spawned on app launch by the
  Rust core, torn down on quit, auto-restarted with backoff on crash.
- **Development** spawns `uvicorn` from a sibling
  `../document-analyser/` source checkout. The `.venv` Python in that
  repo is preferred; falls back to `uv run` then system Python 3.
- **Port `127.0.0.1:8765`** is fixed. Offset from
  `document-analyser`'s default `8000` so an embedded instance never
  collides with a system-wide install.
- **Backend failures are non-fatal.** Coverage, Compare, Score,
  Track, Read concordance, Audit Confirmations, and the entire
  document library all work locally without the backend. Only
  document import, Function classification, Audit Anomalies, and
  synonym discovery require it. The status strip surfaces backend
  health.

The dev backend is auto-spawned, not adopted — Document Lens never
talks to a backend it didn't start. This avoids the brittleness of
inheriting an external process with no recovery path.

## Supported document formats

| Format | Extensions | Notes |
|---|---|---|
| PDF | `.pdf` | Per-page extraction via pdfplumber; powers the embedded preview + page deep-link in Read. |
| Word | `.docx` | |
| PowerPoint | `.pptx` | |
| Plain text | `.txt`, `.md` | |

## Document images

Import extracts the images embedded in a document alongside its text
(ADR-0027): the backend finds them, anchors each to its page,
deduplicates by content hash, and filters out tiny decorative assets.
Library rows with images get a **gallery** button — a thumbnail grid
with page badges, click-through to the full-size rendition, and
jump-to-page in the embedded PDF viewer.

Extraction is best-effort and runs after text extraction commits, so a
document whose images fail still imports cleanly. Image text (OCR,
captions, AI descriptions) is phase 2 — the schema reserves the columns,
but nothing populates them yet.

## Read workflow — finding the passage in the source

Each concordance match card gives you four ways to land on the
keyword in the source PDF, in increasing reliability:

1. **Embedded Preview** — opens the PDF inside the app at the right
   page in Chromium's PDFium viewer. Hit ⌘F and paste the keyword (or
   use Copy phrase) to highlight in-place.
2. **Open at page N** — opens in your OS PDF viewer at the right
   page via `file://...#page=N`. Preview / Acrobat honour the
   fragment; viewers that don't gracefully open at page 1.
3. **Open source file** — opens at page 1 in your OS viewer.
4. **Copy phrase** — three-word snippet (`<word-before> <keyword>
   <word-after>`) on your clipboard, paste into any viewer's Find.

## Development

### Prerequisites

- Node.js 20+
- Python 3.11+ with a sibling `../document-analyser` checkout (run
  `uv sync` or `pip install -e .[nlp]` in that repo to get the
  optional ML dependencies)

### Setup

```bash
git clone https://github.com/michael-borck/document-lens.git
git clone https://github.com/michael-borck/document-analyser.git  # sibling
cd document-lens
npm install
npm run dev    # spawns Tauri + Vite + the dev backend
```

The first run wipes any pre-existing schema (greenfield — no
migration scripts; bump `SCHEMA_VERSION` in `src/db/schema.ts`
when changing tables).

### Testing

```bash
npm run lint           # eslint (src)
npm run typecheck      # tsc --noEmit
npm test               # vitest — unit + invariant suite
npm run test:coverage  # vitest with a v8 coverage report (coverage/)
npm run test:e2e       # Playwright (browser harness): builds, then runs e2e/
npm run test:e2e:smoke # just the backend-free smoke spec
```

CI (`.github/workflows/ci.yml`) runs lint + typecheck + tests + coverage and the
e2e suite on every push/PR. The e2e suite runs the renderer in Chromium with a
Node-side host standing in for the Tauri shell; the backend-gated specs
(happy-path, corpus) skip themselves when no `document-analyser` sibling is
present, so CI without the ML stack stays green. See [e2e/README.md](e2e/README.md).

### Releasing

1. Bump `version` in `package.json`
2. Commit
3. Tag: `git tag v0.13.0 && git push origin v0.13.0`
4. GitHub Actions builds + uploads the release artefacts

## Project structure

```
document-lens/
├── src-tauri/             # Tauri shell (Rust)
│   ├── src/backend.rs     # spawns + supervises document-analyser
│   ├── src/db.rs          # SQLite lifecycle (path, pragmas, greenfield wipe)
│   └── src/db_generated.rs# keyed query registry, generated from src/db/
├── src/
│   ├── db/                # schema.ts + queries.ts — the shared, pure
│   │                      # schema/Query Registry (Rust twin is generated)
│   ├── pages/
│   │   ├── workflow/      # Overview, Setup, Focus, Coverage, Map,
│   │   │                  # Read, Discover, Score, Track, Compare,
│   │   │                  # Audit, Gap
│   │   └── ...            # Library, Keywords, Lenses, Settings
│   ├── components/
│   │   ├── project/       # workflows.ts — the workflow catalogue
│   │   ├── pdf-viewer/    # iframe + native webview PDF viewer
│   │   ├── images/        # document image gallery
│   │   └── ...
│   ├── lib/desktop-bridge.ts  # installs the Tauri-backed window.electron
│   ├── services/          # business logic; talks to SQLite via the bridge
│   │                      # and document-analyser over HTTP
│   ├── stores/            # Zustand
│   └── types/
├── e2e/                   # Playwright acceptance suite (browser harness)
├── samples/               # sample annual reports + test corpus
├── docs/design/           # user stories, IA, methodology notes
└── resources/             # icons, packaged backend (production)
```

## Licence

MIT — see [LICENSE](LICENSE).
