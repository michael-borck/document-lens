#!/bin/bash

# DocumentLens VPS Production Deployment Script
# Usage: ./deploy.sh [--port 8000] [--host 0.0.0.0]

set -e  # Exit on error

HOST=${HOST:-"0.0.0.0"}
PORT=${PORT:-"8000"}
WORKERS=${WORKERS:-"4"}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --port)
            PORT="$2"
            shift 2
            ;;
        --host)
            HOST="$2"
            shift 2
            ;;
        --workers)
            WORKERS="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--port 8000] [--host 0.0.0.0] [--workers 4]"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "🇦🇺 DocumentLens Production Deployment"
echo "======================================"
echo "Host: $HOST"
echo "Port: $PORT"
echo "Workers: $WORKERS"
echo ""

# Check Python version
echo "🐍 Checking Python version..."
python3 --version || { echo "❌ Python 3 is required"; exit 1; }

# Check if uv is available (modern Python package manager)
if command -v uv >/dev/null 2>&1; then
    echo "⚡ Using uv for fast dependency management..."
    UV_AVAILABLE=true
else
    echo "📦 Using pip for dependency management..."
    echo "💡 Tip: Install uv for faster builds: curl -LsSf https://astral.sh/uv/install.sh | sh"
    UV_AVAILABLE=false
fi

# Create virtual environment
if [ "$UV_AVAILABLE" = true ]; then
    echo "🔧 Setting up environment with uv..."
    uv venv --python python3
    source .venv/bin/activate
    uv sync
else
    echo "🔧 Setting up virtual environment..."
    if [ ! -d ".venv" ]; then
        python3 -m venv .venv
    fi
    source .venv/bin/activate
    
    echo "📥 Installing dependencies..."
    uv sync
fi

# Create production .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating production .env file..."
    cat > .env << 'EOL'
# Production Configuration
DEBUG=false
MAX_FILE_SIZE=52428800
MAX_FILES_PER_REQUEST=10
RATE_LIMIT=30/minute
ALLOWED_ORIGINS=*
SECRET_KEY=change-this-secret-key-in-production
HOST=0.0.0.0
PORT=8000
WORKERS=4
EOL
    echo "⚠️  Please edit .env file with your production settings!"
fi

# Run linting and type checking in production
echo "🔍 Running quality checks..."
if [ "$UV_AVAILABLE" = true ]; then
    uv run ruff check . || echo "⚠️  Linting issues found"
    uv run mypy app || echo "⚠️  Type checking issues found"
else
    python -m ruff check . || echo "⚠️  Linting issues found"
    python -m mypy app || echo "⚠️  Type checking issues found"
fi

# Start the production server
echo ""
echo "🚀 Starting DocumentLens Production Server"
echo "==========================================="
echo "URL: http://$HOST:$PORT"
echo "Health: http://$HOST:$PORT/health"
echo "Docs: http://$HOST:$PORT/docs (if DEBUG=true)"
echo ""
echo "Press Ctrl+C to stop the server"
echo "For background deployment, use: nohup ./deploy.sh > deploy.log 2>&1 &"
echo "To check logs: tail -f deploy.log"
echo ""

# Production server with Gunicorn for better performance
if command -v gunicorn >/dev/null 2>&1; then
    echo "🚀 Using Gunicorn for production performance..."
    exec gunicorn app.main:app \
        --bind $HOST:$PORT \
        --workers $WORKERS \
        --worker-class uvicorn.workers.UvicornWorker \
        --access-logfile - \
        --error-logfile - \
        --log-level info
else
    echo "📝 Gunicorn not installed, using uvicorn..."
    echo "💡 For better performance, install gunicorn: pip install gunicorn"
    exec python -m uvicorn app.main:app \
        --host $HOST \
        --port $PORT \
        --workers $WORKERS \
        --log-level info
fi