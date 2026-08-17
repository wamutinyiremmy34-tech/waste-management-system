"""
Application configuration.

All configuration is sourced from environment variables (see .env.example at
the project root). Nothing here is hard-coded to a specific deployment.
"""
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- App ---
    APP_NAME: str = "EcoTrack"
    APP_ENV: str = Field(default="development")  # development | testing | production
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = True

    # --- Security ---
    SECRET_KEY: str = Field(default="CHANGE_ME_INSECURE_DEV_ONLY_SECRET_KEY")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14

    # --- Database ---
    DATABASE_URL: str = Field(
        default="postgresql+psycopg2://ecotrack:ecotrack_dev_pw@localhost:5432/ecotrack_dev"
    )

    # --- Redis ---
    REDIS_URL: str = Field(default="redis://localhost:6379/0")

    # --- CORS ---
    CORS_ORIGINS: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    # --- File storage ---
    STORAGE_BACKEND: str = Field(default="local")  # local | s3 (future)
    STORAGE_LOCAL_PATH: str = Field(default="./uploads")
    MAX_UPLOAD_SIZE_MB: int = 8
    ALLOWED_IMAGE_TYPES: list[str] = Field(
        default_factory=lambda: ["image/jpeg", "image/png", "image/webp"]
    )

    # --- Pagination ---
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    # --- Rate limiting ---
    RATE_LIMIT_PER_MINUTE: int = 60


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
