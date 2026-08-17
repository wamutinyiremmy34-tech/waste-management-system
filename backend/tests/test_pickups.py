
from app.models.enums import UserRole
from app.models.operations import Collector
from app.models.tenant import WasteCompany
from app.models.user import User
from app.security.auth import hash_password
from tests.conftest import TestingSessionLocal, register_and_login


def _bootstrap_company_and_collector(db, collector_email):
    company = WasteCompany(name="Test Waste Co")
    db.add(company)
    db.flush()

    collector_user = db.query(User).filter(User.email == collector_email).first()
    collector = Collector(user_id=collector_user.id, waste_company_id=company.id)
    db.add(collector)
    collector_user.waste_company_id = company.id
    db.commit()
    return company.id, collector.id


def _make_super_admin(db, email="admin@test.com"):
    admin = User(
        email=email,
        hashed_password=hash_password("AdminPass123"),
        full_name="Admin",
        role=UserRole.SUPER_ADMIN,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    return admin


def test_full_pickup_lifecycle(client):
    citizen_token = register_and_login(client, "citizen@example.com", role="CITIZEN")
    collector_token = register_and_login(client, "collector@example.com", role="COLLECTOR")

    db = TestingSessionLocal()
    _make_super_admin(db)
    _company_id, collector_id = _bootstrap_company_and_collector(db, "collector@example.com")
    db.close()

    admin_login = client.post("/api/v1/auth/login", json={"email": "admin@test.com", "password": "AdminPass123"})
    admin_token = admin_login.json()["access_token"]

    # 1. Citizen requests a pickup
    resp = client.post(
        "/api/v1/pickups",
        json={"waste_category": "PLASTIC", "latitude": 0.3476, "longitude": 32.5825, "notes": "test"},
        headers={"Authorization": f"Bearer {citizen_token}"},
    )
    assert resp.status_code == 201
    pickup = resp.json()
    assert pickup["status"] == "REQUESTED"
    pickup_id = pickup["id"]

    # 2. Citizen cannot self-assign
    resp = client.post(
        f"/api/v1/pickups/{pickup_id}/assign",
        json={"collector_id": str(collector_id)},
        headers={"Authorization": f"Bearer {citizen_token}"},
    )
    assert resp.status_code == 403

    # 3. Admin assigns it
    resp = client.post(
        f"/api/v1/pickups/{pickup_id}/assign",
        json={"collector_id": str(collector_id)},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "ASSIGNED"

    # 4. Collector sees it in their assigned list
    resp = client.get("/api/v1/pickups/assigned", headers={"Authorization": f"Bearer {collector_token}"})
    assert resp.status_code == 200
    assert resp.json()["total"] == 1

    # 5. Status transitions
    for new_status in ["EN_ROUTE", "ARRIVED"]:
        resp = client.patch(
            f"/api/v1/pickups/{pickup_id}/status",
            json={"status": new_status},
            headers={"Authorization": f"Bearer {collector_token}"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == new_status

    # 6. Illegal transition rejected: cannot jump back to REQUESTED
    resp = client.patch(
        f"/api/v1/pickups/{pickup_id}/status",
        json={"status": "REQUESTED"},
        headers={"Authorization": f"Bearer {collector_token}"},
    )
    assert resp.status_code == 422

    # 7. Collector completes the collection
    resp = client.post(
        f"/api/v1/pickups/{pickup_id}/complete",
        json={"quantity_kg": 10.0, "waste_category": "PLASTIC"},
        headers={"Authorization": f"Bearer {collector_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["was_successful"] is True

    # 8. A COLLECTED pickup cannot be modified further
    resp = client.patch(
        f"/api/v1/pickups/{pickup_id}/status",
        json={"status": "CANCELLED"},
        headers={"Authorization": f"Bearer {citizen_token}"},
    )
    assert resp.status_code == 422

    # 9. Citizen sees the completed pickup and a notification
    resp = client.get(f"/api/v1/pickups/{pickup_id}", headers={"Authorization": f"Bearer {citizen_token}"})
    assert resp.json()["status"] == "COLLECTED"

    resp = client.get("/api/v1/notifications", headers={"Authorization": f"Bearer {citizen_token}"})
    assert resp.json()["total"] >= 1

    # 10. Real waste-by-category analytics reflect this collection
    resp = client.get("/api/v1/analytics/waste-by-category", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.json().get("PLASTIC") == 10.0


def test_citizen_cannot_view_another_citizens_pickup(client):
    citizen1_token = register_and_login(client, "cit1@example.com", role="CITIZEN")
    citizen2_token = register_and_login(client, "cit2@example.com", role="CITIZEN")

    resp = client.post(
        "/api/v1/pickups",
        json={"waste_category": "ORGANIC", "latitude": 0.3, "longitude": 32.5},
        headers={"Authorization": f"Bearer {citizen1_token}"},
    )
    pickup_id = resp.json()["id"]

    resp = client.get(f"/api/v1/pickups/{pickup_id}", headers={"Authorization": f"Bearer {citizen2_token}"})
    assert resp.status_code == 404  # not 403 — must not reveal existence


def test_collector_cannot_complete_unassigned_pickup(client):
    citizen_token = register_and_login(client, "citx@example.com", role="CITIZEN")
    collector_token = register_and_login(client, "colx@example.com", role="COLLECTOR")

    resp = client.post(
        "/api/v1/pickups",
        json={"waste_category": "GLASS", "latitude": 0.3, "longitude": 32.5},
        headers={"Authorization": f"Bearer {citizen_token}"},
    )
    pickup_id = resp.json()["id"]

    # Never assigned — collector tries to complete anyway
    resp = client.post(
        f"/api/v1/pickups/{pickup_id}/complete",
        json={"quantity_kg": 5.0},
        headers={"Authorization": f"Bearer {collector_token}"},
    )
    assert resp.status_code == 403


def test_citizen_can_cancel_own_pickup(client):
    citizen_token = register_and_login(client, "city@example.com", role="CITIZEN")
    resp = client.post(
        "/api/v1/pickups",
        json={"waste_category": "PAPER", "latitude": 0.3, "longitude": 32.5},
        headers={"Authorization": f"Bearer {citizen_token}"},
    )
    pickup_id = resp.json()["id"]

    resp = client.patch(
        f"/api/v1/pickups/{pickup_id}/status",
        json={"status": "CANCELLED"},
        headers={"Authorization": f"Bearer {citizen_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "CANCELLED"
