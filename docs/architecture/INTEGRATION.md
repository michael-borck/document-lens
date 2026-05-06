# DocumentLens Integration Guide

## Service Integration Overview

DocumentLens operates as the **text intelligence hub** within the broader educational content analysis ecosystem. This document outlines how DocumentLens integrates with other services and external systems.

## Integration Patterns

### 1. Direct Text Analysis

**Use Case**: Direct text input from frontend applications
```http
POST /api/analyze/text
Content-Type: application/json

{
    "text": "The student's essay content here...",
    "options": {
        "analysis_depth": "full",
        "include_suggestions": true
    }
}
```

**Response**:
```json
{
    "status": "success",
    "results": {
        "document_analysis": {
            "word_count": 245,
            "flesch_score": 78.5,
            "grade_level": 8.2
        },
        "writing_quality": {
            "passive_voice_percentage": 12.3,
            "academic_tone": 85.7
        },
        "word_analysis": {
            "most_frequent": [
                {"word": "analysis", "count": 8, "size": 80},
                {"word": "research", "count": 6, "size": 60}
            ]
        }
    }
}
```

### 2. Service-to-Service Integration

#### From PresentationLens
**Use Case**: Analyze extracted text from presentations

```python
# PresentationLens calls DocumentLens
async def analyze_presentation_text(extracted_text):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://document-lens:8000/api/analyze/text",
            json={
                "text": extracted_text,
                "options": {
                    "analysis_depth": "quick",
                    "focus": ["readability", "academic_tone"]
                }
            },
            headers={"Authorization": f"Bearer {SERVICE_TOKEN}"}
        )
        
        return response.json()
```

#### From RecordingLens
**Use Case**: Analyze transcripts from audio/video

```python
# RecordingLens calls DocumentLens
async def analyze_transcript(transcript_data):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://document-lens:8000/api/analyze/academic",
            json={
                "text": transcript_data["full_transcript"],
                "options": {
                    "check_urls": False,  # Audio transcripts rarely have URLs
                    "check_doi": False,   # Audio transcripts rarely have DOIs
                    "focus": ["writing_quality", "word_analysis"]
                }
            },
            headers={"Authorization": f"Bearer {SERVICE_TOKEN}"}
        )
        
        return response.json()
```

#### From CodeLens
**Use Case**: Analyze code comments and documentation

```python
# CodeLens calls DocumentLens
async def analyze_code_documentation(extracted_docs):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://document-lens:8000/api/analyze/text",
            json={
                "text": extracted_docs,
                "options": {
                    "analysis_depth": "basic",
                    "focus": ["readability", "technical_writing"]
                }
            },
            headers={"Authorization": f"Bearer {SERVICE_TOKEN}"}
        )
        
        return response.json()
```

## Authentication & Authorization

### Service-to-Service Authentication

DocumentLens uses JWT tokens for service authentication:

```python
# Example service token validation
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
import jwt

security = HTTPBearer()

async def verify_service_token(token: str = Depends(security)):
    try:
        payload = jwt.decode(token, SERVICE_SECRET, algorithms=["HS256"])
        service_name = payload.get("service")
        
        if service_name not in ALLOWED_SERVICES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Service not authorized"
            )
            
        return service_name
        
    except jwt.JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid service token"
        )
```

### Frontend Authentication

For direct frontend integration (via SubmissionLens):

```python
# User authentication with session validation
async def verify_user_session(session_id: str):
    # Validate user session with authentication service
    user_info = await auth_service.validate_session(session_id)
    
    if not user_info:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session"
        )
    
    return user_info
```

## Error Handling & Resilience

### Circuit Breaker Pattern

DocumentLens implements circuit breakers for external service calls:

```python
class CircuitBreaker:
    def __init__(self, failure_threshold=5, recovery_timeout=60):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.last_failure_time = None
        self.state = "CLOSED"  # CLOSED, OPEN, HALF_OPEN

    async def call(self, func, *args, **kwargs):
        if self.state == "OPEN":
            if time.time() - self.last_failure_time > self.recovery_timeout:
                self.state = "HALF_OPEN"
            else:
                raise ServiceUnavailableError("Circuit breaker is OPEN")

        try:
            result = await func(*args, **kwargs)
            if self.state == "HALF_OPEN":
                self.state = "CLOSED"
                self.failure_count = 0
            return result

        except Exception as e:
            self.failure_count += 1
            self.last_failure_time = time.time()
            
            if self.failure_count >= self.failure_threshold:
                self.state = "OPEN"
            
            raise e

# Usage for DOI resolution
doi_circuit_breaker = CircuitBreaker()

async def resolve_doi_with_circuit_breaker(doi):
    try:
        return await doi_circuit_breaker.call(doi_resolver.resolve, doi)
    except ServiceUnavailableError:
        return {"error": "DOI service temporarily unavailable"}
```

### Graceful Degradation

When external services are unavailable, DocumentLens provides fallback functionality:

```python
async def analyze_academic_with_fallbacks(text, options):
    results = {}
    
    # Core text analysis (always available)
    results["text_analysis"] = await text_analyzer.analyze(text)
    
    # DOI resolution (with fallback)
    if options.check_doi:
        try:
            results["doi_analysis"] = await doi_resolver.resolve_dois(extracted_dois)
        except ServiceError:
            results["doi_analysis"] = {
                "status": "unavailable",
                "message": "DOI service temporarily unavailable"
            }
    
    # URL verification (with fallback)  
    if options.check_urls:
        try:
            results["url_analysis"] = await url_verifier.verify_urls(extracted_urls)
        except ServiceError:
            results["url_analysis"] = {
                "status": "unavailable", 
                "message": "URL verification service temporarily unavailable"
            }
    
    return results
```

