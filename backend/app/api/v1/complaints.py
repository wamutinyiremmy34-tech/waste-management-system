import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.geo import latlng_from_point, point_from_latlng
from app.models.bins_complaints import Complaint
from app.models.enums import ComplaintCategory, ComplaintStatus, UserRole
from app.models.notifications_audit import AuditLog, Notification, NotificationType
from app.models.user import User
from app.security.dependencies import get_current_user, require_roles

router = APIRouter(prefix="/complaints", tags=["complaints"])

COMPLAINT_TRANSITIONS = {
    ComplaintStatus.REPORTED: {ComplaintStatus.UNDER_REVIEW, ComplaintStatus.REJECTED},
    ComplaintStatus.UNDER_REVIEW: {ComplaintStatus.ASSIGNED, ComplaintStatus.REJECTED},
    ComplaintStatus.ASSIGNED: {ComplaintStatus.IN_PROGRESS, ComplaintStatus.REJECTED},
    ComplaintStatus.IN_PROGRESS: {ComplaintStatus.RESOLVED, ComplaintStatus.REJECTED},
    ComplaintStatus.RESOLVED: set(),
    ComplaintStatus.REJECTED: set(),
}


class ComplaintCreateRequest(BaseModel):
    category: ComplaintCategory
    description: str = Field(min_length=5, max_length=2000)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class ComplaintStatusUpdateRequest(BaseModel):
    status: ComplaintStatus
    resolution_notes: str | None = Field(default=None, max_length=2000)


class ComplaintOut(BaseModel):
    id: uuid.UUID
    reporter_user_id: uuid.UUID
    category: ComplaintCategory
    description: str
    status: ComplaintStatus
    latitude: float
    longitude: float
    resolution_notes: str | None
    created_at: datetime


def _out(c: Complaint) -> dict:
    lat, lng = latlng_from_point(c.location)
    return {
        "id": c.id,
        "reporter_user_id": c.reporter_user_id,
        "category": c.category,
        "description": c.description,
        "status": c.status,
        "latitude": lat,
        "longitude": lng,
        "resolution_notes": c.resolution_notes,
        "created_at": c.created_at,
    }


@router.post("", response_model=ComplaintOut, status_code=201)
def report_complaint(
    payload: ComplaintCreateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    complaint = Complaint(
        reporter_user_id=current_user.id,
        category=payload.category,
        description=payload.description,
        location=point_from_latlng(payload.latitude, payload.longitude),
        status=ComplaintStatus.REPORTED,
    )
    db.add(complaint)
    db.flush()
    db.add(
        AuditLog(
            actor_user_id=current_user.id,
            action="COMPLAINT_REPORTED",
            entity_type="Complaint",
            entity_id=str(complaint.id),
        )
    )
    db.commit()
    db.refresh(complaint)
    return _out(complaint)


@router.get("/mine", response_model=dict)
def my_complaints(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Complaint).filter(Complaint.reporter_user_id == current_user.id)
    total = q.count()
    items = q.order_by(Complaint.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [_out(c) for c in items], "total": total, "page": page, "page_size": page_size}


@router.get("", response_model=dict)
def list_complaints(
    status_filter: ComplaintStatus | None = Query(default=None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.MUNICIPAL_ADMIN, UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
    ),
):
    q = db.query(Complaint)
    if status_filter:
        q = q.filter(Complaint.status == status_filter)
    total = q.count()
    items = q.order_by(Complaint.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [_out(c) for c in items], "total": total, "page": page, "page_size": page_size}


@router.get("/{complaint_id}", response_model=ComplaintOut)
def get_complaint(complaint_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    c = db.get(Complaint, complaint_id)
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")
    if current_user.role not in (UserRole.MUNICIPAL_ADMIN, UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN):
        if c.reporter_user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Complaint not found")
    return _out(c)


@router.patch("/{complaint_id}/status", response_model=ComplaintOut)
def update_complaint_status(
    complaint_id: uuid.UUID,
    payload: ComplaintStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.MUNICIPAL_ADMIN, UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
    ),
):
    c = db.get(Complaint, complaint_id)
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")

    allowed = COMPLAINT_TRANSITIONS.get(c.status, set())
    if payload.status not in allowed:
        raise HTTPException(
            status_code=422, detail=f"Cannot transition complaint from {c.status.value} to {payload.status.value}"
        )
    c.status = payload.status
    if payload.resolution_notes:
        c.resolution_notes = payload.resolution_notes
    if payload.status == ComplaintStatus.RESOLVED:
        c.resolved_at = datetime.now(timezone.utc)

    db.add(
        Notification(
            user_id=c.reporter_user_id,
            type=NotificationType.COMPLAINT_UPDATED,
            title=f"Your report is now {payload.status.value.replace('_', ' ').title()}",
            body=payload.resolution_notes or "Status updated.",
            reference_id=c.id,
        )
    )
    db.add(
        AuditLog(
            actor_user_id=current_user.id,
            action=f"COMPLAINT_STATUS_{payload.status.value}",
            entity_type="Complaint",
            entity_id=str(c.id),
        )
    )
    db.commit()
    db.refresh(c)
    return _out(c)
