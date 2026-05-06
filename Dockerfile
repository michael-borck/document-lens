# DocumentLens Australian Microservice
# Multi-stage Docker build for production deployment

# Stage 1: Build stage with uv for fast dependency resolution
FROM python:3.11-slim AS builder

# Install uv for fast dependency management
RUN pip install uv

# Set working directory
WORKDIR /app

# Copy dependency files first (for Docker layer caching)
COPY pyproject.toml ./

# Create virtual environment and install dependencies using uv
RUN uv venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"
RUN uv sync

# Stage 2: Runtime stage
FROM python:3.11-slim AS runtime

# Install system dependencies for document processing
RUN apt-get update && apt-get install -y \
    # For PDF processing
    libpoppler-cpp-dev \
    # For general file handling
    file \
    # For text processing
    locales \
    # Clean up
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Set Australian locale
RUN echo "en_AU.UTF-8 UTF-8" >> /etc/locale.gen \
    && locale-gen \
    && update-locale LANG=en_AU.UTF-8

ENV LANG=en_AU.UTF-8
ENV LANGUAGE=en_AU:en
ENV LC_ALL=en_AU.UTF-8

# Create app user for security
RUN groupadd -r appgroup && useradd -r -g appgroup -m appuser

# Set working directory
WORKDIR /app

# Copy virtual environment from builder stage
COPY --from=builder /app/.venv /app/.venv

# Make sure venv is activated
ENV PATH="/app/.venv/bin:$PATH"

# Copy application code
COPY app/ ./app/

# Create directories for app data and set permissions
RUN mkdir -p /app/logs /app/data/nltk /home/appuser && \
    chown -R appuser:appgroup /app /home/appuser

# Download NLTK data during build (as root before switching users)
RUN python -c "import nltk; nltk.download('punkt', download_dir='/app/data/nltk'); nltk.download('stopwords', download_dir='/app/data/nltk')" && \
    chown -R appuser:appgroup /app/data/nltk

# Set NLTK data path
ENV NLTK_DATA=/app/data/nltk

# Install spaCy model (best-effort during build)
RUN python -m pip install --no-cache-dir spacy==3.7.2 && python -m spacy download en_core_web_sm || true

# Switch to app user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health')" || exit 1

# Expose port
EXPOSE 8000

# Environment variables
ENV HOST=0.0.0.0
ENV PORT=8000
ENV WORKERS=4
ENV DEBUG=false
ENV PYTHONPATH=/app

# Default command - use Gunicorn for production
CMD ["gunicorn", "app.main:app", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "4", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "--log-level", "info"]