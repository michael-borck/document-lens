# DocumentLens Setup Guide

**DocumentLens** is a comprehensive, multi-modal document analysis microservice that provides text analysis, readability scoring, writing quality assessment, and academic integrity features through a clean REST API.

## 🎯 Overview

DocumentLens transforms your documents into actionable insights through:
- **Core Text Analysis**: Readability scores, word frequency, writing quality
- **Academic Analysis**: Citation extraction, DOI resolution, URL verification  
- **Multi-Modal Ready**: Designed for future audio/video analysis integration
- **Modular APIs**: Choose exactly the analysis features you need

## 📋 Repository Split Instructions

### Step 1: Create DocumentLens Repository

```bash
# Clone the current repository to create Document-Lens
git clone git@github.com:michael-borck/cite-sight.git document-lens
cd document-lens

# Remove frontend and move backend to root
rm -rf frontend/
rm start-frontend.sh start.sh cite-sight.html DEVELOPMENT_PLAN.md
mv backend/* .
mv backend/.* . 2>/dev/null || true  # Move hidden files, ignore errors
rm -rf backend/

# Update for root-level structure
mv start-backend.sh start.sh
```

### Step 2: Update Original Repository (CiteSight)

```bash
# Go back to original cite-sight repository
cd ../cite-sight

# Remove backend and move frontend to root  
rm -rf backend/
rm start-backend.sh start.sh STARTUP_GUIDE.md
mv frontend/* .
mv frontend/.* . 2>/dev/null || true  # Move hidden files, ignore errors
rm -rf frontend/

# Update for root-level structure
mv start-frontend.sh start.sh
```

### Step 3: Create New GitHub Repository

```bash
# In the document-lens folder
git remote set-url origin git@github.com:michael-borck/document-lens.git
git add -A
git commit -m "Transform CiteSight backend into DocumentLens microservice

- Rename from CiteSight to DocumentLens
- Move backend to root level structure
- Design modular API endpoints for text analysis
- Prepare for multi-modal document analysis expansion
- Maintain all existing functionality while enabling selective analysis"
git push -u origin main
```

## 🏗️ API Architecture

### Current Endpoints (MVP)

```
GET  /                          # Service info
GET  /api/health               # Health check
POST /api/analyze              # Full analysis (backward compatibility)
```

### New Modular Endpoints (Planned)

```
POST /api/analyze/text         # Core text analysis only
POST /api/analyze/academic     # Academic features only  
POST /api/analyze/all          # Complete analysis (same as /api/analyze)

# Future Multi-Modal Endpoints
POST /api/analyze/files        # File upload + conversion + analysis
POST /api/analyze/audio        # Audio transcription + analysis
POST /api/analyze/video        # Video extraction + analysis
```

### API Response Structure

```json
{
  "service": "DocumentLens",
  "version": "1.0.0",
  "analysis": {
    "text_metrics": {
      "word_count": 1500,
      "readability": {
        "flesch_score": 65.2,
        "flesch_kincaid_grade": 8.1
      },
      "quality": {
        "passive_voice_percentage": 12.5,
        "sentence_variety_score": 7.3
      },
      "word_analysis": {
        "unique_words": 342,
        "vocabulary_richness": 0.65,
        "top_words": [...]
      }
    },
    "academic_metrics": {
      "references": {
        "total": 15,
        "broken_urls": 2,
        "unresolved_dois": 1
      },
      "citations": [...],
      "integrity": {
        "risk_score": 25.0,
        "patterns": [...]
      }
    }
  },
  "processing_time": 2.34,
  "timestamp": "2024-08-31T18:00:00Z"
}
```

## 🚀 Quick Start

### 1. Setup Environment

```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
uv sync
```

### 2. Configuration

Create `.env` file:
```env
DEBUG=true
MAX_FILE_SIZE=10485760
RATE_LIMIT=100/hour
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
SECRET_KEY=your-secret-key-here
```

### 3. Start Service

```bash
# Development
./start.sh

# Production  
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 4. Test API

```bash
# Health check
curl http://localhost:8000/api/health

# Text analysis
curl -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"text": "This is a sample document for analysis.", "options": {}}'
```

## 🎯 Service Philosophy

### What DocumentLens Is
- **Focused**: Specialized in document and text analysis
- **Modular**: Choose only the analysis features you need
- **Extensible**: Ready for multi-modal content (audio, video, images)
- **Fast**: Optimized for performance and scalability
- **Open**: Designed to serve multiple client applications

### What DocumentLens Is Not
- Not a frontend application (that's what CiteSight becomes)
- Not limited to academic documents (serves any text content)
- Not monolithic (modular API design for selective analysis)

## 🔧 Development

### Adding New Analysis Features

1. Create analyzer in `app/analyzers/`
2. Add endpoint in `app/api/routes/`
3. Update response models in `app/models/schemas.py`
4. Add tests in `tests/`

### Multi-Modal Expansion

The service is designed for easy expansion:
- Audio analysis: Add speech-to-text + text analysis pipeline
- Video analysis: Add video-to-text + visual content analysis  
- Image analysis: Add OCR + visual document analysis

## 📊 Use Cases

### Individual Developers
```python
import requests

response = requests.post('http://localhost:8000/api/analyze/text', 
                        json={'text': blog_post})
readability = response.json()['analysis']['text_metrics']['readability']
```

### Academic Applications
```python
# Full academic analysis
response = requests.post('http://localhost:8000/api/analyze/academic',
                        json={'text': research_paper})
citations = response.json()['analysis']['academic_metrics']['citations']
```

### Multi-Modal Applications
```python
# Future: Audio transcription + analysis
files = {'audio': open('lecture.mp3', 'rb')}
response = requests.post('http://localhost:8000/api/analyze/audio', files=files)
```

## 🌟 Why DocumentLens?

DocumentLens fills the gap between:
- **Libraries** (textstat, spaCy) that require integration work
- **Commercial APIs** that are expensive and limited
- **Academic tools** that aren't production-ready

**Result**: A production-ready, self-hosted, comprehensive document analysis service that scales with your needs.

---

*DocumentLens: See through your content*