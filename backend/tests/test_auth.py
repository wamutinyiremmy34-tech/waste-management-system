from tests.conftest import register_and_login


def test_register_and_login(client):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "a@example.com", "password": "Passw0rd123", "full_name": "A B", "role": "CITIZEN"},
    )
    assert resp.status_code == 201
    resp = client.post("/api/v1/auth/login", json={"email": "a@example.com", "password": "Passw0rd123"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()
    assert "refresh_token" in resp.json()


def test_duplicate_email_rejected(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "dup@example.com", "password": "Passw0rd123", "full_name": "Dup One", "role": "CITIZEN"},
    )
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "dup@example.com", "password": "Passw0rd123", "full_name": "Dup Two", "role": "CITIZEN"},
    )
    assert resp.status_code == 409


def test_wrong_password_rejected(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "b@example.com", "password": "Passw0rd123", "full_name": "Dup Two", "role": "CITIZEN"},
    )
    resp = client.post("/api/v1/auth/login", json={"email": "b@example.com", "password": "WrongPass1"})
    assert resp.status_code == 401


def test_cannot_self_register_as_super_admin(client):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "hacker@example.com", "password": "Passw0rd123", "full_name": "H", "role": "SUPER_ADMIN"},
    )
    assert resp.status_code == 422


def test_protected_endpoint_requires_token(client):
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401


def test_me_returns_correct_user(client):
    token = register_and_login(client, "c@example.com")
    resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "c@example.com"


def test_refresh_token_rotation(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "d@example.com", "password": "Passw0rd123", "full_name": "D User", "role": "CITIZEN"},
    )
    login_resp = client.post("/api/v1/auth/login", json={"email": "d@example.com", "password": "Passw0rd123"})
    refresh_token = login_resp.json()["refresh_token"]

    refresh_resp = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_resp.status_code == 200
    new_access = refresh_resp.json()["access_token"]
    assert new_access != login_resp.json()["access_token"]

    # Old refresh token should now be revoked (rotation) — reusing it fails.
    reuse_resp = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert reuse_resp.status_code == 401


def test_logout_revokes_refresh_token(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "e@example.com", "password": "Passw0rd123", "full_name": "E User", "role": "CITIZEN"},
    )
    login_resp = client.post("/api/v1/auth/login", json={"email": "e@example.com", "password": "Passw0rd123"})
    refresh_token = login_resp.json()["refresh_token"]

    logout_resp = client.post("/api/v1/auth/logout", json={"refresh_token": refresh_token})
    assert logout_resp.status_code == 204

    refresh_resp = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_resp.status_code == 401
