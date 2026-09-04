"""
Tests for the password reset flow (H-6 fix).

Covers:
- Full happy path: request → token → confirm → login with new password
- Old refresh tokens are revoked after reset
- Reusing an expired/used token is rejected
- Non-existent email returns 200 (no enumeration)
- Weak new password is rejected
"""
import pytest

from tests.conftest import register_and_login


def _register(client, email, password="Passw0rd123"):
    client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": "Reset Test User", "role": "CITIZEN"},
    )


def test_full_password_reset_happy_path(client):
    email = "reset_happy@example.com"
    old_pw = "Passw0rd123"
    new_pw = "NewPassw0rd456"
    _register(client, email, old_pw)

    # Request reset
    resp = client.post("/api/v1/auth/password-reset/request", json={"email": email})
    assert resp.status_code == 200
    data = resp.json()
    assert "reset_token" in data, "Pilot mode should return token in response"
    token = data["reset_token"]

    # Confirm reset
    resp = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "new_password": new_pw},
    )
    assert resp.status_code == 200

    # Old password should no longer work
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": old_pw})
    assert resp.status_code == 401

    # New password should work
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": new_pw})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_password_reset_revokes_existing_refresh_tokens(client):
    email = "reset_revoke@example.com"
    old_pw = "Passw0rd123"
    _register(client, email, old_pw)

    # Log in and capture refresh token
    login_resp = client.post("/api/v1/auth/login", json={"email": email, "password": old_pw})
    old_refresh = login_resp.json()["refresh_token"]

    # Reset password
    req_resp = client.post("/api/v1/auth/password-reset/request", json={"email": email})
    token = req_resp.json()["reset_token"]
    client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "new_password": "NewPassw0rd456"},
    )

    # Old refresh token must be revoked
    refresh_resp = client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert refresh_resp.status_code == 401, "Old refresh token should be revoked after password reset"


def test_used_reset_token_cannot_be_reused(client):
    email = "reset_reuse@example.com"
    _register(client, email)

    req_resp = client.post("/api/v1/auth/password-reset/request", json={"email": email})
    token = req_resp.json()["reset_token"]

    # Use it once
    client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "new_password": "NewPassw0rd456"},
    )

    # Attempt to reuse it
    resp = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "new_password": "AnotherPassw0rd789"},
    )
    assert resp.status_code == 400, "Used reset token must be rejected"


def test_unknown_email_returns_200_no_enumeration(client):
    """Password reset for an unregistered email must return 200 to prevent
    user enumeration — an attacker cannot determine whether an email is
    registered by observing the response."""
    resp = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": "nobody@example.com"},
    )
    assert resp.status_code == 200
    # Must NOT include a reset_token when the user does not exist
    assert "reset_token" not in resp.json()


def test_weak_new_password_rejected(client):
    email = "reset_weak@example.com"
    _register(client, email)

    req_resp = client.post("/api/v1/auth/password-reset/request", json={"email": email})
    token = req_resp.json()["reset_token"]

    # Too short / no digit
    resp = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "new_password": "short"},
    )
    assert resp.status_code == 422


def test_invalid_token_rejected(client):
    resp = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": "completely-fake-token", "new_password": "ValidPassw0rd"},
    )
    assert resp.status_code == 400
