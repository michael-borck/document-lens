# Document Lens

Desktop app for keyword analysis of document corpora — built for
researchers studying corporate disclosure. The original use case was
sustainability reporting in Australian university annual reports
(does the document *talk* about a topic, and does it talk about it in
the *right* place?), but the analysis workflows generalise to any
keyword-driven study of unstructured text.

Cross-platform (macOS / Windows / Linux), local-first (SQLite + your
own files on disk), greenfield rebuild on Electron 33 + React 18.

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
`.dmg` (macOS), `Setup.exe` (Windows), or `.AppImage` (Linux). The Python
analysis backend is bundled — there is nothing else to install, and no network
connection is required for analysis. macOS builds are signed and notarised.

**From source** — see [Development](#development) and
[CONTRIBUTING.md](CONTRIBUTING.md).

## Quickstart

1. Launch the app. A first run seeds a working sustainability setup (the SDG
   keyword list, the Pillar and Function axes, and the Wedding Cake scoring
   rule) so you can be productive immediately.
2. **Library** → *Import* (or *Import folder*) to add your PDFs / DOCX / etc.
3. Create a **Project**, add documents to it, and pick your keyword list, axes,
   and scoring rule in **Setup**. Click **Classify documents** to tag sections.
4. Explore: **Coverage**, **Map**, **Score**, **Compare**, **Track**, **Gap**,
   **Audit**, and **Focus** (ranks the documents worth looking at first).
5. **Setup → Export report** for a Word document, or use a BYOK provider under
   **Settings → AI provider** for optional, flagged AI observations.

## What it does

You assemble a **project** — a set of documents, a keyword list, a
few lenses (axes you want to break the analysis along, e.g. SDG /
Pillar / Function), and a scoring rule. The app then exposes nine
purpose-built workflows over that project:

| Workflow | The question it answers |
|---|---|
| **Setup** | Assemble this project: documents, keywords, lenses, scoring rule. |
| **Coverage** | Which keywords appear where? (per-document × per-keyword heatmap.) |
| **Map** | How does each document distribute across two lens axes? (e.g. SDG × Function.) |
| **Score** | A single number per document — Wedding Cake completeness, framework score, etc. |
| **Track** | How does the metric move year-over-year? (per-company / sector overlay.) |
| **Compare** | Rank documents on the chosen metric. (Track without the time dimension.) |
| **Audit** | Is each keyword being used in the right context? (Anomalies + Confirmations modes.) |
| **Discover** | What phrases / synonyms is the corpus using that you should know about? |
| **Read** | What does each document actually say about a topic? (Concordance with PDF preview.) |

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

For each document, ask: of the four organisational **Functions**
(Operations, Supporting, Awareness, Educating), how many deliver all
three sustainability **Pillars** (Biosphere, Society, Economy)?

- **Level 0** — none qualify
- **Level 4** — all four Functions cover all three Pillars

The score is grounded in the SDG Wedding Cake model (Rockström et al.).
Function classification is automatic via sentence embeddings against
the lens value descriptions — see Setup → Function classification.

## Tech stack

| Layer | Choice |
|---|---|
| Shell | Electron 33 |
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind |
| State | Zustand |
| Charts | Recharts |
| Storage | SQLite (better-sqlite3 via IPC) |
| PDF preview | Chromium native PDFium (iframe + blob URL) |
| Backend | [`document-analyser`](https://github.com/michael-borck/document-analyser) (FastAPI, Python 3.11+) — embedded child process |

## Backend architecture

Document Lens does not implement document analysis itself. It embeds
the `document-analyser` Python service as a child process and talks
to it on `127.0.0.1:8765`.

- **Production builds** ship a PyInstaller bundle of `document-analyser`
  inside `resources/backend/`. Spawned on app launch, torn down on
  quit, auto-restarted with backoff (max 3 attempts) on crash.
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
npm run dev    # spawns Electron + Vite + the dev backend
```

The first run wipes any pre-existing schema (greenfield — no
migration scripts; bump `SCHEMA_VERSION` in `electron/database.ts`
when changing tables).

### Releasing

1. Bump `version` in `package.json`
2. Commit
3. Tag: `git tag v0.13.0 && git push origin v0.13.0`
4. GitHub Actions builds + uploads the release artefacts

## Project structure

```
document-lens/
├── electron/              # Electron main process
│   ├── main.ts
│   ├── preload.ts
│   ├── backend-manager.ts # spawns + supervises document-analyser
│   └── database.ts        # SQLite schema + greenfield wipe
├── src/                   # Renderer (React)
│   ├── pages/
│   │   ├── workflow/      # Setup, Coverage, Map, Score, Track,
│   │   │                  # Compare, Audit, Discover, Read
│   │   └── ...            # Library, Keywords, Lenses, Settings
│   ├── components/
│   │   ├── pdf-viewer/    # iframe + Chromium PDFium
│   │   └── ...
│   ├── services/          # business logic; talks to SQLite via IPC
│   │                      # and document-analyser over HTTP
│   ├── stores/            # Zustand
│   └── types/
├── samples/               # sample annual reports + test corpus
├── docs/design/           # user stories, IA, methodology notes
└── resources/             # icons, packaged backend (production)
```

## Licence

MIT — see [LICENSE](LICENSE).
