"""Recurring schedule creation and real materialization (spec section 13)."""
from datetime import date, timedelta

from app.models.enums import UserRole
from app.models.user import User
from app.security.auth import hash_password
from tests.conftest import TestingSessionLocal, register_and_login


def _make_super_admin(db, email="schedadmin@test.com"):
    admin = User(
        email=email, hashed_password=hash_password("AdminPass123"), full_name="Admin",
        role=UserRole.SUPER_ADMIN, is_active=True,
    )
    db.add(admin)
    db.commit()
    return admin


def test_create_recurring_schedule(client):
    citizen_token = register_and_login(client, "recurring1@example.com", role="CITIZEN")
    resp = client.post(
        "/api/v1/recurring-schedules",
        json={
            "frequency": "WEEKLY",
            "waste_category": "ORGANIC",
            "latitude": 0.34,
            "longitude": 32.58,
            "address_text": "Weekly organic pickup",
            "first_run_date": str(date.today()),
        },
        headers={"Authorization": f"Bearer {citizen_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["frequency"] == "WEEKLY"
    assert resp.json()["next_run_date"] == str(date.today())


def test_frequency_none_rejected(client):
    citizen_token = register_and_login(client, "recurring2@example.com", role="CITIZEN")
    resp = client.post(
        "/api/v1/recurring-schedules",
        json={
            "frequency": "NONE",
            "waste_category": "PLASTIC",
            "latitude": 0.34,
            "longitude": 32.58,
            "first_run_date": str(date.today()),
        },
        headers={"Authorization": f"Bearer {citizen_token}"},
    )
    assert resp.status_code == 422


def test_materialization_creates_real_pickup_and_advances_schedule(client):
    citizen_token = register_and_login(client, "recurring3@example.com", role="CITIZEN")
    db = TestingSessionLocal()
    _make_super_admin(db)
    db.close()
    admin_login = client.post("/api/v1/auth/login", json={"email": "schedadmin@test.com", "password": "AdminPass123"})
    admin_token = admin_login.json()["access_token"]

    # Due yesterday, so it's picked up immediately.
    due_date = date.today() - timedelta(days=1)
    resp = client.post(
        "/api/v1/recurring-schedules",
        json={
            "frequency": "WEEKLY",
            "waste_category": "PAPER",
            "latitude": 0.34,
            "longitude": 32.58,
            "first_run_date": str(due_date),
        },
        headers={"Authorization": f"Bearer {citizen_token}"},
    )
    schedule_id = resp.json()["id"]

    # No pickups yet for this citizen.
    resp = client.get("/api/v1/pickups/mine", headers={"Authorization": f"Bearer {citizen_token}"})
    assert resp.json()["total"] == 0

    # Run the materialization job.
    resp = client.post("/api/v1/recurring-schedules/run-materialization", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["created_count"] >= 1

    # A real pickup now exists for the citizen, linked to the schedule.
    resp = client.get("/api/v1/pickups/mine", headers={"Authorization": f"Bearer {citizen_token}"})
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["waste_category"] == "PAPER"

    # Running it again immediately does NOT create a duplicate — the schedule's
    # next_run_date has been advanced past "today", so it's no longer due.
    resp = client.post("/api/v1/recurring-schedules/run-materialization", headers={"Authorization": f"Bearer {admin_token}"})
    created_ids_second_run = resp.json()["created_pickup_ids"]
    resp2 = client.get("/api/v1/pickups/mine", headers={"Authorization": f"Bearer {citizen_token}"})
    assert resp2.json()["total"] == 1  # still just one — no duplicate materialized

    # Schedule can be deactivated by its owner.
    resp = client.patch(
        f"/api/v1/recurring-schedules/{schedule_id}/deactivate", headers={"Authorization": f"Bearer {citizen_token}"}
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


def test_citizen_cannot_trigger_materialization(client):
    citizen_token = register_and_login(client, "recurring4@example.com", role="CITIZEN")
    resp = client.post(
        "/api/v1/recurring-schedules/run-materialization", headers={"Authorization": f"Bearer {citizen_token}"}
    )
    assert resp.status_code == 403


def test_cannot_deactivate_another_users_schedule(client):
    citizen1_token = register_and_login(client, "recurring5@example.com", role="CITIZEN")
    citizen2_token = register_and_login(client, "recurring6@example.com", role="CITIZEN")

    resp = client.post(
        "/api/v1/recurring-schedules",
        json={
            "frequency": "MONTHLY",
            "waste_category": "GLASS",
            "latitude": 0.34,
            "longitude": 32.58,
            "first_run_date": str(date.today()),
        },
        headers={"Authorization": f"Bearer {citizen1_token}"},
    )
    schedule_id = resp.json()["id"]

    resp = client.patch(
        f"/api/v1/recurring-schedules/{schedule_id}/deactivate", headers={"Authorization": f"Bearer {citizen2_token}"}
    )
    assert resp.status_code == 404
