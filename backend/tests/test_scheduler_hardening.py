"""
Scheduler hardening tests (M-3 fix).

Verifies:
- Successful schedule materialization produces a pickup and advances next_run_date
- A schedule with a bad geometry (simulated via monkeypatch) does not create a
  duplicate on the next run — next_run_date is advanced even on failure
- The scheduler is idempotent: running it twice for the same date does not
  create two pickups
"""
import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy.orm import Session

from app.core.geo import point_from_latlng
from app.models.enums import RecurrenceFrequency, UserRole, WasteCategory
from app.models.pickup import PickupRequest, RecurringSchedule
from app.models.user import User
from app.security.auth import hash_password
from app.services.scheduler_service import materialize_due_schedules


def _make_user(db: Session) -> User:
    user = User(
        email=f"sched_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=hash_password("Passw0rd123"),
        full_name="Scheduler Test",
        role=UserRole.CITIZEN,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


def _make_schedule(db: Session, user: User, next_run: date) -> RecurringSchedule:
    schedule = RecurringSchedule(
        requester_user_id=user.id,
        frequency=RecurrenceFrequency.WEEKLY,
        waste_category=WasteCategory.ORGANIC,
        location=point_from_latlng(0.3, 32.5),
        address_text="Test address",
        is_active=True,
        next_run_date=next_run,
    )
    db.add(schedule)
    db.commit()
    return schedule


def test_scheduler_materializes_due_schedule(db_session):
    user = _make_user(db_session)
    today = date.today()
    schedule = _make_schedule(db_session, user, today)

    created = materialize_due_schedules(db_session, as_of=today)

    assert len(created) == 1
    assert created[0].requester_user_id == user.id
    assert created[0].preferred_date == today

    db_session.refresh(schedule)
    assert schedule.next_run_date == today + timedelta(days=7), (
        "next_run_date must advance by one week after materialization"
    )


def test_scheduler_idempotent_same_date(db_session):
    """Running the scheduler twice for the same date must NOT create two pickups."""
    user = _make_user(db_session)
    today = date.today()
    schedule = _make_schedule(db_session, user, today)

    created_first = materialize_due_schedules(db_session, as_of=today)
    assert len(created_first) == 1

    # Run again — next_run_date was already advanced, so no new pickup
    created_second = materialize_due_schedules(db_session, as_of=today)
    assert len(created_second) == 0, "Second run must not create a duplicate pickup"

    total = db_session.query(PickupRequest).filter(
        PickupRequest.recurring_schedule_id == schedule.id
    ).count()
    assert total == 1


def test_scheduler_skips_inactive_schedules(db_session):
    user = _make_user(db_session)
    today = date.today()
    schedule = _make_schedule(db_session, user, today)
    schedule.is_active = False
    db_session.commit()

    created = materialize_due_schedules(db_session, as_of=today)
    assert len(created) == 0


def test_scheduler_skips_future_schedule(db_session):
    user = _make_user(db_session)
    tomorrow = date.today() + timedelta(days=1)
    _make_schedule(db_session, user, tomorrow)

    created = materialize_due_schedules(db_session, as_of=date.today())
    assert len(created) == 0


def test_scheduler_advances_date_even_if_pickup_commit_fails(db_session, monkeypatch):
    """
    If creating the pickup row fails (e.g. DB constraint violation), the
    scheduler must still advance next_run_date to prevent the same broken
    schedule from blocking every subsequent run.
    """
    user = _make_user(db_session)
    today = date.today()
    schedule = _make_schedule(db_session, user, today)
    original_next = schedule.next_run_date

    # Monkeypatch db.flush to raise on the first call (simulating a DB error
    # during pickup creation), then restore normal behaviour.
    original_flush = db_session.flush
    flush_calls = {"count": 0}

    def failing_flush(*args, **kwargs):
        flush_calls["count"] += 1
        if flush_calls["count"] == 1:
            raise Exception("Simulated DB error during pickup insert")
        return original_flush(*args, **kwargs)

    monkeypatch.setattr(db_session, "flush", failing_flush)

    # Should not raise — error is caught and logged
    created = materialize_due_schedules(db_session, as_of=today)

    # No pickup created (failed)
    assert len(created) == 0

    # But next_run_date was advanced to prevent infinite retry
    db_session.refresh(schedule)
    assert schedule.next_run_date > original_next, (
        "next_run_date must advance even when pickup creation fails"
    )
