from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.bins_complaints import Complaint
from app.models.enums import ComplaintStatus, PickupStatus, UserRole
from app.models.pickup import Collection, PickupRequest, WasteRecord
from app.models.recycling_rewards import RecyclingRecord
from app.models.user import User
from app.security.dependencies import require_roles

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/admin-dashboard")
def admin_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.MUNICIPAL_ADMIN)),
):
    total_users = db.query(func.count(User.id)).scalar()
    active_users = db.query(func.count(User.id)).filter(User.is_active.is_(True)).scalar()
    total_collections = db.query(func.count(Collection.id)).scalar()
    completed = db.query(func.count(PickupRequest.id)).filter(PickupRequest.status == PickupStatus.COLLECTED).scalar()
    missed = db.query(func.count(PickupRequest.id)).filter(PickupRequest.status == PickupStatus.MISSED).scalar()
    waste_collected = db.query(func.coalesce(func.sum(WasteRecord.quantity_kg), 0.0)).scalar()
    waste_recycled = db.query(func.coalesce(func.sum(RecyclingRecord.quantity_kg), 0.0)).scalar()
    complaints_total = db.query(func.count(Complaint.id)).scalar()
    unresolved = db.query(func.count(Complaint.id)).filter(Complaint.status != ComplaintStatus.RESOLVED).scalar()

    return {
        "total_users": total_users,
        "active_users": active_users,
        "total_collections": total_collections,
        "completed_collections": completed,
        "missed_collections": missed,
        "waste_collected_kg": round(waste_collected, 2),
        "recycled_waste_kg": round(waste_recycled, 2),
        "complaints_total": complaints_total,
        "unresolved_complaints": unresolved,
    }


@router.get("/waste-by-category")
def waste_by_category(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.SUPER_ADMIN, UserRole.MUNICIPAL_ADMIN, UserRole.COMPANY_ADMIN)
    ),
):
    rows = db.query(WasteRecord.category, func.sum(WasteRecord.quantity_kg)).group_by(WasteRecord.category).all()
    return {cat.value: round(qty, 2) for cat, qty in rows}


@router.get("/complaint-analytics")
def complaint_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.SUPER_ADMIN, UserRole.MUNICIPAL_ADMIN, UserRole.COMPANY_ADMIN)
    ),
):
    by_category = db.query(Complaint.category, func.count(Complaint.id)).group_by(Complaint.category).all()
    by_status = db.query(Complaint.status, func.count(Complaint.id)).group_by(Complaint.status).all()
    total = db.query(func.count(Complaint.id)).scalar()
    resolved = db.query(func.count(Complaint.id)).filter(Complaint.status == ComplaintStatus.RESOLVED).scalar()
    resolution_rate = (resolved / total * 100) if total else 0.0

    return {
        "by_category": {c.value: n for c, n in by_category},
        "by_status": {s.value: n for s, n in by_status},
        "resolution_rate_percent": round(resolution_rate, 2),
    }
