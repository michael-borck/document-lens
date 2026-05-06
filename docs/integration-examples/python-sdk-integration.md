# Python Integration with Lens Platform APIs

This guide shows how Python applications (like `feed-forward`) can integrate with lens services using HTTP requests, since the SDK is currently TypeScript-only.

## HTTP Client Integration

### Document Analysis Integration

```python
import httpx
import asyncio
from typing import Dict, Any, Optional
import os

class DocumentLensClient:
    def __init__(self, base_url: str = None):
        self.base_url = base_url or os.getenv('DOCUMENT_LENS_URL', 'http://localhost:8002')
        self.client = httpx.AsyncClient(timeout=30.0)

    async def analyze_text(self, text: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """Analyze text for readability and quality metrics"""
        url = f"{self.base_url}/text"
        payload = {
            "text": text,
            "options": options or {}
        }

        try:
            response = await self.client.post(url, json=payload)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise Exception(f"Document analysis failed: {e}")

    async def analyze_academic_features(
        self,
        text: str,
        citation_style: str = "auto",
        check_urls: bool = True,
        check_doi: bool = True,
        check_plagiarism: bool = False
    ) -> Dict[str, Any]:
        """Analyze academic features like citations and integrity"""
        url = f"{self.base_url}/academic"
        payload = {
            "text": text,
            "citation_style": citation_style,
            "check_urls": check_urls,
            "check_doi": check_doi,
            "check_plagiarism": check_plagiarism,
            "check_in_text": True
        }

        try:
            response = await self.client.post(url, json=payload)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise Exception(f"Academic analysis failed: {e}")

    async def analyze_files(self, files: list, analysis_type: str = "full") -> Dict[str, Any]:
        """Analyze uploaded files"""
        url = f"{self.base_url}/files"

        # Prepare multipart form data
        form_data = {
            "analysis_type": analysis_type,
            "check_urls": True,
            "check_doi": True,
            "extract_metadata": True
        }

        files_data = []
        for file_path in files:
            with open(file_path, 'rb') as f:
                files_data.append(('files', (file_path, f.read())))

        try:
            response = await self.client.post(url, data=form_data, files=files_data)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise Exception(f"File analysis failed: {e}")

    async def close(self):
        await self.client.aclose()
```

### Code Analysis Integration

```python
class CodeLensClient:
    def __init__(self, base_url: str = None):
        self.base_url = base_url or os.getenv('CODE_LENS_URL', 'http://localhost:8003')
        self.client = httpx.AsyncClient(timeout=30.0)

    async def analyze_code(
        self,
        code: str,
        language: str = "python",
        check_similarity: bool = False,
        run_tests: bool = False,
        rubric_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Analyze code for quality, style, and metrics"""
        url = f"{self.base_url}/api/v1/analyze/{language}"
        payload = {
            "code": code,
            "language": language,
            "check_similarity": check_similarity,
            "run_tests": run_tests
        }

        if rubric_id:
            payload["rubric_id"] = rubric_id

        try:
            response = await self.client.post(url, json=payload)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise Exception(f"Code analysis failed: {e}")

    async def batch_analyze(self, submissions: list) -> Dict[str, Any]:
        """Analyze multiple code submissions"""
        url = f"{self.base_url}/api/v1/analyze/batch"
        payload = {
            "submissions": submissions,
            "check_similarity": True
        }

        try:
            response = await self.client.post(url, json=payload)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise Exception(f"Batch analysis failed: {e}")

    async def get_rubrics(self, language: Optional[str] = None) -> list:
        """Get available rubrics"""
        url = f"{self.base_url}/api/v1/rubrics"
        params = {}
        if language:
            params["language"] = language

        try:
            response = await self.client.get(url, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise Exception(f"Failed to fetch rubrics: {e}")

    async def close(self):
        await self.client.aclose()
```

## Feed-Forward Integration Example

### Enhanced Feedback Service

