from app.models.enums import UserRole
from app.models.user import User
from app.security.auth import hash_password
from tests.conftest import TestingSessionLocal, register_and_login


def _make_super_admin(db, email="admin2@test.com"):
    admin = User(
        email=email, hashed_password=hash_password("AdminPass123"), full_name="Admin", role=UserRole.SUPER_ADMIN, is_active=True
    )
    db.add(admin)
    db.commit()
    return admin


def test_nearby_bin_search_uses_real_distance(client):
    citizen_token = register_and_login(client, "geo1@example.com", role="CITIZEN")
    db = TestingSessionLocal()
    _make_super_admin(db)
    db.close()
    admin_login = client.post("/api/v1/auth/login", json={"email": "admin2@test.com", "password": "AdminPass123"})
    admin_token = admin_login.json()["access_token"]

    # Bin ~500m north of the search point (roughly 0.0045 deg lat ~ 500m)
    client.post(
        "/api/v1/bins",
        json={"code": "T-BIN-1", "bin_type": "general", "latitude": 0.3520, "longitude": 32.5825},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    # Bin far away (should be excluded by radius)
    client.post(
        "/api/v1/bins",
        json={"code": "T-BIN-2", "bin_type": "general", "latitude": 1.5, "longitude": 33.5},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    resp = client.get(
        "/api/v1/bins/nearby?latitude=0.3476&longitude=32.5825&radius_meters=1000",
        headers={"Authorization": f"Bearer {citizen_token}"},
    )
    assert resp.status_code == 200
    results = resp.json()
    codes = [b["code"] for b in results]
    assert "T-BIN-1" in codes
    assert "T-BIN-2" not in codes
    # distance should be a real computed float, ordered ascending
    assert results[0]["distance_meters"] is not None


def test_duplicate_bin_code_rejected(client):
    db = TestingSessionLocal()
    _make_super_admin(db, "admin3@test.com")
    db.close()
    admin_login = client.post("/api/v1/auth/login", json={"email": "admin3@test.com", "password": "AdminPass123"})
    admin_token = admin_login.json()["access_token"]

    payload = {"code": "DUP-BIN", "bin_type": "general", "latitude": 0.3, "longitude": 32.5}
    r1 = client.post("/api/v1/bins", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert r1.status_code == 201
    r2 = client.post("/api/v1/bins", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 409


def test_citizen_cannot_create_bin(client):
    citizen_token = register_and_login(client, "geo2@example.com", role="CITIZEN")
    resp = client.post(
        "/api/v1/bins",
        json={"code": "X", "bin_type": "general", "latitude": 0.3, "longitude": 32.5},
        headers={"Authorization": f"Bearer {citizen_token}"},
    )
    assert resp.status_code == 403


def test_complaint_lifecycle_and_invalid_transition(client):
    citizen_token = register_and_login(client, "complainant@example.com", role="CITIZEN")
    db = TestingSessionLocal()
    _make_super_admin(db, "admin4@test.com")
    db.close()
    admin_login = client.post("/api/v1/auth/login", json={"email": "admin4@test.com", "password": "AdminPass123"})
    admin_token = admin_login.json()["access_token"]

    resp = client.post(
        "/api/v1/complaints",
        json={"category": "ILLEGAL_DUMPING", "description": "Large pile of waste dumped near the market", "latitude": 0.3, "longitude": 32.5},
        headers={"Authorization": f"Bearer {citizen_token}"},
    )
    assert resp.status_code == 201
    complaint_id = resp.json()["id"]
    assert resp.json()["status"] == "REPORTED"

    # Invalid: can't jump straight from REPORTED to RESOLVED
    resp = client.patch(
        f"/api/v1/complaints/{complaint_id}/status",
        json={"status": "RESOLVED"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 422

    # Valid path
    for s in ["UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS", "RESOLVED"]:
        resp = client.patch(
            f"/api/v1/complaints/{complaint_id}/status",
            json={"status": s, "resolution_notes": "handled"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == s


def test_citizen_cannot_moderate_complaints(client):
    citizen_token = register_and_login(client, "complainant2@example.com", role="CITIZEN")
    resp = client.post(
        "/api/v1/complaints",
        json={"category": "OVERFLOWING_BIN", "description": "Bin overflowing behind the school", "latitude": 0.3, "longitude": 32.5},
        headers={"Authorization": f"Bearer {citizen_token}"},
    )
    complaint_id = resp.json()["id"]
    resp = client.patch(
        f"/api/v1/complaints/{complaint_id}/status",
        json={"status": "UNDER_REVIEW"},
        headers={"Authorization": f"Bearer {citizen_token}"},
    )
    assert resp.status_code == 403
