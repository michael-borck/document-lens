# ChartLens - Image Interpretation Microservice

A dedicated FastAPI microservice for extracting and interpreting charts/images from PDFs using Vision LLM.

## Project Structure

```
chartlens/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI app setup
│   ├── core/
│   │   ├── __init__.py
│   │   └── config.py              # Settings with API keys
│   ├── analyzers/
│   │   ├── __init__.py
│   │   └── chart_interpreter.py   # Vision LLM interpreter (move from DocumentLens)
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes/
│   │       ├── __init__.py
│   │       ├── health.py
│   │       └── images.py           # Image extraction & interpretation endpoints
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py              # Pydantic response models
│   └── services/
│       ├── __init__.py
│       └── pdf_processor.py        # PDF image extraction service
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   └── test_image_analysis.py
├── pyproject.toml
├── Dockerfile
└── README.md
```

## pyproject.toml

```toml
[project]
name = "chartlens"
version = "1.0.0"
description = "Image Interpretation Microservice for Charts and Diagrams"
requires-python = ">=3.11"

dependencies = [
    "fastapi>=0.109.0",
    "uvicorn>=0.27.0",
    "python-multipart>=0.0.6",
    "slowapi>=0.1.9",
    "pydantic>=2.5.0",
    "pydantic-settings>=2.1.0",
    "PyMuPDF>=1.24.0",              # PDF image extraction
    "Pillow>=10.0.0",               # Image processing
    "anthropic>=0.18.0",            # Claude Vision API
    "openai>=1.10.0",               # GPT-4V fallback
    "transformers>=4.35.0",         # Local vision model fallback
    "gunicorn>=21.2.0",
]

[project.optional-dependencies]
dev = [
    "ruff>=0.6.0",
    "mypy>=1.11.0",
    "pytest>=8.3.0",
    "pytest-asyncio>=0.23.0",
]
```

## app/core/config.py

```python
"""Configuration settings for ChartLens API"""

from pydantic import ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App settings
    DEBUG: bool = False
    API_V1_STR: str = "/api"
    PROJECT_NAME: str = "ChartLens"

    # File processing
    MAX_FILE_SIZE: int = 52428800  # 50MB
    PROCESS_TIMEOUT: int = 120

    # Rate limiting
    RATE_LIMIT: str = "30/minute"

    # Vision LLM API keys
    ANTHROPIC_API_KEY: str | None = None
    OPENAI_API_KEY: str | None = None

    # Local model fallback
    USE_LOCAL_FALLBACK: bool = True

    # CORS
    ALLOWED_ORIGINS: str | list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]

    model_config = ConfigDict(
        case_sensitive=True,
        env_file=".env",
    )


settings = Settings()
```

## app/services/pdf_processor.py

```python
"""PDF processing service for image extraction"""

import io
from typing import Any

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

try:
    from PIL import Image
except ImportError:
    Image = None


class PDFProcessor:
    """Extract images from PDF files"""

    @staticmethod
    async def extract_images_from_pdf(
        content: bytes, filename: str
    ) -> list[dict[str, Any]]:
        """
        Extract images from PDF pages using PyMuPDF.

        Args:
            content: PDF file content as bytes
            filename: Name of the PDF file

        Returns:
            List of image data dicts
        """
        if not fitz:
            raise ImportError(
                "PyMuPDF not available. Install with: pip install PyMuPDF"
            )

        images: list[dict[str, Any]] = []

        try:
            pdf_file = io.BytesIO(content)
            pdf_document = fitz.open(stream=pdf_file, filetype="pdf")

            for page_num in range(len(pdf_document)):
                page = pdf_document[page_num]
                image_list = page.get_images(full=True)

                for img_index, img_info in enumerate(image_list):
                    xref = img_info[0]

                    # Extract image
                    base_image = pdf_document.extract_image(xref)
                    image_bytes = base_image["image"]
                    image_ext = base_image["ext"]

                    # Get dimensions
                    if Image:
                        try:
                            pil_image = Image.open(io.BytesIO(image_bytes))
                            width, height = pil_image.size
                        except Exception:
                            width, height = 0, 0
                    else:
                        width, height = 0, 0

                    images.append({
                        "page_number": page_num + 1,
                        "image_index": img_index,
                        "width": width,
                        "height": height,
                        "format": image_ext,
                        "image_bytes": image_bytes,
                    })

            pdf_document.close()

        except Exception as e:
            raise ValueError(f"Failed to extract images from PDF: {e!s}") from e

        return images
```

## app/models/schemas.py

```python
"""Pydantic schemas for ChartLens API"""

from typing import Any, Literal

from pydantic import BaseModel, Field


class ExtractedImage(BaseModel):
    """Metadata for an extracted image"""

    page_number: int
    image_index: int
    width: int
    height: int
    format: str


class ChartInterpretation(BaseModel):
    """Vision LLM interpretation of a chart/image"""

    page_number: int
    image_index: int
    chart_type: str
    description: str
    sustainability_relevance: Literal["high", "medium", "low", "none"]
    extracted_data_points: dict[str, Any] = Field(default_factory=dict)
    confidence: float = 0.0
    interpretation_source: Literal["claude", "gpt4v", "local"]


class ImageInterpretationResponse(BaseModel):
    """Response for image interpretation"""

    total_images_extracted: int
    total_images_interpreted: int
    images: list[ExtractedImage] = Field(default_factory=list)
    interpretations: list[ChartInterpretation] = Field(default_factory=list)
    chart_count: int = 0
    table_count: int = 0
    diagram_count: int = 0
    sustainability_relevant_count: int = 0
    processing_notes: list[str] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str
    version: str
    uptime: float
```

