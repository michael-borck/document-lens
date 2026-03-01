# Document Lens Desktop

<!-- BADGES:START -->
[![edtech](https://img.shields.io/badge/-edtech-4caf50?style=flat-square)](https://github.com/topics/edtech) [![batch-processing](https://img.shields.io/badge/-batch--processing-blue?style=flat-square)](https://github.com/topics/batch-processing) [![cross-platform](https://img.shields.io/badge/-cross--platform-blue?style=flat-square)](https://github.com/topics/cross-platform) [![data-visualization](https://img.shields.io/badge/-data--visualization-blue?style=flat-square)](https://github.com/topics/data-visualization) [![desktop-app](https://img.shields.io/badge/-desktop--app-blue?style=flat-square)](https://github.com/topics/desktop-app) [![document-analysis](https://img.shields.io/badge/-document--analysis-blue?style=flat-square)](https://github.com/topics/document-analysis) [![electron](https://img.shields.io/badge/-electron-47848f?style=flat-square)](https://github.com/topics/electron) [![keyword-analysis](https://img.shields.io/badge/-keyword--analysis-blue?style=flat-square)](https://github.com/topics/keyword-analysis) [![pdf-analysis](https://img.shields.io/badge/-pdf--analysis-blue?style=flat-square)](https://github.com/topics/pdf-analysis) [![research](https://img.shields.io/badge/-research-3f51b5?style=flat-square)](https://github.com/topics/research)
<!-- BADGES:END -->

A cross-platform Electron desktop application for batch PDF analysis, designed for researchers analyzing large document collections across various domains.

## Overview

Document Lens Desktop enables researchers to:
- **Batch import** PDF documents (annual reports, research papers, contracts, etc.)
- **Choose a research focus** with pre-loaded keyword frameworks for your domain
- **Analyze** documents using pre-built keyword lists or custom keywords
- **Search** across documents for keywords and n-grams
- **Compare** coverage across multiple frameworks
- **Visualize** trends over time with word clouds, heatmaps, and trend charts
- **Export** findings in CSV, Excel, and JSON formats

## Target Users

- Researchers analyzing document collections
- Compliance teams reviewing corporate documents
- Non-technical users requiring simple installation
- Platform priority: Windows > Mac > Linux

## Features

### Core Features
- Project-based organization with document library (documents can belong to multiple projects)
- **Research Focuses** for domain-specific analysis:
  - Sustainability (TCFD, GRI, SDGs, SASB)
  - Cybersecurity (NIST CSF, ISO 27001, CIS Controls, MITRE ATT&CK)
  - Finance (SEC, GAAP, Basel III, Financial Ratios)
  - Healthcare (FDA, HIPAA, Clinical Trials, Medical Terminology)
  - Legal (Contract Terms, Regulatory Language, Compliance)
  - Academic (Research Methods, Statistical Terms, Literature Review)
  - Project Management (Agile, PMBOK, Risk Management)
  - General (custom keywords only)
- Drag-and-drop PDF import with auto-metadata detection
- Pre-built keyword frameworks with hundreds of domain-specific terms
- Custom keyword list creation with CSV import support
- Cross-document keyword search with context highlighting
- Quick Filter for ad-hoc document subset analysis
- Individual document statistics (word count, readability scores, top keywords)
- N-gram analysis (bigrams and trigrams)
- Cross-framework comparison with radar charts

### Visualizations
- Word clouds
- Keyword frequency bar charts
- Keywords x Documents heatmaps
- Year-over-year trend lines
- Framework comparison radar charts

### Data Management
- Local SQLite database for offline access to cached analysis
- Export to CSV, Excel, JSON, and full project ZIP bundles

## Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | Electron 28+ |
| Frontend | React 18 + TypeScript |
| UI Components | Shadcn/ui + Tailwind CSS |
| State Management | Zustand |
| Database | SQLite (better-sqlite3) |
| Charts | Recharts |
| Word Cloud | visx |
| Build | electron-builder |
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
   git tag v0.1.0
   git push origin v0.1.0
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
│   ├── components/
│   ├── pages/
│   ├── stores/
│   ├── services/
│   └── data/frameworks/
├── resources/         # App icons
└── build/            # Build configuration
```

## Backend

This application connects to the [document-lens](https://github.com/michaelborck-education/document-lens) API backend for text extraction and analysis.

- **Development**: Run the backend locally (`uvicorn app.main:app`)
- **Distribution**: The GitHub Actions CI/CD workflow automatically builds and bundles the backend executable using PyInstaller for each platform (Windows, macOS, Linux)

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please read the implementation plan in `IMPLEMENTATION_PLAN.md` for details on the development roadmap.
