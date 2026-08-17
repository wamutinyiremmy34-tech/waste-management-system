"""
Reporting endpoints (spec section 35). Both CSV and PDF export are fully
implemented, sharing the same underlying queries so the two formats never
drift apart. PDF reports use a real styled template (branded header, summary
line, alternating-row table) via app/services/pdf_report_service.py — not a
bare unstyled dump of rows.
"""
import csv
import io
import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.intelligence.environmental_calculator import CO2E_AVOIDED_PER_KG_RECYCLED, calculate_environmental_impact
from app.models.bins_complaints import Complaint
from app.models.enums import UserRole
from app.models.pickup import Collection, PickupRequest, WasteRecord
from app.models.recycling_rewards import RecyclingRecord
from app.models.user import User
from app.security.dependencies import require_roles
from app.services.pdf_report_service import build_report_pdf

router = APIRouter(prefix="/reports", tags=["reports"])

REPORT_ROLES = (UserRole.SUPER_ADMIN, UserRole.MUNICIPAL_ADMIN, UserRole.COMPANY_ADMIN)


def _csv_response(rows: list[dict], filename: str) -> StreamingResponse:
    buffer = io.StringIO()
    if rows:
        writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    else:
        buffer.write("")
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _pdf_response(pdf_bytes: bytes, filename: str) -> Response:
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _collections_rows(
    db: Session,
    current_user: User,
    date_from: Optional[date],
    date_to: Optional[date],
    organization_id: Optional[uuid.UUID] = None,
    zone_id: Optional[uuid.UUID] = None,
):
    query = db.query(Collection, PickupRequest).join(PickupRequest, Collection.pickup_request_id == PickupRequest.id)
    if current_user.role == UserRole.COMPANY_ADMIN:
        query = query.filter(PickupRequest.waste_company_id == current_user.waste_company_id)
    if date_from:
        query = query.filter(Collection.completed_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(Collection.completed_at <= datetime.combine(date_to, datetime.max.time()))
    if organization_id:
        query = query.filter(PickupRequest.organization_id == organization_id)
    if zone_id:
        query = query.filter(PickupRequest.assigned_zone_id == zone_id)
    return query.order_by(Collection.completed_at.desc()).limit(5000).all()


def _complaints_rows(db: Session, date_from: Optional[date], date_to: Optional[date]):
    query = db.query(Complaint)
    if date_from:
        query = query.filter(Complaint.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(Complaint.created_at <= datetime.combine(date_to, datetime.max.time()))
    return query.order_by(Complaint.created_at.desc()).limit(5000).all()


def _recycling_rows(
    db: Session, date_from: Optional[date], date_to: Optional[date], recycler_id: Optional[uuid.UUID] = None
):
    query = db.query(RecyclingRecord)
    if date_from:
        query = query.filter(RecyclingRecord.received_date >= date_from)
    if date_to:
        query = query.filter(RecyclingRecord.received_date <= date_to)
    if recycler_id:
        query = query.filter(RecyclingRecord.recycler_id == recycler_id)
    return query.order_by(RecyclingRecord.received_date.desc()).limit(5000).all()


@router.get("/collections.csv")
def collections_report_csv(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    organization_id: Optional[uuid.UUID] = Query(default=None, description="Filter to pickups requested by this organization"),
    zone_id: Optional[uuid.UUID] = Query(default=None, description="Filter to pickups assigned to this collection zone"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROLES)),
):
    results = _collections_rows(db, current_user, date_from, date_to, organization_id, zone_id)
    rows = [
        {
            "collection_id": str(c.id),
            "pickup_id": str(c.pickup_request_id),
            "waste_category": (c.waste_category.value if c.waste_category else ""),
            "quantity_kg": c.quantity_kg or "",
            "was_successful": c.was_successful,
            "failure_reason": c.failure_reason or "",
            "completed_at": c.completed_at.isoformat() if c.completed_at else "",
            "address": pr.address_text or "",
        }
        for c, pr in results
    ]
    return _csv_response(rows, "collections_report.csv")


@router.get("/collections.pdf")
def collections_report_pdf(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    organization_id: Optional[uuid.UUID] = Query(default=None, description="Filter to pickups requested by this organization"),
    zone_id: Optional[uuid.UUID] = Query(default=None, description="Filter to pickups assigned to this collection zone"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROLES)),
):
    results = _collections_rows(db, current_user, date_from, date_to, organization_id, zone_id)
    total_kg = sum(c.quantity_kg or 0 for c, _ in results)
    successful = sum(1 for c, _ in results if c.was_successful)

    pdf_bytes = build_report_pdf(
        title="Collections Report",
        subtitle="Completed and attempted waste collections",
        summary_lines=[
            f"<b>{len(results)}</b> collection record(s) — <b>{successful}</b> successful, "
            f"<b>{len(results) - successful}</b> failed. Total collected: <b>{total_kg:.1f} kg</b>."
        ],
        column_headers=["Date", "Category", "Qty (kg)", "Status", "Address"],
        rows=[
            [
                c.completed_at.strftime("%Y-%m-%d %H:%M") if c.completed_at else "",
                c.waste_category.value if c.waste_category else "-",
                f"{c.quantity_kg:.1f}" if c.quantity_kg else "-",
                "Collected" if c.was_successful else f"Failed: {c.failure_reason or 'unspecified'}",
                pr.address_text or "-",
            ]
            for c, pr in results
        ],
        date_from=date_from,
        date_to=date_to,
    )
    return _pdf_response(pdf_bytes, "collections_report.pdf")


