"""
Analytics API — Phase 2 extended with date-range filters and complaint category breakdown.

All existing endpoints are backward-compatible (new query params are optional).
"""
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
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
    """Platform-wide operational overview. No date filter — always shows totals."""
    total_users = db.query(func.count(User.id)).scalar()
    active_users = db.query(func.count(User.id)).filter(User.is_active.is_(True)).scalar()
    total_collections = db.query(func.count(Collection.id)).scalar()
    completed = db.query(func.count(PickupRequest.id)).filter(PickupRequest.status == PickupStatus.COLLECTED).scalar()
    missed = db.query(func.count(PickupRequest.id)).filter(PickupRequest.status == PickupStatus.MISSED).scalar()
    failed = db.query(func.count(PickupRequest.id)).filter(PickupRequest.status == PickupStatus.FAILED).scalar()
    requested = db.query(func.count(PickupRequest.id)).filter(PickupRequest.status == PickupStatus.REQUESTED).scalar()
    assigned = db.query(func.count(PickupRequest.id)).filter(PickupRequest.status == PickupStatus.ASSIGNED).scalar()
    waste_collected = db.query(func.coalesce(func.sum(WasteRecord.quantity_kg), 0.0)).scalar()
    waste_recycled = db.query(func.coalesce(func.sum(RecyclingRecord.quantity_kg), 0.0)).scalar()
    complaints_total = db.query(func.count(Complaint.id)).scalar()
    unresolved = db.query(func.count(Complaint.id)).filter(Complaint.status != ComplaintStatus.RESOLVED).scalar()

    terminal = completed + missed + failed
    completion_rate = round(completed / terminal * 100, 1) if terminal > 0 else 0.0

    return {
        "total_users": total_users,
        "active_users": active_users,
        "total_collections": total_collections,
        "completed_collections": completed,
        "failed_collections": failed,
        "missed_collections": missed,
        "requested_pickups": requested,
        "assigned_pickups": assigned,
        "waste_collected_kg": round(waste_collected, 2),
        "recycled_waste_kg": round(waste_recycled, 2),
        "complaints_total": complaints_total,
        "unresolved_complaints": unresolved,
        "completion_rate_percent": completion_rate,
    }


@router.get("/waste-by-category")
def waste_by_category(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    company_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.SUPER_ADMIN, UserRole.MUNICIPAL_ADMIN, UserRole.COMPANY_ADMIN)
    ),
):
    """
    Waste collected by category in kg.

    Now supports date_from / date_to filtering.
    COMPANY_ADMIN is automatically scoped to their own company.
    """
    q = db.query(WasteRecord.category, func.sum(WasteRecord.quantity_kg))

    # Tenant scoping
    if current_user.role == UserRole.COMPANY_ADMIN:
        q = q.filter(WasteRecord.waste_company_id == current_user.waste_company_id)
    elif company_id:
        q = q.filter(WasteRecord.waste_company_id == company_id)

    if date_from:
        q = q.filter(WasteRecord.recorded_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(WasteRecord.recorded_at <= datetime.combine(date_to, datetime.max.time()))

    rows = q.group_by(WasteRecord.category).all()
    return {cat.value: round(qty, 2) for cat, qty in rows}


@router.get("/complaint-analytics")
def complaint_analytics(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.SUPER_ADMIN, UserRole.MUNICIPAL_ADMIN, UserRole.COMPANY_ADMIN)
    ),
):
    """
    Complaint breakdowns by category and status.

    Now includes date filtering. Returns by_category, by_status, resolution_rate.
    """
    q = db.query(Complaint)
    if date_from:
        q = q.filter(Complaint.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(Complaint.created_at <= datetime.combine(date_to, datetime.max.time()))

    by_category = q.with_entities(Complaint.category, func.count(Complaint.id)).group_by(Complaint.category).all()
    by_status = q.with_entities(Complaint.status, func.count(Complaint.id)).group_by(Complaint.status).all()
    total = q.count()
    resolved = q.filter(Complaint.status == ComplaintStatus.RESOLVED).count()
    resolution_rate = (resolved / total * 100) if total else 0.0

    return {
        "by_category": {c.value: n for c, n in by_category},
        "by_status": {s.value: n for s, n in by_status},
        "total": total,
        "resolved": resolved,
        "resolution_rate_percent": round(resolution_rate, 2),
    }
