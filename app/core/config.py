"""
Configuration settings for DocumentLens API
"""

from typing import Any

from pydantic import ConfigDict, Field, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App settings
    DEBUG: bool = False
    API_V1_STR: str = "/api"
    PROJECT_NAME: str = "DocumentLens"

    # CORS settings - can be set as comma-separated string in .env.
    # Note: ignored entirely when DOCUMENT_LENS_MODE=desktop (see app/main.py),
    # which swaps in a permissive regex for embedded Electron use.
    ALLOWED_ORIGINS: str | list[str] = Field(
        default="http://localhost:5173,http://localhost:5174,http://localhost:3000",
        description="Comma-separated list of allowed origins (web mode only)",
    )

    # File processing settings
    MAX_FILE_SIZE: int = 52428800  # 50MB default
    PROCESS_TIMEOUT: int = 120  # 2 minutes
    MAX_FILES_PER_REQUEST: int = 5

    # Rate limiting
    RATE_LIMIT: str = "10/hour"

    # Analysis settings
    DEFAULT_CITATION_STYLE: str = "auto"
    SUPPORTED_FILE_TYPES: list[str] = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # DOCX
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",  # PPTX
        "text/plain",
        "text/markdown",
        "application/json",
    ]

    # External services
    CROSSREF_API_BASE: str = "https://api.crossref.org"
    WAYBACK_API_BASE: str = "https://archive.org/wayback"

    # Security settings
    SECRET_KEY: str = "change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    @field_validator("ALLOWED_ORIGINS")
    @classmethod
    def parse_cors(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        elif isinstance(v, list):
            return v
        return []

    model_config = ConfigDict(
        case_sensitive=True,
        env_file=".env",
    )


# Create settings instance
settings = Settings()

# Ensure ALLOWED_ORIGINS is always a list
if isinstance(settings.ALLOWED_ORIGINS, str):
    settings.ALLOWED_ORIGINS = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",")]
