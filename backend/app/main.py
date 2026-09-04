import logging
import time
import uuid

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1 import (
    admin,
    analytics,
    auth,
    bins,
    collectors,
    companies,
    complaints,
    notifications,
    operations,
    organizations,
    pickups,
    recurring_schedules,
    recycling,
    reports,
    rewards,
    vehicles,
    zones,
)
from app.core.config import settings, validate_production_config
from app.core.database import get_db
from app.core.rate_limit import RateLimitMiddleware
from app.core.security_headers import SecurityHeadersMiddleware

# ---------------------------------------------------------------------------
# Logging configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("ecotrack")

# Suppress noisy third-party loggers at INFO level
for _noisy in ("sqlalchemy.engine", "uvicorn.access"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)

# ---------------------------------------------------------------------------
# Startup validation — fail fast if misconfigured
# ---------------------------------------------------------------------------
validate_production_config(settings)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title=f"{settings.APP_NAME} API",
    version="0.1.0",
    description="Smart Waste Management & Environmental Intelligence Platform — API",
    # Disable interactive docs in production — they expose the full API surface
    # to unauthenticated users and have been the target of reflected-XSS attacks
    # in other projects. Enable explicitly in development/staging only.
    docs_url="/docs" if settings.APP_ENV != "production" else None,
    redoc_url="/redoc" if settings.APP_ENV != "production" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    # Restrict to the HTTP methods this API actually uses — not the browser
    # preflight wildcard. Avoids accepting arbitrary methods from allowed origins.
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    # Allow the specific headers the API needs: Authorization (Bearer tokens)
    # and Content-Type (JSON bodies). Accept is included for good interoperability.
    allow_headers=["Authorization", "Content-Type", "Accept"],
)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)


# ---------------------------------------------------------------------------
# Request correlation ID + timing middleware
# ---------------------------------------------------------------------------
@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """
    Assigns a correlation ID to every request and logs completion with
    duration and status. The correlation ID is returned in the response
    header `X-Request-ID` so it can be linked to client-side error reports.
    Never logs request bodies (may contain passwords/tokens).
    """
    correlation_id = str(uuid.uuid4())[:8]
    request.state.correlation_id = correlation_id
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "request completed method=%s path=%s status=%d duration_ms=%.1f correlation_id=%s",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        correlation_id,
    )
    response.headers["X-Request-ID"] = correlation_id
    return response


# ---------------------------------------------------------------------------
# Global exception handler — prevents stack traces leaking to clients
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Catches any exception that escaped all route handlers. Logs the full
    traceback server-side (with correlation ID for tracing), but returns a
    safe, generic 500 to the client — no stack traces, no internal details.
    """
    correlation_id = getattr(request.state, "correlation_id", "unknown")
    logger.exception(
        "Unhandled exception method=%s path=%s correlation_id=%s",
        request.method,
        request.url.path,
        correlation_id,
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An unexpected error occurred. Please try again or contact support.",
            "correlation_id": correlation_id,
        },
    )


# ---------------------------------------------------------------------------
# IntegrityError handler — turns DB unique/FK violations into clean 409s
# ---------------------------------------------------------------------------
@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    """
    Catches SQLAlchemy IntegrityError (unique constraint violations, FK
    violations) and returns a 409 Conflict instead of a 500. This covers
    race-condition uniqueness failures (e.g. concurrent bin code creation)
    that the application-layer check cannot fully prevent.
    """
    correlation_id = getattr(request.state, "correlation_id", "unknown")
    logger.warning(
        "Integrity constraint violation path=%s error=%s correlation_id=%s",
        request.url.path,
        str(exc.orig),
        correlation_id,
    )
    return JSONResponse(
        status_code=409,
        content={"detail": "A conflicting record already exists.", "correlation_id": correlation_id},
    )

app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(pickups.router, prefix=settings.API_V1_PREFIX)
app.include_router(complaints.router, prefix=settings.API_V1_PREFIX)
app.include_router(bins.router, prefix=settings.API_V1_PREFIX)
app.include_router(zones.router, prefix=settings.API_V1_PREFIX)
app.include_router(vehicles.router, prefix=settings.API_V1_PREFIX)
app.include_router(collectors.router, prefix=settings.API_V1_PREFIX)
app.include_router(recycling.router, prefix=settings.API_V1_PREFIX)
app.include_router(rewards.router, prefix=settings.API_V1_PREFIX)
app.include_router(notifications.router, prefix=settings.API_V1_PREFIX)
app.include_router(analytics.router, prefix=settings.API_V1_PREFIX)
app.include_router(admin.router, prefix=settings.API_V1_PREFIX)
app.include_router(organizations.router, prefix=settings.API_V1_PREFIX)
app.include_router(companies.router, prefix=settings.API_V1_PREFIX)
app.include_router(recurring_schedules.router, prefix=settings.API_V1_PREFIX)
app.include_router(reports.router, prefix=settings.API_V1_PREFIX)
app.include_router(operations.router, prefix=settings.API_V1_PREFIX)


@app.get(f"{settings.API_V1_PREFIX}/health")
def health(db: Session = Depends(get_db)):
    checks = {"database": "unknown", "redis": "unknown"}
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        logger.error("Health check: database unavailable error=%s", str(exc))
        checks["database"] = "error"

    try:
        import redis

        r = redis.from_url(settings.REDIS_URL, socket_connect_timeout=1)
        r.ping()
        checks["redis"] = "ok"
    except Exception as exc:
        logger.error("Health check: Redis unavailable error=%s", str(exc))
        checks["redis"] = "error"

    overall = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
    if overall != "ok":
        logger.warning("Health check degraded checks=%s", str(checks))
    return {"status": overall, "checks": checks, "app": settings.APP_NAME, "env": settings.APP_ENV}


@app.get("/")
def root():
    return {"message": f"{settings.APP_NAME} API", "docs": "/docs"}