@router.get("/complaints.csv")
def complaints_report_csv(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROLES)),
):
    results = _complaints_rows(db, date_from, date_to)
    rows = [
        {
            "complaint_id": str(c.id),
            "category": c.category.value,
            "status": c.status.value,
            "description": c.description,
            "resolution_notes": c.resolution_notes or "",
            "created_at": c.created_at.isoformat(),
            "resolved_at": c.resolved_at.isoformat() if c.resolved_at else "",
        }
        for c in results
    ]
    return _csv_response(rows, "complaints_report.csv")


@router.get("/complaints.pdf")
def complaints_report_pdf(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROLES)),
):
    results = _complaints_rows(db, date_from, date_to)
    resolved = sum(1 for c in results if c.status.value == "RESOLVED")

    pdf_bytes = build_report_pdf(
        title="Complaints Report",
        subtitle="Environmental and waste-related issue reports",
        summary_lines=[
            f"<b>{len(results)}</b> complaint(s) reported — <b>{resolved}</b> resolved "
            f"(<b>{(resolved / len(results) * 100) if results else 0:.1f}%</b> resolution rate)."
        ],
        column_headers=["Date", "Category", "Status", "Description"],
        rows=[
            [
                c.created_at.strftime("%Y-%m-%d"),
                c.category.value,
                c.status.value.replace("_", " "),
                (c.description[:80] + "…") if len(c.description) > 80 else c.description,
            ]
            for c in results
        ],
        date_from=date_from,
        date_to=date_to,
    )
    return _pdf_response(pdf_bytes, "complaints_report.pdf")


@router.get("/recycling.csv")
def recycling_report_csv(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    recycler_id: Optional[uuid.UUID] = Query(default=None, description="Filter to a single recycling partner"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROLES)),
):
    results = _recycling_rows(db, date_from, date_to, recycler_id)
    rows = [
        {
            "record_id": str(r.id),
            "waste_category": r.waste_category.value,
            "quantity_kg": r.quantity_kg,
            "received_date": r.received_date.isoformat(),
            "destination": r.destination or "",
        }
        for r in results
    ]
    return _csv_response(rows, "recycling_report.csv")


