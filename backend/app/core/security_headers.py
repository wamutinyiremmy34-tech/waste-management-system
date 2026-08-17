"""
Security headers middleware (spec section 41 — closes a gap flagged in
docs/security.md). Adds standard defensive HTTP response headers to every
response. This is a reasonable application-layer default; a production
deployment behind a reverse proxy may set some of these there instead (e.g.
HSTS is often terminated at the load balancer) — setting them here too is
harmless (the browser just sees the same header twice, or the proxy's takes
precedence depending on config) and means the API is safe by default even
when served directly.
"""
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Prevents browsers from MIME-sniffing a response away from its
        # declared Content-Type — mitigates some XSS/content-injection
        # vectors where an uploaded file might otherwise be reinterpreted.
        response.headers["X-Content-Type-Options"] = "nosniff"

        # This is a JSON API with no legitimate reason to be framed by
        # another site — blocks clickjacking-style embedding.
        response.headers["X-Frame-Options"] = "DENY"

        # Don't leak the full referring URL (which may contain tokens in
        # query strings, pickup addresses, etc.) to third-party origins.
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Restricts browser features this API has no use for. Deliberately
        # conservative (deny-by-default) since this is a JSON API, not a
        # page that embeds media/sensors itself.
        response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"

        # HSTS: only meaningful over HTTPS, and only set when the request
        # actually arrived over HTTPS (or via a trusted proxy header) so we
        # don't tell a browser to force HTTPS on a plain-HTTP local dev
        # server, which would be actively unhelpful for local development.
        if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"

        return response
