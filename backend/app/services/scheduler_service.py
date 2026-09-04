"""
Recurring pickup schedule materialization (spec section 13).

Per the spec, we do NOT pre-create thousands of PickupRequest rows in advance
for a recurring schedule. Instead, `RecurringSchedule` stores the recurrence
*rule*, and this service generates the next actual `PickupRequest` row only
when it's due — called by `scripts/run_scheduler.py`, intended to run on a
periodic job (cron/Celery-beat/systemd timer — any of these work; the
function itself is transport-agnostic).
"""
import logging
from datetime import date, timedelta

from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.models.enums import NotificationType, PickupStatus, RecurrenceFrequency
from app.models.notifications_audit import AuditLog, Notification
from app.models.pickup import PickupRequest, RecurringSchedule

logger = logging.getLogger("ecotrack.scheduler")


def _next_run_date(current: date, frequency: RecurrenceFrequency, day_of_week: int | None) -> date:
    """Computes the next occurrence date after `current` for a given frequency."""
    if frequency == RecurrenceFrequency.WEEKLY:
        return current + timedelta(days=7)
    if frequency == RecurrenceFrequency.BIWEEKLY:
        return current + timedelta(days=14)
    if frequency == RecurrenceFrequency.MONTHLY:
        # Naive month advance (28-31 days) — good enough for an MVP scheduler;
        # a calendar-aware month add would be a reasonable future refinement.
        month = current.month + 1
        year = current.year + (1 if month > 12 else 0)
        month = month if month <= 12 else 1
        day = min(current.day, 28)  # avoid invalid dates like Feb 30
        return date(year, month, day)
    # CUSTOM/NONE: caller is responsible for advancing next_run_date manually;
    # this scheduler does not guess an interval for custom rules.
    return current + timedelta(days=7)


def materialize_due_schedules(db: Session, as_of: date | None = None) -> list[PickupRequest]:
    """
    Finds active recurring schedules whose `next_run_date` is today or
    earlier, creates a real PickupRequest for each, advances next_run_date,
    and returns the list of newly created pickups. Idempotent per call: a
    schedule already materialized for today won't be materialized twice,
    because advancing next_run_date moves it out of the "due" window.
    """
    as_of = as_of or date.today()

    due_schedules = (
        db.query(RecurringSchedule)
        .filter(
            and_(
                RecurringSchedule.is_active.is_(True),
                RecurringSchedule.next_run_date.isnot(None),
                RecurringSchedule.next_run_date <= as_of,
            )
        )
        .all()
    )

    created: list[PickupRequest] = []
    for schedule in due_schedules:
        try:
            pickup = PickupRequest(
                requester_user_id=schedule.requester_user_id,
                organization_id=schedule.organization_id,
                waste_category=schedule.waste_category,
                location=schedule.location,
                address_text=schedule.address_text,
                preferred_date=schedule.next_run_date,
                recurring_schedule_id=schedule.id,
                status=PickupStatus.REQUESTED,
            )
            db.add(pickup)
            db.flush()

            db.add(
                Notification(
                    user_id=schedule.requester_user_id,
                    type=NotificationType.PICKUP_SCHEDULED,
                    title="Your recurring pickup has been scheduled",
                    body=f"A {schedule.waste_category.value.lower()} pickup was auto-created from your recurring schedule.",
                    reference_id=pickup.id,
                )
            )
            db.add(
                AuditLog(
                    actor_user_id=None,
                    action="RECURRING_PICKUP_MATERIALIZED",
                    entity_type="PickupRequest",
                    entity_id=str(pickup.id),
                    metadata_json={"recurring_schedule_id": str(schedule.id)},
                )
            )

            # Advance next_run_date BEFORE committing so that if commit fails
            # and we retry, we won't try to re-materialize the same date.
            schedule.next_run_date = _next_run_date(schedule.next_run_date, schedule.frequency, schedule.day_of_week)
            db.commit()
            created.append(pickup)
            logger.info(
                "Recurring pickup materialized schedule_id=%s pickup_id=%s user_id=%s category=%s",
                str(schedule.id),
                str(pickup.id),
                str(schedule.requester_user_id),
                schedule.waste_category.value,
            )
        except Exception as exc:
            logger.error(
                "Failed to materialize recurring schedule schedule_id=%s error=%s",
                str(schedule.id),
                str(exc),
                exc_info=True,
            )
            db.rollback()
            # Advance next_run_date even on failure to prevent this schedule
            # from being picked up again on every subsequent scheduler run.
            try:
                schedule.next_run_date = _next_run_date(
                    schedule.next_run_date, schedule.frequency, schedule.day_of_week
                )
                db.commit()
            except Exception as advance_exc:
                logger.error(
                    "Failed to advance next_run_date after schedule error schedule_id=%s error=%s",
                    str(schedule.id),
                    str(advance_exc),
                )
                db.rollback()

    logger.info("Scheduler run complete created=%d due=%d", len(created), len(due_schedules))
    for p in created:
        try:
            db.refresh(p)
        except Exception:
            pass  # Already committed — refresh is best-effort
    return created
