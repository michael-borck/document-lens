# CiteSight - Startup Guide

## Prerequisites
- Python 3.11 or higher
- Node.js 18 or higher
- npm or yarn

## Quick Start

### Option 1: Using the startup scripts (Recommended)

```bash
# Run both frontend and backend simultaneously
./start.sh

# Or run them separately:
./start-backend.sh  # In one terminal
./start-frontend.sh # In another terminal
```

### Option 2: Manual Setup

## Backend Setup

1. **Navigate to backend directory:**
```bash
cd backend
```

2. **Create virtual environment:**
```bash
python3 -m venv .venv
```

3. **Activate virtual environment:**
```bash
# On Linux/Mac:
source .venv/bin/activate

# On Windows:
.venv\Scripts\activate
```

4. **Install dependencies:**
```bash
uv sync
# Or for development with dev dependencies:
uv sync --group dev
```

5. **Start the backend server:**
```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The backend API will be available at: http://localhost:8000
- API Documentation: http://localhost:8000/api/docs
- Alternative docs: http://localhost:8000/api/redoc

## Frontend Setup

1. **Open a new terminal and navigate to frontend directory:**
```bash
cd frontend
```

2. **Install dependencies:**
```bash
npm install
```

3. **Start the development server:**
```bash
npm run dev
```

The frontend will be available at: http://localhost:5173

## Testing the Application

1. Open your browser and go to http://localhost:5173
2. Upload one or more documents (PDF, DOCX, PPTX, TXT, MD, or JSON)
3. Configure analysis options
4. Click "Analyze Documents"
5. View results in the tabbed interface

## Environment Variables

### Backend (.env file in backend/ directory)
```env
DEBUG=true
MAX_FILE_SIZE=10485760
MAX_FILES_PER_REQUEST=5
RATE_LIMIT=10/minute
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Frontend (.env file in frontend/ directory)
```env
VITE_API_URL=http://localhost:8000/api
```

## Common Issues

### Port Already in Use
If you get a port conflict error:
- Backend: Change the port in the uvicorn command (e.g., `--port 8001`)
- Frontend: The Vite dev server will automatically try the next available port

### CORS Issues
Make sure the backend ALLOWED_ORIGINS includes your frontend URL.

### Python Package Installation Errors
If you encounter issues installing Python packages:
```bash
# Upgrade pip first
pip install --upgrade pip

# Install packages one by one if needed
pip install fastapi
pip install uvicorn
# etc.
```

### Frontend Build Errors
If the frontend won't build:
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

## Development Tips

### Backend Hot Reload
The `--reload` flag in uvicorn enables hot reloading. Any changes to Python files will automatically restart the server.

### Frontend Hot Module Replacement
Vite provides HMR (Hot Module Replacement) out of the box. Changes to React components will update instantly in the browser.

### Checking Logs
- Backend logs appear in the terminal running uvicorn
- Frontend logs appear in the browser console (F12)
- Network requests can be monitored in the browser's Network tab

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/analyze` - Main analysis endpoint (accepts multipart form data)

## Stopping the Servers

- Press `Ctrl+C` in each terminal to stop the servers
- Or use the stop script: `./stop.sh`

## Production Deployment

For production deployment, see DEPLOYMENT.md (to be created)