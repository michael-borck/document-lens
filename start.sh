#!/bin/bash

# DocumentLens Microservice Startup Script

echo "🚀 Starting DocumentLens Microservice..."

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source .venv/bin/activate

# Check if dependencies are installed
if ! python -c "import fastapi" 2>/dev/null; then
    echo "📥 Installing dependencies..."
    uv sync
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file..."
    cat > .env << 'EOL'
DEBUG=true
MAX_FILE_SIZE=10485760
MAX_FILES_PER_REQUEST=5
RATE_LIMIT=10/minute
# Web mode allowlist — only used when DOCUMENT_LENS_MODE is NOT set to 'desktop'.
# The desktop Electron app (document-lens-desktop) sets DOCUMENT_LENS_MODE=desktop
# when spawning this backend, which switches CORS to a permissive regex covering
# any localhost port + file:// origins.
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:3000
SECRET_KEY=development-secret-key-change-in-production
EOL
fi

# Start the backend server
# Port 8765 matches document-lens-desktop Electron client (BACKEND_PORT in backend-manager.ts)
PORT="${DOCUMENT_LENS_PORT:-8765}"
HOST="${DOCUMENT_LENS_HOST:-127.0.0.1}"

echo "✅ Starting DocumentLens server on http://${HOST}:${PORT}"
echo "📚 API Documentation available at http://${HOST}:${PORT}/api/docs"
echo "Press Ctrl+C to stop the server"
echo "----------------------------------------"

python -m uvicorn app.main:app --reload --host "${HOST}" --port "${PORT}"