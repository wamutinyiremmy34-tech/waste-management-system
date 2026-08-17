import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.geo import point_from_latlng
from app.models.enums import RecurrenceFrequency, UserRole, WasteCategory
from app.models.pickup import RecurringSchedule
from app.models.user import User
from app.security.dependencies import get_current_user, require_roles
from app.services.scheduler_service import materialize_due_schedules

router = APIRouter(prefix="/recurring-schedules", tags=["recurring-schedules"])


class RecurringScheduleCreateRequest(BaseModel):
    frequency: RecurrenceFrequency
    waste_category: WasteCategory
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address_text: str | None = Field(default=None, max_length=500)
    first_run_date: date
    day_of_week: int | None = Field(default=None, ge=0, le=6)


class RecurringScheduleOut(BaseModel):
    id: uuid.UUID
    frequency: RecurrenceFrequency
    waste_category: WasteCategory
    address_text: str | None
    next_run_date: date | None
    is_active: bool

    model_config = {"from_attributes": True}


@router.post("", response_model=RecurringScheduleOut, status_code=201)
def create_recurring_schedule(
    payload: RecurringScheduleCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CITIZEN, UserRole.ORGANIZATION_ADMIN)),
):
    if payload.frequency == RecurrenceFrequency.NONE:
        raise HTTPException(status_code=422, detail="frequency must not be NONE for a recurring schedule")

    schedule = RecurringSchedule(
        requester_user_id=current_user.id,
        organization_id=current_user.organization_id,
        frequency=payload.frequency,
        day_of_week=payload.day_of_week,
        waste_category=payload.waste_category,
        location=point_from_latlng(payload.latitude, payload.longitude),
        address_text=payload.address_text,
        next_run_date=payload.first_run_date,
        is_active=True,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


@router.get("/mine", response_model=list[RecurringScheduleOut])
def my_recurring_schedules(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(RecurringSchedule)
        .filter(RecurringSchedule.requester_user_id == current_user.id)
        .order_by(RecurringSchedule.created_at.desc())
        .all()
    )


@router.patch("/{schedule_id}/deactivate", response_model=RecurringScheduleOut)
def deactivate_schedule(
    schedule_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    schedule = db.get(RecurringSchedule, schedule_id)
    if not schedule or (schedule.requester_user_id != current_user.id and current_user.role != UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=404, detail="Recurring schedule not found")
    schedule.is_active = False
    db.commit()
    db.refresh(schedule)
    return schedule


@router.post("/run-materialization", status_code=200)
def trigger_materialization(
    db: Session = Depends(get_db), current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN))
):
    """
    Manually trigger the same materialization job `scripts/run_scheduler.py`
    runs on a cron schedule. Exposed as an admin-only endpoint mainly so this
    can be verified/tested over HTTP without shelling into the container —
    the real periodic invocation should still be a cron/systemd timer/
    scheduled job calling the script, not this endpoint being polled.
    """
    created = materialize_due_schedules(db)
    return {"created_count": len(created), "created_pickup_ids": [str(p.id) for p in created]}
