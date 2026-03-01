# DocumentLens

<!-- BADGES:START -->
[![edtech](https://img.shields.io/badge/-edtech-4caf50?style=flat-square)](https://github.com/topics/edtech) [![academic-integrity](https://img.shields.io/badge/-academic--integrity-blue?style=flat-square)](https://github.com/topics/academic-integrity) [![api](https://img.shields.io/badge/-api-blue?style=flat-square)](https://github.com/topics/api) [![docker](https://img.shields.io/badge/-docker-2496ed?style=flat-square)](https://github.com/topics/docker) [![document-analysis](https://img.shields.io/badge/-document--analysis-blue?style=flat-square)](https://github.com/topics/document-analysis) [![microservice](https://img.shields.io/badge/-microservice-blue?style=flat-square)](https://github.com/topics/microservice) [![natural-language-processing](https://img.shields.io/badge/-natural--language--processing-blue?style=flat-square)](https://github.com/topics/natural-language-processing) [![nlp](https://img.shields.io/badge/-nlp-blue?style=flat-square)](https://github.com/topics/nlp) [![python](https://img.shields.io/badge/-python-3776ab?style=flat-square)](https://github.com/topics/python) [![readability](https://img.shields.io/badge/-readability-blue?style=flat-square)](https://github.com/topics/readability)
<!-- BADGES:END -->

**Text Analysis & Academic Intelligence Microservice**

Transform text content into actionable insights through comprehensive linguistic analysis, writing quality assessment, and academic integrity checking.

## 🚀 Quick Start

```bash
# Docker deployment (recommended)
docker-compose up -d

# Or raw deployment
./deploy.sh

# API available at: http://localhost:8002
# Documentation: http://localhost:8002/docs
```

## 📊 API Endpoints

### Core Analysis
- `GET /health` - Service health check
- `POST /text` - Text analysis (readability, quality, word frequency)
- `POST /academic` - Academic analysis (citations, DOI resolution, integrity)
- `POST /files` - File upload + analysis (PDF, DOCX, TXT, MD)

### Advanced Text Analysis
- `POST /advanced/ngrams` - N-gram extraction with optional filter terms
- `POST /advanced/ner` - Named entity recognition
- `POST /advanced/search/keywords` - Batch keyword search across multiple terms

### Document Intelligence
- `POST /files/infer-metadata` - Infer year, company, industry, document type from content
- `POST /text/infer-metadata` - Metadata inference from raw text
- Page-level text extraction (via `include_extracted_text=true` on `/files`)

### Integration
- Root endpoint: `GET /` - Service info and available endpoints
- For presentations: Use [PresentationLens](https://github.com/michael-borck/presentation-lens)
- For recordings: Use [RecordingLens](https://github.com/michael-borck/recording-lens)

## 🎯 Use Cases

- **Text Analysis**: Readability, writing quality, word frequency for any text content
- **Academic Analysis**: Citation verification, DOI resolution, AI detection, integrity checking
- **Document Intelligence**: Extract and analyze text from PDFs and Word documents
- **Sustainability Research**: Batch keyword analysis for TCFD, GRI, SDGs, SASB frameworks
- **Corporate Report Analysis**: Auto-detect metadata (year, company, industry) from annual reports
- **Multi-Service Workflows**: Integrate with specialized analysis services

### Desktop Application Support
DocumentLens powers the **document-lens-desktop** Electron application for researchers analyzing corporate sustainability reports. Features include:
- Smart metadata inference (company name, year, industry, document type)
- Framework keyword analysis (TCFD, GRI, SDGs, SASB)
- Batch processing with SQLite storage
- Offline operation via bundled Python backend

## 🏗️ Microservices Ecosystem

DocumentLens is part of a focused microservices architecture:

| Service | Purpose | Repository |
|---------|---------|------------|
| **DocumentLens** | Text analysis & academic intelligence | *This repo* |
| **PresentationLens** | Presentation design & structure analysis | [presentation-lens](https://github.com/michael-borck/presentation-lens) |
| **RecordingLens** | Student recordings (video/audio) analysis | [recording-lens](https://github.com/michael-borck/recording-lens) |
| **CodeLens** | Source code quality & analysis | [code-lens](https://github.com/michael-borck/code-lens) |
| **SubmissionLens** | Student submission router & frontend | [submission-lens](https://github.com/michael-borck/submission-lens) |

### Integration Pattern
```mermaid
graph LR
    A[Student Submission] --> B[SubmissionLens Frontend]
    B --> C{File Type Router}
    C -->|Text/PDF/DOCX| D[DocumentLens]
    C -->|PPTX| E[PresentationLens]
    C -->|Video/Audio| F[RecordingLens]
    C -->|Source Code| G[CodeLens]
    E --> D
    F --> D
    G --> D
    D --> H[Combined Feedback]
    H --> B
    B --> I[Student Dashboard]
```

## 🚀 Deployment

### Docker Deployment (Recommended)
```bash
git clone https://github.com/michael-borck/document-lens.git
cd document-lens
docker-compose up -d  # Single container deployment
```

### Raw/Native Deployment
```bash
git clone https://github.com/michael-borck/document-lens.git
cd document-lens
./deploy.sh  # Handles venv, dependencies, and production server
```

## 🧪 Testing

```bash
# Install dev dependencies
uv sync --extra dev

# Run all tests
uv run pytest tests/ -v

# Run specific test file
uv run pytest tests/test_files.py -v

# Run only PDF tests
uv run pytest tests/ -m pdf -v

# Skip slow tests
uv run pytest tests/ -m "not slow" -v

# Run with coverage report
uv run pytest tests/
```

### Test Structure
- `tests/conftest.py` - Shared fixtures and test client setup
- `tests/test_health.py` - Health/smoke tests
- `tests/test_text_analysis.py` - Text analysis endpoint tests
- `tests/test_academic_analysis.py` - Academic analysis endpoint tests
- `tests/test_files.py` - PDF file upload tests

### Test Data
Place test files (PDF, DOCX, etc.) in the `test-data/` directory. The test suite automatically discovers and uses these files for parameterized tests.

## 📚 Documentation

- `DEPLOYMENT.md` - Deployment guide for Docker and raw installations
- `DOCUMENTLENS_SETUP.md` - Setup and usage instructions
- `.env.example` - Configuration template
- `docs/` - Additional architecture and integration documentation

---

*DocumentLens: Pure text intelligence at the heart of content analysis*