```python
from typing import List, Dict, Any
import asyncio

class EnhancedFeedbackService:
    def __init__(self):
        self.document_lens = DocumentLensClient()
        self.code_lens = CodeLensClient()

    async def generate_text_feedback(self, text: str) -> Dict[str, Any]:
        """Generate enhanced feedback for text content"""
        try:
            # Get analysis from document-lens
            analysis = await self.document_lens.analyze_text(text)

            # Transform to feedback suggestions
            feedback = self._extract_text_feedback(analysis)

            return {
                "success": True,
                "feedback": feedback,
                "metrics": self._extract_text_metrics(analysis),
                "processing_time": analysis.get("processing_time", 0)
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "feedback": ["Analysis service unavailable. Please review content manually."]
            }

    async def generate_code_feedback(self, code: str, language: str = "python") -> Dict[str, Any]:
        """Generate enhanced feedback for code submissions"""
        try:
            # Get analysis from code-lens
            analysis = await self.code_lens.analyze_code(code, language)

            # Transform to feedback suggestions
            feedback = self._extract_code_feedback(analysis)

            return {
                "success": True,
                "feedback": feedback,
                "metrics": self._extract_code_metrics(analysis),
                "issues": analysis.get("analysis", {}).get("issues", []),
                "grade": analysis.get("analysis", {}).get("grade")
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "feedback": ["Code analysis service unavailable. Please review code manually."]
            }

    async def generate_academic_feedback(self, text: str) -> Dict[str, Any]:
        """Generate academic integrity and citation feedback"""
        try:
            analysis = await self.document_lens.analyze_academic_features(text)

            return {
                "success": True,
                "feedback": self._extract_academic_feedback(analysis),
                "citations": analysis.get("analysis", {}).get("citations", {}),
                "integrity_issues": self._extract_integrity_issues(analysis)
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "feedback": ["Academic analysis unavailable."]
            }

    def _extract_text_feedback(self, analysis: Dict) -> List[str]:
        """Extract actionable feedback from document analysis"""
        feedback = []
        metrics = analysis.get("analysis", {})

        # Readability feedback
        readability = metrics.get("readability", {})
        flesch_score = readability.get("flesch_reading_ease")
        if flesch_score and flesch_score < 50:
            feedback.append("Consider simplifying sentence structure for better readability.")

        # Quality feedback
        quality = metrics.get("quality_metrics", {})
        passive_voice_pct = quality.get("passive_voice_percentage", 0)
        if passive_voice_pct > 20:
            feedback.append(f"Consider reducing passive voice usage ({passive_voice_pct:.1f}% detected).")

        sentence_variety = quality.get("sentence_variety", 1.0)
        if sentence_variety < 0.7:
            feedback.append("Try varying your sentence lengths and structures.")

        return feedback

    def _extract_code_feedback(self, analysis: Dict) -> List[str]:
        """Extract actionable feedback from code analysis"""
        feedback = []
        issues = analysis.get("analysis", {}).get("issues", [])

        # Group issues by type
        errors = [i for i in issues if i.get("severity") == "error"]
        warnings = [i for i in issues if i.get("severity") == "warning"]

        if errors:
            feedback.append(f"Fix {len(errors)} error(s) in your code:")
            for error in errors[:3]:  # Show top 3 errors
                feedback.append(f"  • Line {error.get('line', '?')}: {error.get('message', 'Error detected')}")

        if warnings:
            feedback.append(f"Consider addressing {len(warnings)} style/quality issue(s):")
            for warning in warnings[:3]:  # Show top 3 warnings
                feedback.append(f"  • Line {warning.get('line', '?')}: {warning.get('message', 'Issue detected')}")

        return feedback

    async def close(self):
        """Clean up resources"""
        await self.document_lens.close()
        await self.code_lens.close()
```

## FastHTML Integration

### Routes with Enhanced Feedback