## app/analyzers/chart_interpreter.py

```python
# Copy the chart_interpreter.py from DocumentLens
# Update imports to use ImageInterpretationResponse from local schemas
```

## app/api/routes/images.py

```python
"""Image extraction and interpretation endpoints"""

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.analyzers.chart_interpreter import ChartInterpreter
from app.core.config import settings
from app.models.schemas import ImageInterpretationResponse
from app.services.pdf_processor import PDFProcessor

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

# Initialize services
chart_interpreter = ChartInterpreter(
    anthropic_api_key=settings.ANTHROPIC_API_KEY,
    openai_api_key=settings.OPENAI_API_KEY,
    use_local_fallback=settings.USE_LOCAL_FALLBACK
)


@router.post("/extract-and-interpret", response_model=ImageInterpretationResponse)
@limiter.limit(settings.RATE_LIMIT)
async def extract_and_interpret_images(
    request: Request,
    file: UploadFile = File(..., description="PDF file to extract images from"),
) -> ImageInterpretationResponse:
    """
    Extract images from PDF and interpret with Vision LLM.

    Pipeline:
    1. Extract images from PDF (PyMuPDF)
    2. Interpret with Claude 3.5 Sonnet (primary)
    3. Fall back to GPT-4V if needed
    4. Fall back to local BLIP-2 if APIs unavailable
    """
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail=f"Only PDFs supported. Got: {file.content_type}"
        )

    content = await file.read()

    if len(content) > settings.MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max: {settings.MAX_FILE_SIZE} bytes"
        )

    try:
        images = await PDFProcessor.extract_images_from_pdf(
            content,
            file.filename or "unknown.pdf"
        )

        result = chart_interpreter.analyze(images)
        return result

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Image processing failed: {e!s}"
        ) from e
```

## app/api/routes/health.py

```python
"""Health check endpoint"""

import time

from fastapi import APIRouter

from app.models.schemas import HealthResponse

router = APIRouter()
START_TIME = time.time()


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Health check endpoint"""
    uptime = time.time() - START_TIME

    return HealthResponse(
        status="healthy",
        version="1.0.0",
        uptime=uptime
    )
```

## app/main.py

```python
"""ChartLens FastAPI Service"""

from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api.routes import health, images
from app.core.config import settings

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="ChartLens API",
    description="Image Extraction and Interpretation Microservice",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["health"])
app.include_router(images.router, prefix="/images", tags=["images"])


@app.get("/")
async def root() -> dict[str, Any]:
    """Root endpoint"""
    return {
        "service": "ChartLens",
        "description": "Image Extraction and Interpretation Microservice",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "images": "/images",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8001, reload=settings.DEBUG)
```

## Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir uv && \
    uv pip install --system --no-cache-dir -e .

COPY app/ ./app/

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:8001", "app.main:app"]
```

## .env.example

```env
# ChartLens Configuration
DEBUG=false
RATE_LIMIT=30/minute

# Vision LLM API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Local fallback
USE_LOCAL_FALLBACK=true

# CORS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

## Integration with DocumentLens

In DocumentLens, when you need image interpretation:

```python
# In your SubmissionLens router or client app:
import httpx

async def analyze_pdf(file_path: str):
    # First: Extract text with DocumentLens
    with open(file_path, "rb") as f:
        text_response = await httpx.AsyncClient().post(
            "http://localhost:8000/files",
            files={"files": f}
        )

    # Second: Extract and interpret images with ChartLens
    with open(file_path, "rb") as f:
        image_response = await httpx.AsyncClient().post(
            "http://localhost:8001/images/extract-and-interpret",
            files={"file": f}
        )

    # Combine results
    return {
        "text_analysis": text_response.json(),
        "image_analysis": image_response.json()
    }
```

## Running ChartLens

```bash
# 1. Create new directory
mkdir chartlens
cd chartlens

# 2. Create project structure from template above
# 3. Copy chart_interpreter.py from DocumentLens

# 4. Install dependencies
uv sync

# 5. Set environment variables
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."

# 6. Run server
uv run uvicorn app.main:app --port 8001 --reload

# 7. Test
curl -X POST "http://localhost:8001/images/extract-and-interpret" \
  -F "file=@test.pdf"
```

## Docker Compose (for both services)

```yaml
version: '3.8'

services:
  documentlens:
    build: ./document-lens
    ports:
      - "8000:8000"
    environment:
      DEBUG: "false"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  chartlens:
    build: ./chartlens
    ports:
      - "8001:8001"
    environment:
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      DEBUG: "false"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

This separation maintains clean boundaries between text analysis and image interpretation!
