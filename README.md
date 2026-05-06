# Document Lens

Extracts text from documents and returns readability metrics, word counts, and structural information. Accepts PDF, DOCX, PPTX, and plain text formats.

A cross-platform Electron desktop application for batch PDF analysis, designed for researchers analysing large document collections across various domains.

## Overview

Document Lens enables researchers to:
- **Batch import** PDF documents (annual reports, research papers, contracts, etc.)
- **Choose a research focus** with pre-loaded keyword frameworks for your domain
- **Analyse** documents using pre-built keyword lists, custom keywords, or hierarchical taxonomies
- **Search** across documents for keywords with tier-level aggregation (e.g., by SDG pillar)
- **Discover** terminology patterns with n-gram analysis (bigrams and trigrams)
- **Compare** coverage across frameworks and documents
- **Visualize** trends with word clouds, heatmaps, treemaps, and trend charts
- **Export** findings in CSV, Excel, JSON, and shareable `.lens` bundle formats
- **Collaborate** by sharing project bundles that include documents, keywords, and analysis

## Target Users

- Researchers analysing document collections
- Compliance teams reviewing corporate documents
- Non-technical users requiring simple installation
- Platform priority: Windows > Mac > Linux

## Features

### Analysis Workflow

The app guides users through four levels of analysis:

1. **Import & Analyse** - Import PDFs, run document-level analysis (readability, writing quality, word frequency)
2. **Keyword Search** - Search for framework terms across documents with tier-level aggregation
3. **N-gram Discovery** - Find frequently occurring 2-3 word phrases to discover terminology patterns
4. **Visualize & Compare** - Generate charts comparing keyword usage, trends, and document coverage

### Keyword Frameworks

32+ pre-built keyword frameworks across 8 research domains:

| Domain | Frameworks |
|--------|-----------|
| Sustainability | TCFD, GRI, SDGs, SASB, SDGs Wedding Cake Model |
| Cybersecurity | NIST CSF, ISO 27001, CIS Controls, MITRE ATT&CK |
| Finance | SEC, GAAP, Basel III, Financial Ratios |
| Healthcare | FDA, HIPAA, Clinical Trials, Medical Terminology |
| Legal | Contract Terms, Regulatory Language, Compliance |
| Academic | Research Methods, Statistical Terms, Literature Review |
| Project Management | Agile, PMBOK, Risk Management |
| General | Custom keywords only |

### Hierarchical Taxonomies

Keyword lists can be organised into multi-level taxonomies with named tiers. For example, the SDGs Wedding Cake Model organises 397 keywords into:

- **Pillar** (Environmental, Social, Economic, Governance) > **Goal** (SDG 1-17) > **Keywords**

Analysis results can be viewed at any tier level, with coverage percentages and match counts per category. Users can create their own taxonomies by importing Excel files or converting existing grouped lists.

### Visualizations

- Word clouds
- Keyword frequency bar charts
- Keywords x Documents heatmaps
- Year-over-year trend lines
- Framework comparison radar charts
- Grouped document comparison charts
- Taxonomy treemaps (hierarchical match distribution)
- Taxonomy stacked bar charts (per-document tier breakdown)

All charts exportable as images.

### Collaboration

Projects can be shared as `.lens` bundle files (ZIP format) containing:
- Documents with extracted text and metadata
- Analysis results (readability, writing quality, word analysis)
- Keyword configurations and custom keyword lists
- PDF files (optional, for full replication)

Recipients import bundles to replicate the sender's complete analysis setup. Intelligent deduplication prevents reimporting identical documents.

### Data Management

- Project-based organization with shared document library
- Local SQLite database for offline access
- Drag-and-drop PDF import with auto-metadata detection
- Custom keyword list creation, editing, and Excel/CSV import
- Export to CSV, Excel, JSON, and full project ZIP bundles
- Restore default keyword lists from Settings

## Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | Electron 33+ |
| Frontend | React 18 + TypeScript |
| UI Components | Shadcn/ui + Tailwind CSS |
| State Management | Zustand |
| Database | SQLite (better-sqlite3) |
| Charts | Recharts |
| Word Cloud | visx |
| Build | Vite + electron-builder |
| Auto-update | electron-updater |

## Development

### Prerequisites
- Node.js 20+
- npm or yarn

### Setup

```bash
pip install document-analyser
```

Requires Python 3.11+.

## Usage

### Python

```python
from app.analyser import DocumentAnalyser

result = DocumentAnalyser().analyse("report.pdf")

print(f"Words:       {result['word_count']}")
print(f"Sentences:   {result['sentence_count']}")
print(f"Readability: {result['readability']['flesch_reading_ease']:.1f} (Flesch)")
print(result["text"][:500])
```

### CLI

```bash
# Human-readable summary
document-analyser report.pdf

# Machine-readable JSON
document-analyser thesis.docx --json

# Start the HTTP server
document-analyser serve --port 8000
```

### HTTP API

### Releasing

1. Update version in `package.json`
2. Commit changes
3. Create and push a git tag:
   ```bash
   git tag v0.11.0
   git push origin v0.11.0
   ```
4. GitHub Actions will automatically build and create a release

### Project Structure

```
document-lens/
├── electron/           # Main process (Electron)
│   ├── main.ts
│   ├── preload.ts
│   ├── backend-manager.ts
│   └── database.ts
├── src/               # Renderer process (React)
│   ├── components/    # UI components + charts
│   ├── pages/         # Route pages
│   ├── stores/        # Zustand state management
│   ├── services/      # Business logic
│   └── data/          # Keyword frameworks (JSON)
├── resources/         # App icons
└── build/            # Build configuration
```

## Supported formats

| Format | Extensions |
|---|---|
| PDF | `.pdf` |
| Word | `.docx` |
| PowerPoint | `.pptx` |
| Plain text | `.txt` `.md` |

## Output

## Licence

MIT Licence - see [LICENSE](LICENSE) for details.