```python
from fasthtml.common import *
from fasthtml import FastHTML

# Initialize the feedback service
feedback_service = EnhancedFeedbackService()

app = FastHTML()

@app.post("/analyze-text")
async def analyze_text_endpoint(text: str):
    """Endpoint for text analysis with lens integration"""
    if not text.strip():
        return {"error": "Text content is required"}

    result = await feedback_service.generate_text_feedback(text)

    if result["success"]:
        return {
            "feedback": result["feedback"],
            "metrics": {
                "readability_score": result["metrics"].get("flesch_reading_ease"),
                "word_count": result["metrics"].get("word_count"),
                "processing_time": result["processing_time"]
            }
        }
    else:
        return {"error": result["error"], "fallback_feedback": result["feedback"]}

@app.post("/analyze-code")
async def analyze_code_endpoint(code: str, language: str = "python"):
    """Endpoint for code analysis with lens integration"""
    if not code.strip():
        return {"error": "Code content is required"}

    result = await feedback_service.generate_code_feedback(code, language)

    if result["success"]:
        return {
            "feedback": result["feedback"],
            "issues": result["issues"],
            "grade": result.get("grade"),
            "metrics": result.get("metrics")
        }
    else:
        return {"error": result["error"], "fallback_feedback": result["feedback"]}

@app.get("/")
def home():
    return Titled("Feed Forward with Lens Integration",
        Container(
            H1("Enhanced Feedback Platform"),
            P("Now powered by professional lens analysis services"),

            # Text analysis form
            Form(
                H3("Text Analysis"),
                Textarea("text", placeholder="Enter your text here...", rows=8),
                Button("Analyze Text", type="submit"),
                action="/analyze-text", method="post"
            ),

            Br(),

            # Code analysis form
            Form(
                H3("Code Analysis"),
                Select(
                    Option("Python", value="python"),
                    # Add more languages as supported
                    name="language"
                ),
                Textarea("code", placeholder="Enter your code here...", rows=10),
                Button("Analyze Code", type="submit"),
                action="/analyze-code", method="post"
            )
        )
    )

# Cleanup on shutdown
@app.on_event("shutdown")
async def shutdown_event():
    await feedback_service.close()
```

## Configuration and Environment

```python
# config.py
import os
from typing import Optional

class LensConfig:
    DOCUMENT_LENS_URL: str = os.getenv('DOCUMENT_LENS_URL', 'http://localhost:8002')
    CODE_LENS_URL: str = os.getenv('CODE_LENS_URL', 'http://localhost:8003')
    TIMEOUT: int = int(os.getenv('LENS_TIMEOUT', '30'))
    RETRIES: int = int(os.getenv('LENS_RETRIES', '3'))
    ENABLE_FALLBACK: bool = os.getenv('ENABLE_FALLBACK', 'true').lower() == 'true'

# .env file additions
DOCUMENT_LENS_URL=http://localhost:8002
CODE_LENS_URL=http://localhost:8003
LENS_TIMEOUT=30
LENS_RETRIES=3
ENABLE_FALLBACK=true
```

## Error Handling and Resilience

```python
import asyncio
from functools import wraps

def with_fallback(fallback_message: str):
    """Decorator for lens service calls with fallback"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                print(f"Lens service error: {e}")
                return {
                    "success": False,
                    "error": str(e),
                    "feedback": [fallback_message]
                }
        return wrapper
    return decorator

class ResilientLensClient:
    def __init__(self, max_retries: int = 3):
        self.max_retries = max_retries
        self.document_lens = DocumentLensClient()
        self.code_lens = CodeLensClient()

    async def analyze_with_retry(self, analysis_func, *args, **kwargs):
        """Retry analysis with exponential backoff"""
        for attempt in range(self.max_retries):
            try:
                return await analysis_func(*args, **kwargs)
            except Exception as e:
                if attempt == self.max_retries - 1:
                    raise e

                wait_time = 2 ** attempt
                await asyncio.sleep(wait_time)
                print(f"Retry attempt {attempt + 1} after {wait_time}s delay")
```

This integration approach allows Python applications like feed-forward to leverage lens services while maintaining independence and providing graceful fallbacks when services are unavailable.