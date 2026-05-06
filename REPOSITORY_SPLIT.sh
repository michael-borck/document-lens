#!/bin/bash

# DocumentLens Repository Split Script
# This script helps you split the current cite-sight repository into two separate projects:
# 1. documentlens - Backend microservice for document analysis
# 2. cite-sight - Frontend application for academic integrity

set -e  # Exit on any error

echo "🔄 DocumentLens Repository Split Script"
echo "======================================"

# Check if we're in the correct directory
if [ ! -f "DOCUMENTLENS_SETUP.md" ]; then
    echo "❌ Error: This script must be run from the backend folder containing DOCUMENTLENS_SETUP.md"
    exit 1
fi

echo "📍 Current directory: $(pwd)"
echo "📂 Parent directory: $(dirname $(pwd))"

# Get the parent directory (should be cite-sight)
PARENT_DIR=$(dirname $(pwd))
PROJECT_NAME=$(basename "$PARENT_DIR")

echo "🔍 Detected project: $PROJECT_NAME"

if [ "$PROJECT_NAME" != "cite-sight" ]; then
    echo "⚠️  Warning: Expected to be in cite-sight project, but found: $PROJECT_NAME"
    read -p "Continue anyway? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "🎯 This script will:"
echo "1. Create a new 'document-lens' repository from current cite-sight"
echo "2. Transform it into a backend-only service"
echo "3. Transform original cite-sight into frontend-only app"
echo ""

read -p "📝 Enter the path where you want to create the document-lens project (default: ../document-lens): " DOCUMENTLENS_PATH
DOCUMENTLENS_PATH=${DOCUMENTLENS_PATH:-../document-lens}

echo ""
echo "📋 Summary:"
echo "  - Source: $PARENT_DIR"
echo "  - DocumentLens destination: $DOCUMENTLENS_PATH"
echo "  - Original will become frontend-only"
echo ""

read -p "🚀 Proceed with repository split? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted"
    exit 1
fi

echo ""
echo "🔧 Step 1: Creating DocumentLens repository..."

# Clone the repository
git clone "$PARENT_DIR" "$DOCUMENTLENS_PATH"
cd "$DOCUMENTLENS_PATH"

echo "📦 Cleaning up DocumentLens repository..."

# Remove frontend and frontend-related files
rm -rf frontend/
rm -f start-frontend.sh start.sh
rm -f cite-sight.html DEVELOPMENT_PLAN.md