@router.get("/recycling.pdf")
def recycling_report_pdf(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    recycler_id: Optional[uuid.UUID] = Query(default=None, description="Filter to a single recycling partner"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROLES)),
):
    results = _recycling_rows(db, date_from, date_to, recycler_id)
    total_kg = sum(r.quantity_kg for r in results)

    pdf_bytes = build_report_pdf(
        title="Recycling Report",
        subtitle="Recorded recycling activity",
        summary_lines=[f"<b>{len(results)}</b> record(s) — <b>{total_kg:.1f} kg</b> total recycled."],
        column_headers=["Date received", "Category", "Qty (kg)", "Destination"],
        rows=[
            [r.received_date.isoformat(), r.waste_category.value, f"{r.quantity_kg:.1f}", r.destination or "-"]
            for r in results
        ],
        date_from=date_from,
        date_to=date_to,
    )
    return _pdf_response(pdf_bytes, "recycling_report.pdf")


def _environmental_category_breakdown(db: Session) -> list[list[str]]:
    """
    Per-category breakdown: waste collected (via pickups), waste recycled,
    and the per-category CO2e-avoided estimate — real numbers, with the
    estimate clearly labeled (see docs/environmental-impact.md).
    """
    collected_by_category = dict(
        db.query(WasteRecord.category, func.coalesce(func.sum(WasteRecord.quantity_kg), 0.0))
        .group_by(WasteRecord.category)
        .all()
    )
    recycled_by_category = dict(
        db.query(RecyclingRecord.waste_category, func.coalesce(func.sum(RecyclingRecord.quantity_kg), 0.0))
        .group_by(RecyclingRecord.waste_category)
        .all()
    )

    all_categories = set(collected_by_category) | set(recycled_by_category)
    rows = []
    for category in sorted(all_categories, key=lambda c: c.value):
        collected = collected_by_category.get(category, 0.0)
        recycled = recycled_by_category.get(category, 0.0)
        co2e = recycled * CO2E_AVOIDED_PER_KG_RECYCLED.get(category, 0.0)
        rows.append([category.value, f"{collected:.1f}", f"{recycled:.1f}", f"{co2e:.1f} (est.)"])
    return rows


@router.get("/environmental.csv")
def environmental_report_csv(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROLES)),
):
    summary = calculate_environmental_impact(db)
    breakdown = _environmental_category_breakdown(db)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["metric", "value"])
    writer.writerow(["total_waste_collected_kg", summary.total_waste_collected_kg])
    writer.writerow(["total_waste_recycled_kg", summary.total_waste_recycled_kg])
    writer.writerow(["diversion_rate_percent", summary.diversion_rate_percent])
    writer.writerow(["estimated_co2e_avoided_kg (estimate — see docs/environmental-impact.md)", summary.estimated_co2e_avoided_kg])
    writer.writerow([])
    writer.writerow(["category", "collected_kg", "recycled_kg", "estimated_co2e_avoided_kg"])
    for row in breakdown:
        writer.writerow(row)

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="environmental_report.csv"'},
    )


@router.get("/environmental.pdf")
def environmental_report_pdf(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROLES)),
):
    summary = calculate_environmental_impact(db)
    breakdown = _environmental_category_breakdown(db)

    pdf_bytes = build_report_pdf(
        title="Environmental Impact Report",
        subtitle="Platform-wide waste, recycling, and estimated impact",
        summary_lines=[
            f"Total waste collected: <b>{summary.total_waste_collected_kg} kg</b> · "
            f"Total recycled: <b>{summary.total_waste_recycled_kg} kg</b> · "
            f"Diversion rate: <b>{summary.diversion_rate_percent}%</b>",
            f"Estimated CO2e avoided: <b>{summary.estimated_co2e_avoided_kg} kg</b> "
            f"<i>(estimate based on configurable per-category assumptions — not a verified "
            f"life-cycle measurement; see docs/environmental-impact.md)</i>",
        ],
        column_headers=["Category", "Collected (kg)", "Recycled (kg)", "Est. CO2e avoided (kg)"],
        rows=breakdown,
    )
    return _pdf_response(pdf_bytes, "environmental_report.pdf")
