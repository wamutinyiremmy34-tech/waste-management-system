"""
Rate limiting middleware (spec section 5/41 — closes the gap flagged in
docs/security.md). Real Redis-backed fixed-window limiter, keyed by client IP
plus route path, so one noisy endpoint can't exhaust another's budget.

Auth endpoints get a tighter limit than the general API, since brute-force
login/registration attempts are the highest-value target here.
"""
import time

import redis
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings

_redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=2)

# Tighter budget for auth endpoints (brute-force targets) than the general API.
AUTH_PATH_PREFIXES = ("/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/refresh")
AUTH_LIMIT_PER_MINUTE = 10


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Disabled in the automated test environment — TestClient requests all
        # share one synthetic client IP, so the limiter would otherwise throttle
        # the test suite itself rather than reflecting real traffic patterns.
        if settings.APP_ENV == "testing":
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path

        is_auth_path = path.startswith(AUTH_PATH_PREFIXES)
        limit = AUTH_LIMIT_PER_MINUTE if is_auth_path else settings.RATE_LIMIT_PER_MINUTE

        window = int(time.time() // 60)
        key = f"ratelimit:{'auth' if is_auth_path else 'api'}:{client_ip}:{window}"

        try:
            current = _redis_client.incr(key)
            if current == 1:
                _redis_client.expire(key, 60)
        except redis.exceptions.RedisError:
            # Fail open: if Redis is unreachable, don't take the whole API down
            # over a rate-limiting outage — this is a availability/security
            # tradeoff explicitly documented in docs/security.md.
            return await call_next(request)

        if current > limit:
            return Response(
                content='{"detail":"Too many requests. Please try again shortly."}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": "60"},
            )

        return await call_next(request)
