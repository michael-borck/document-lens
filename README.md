# Document Lens Desktop

<!-- BADGES:START -->
[![edtech](https://img.shields.io/badge/-edtech-4caf50?style=flat-square)](https://github.com/topics/edtech) [![batch-processing](https://img.shields.io/badge/-batch--processing-blue?style=flat-square)](https://github.com/topics/batch-processing) [![cross-platform](https://img.shields.io/badge/-cross--platform-blue?style=flat-square)](https://github.com/topics/cross-platform) [![data-visualization](https://img.shields.io/badge/-data--visualization-blue?style=flat-square)](https://github.com/topics/data-visualization) [![desktop-app](https://img.shields.io/badge/-desktop--app-blue?style=flat-square)](https://github.com/topics/desktop-app) [![document-analysis](https://img.shields.io/badge/-document--analysis-blue?style=flat-square)](https://github.com/topics/document-analysis) [![electron](https://img.shields.io/badge/-electron-47848f?style=flat-square)](https://github.com/topics/electron) [![keyword-analysis](https://img.shields.io/badge/-keyword--analysis-blue?style=flat-square)](https://github.com/topics/keyword-analysis) [![pdf-analysis](https://img.shields.io/badge/-pdf--analysis-blue?style=flat-square)](https://github.com/topics/pdf-analysis) [![research](https://img.shields.io/badge/-research-3f51b5?style=flat-square)](https://github.com/topics/research)
<!-- BADGES:END -->

A cross-platform Electron desktop application for batch PDF analysis, designed for researchers analyzing large document collections across various domains.

## Overview

Document Lens Desktop enables researchers to:
- **Batch import** PDF documents (annual reports, research papers, contracts, etc.)
- **Choose a research focus** with pre-loaded keyword frameworks for your domain
- **Analyze** documents using pre-built keyword lists, custom keywords, or hierarchical taxonomies
- **Search** across documents for keywords with tier-level aggregation (e.g., by SDG pillar)
- **Discover** terminology patterns with n-gram analysis (bigrams and trigrams)
- **Compare** coverage across frameworks and documents
- **Visualize** trends with word clouds, heatmaps, treemaps, and trend charts
- **Export** findings in CSV, Excel, JSON, and shareable `.lens` bundle formats
- **Collaborate** by sharing project bundles that include documents, keywords, and analysis

## Target Users

- Researchers analyzing document collections
- Compliance teams reviewing corporate documents
- Non-technical users requiring simple installation
- Platform priority: Windows > Mac > Linux

## Features

### Analysis Workflow

The app guides users through four levels of analysis:

1. **Import & Analyze** - Import PDFs, run document-level analysis (readability, writing quality, word frequency)
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

Keyword lists can be organized into multi-level taxonomies with named tiers. For example, the SDGs Wedding Cake Model organizes 397 keywords into:

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
# Install dependencies
npm install

# Start development
npm run dev
```

### Building

```bash
# Build for current platform
npm run build

# Build for specific platform
npm run build:mac     # macOS (.dmg)
npm run build:win     # Windows (.exe)
npm run build:linux   # Linux (.AppImage)

# Build for all platforms (requires appropriate OS or CI)
npm run build:all
```

Build outputs are placed in the `release/` directory.

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
document-lens-desktop/
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

## Backend

This application connects to the [document-lens](https://github.com/michaelborck-education/document-lens) API backend for PDF text extraction and analysis.

- **Development**: Run the backend locally (`uvicorn app.main:app`)
- **Distribution**: GitHub Actions CI/CD automatically builds and bundles the backend executable using PyInstaller for each platform

## License

MIT License - see [LICENSE](LICENSE) for details.
