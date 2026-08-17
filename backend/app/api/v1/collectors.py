import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.geo import latlng_from_point, point_from_latlng
from app.models.enums import UserRole
from app.models.operations import Collector
from app.models.user import User
from app.security.dependencies import require_roles

router = APIRouter(prefix="/collectors", tags=["collectors"])


class CollectorCreateRequest(BaseModel):
    user_id: uuid.UUID


class CollectorLocationUpdateRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class CollectorAssignmentRequest(BaseModel):
    assigned_zone_id: uuid.UUID | None = None
    assigned_vehicle_id: uuid.UUID | None = None


class CollectorOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    waste_company_id: uuid.UUID
    assigned_zone_id: uuid.UUID | None
    assigned_vehicle_id: uuid.UUID | None
    is_active: bool
    latitude: float | None = None
    longitude: float | None = None


def _out(c: Collector) -> CollectorOut:
    loc = latlng_from_point(c.last_known_location)
    return CollectorOut(
        id=c.id,
        user_id=c.user_id,
        waste_company_id=c.waste_company_id,
        assigned_zone_id=c.assigned_zone_id,
        assigned_vehicle_id=c.assigned_vehicle_id,
        is_active=c.is_active,
        latitude=loc[0] if loc else None,
        longitude=loc[1] if loc else None,
    )


@router.get("", response_model=list[CollectorOut])
def list_collectors(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.COMPANY_ADMIN, UserRole.SUPER_ADMIN, UserRole.MUNICIPAL_ADMIN)),
):
    q = db.query(Collector)
    if current_user.role == UserRole.COMPANY_ADMIN:
        q = q.filter(Collector.waste_company_id == current_user.waste_company_id)
    return [_out(c) for c in q.all()]


@router.post("", response_model=CollectorOut, status_code=201)
def create_collector_profile(
    payload: CollectorCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.COMPANY_ADMIN, UserRole.SUPER_ADMIN)),
):
    target_user = db.get(User, payload.user_id)
    if not target_user or target_user.role != UserRole.COLLECTOR:
        raise HTTPException(status_code=404, detail="User not found or not a COLLECTOR role")
    existing = db.query(Collector).filter(Collector.user_id == payload.user_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Collector profile already exists")

    company_id = current_user.waste_company_id if current_user.role == UserRole.COMPANY_ADMIN else target_user.waste_company_id
    if not company_id:
        raise HTTPException(status_code=422, detail="waste_company_id must be resolvable for this collector")

    collector = Collector(user_id=payload.user_id, waste_company_id=company_id)
    db.add(collector)
    target_user.waste_company_id = company_id
    db.commit()
    db.refresh(collector)
    return _out(collector)


@router.get("/me", response_model=CollectorOut)
def my_collector_profile(db: Session = Depends(get_db), current_user: User = Depends(require_roles(UserRole.COLLECTOR))):
    c = db.query(Collector).filter(Collector.user_id == current_user.id).first()
    if not c:
        raise HTTPException(status_code=404, detail="No collector profile found")
    return _out(c)


@router.patch("/me/location", response_model=CollectorOut)
def update_my_location(
    payload: CollectorLocationUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.COLLECTOR)),
):
    c = db.query(Collector).filter(Collector.user_id == current_user.id).first()
    if not c:
        raise HTTPException(status_code=404, detail="No collector profile found")
    c.last_known_location = point_from_latlng(payload.latitude, payload.longitude)
    db.commit()
    db.refresh(c)
    return _out(c)


@router.patch("/{collector_id}/assignment", response_model=CollectorOut)
def update_assignment(
    collector_id: uuid.UUID,
    payload: CollectorAssignmentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.COMPANY_ADMIN, UserRole.SUPER_ADMIN)),
):
    c = db.get(Collector, collector_id)
    if not c:
        raise HTTPException(status_code=404, detail="Collector not found")
    if current_user.role == UserRole.COMPANY_ADMIN and c.waste_company_id != current_user.waste_company_id:
        raise HTTPException(status_code=404, detail="Collector not found")
    if payload.assigned_zone_id is not None:
        c.assigned_zone_id = payload.assigned_zone_id
    if payload.assigned_vehicle_id is not None:
        c.assigned_vehicle_id = payload.assigned_vehicle_id
    db.commit()
    db.refresh(c)
    return _out(c)
