import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.enums import UserRole, WasteCategory
from app.models.pickup import WasteRecord
from app.models.recycling_rewards import RecyclingRecord
from app.models.user import User
from app.security.dependencies import get_current_user, require_roles

router = APIRouter(prefix="/recycling", tags=["recycling"])


class RecyclingRecordCreateRequest(BaseModel):
    waste_category: WasteCategory
    quantity_kg: float = Field(gt=0)
    received_date: date
    source_organization_id: uuid.UUID | None = None
    destination: str | None = Field(default=None, max_length=255)


class RecyclingRecordOut(BaseModel):
    id: uuid.UUID
    waste_category: WasteCategory
    quantity_kg: float
    received_date: date
    destination: str | None

    model_config = {"from_attributes": True}


@router.post("", response_model=RecyclingRecordOut, status_code=201)
def record_recycling(
    payload: RecyclingRecordCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.RECYCLER, UserRole.SUPER_ADMIN)),
):
    if current_user.role == UserRole.RECYCLER and not current_user.recycler_id:
        raise HTTPException(status_code=422, detail="User has no associated recycling partner")
    record = RecyclingRecord(
        recycler_id=current_user.recycler_id,
        source_organization_id=payload.source_organization_id,
        waste_category=payload.waste_category,
        quantity_kg=payload.quantity_kg,
        received_date=payload.received_date,
        destination=payload.destination,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("", response_model=list[RecyclingRecordOut])
def list_recycling_records(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.RECYCLER, UserRole.MUNICIPAL_ADMIN, UserRole.SUPER_ADMIN)),
):
    q = db.query(RecyclingRecord)
    if current_user.role == UserRole.RECYCLER:
        q = q.filter(RecyclingRecord.recycler_id == current_user.recycler_id)
    return q.order_by(RecyclingRecord.received_date.desc()).limit(500).all()


@router.get("/impact-summary")
def recycling_impact_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Real environmental-impact figures computed from actual database totals —
    not hardcoded. See docs/environmental-impact.md for the (clearly labeled,
    configurable) assumptions behind any derived estimates.
    """
    total_collected = db.query(func.coalesce(func.sum(WasteRecord.quantity_kg), 0.0)).scalar()
    total_recycled = db.query(func.coalesce(func.sum(RecyclingRecord.quantity_kg), 0.0)).scalar()
    diversion_rate = (total_recycled / total_collected * 100) if total_collected else 0.0

    by_category = (
        db.query(RecyclingRecord.waste_category, func.sum(RecyclingRecord.quantity_kg))
        .group_by(RecyclingRecord.waste_category)
        .all()
    )

    return {
        "total_waste_collected_kg": round(total_collected, 2),
        "total_waste_recycled_kg": round(total_recycled, 2),
        "diversion_rate_percent": round(diversion_rate, 2),
        "recycled_by_category_kg": {cat.value: round(qty, 2) for cat, qty in by_category},
        "note": "Figures are computed directly from recorded collection and recycling data. No CO2-equivalent or other scientific estimate is included unless explicitly configured — see docs/environmental-impact.md.",
    }
