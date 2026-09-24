"""
Application configuration.

All configuration is sourced from environment variables (see .env.example at
the project root). Nothing here is hard-coded to a specific deployment.
"""
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_DEFAULT_SECRET_KEY = "CHANGE_ME_INSECURE_DEV_ONLY_SECRET_KEY"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- App ---
    APP_NAME: str = "EcoTrack"
    APP_ENV: str = Field(default="development")  # development | testing | production
    API_V1_PREFIX: str = "/api/v1"
    # Default is False — debug mode must be explicitly enabled. Never enable
    # in production: it can cause stack traces to appear in HTTP responses.
    DEBUG: bool = False

    # --- Security ---
    SECRET_KEY: str = Field(default=_INSECURE_DEFAULT_SECRET_KEY)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14

    # --- Database ---
    # APPLICATION connection — must use the restricted `ecotrack_app` role in
    # production (NOSUPERUSER, NOBYPASSRLS).  In local development the default
    # superuser connection is fine.
    DATABASE_URL: str = Field(
        default="postgresql+psycopg2://ecotrack:ecotrack_dev_pw@localhost:5432/ecotrack_dev"
    )

    # MIGRATION connection — must use the privileged `ecotrack_owner` role so
    # that Alembic can CREATE/ALTER/DROP tables and manage RLS objects.
    # When not set, Alembic falls back to DATABASE_URL (safe for local dev
    # where both roles are typically the same superuser connection).
    # NEVER set this to the ecotrack_app credentials — migrations require DDL
    # privileges that the app role intentionally does not have.
    MIGRATION_DATABASE_URL: str | None = Field(default=None)

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

    # --- Spatial intelligence ---
    # Radius (metres) used to associate nearby complaints / bins with a pickup
    # location when computing CollectionPrioritizer scores. Chosen to reflect
    # a realistic "same-block" radius in dense Kampala streets.
    NEARBY_RADIUS_METERS: int = 500


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()


def validate_production_config(s: Settings) -> None:
    """
    Raises RuntimeError if any insecure defaults are present in a non-dev
    environment. Called at application startup (app/main.py). This prevents
    a production deployment from silently starting with dev credentials.
    """
    if s.APP_ENV in ("production", "staging"):
        if s.SECRET_KEY == _INSECURE_DEFAULT_SECRET_KEY:
            raise RuntimeError(
                "SECRET_KEY is set to the insecure default value. "
                "Generate a real secret key before running in production: "
                "python3 -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        if s.DEBUG:
            raise RuntimeError(
                "DEBUG=True must not be used in production. Set DEBUG=False."
            )