## Rate Limiting

DocumentLens implements rate limiting to protect external services:

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)

@app.post("/api/analyze/academic")
@limiter.limit("10/minute")  # Academic analysis is more resource intensive
async def analyze_academic_content(request: Request, analysis_request: AcademicAnalysisRequest):
    # Analysis logic here
    pass

@app.post("/api/analyze/text")  
@limiter.limit("30/minute")  # Text analysis is lighter weight
async def analyze_text_content(request: Request, analysis_request: TextAnalysisRequest):
    # Analysis logic here  
    pass
```

## Caching Strategy

### Response Caching

DocumentLens implements intelligent caching for expensive operations:

```python
import hashlib
import json
from datetime import datetime, timedelta

class AnalysisCache:
    def __init__(self, ttl_minutes=60):
        self.cache = {}
        self.ttl = timedelta(minutes=ttl_minutes)
    
    def generate_cache_key(self, text, options):
        # Create deterministic cache key
        content_hash = hashlib.sha256(text.encode()).hexdigest()[:16]
        options_hash = hashlib.sha256(
            json.dumps(options, sort_keys=True).encode()
        ).hexdigest()[:8]
        
        return f"analysis:{content_hash}:{options_hash}"
    
    async def get_cached_result(self, text, options):
        cache_key = self.generate_cache_key(text, options)
        
        if cache_key in self.cache:
            cached_data = self.cache[cache_key]
            
            if datetime.now() - cached_data["timestamp"] < self.ttl:
                return cached_data["result"]
            else:
                # Remove expired entry
                del self.cache[cache_key]
        
        return None
    
    async def cache_result(self, text, options, result):
        cache_key = self.generate_cache_key(text, options)
        
        self.cache[cache_key] = {
            "result": result,
            "timestamp": datetime.now()
        }

# Global cache instance
analysis_cache = AnalysisCache()

@app.post("/api/analyze/text")
async def analyze_text_cached(analysis_request: TextAnalysisRequest):
    # Check cache first
    cached_result = await analysis_cache.get_cached_result(
        analysis_request.text, 
        analysis_request.options
    )
    
    if cached_result:
        return cached_result
    
    # Perform analysis
    result = await perform_text_analysis(analysis_request)
    
    # Cache the result
    await analysis_cache.cache_result(
        analysis_request.text,
        analysis_request.options, 
        result
    )
    
    return result
```

## Monitoring Integration

### Health Check Endpoints

DocumentLens provides detailed health information for service monitoring:

```python
@app.get("/health/detailed")
async def detailed_health_check():
    health_status = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0",
        "dependencies": {}
    }
    
    # Check DOI resolver health
    try:
        await doi_resolver.health_check()
        health_status["dependencies"]["doi_resolver"] = "healthy"
    except Exception as e:
        health_status["dependencies"]["doi_resolver"] = f"unhealthy: {str(e)}"
        health_status["status"] = "degraded"
    
    # Check URL verifier health  
    try:
        await url_verifier.health_check()
        health_status["dependencies"]["url_verifier"] = "healthy"
    except Exception as e:
        health_status["dependencies"]["url_verifier"] = f"unhealthy: {str(e)}"
        health_status["status"] = "degraded"
    
    return health_status
```

### Metrics Collection

DocumentLens exposes metrics for monitoring and observability:

```python
from prometheus_client import Counter, Histogram, generate_latest

# Metrics definitions
analysis_requests_total = Counter(
    'documentlens_analysis_requests_total',
    'Total analysis requests',
    ['endpoint', 'status']
)

analysis_duration_seconds = Histogram(
    'documentlens_analysis_duration_seconds',
    'Analysis request duration',
    ['endpoint']
)

@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    start_time = time.time()
    
    response = await call_next(request)
    
    # Record metrics
    endpoint = request.url.path
    duration = time.time() - start_time
    status = "success" if response.status_code < 400 else "error"
    
    analysis_requests_total.labels(endpoint=endpoint, status=status).inc()
    analysis_duration_seconds.labels(endpoint=endpoint).observe(duration)
    
    return response

@app.get("/metrics")
async def get_metrics():
    return Response(
        generate_latest(),
        media_type="text/plain"
    )
```

## Configuration Management

DocumentLens uses environment-based configuration for integration settings:

```python
# app/core/config.py
from pydantic import BaseSettings

class Settings(BaseSettings):
    # Service configuration
    SERVICE_NAME: str = "document-lens"
    SERVICE_VERSION: str = "1.0.0"
    
    # External service URLs
    DOI_RESOLVER_BASE_URL: str = "https://api.crossref.org"
    
    # Authentication
    SERVICE_SECRET_KEY: str
    ALLOWED_SERVICES: list[str] = [
        "presentation-lens",
        "recording-lens", 
        "code-lens",
        "submission-lens"
    ]
    
    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    ACADEMIC_RATE_LIMIT_PER_MINUTE: int = 20
    
    # Caching
    CACHE_TTL_MINUTES: int = 60
    MAX_CACHE_SIZE: int = 1000
    
    # Performance
    MAX_CONCURRENT_DOI_REQUESTS: int = 5
    MAX_CONCURRENT_URL_REQUESTS: int = 10
    REQUEST_TIMEOUT_SECONDS: int = 30

    class Config:
        env_file = ".env"

settings = Settings()
```

---

This integration guide ensures DocumentLens operates seamlessly within the broader microservices ecosystem while maintaining its focus on excellent text analysis capabilities.