# Move backend contents to root level
echo "📁 Moving backend to root level..."
mv backend/* .
mv backend/.* . 2>/dev/null || true  # Move hidden files, ignore errors if none
rm -rf backend/

# Rename startup script
if [ -f start-backend.sh ]; then
    mv start-backend.sh start.sh
fi

# Update .gitignore for backend-only project
echo "📝 Creating backend-focused .gitignore..."
cat > .gitignore << 'EOF'
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg
MANIFEST

# Virtual environments
.venv/
venv/
ENV/
env/

# Environment variables
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# Testing
.coverage
.pytest_cache/
.tox/
htmlcov/
.coverage.*
coverage.xml

# MyPy
.mypy_cache/
.dmypy.json
dmypy.json

# Ruff
.ruff_cache/

# Logs
*.log
logs/

# Database
*.db
*.sqlite3

# OS
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db
EOF

# Create DocumentLens README
echo "📖 Creating DocumentLens README..."
cat > README.md << 'EOF'
# DocumentLens

**Multi-Modal Document Analysis Microservice**

Transform any content into actionable insights through comprehensive text analysis, academic integrity checking, and future multi-modal capabilities.

## 🚀 Quick Start

```bash
# Setup
./start.sh

# API available at: http://localhost:8000
# Documentation: http://localhost:8000/api/docs
```

## 📊 API Endpoints

### Current (MVP)
- `GET /api/health` - Service health check
- `POST /api/analyze` - Full analysis (backward compatibility)
- `POST /api/analyze/text` - Core text analysis only
- `POST /api/analyze/academic` - Academic features only

### Planned
- `POST /api/analyze/files` - File upload + analysis
- `POST /api/analyze/audio` - Audio transcription + analysis  
- `POST /api/analyze/video` - Video content + analysis

## 🎯 Use Cases

- **Text Analysis**: Readability, quality, word frequency for any content
- **Academic Analysis**: Citation verification, DOI resolution, integrity checking
- **Multi-Modal**: Future audio/video analysis integration

## 📚 Documentation

See `DOCUMENTLENS_SETUP.md` for complete setup and usage instructions.

---

*DocumentLens: See through your content*
EOF

echo "✅ DocumentLens repository created successfully!"

echo ""
echo "🔧 Step 2: Transforming original repository to frontend-only..."

# Go back to original repository
cd "$PARENT_DIR"

# Remove backend and backend-related files  
rm -rf backend/
rm -f start-backend.sh start.sh STARTUP_GUIDE.md

# Move frontend contents to root level
echo "📁 Moving frontend to root level..."
mv frontend/* .
mv frontend/.* . 2>/dev/null || true  # Move hidden files, ignore errors if none
rm -rf frontend/

# Rename startup script
if [ -f start-frontend.sh ]; then
    mv start-frontend.sh start.sh
fi

# Update .gitignore for frontend-only project
echo "📝 Creating frontend-focused .gitignore..."
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Production builds
dist/
build/

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Logs
logs/
*.log

# Coverage
coverage/

# ESLint
.eslintcache

# TypeScript
*.tsbuildinfo

# Temporary folders
tmp/
temp/
EOF

# Update package.json if it exists
if [ -f package.json ]; then
    echo "📦 Updating package.json..."
    # Update name and description if they contain citesight
    sed -i.bak 's/"citesight-frontend"/"cite-sight"/g' package.json || true
    sed -i.bak 's/CiteSight Frontend/CiteSight Academic Integrity Platform/g' package.json || true
    rm -f package.json.bak
fi

# Create frontend-focused README
echo "📖 Creating CiteSight README..."
cat > README.md << 'EOF'
# CiteSight

**Academic Integrity Platform**

A React-based frontend application for analyzing academic documents, detecting suspicious patterns, and ensuring research integrity.

## 🚀 Quick Start

```bash
# Setup and start
./start.sh

# Application available at: http://localhost:5173
```

## 🎯 Features

- **Document Upload**: Drag & drop PDF, DOCX, PPTX, TXT, MD, JSON files
- **Citation Analysis**: Extract and verify academic references
- **Integrity Checking**: Detect suspicious patterns and potential issues
- **Quality Assessment**: Readability and writing quality metrics
- **Multi-Document Comparison**: Analyze multiple documents together

## 🔧 Backend Service

CiteSight consumes the DocumentLens API for document analysis.

Default API endpoint: `http://localhost:8000`

Configure via `.env`:
```
VITE_API_URL=http://localhost:8000/api
```

## 📚 Technology Stack

- React 18 + TypeScript
- Vite for development and building
- Zustand for state management
- Axios for API communication
- React Tabs for results display
- React Dropzone for file uploads

---

*CiteSight: Academic integrity through intelligent analysis*
EOF

echo "✅ CiteSight frontend transformation complete!"

echo ""
echo "🎉 Repository split completed successfully!"
echo ""
echo "📁 Project Structure:"
echo "  📦 $DOCUMENTLENS_PATH (DocumentLens - Backend Service)"
echo "  📦 $PARENT_DIR (CiteSight - Frontend App)"
echo ""
echo "🔧 Next Steps:"
echo ""
echo "1. 🚀 Test DocumentLens:"
echo "   cd $DOCUMENTLENS_PATH"
echo "   ./start.sh"
echo "   # API: http://localhost:8000"
echo ""
echo "2. 🌐 Test CiteSight:"
echo "   cd $PARENT_DIR" 
echo "   ./start.sh"
echo "   # App: http://localhost:5173"
echo ""
echo "3. 📚 Create GitHub repositories:"
echo "   # For Document-Lens:"
echo "   cd $DOCUMENTLENS_PATH"
echo "   git remote set-url origin git@github.com:michael-borck/document-lens.git"
echo "   git add -A && git commit -m 'Transform into DocumentLens microservice'"
echo "   git push -u origin main"
echo ""
echo "   # CiteSight repository is already configured"
echo ""
echo "✨ Happy coding!"