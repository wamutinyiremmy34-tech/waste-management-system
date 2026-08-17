"""Security headers middleware (spec section 41 / docs/security.md gap)."""


def test_security_headers_present_on_every_response(client):
    resp = client.get("/api/v1/health")
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    assert resp.headers["X-Frame-Options"] == "DENY"
    assert resp.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "geolocation=()" in resp.headers["Permissions-Policy"]


def test_security_headers_present_on_error_responses_too(client):
    resp = client.get("/api/v1/auth/me")  # unauthenticated -> 401
    assert resp.status_code == 401
    assert resp.headers["X-Content-Type-Options"] == "nosniff"


def test_hsts_not_set_over_plain_http(client):
    """
    Local dev / plain-HTTP requests should NOT get an HSTS header — forcing
    HTTPS on a local dev server would break it, not protect it.
    """
    resp = client.get("/api/v1/health")
    assert "Strict-Transport-Security" not in resp.headers


def test_hsts_set_when_forwarded_proto_indicates_https(client):
    """A request arriving via a TLS-terminating proxy (X-Forwarded-Proto: https) does get HSTS."""
    resp = client.get("/api/v1/health", headers={"X-Forwarded-Proto": "https"})
    assert resp.headers["Strict-Transport-Security"] == "max-age=63072000; includeSubDomains"
