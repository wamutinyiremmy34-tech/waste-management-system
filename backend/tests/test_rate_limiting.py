"""
Verifies the rate limiter actually limits requests. Rather than fighting the
lru_cache'd application settings singleton, this builds a small standalone
ASGI app wrapping the real RateLimitMiddleware class directly — so the test
exercises the exact same code path production traffic would hit, without
needing to mutate global app/settings state mid-suite.
"""
import time

import redis as redis_lib
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core import rate_limit as rate_limit_module
from app.core.config import settings


def _build_app_with_limiter():
    app = FastAPI()

    @app.post("/api/v1/auth/login")
    def fake_login():
        return {"ok": True}

    app.add_middleware(rate_limit_module.RateLimitMiddleware)
    return app


def test_rate_limiter_blocks_excess_auth_requests(monkeypatch):
    # The middleware checks settings.APP_ENV at request time via the shared
    # `settings` singleton — flip it for this test, then restore.
    monkeypatch.setattr(settings, "APP_ENV", "development")
    monkeypatch.setattr(rate_limit_module, "AUTH_LIMIT_PER_MINUTE", 3)

    r = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)
    window = int(time.time() // 60)
    r.delete(f"ratelimit:auth:testclient:{window}")

    app = _build_app_with_limiter()
    client = TestClient(app)

    statuses = [client.post("/api/v1/auth/login").status_code for _ in range(5)]

    assert statuses[:3] == [200, 200, 200]
    assert 429 in statuses[3:]


def test_rate_limiter_disabled_in_testing_env(monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "testing")
    monkeypatch.setattr(rate_limit_module, "AUTH_LIMIT_PER_MINUTE", 1)

    app = _build_app_with_limiter()
    client = TestClient(app)

    statuses = [client.post("/api/v1/auth/login").status_code for _ in range(5)]

    # Even with a limit of 1, nothing is blocked while APP_ENV == "testing".
    assert all(s == 200 for s in statuses)
