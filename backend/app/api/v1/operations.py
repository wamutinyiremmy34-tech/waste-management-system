"""
Operations intelligence API (Phase 2).

Exposes the Municipal Command Centre intelligence endpoints:
 - Hotspot detection (complaint spatial clusters via PostGIS)
 - Environmental impact live widget
 - Operational summary (overdue pickups, attention items)
 - Zone performance analytics
 - Collection trend (time-series)
 - Collector performance
 - Priority pickup queue
 - Route optimization

All endpoints enforce RBAC and tenant isolation.
"""
import logging
import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.intelligence.environmental_calculator import calculate_environmental_impact
from app.intelligence.hotspot_detector import detect_complaint_hotspots
from app.models.enums import UserRole
from app.models.user import User
from app.security.dependencies import get_current_user, require_roles
from app.services import operational_service

logger = logging.getLogger("ecotrack.operations_api")

router = APIRouter(prefix="/operations", tags=["operations"])

# Roles that can see municipal/platform-wide data
ADMIN_ROLES = (UserRole.SUPER_ADMIN, UserRole.MUNICIPAL_ADMIN)
COMPANY_ROLES = (UserRole.COMPANY_ADMIN,)
ALL_OPERATIONAL_ROLES = ADMIN_ROLES + COMPANY_ROLES


def _resolve_company_id(current_user: User, requested_company_id: Optional[str]) -> Optional[str]:
    """
    Tenant isolation helper.
    - SUPER_ADMIN / MUNICIPAL_ADMIN: can request any company_id (or None for platform-wide)
    - COMPANY_ADMIN: always scoped to their own company, requested_company_id is ignored
    """
    if current_user.role == UserRole.COMPANY_ADMIN:
        return str(current_user.waste_company_id) if current_user.waste_company_id else None
    return requested_company_id


# ---------------------------------------------------------------------------
# Hotspot detection
# ---------------------------------------------------------------------------

@router.get("/hotspots")
def complaint_hotspots(
    eps_meters: float = Query(default=300, ge=50, le=2000, description="Cluster radius in metres"),
    min_points: int = Query(default=3, ge=2, le=20, description="Minimum complaints to form a cluster"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ALL_OPERATIONAL_ROLES)),
):
    """
    Returns complaint spatial hotspots computed using PostGIS ST_ClusterDBSCAN.

    Each hotspot is a geographic cluster of complaints within `eps_meters` of
    each other with at least `min_points` complaints. The centroid of each
    cluster is returned for map display.

    This is deterministic spatial analysis — NOT machine learning or prediction.
    Algorithm: DBSCAN (density-based spatial clustering) via PostGIS.
    """
    hotspots = detect_complaint_hotspots(db, eps_meters=eps_meters, min_points=min_points)
    logger.info("Hotspot detection ran clusters=%d eps=%dm min=%d", len(hotspots), eps_meters, min_points)
    return {
        "hotspots": hotspots,
        "total_clusters": len(hotspots),
        "algorithm": "PostGIS ST_ClusterDBSCAN — deterministic spatial clustering, not ML prediction",
        "parameters": {"eps_meters": eps_meters, "min_points": min_points},
    }


# ---------------------------------------------------------------------------
# Environmental impact live widget
# ---------------------------------------------------------------------------

@router.get("/environmental-impact")
def environmental_impact(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Platform-wide environmental impact summary from real WasteRecord and
    RecyclingRecord data. CO2e estimates use configurable per-category
    factors — clearly labeled as estimates, not sensor measurements.

    Data source: WasteRecord (collected waste) + RecyclingRecord (recycled material).
    CO2e factors: configured in environmental_calculator.CO2E_AVOIDED_PER_KG_RECYCLED.
    """
    summary = calculate_environmental_impact(db)
    return {
        "total_waste_collected_kg": summary.total_waste_collected_kg,
        "total_waste_recycled_kg": summary.total_waste_recycled_kg,
        "diversion_rate_percent": summary.diversion_rate_percent,
        "estimated_co2e_avoided_kg": summary.estimated_co2e_avoided_kg,
        "is_estimate": True,
        "note": (
            "CO2e figures are estimates based on configurable per-category assumptions, "
            "not verified life-cycle measurements. See docs/environmental-impact.md."
        ),
    }


# ---------------------------------------------------------------------------
# Operational summary (overdue pickups, attention items)
# ---------------------------------------------------------------------------

@router.get("/operational-summary")
def operational_summary(
    company_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ALL_OPERATIONAL_ROLES)),
):
    """
    Returns operational attention items:
    - Overdue pickups (REQUESTED/ASSIGNED past their preferred date or 2+ day grace period)
    - Collection KPIs for the current period
    - Unassigned backlog count

    Overdue detection formula:
        If preferred_date set: overdue_days = today - preferred_date (if > 0)
        Otherwise: overdue_days = max(0, today - created_at.date() - 2)

    Priority score = days_overdue × 2.0 (CollectionPrioritizer, bin_fill=0, complaints=0)
    """
    scoped_company = _resolve_company_id(current_user, company_id)
    overdue = operational_service.get_overdue_pickups(db, company_id=scoped_company, limit=50)
    kpis = operational_service.get_collection_kpis(db, company_id=scoped_company)

    return {
        "overdue_pickups": overdue,
        "overdue_count": len(overdue),
        "kpis": kpis,
        "attention_items": _build_attention_items(overdue, kpis),
    }


def _build_attention_items(overdue: list[dict], kpis: dict) -> list[dict]:
    """
    Produces a prioritised list of human-readable attention items for the
    command centre "Needs Attention" section.
    """
    items = []

    if kpis.get("unassigned_backlog", 0) > 5:
        items.append({
            "type": "BACKLOG",
            "severity": "HIGH" if kpis["unassigned_backlog"] > 15 else "MEDIUM",
            "message": f"{kpis['unassigned_backlog']} unassigned pickup requests are waiting for a collector",
            "count": kpis["unassigned_backlog"],
        })

    if overdue:
        high_priority = [x for x in overdue if x["priority_label"] == "HIGH"]
        if high_priority:
            items.append({
                "type": "OVERDUE",
                "severity": "HIGH",
                "message": f"{len(high_priority)} pickups are significantly overdue",
                "count": len(high_priority),
            })
        elif overdue:
            items.append({
                "type": "OVERDUE",
                "severity": "MEDIUM",
                "message": f"{len(overdue)} pickups are overdue",
                "count": len(overdue),
            })

    if kpis.get("failure_rate_percent", 0) > 20:
        items.append({
            "type": "HIGH_FAILURE_RATE",
            "severity": "HIGH",
            "message": f"Collection failure rate is {kpis['failure_rate_percent']}% — above 20% threshold",
            "value": kpis["failure_rate_percent"],
        })

    return items


# ---------------------------------------------------------------------------
# Zone performance
# ---------------------------------------------------------------------------

@router.get("/zone-performance")
def zone_performance(
    company_id: Optional[str] = Query(default=None),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ALL_OPERATIONAL_ROLES)),
):
    """
    Per-zone operational performance.

    Metrics per zone:
        total_pickups, completed, failed_or_missed, active (in-progress)
        completion_rate = completed / (completed + failed_or_missed) × 100
        waste_collected_kg = SUM from WasteRecord joined via Collection→PickupRequest
        unresolved_complaints = COUNT complaints inside zone boundary (PostGIS ST_Contains)
        attention_needed = True if completion_rate < 60% OR unresolved_complaints > 3
    """
    scoped_company = _resolve_company_id(current_user, company_id)
    zones = operational_service.get_zone_performance(
        db, company_id=scoped_company, date_from=date_from, date_to=date_to
    )
    return {"zones": zones, "total_zones": len(zones)}


# ---------------------------------------------------------------------------
# Collection trend (time-series)
# ---------------------------------------------------------------------------

@router.get("/collection-trend")
def collection_trend(
    company_id: Optional[str] = Query(default=None),
    days: int = Query(default=30, ge=7, le=90, description="Number of days of history"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ALL_OPERATIONAL_ROLES)),
):
    """
    Daily collection completed/failed counts for the last N days.

    Formula: COUNT(collections) grouped by completed_at::date and was_successful.
    Returns sorted ascending by date for direct chart consumption.
    """
    scoped_company = _resolve_company_id(current_user, company_id)
    trend = operational_service.get_collection_trend(db, company_id=scoped_company, days=days)
    return {"trend": trend, "days": days}


# ---------------------------------------------------------------------------
# Collector performance
# ---------------------------------------------------------------------------

@router.get("/collector-performance")
def collector_performance(
    company_id: Optional[str] = Query(default=None),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ALL_OPERATIONAL_ROLES)),
):
    """
    Per-collector KPIs.

    Metrics:
        completions = COUNT(was_successful=TRUE)
        failures    = COUNT(was_successful=FALSE)
        total_kg    = SUM(quantity_kg WHERE was_successful)
        completion_rate = completions / (completions + failures) × 100
    """
    scoped_company = _resolve_company_id(current_user, company_id)
    performance = operational_service.get_collector_performance(
        db, company_id=scoped_company, date_from=date_from, date_to=date_to
    )
    return {"collectors": performance, "total": len(performance)}


# ---------------------------------------------------------------------------
# Priority pickup queue
# ---------------------------------------------------------------------------

@router.get("/priority-queue")
def priority_queue(
    company_id: Optional[str] = Query(default=None),
    limit: int = Query(default=30, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ALL_OPERATIONAL_ROLES)),
):
    """
    Returns unassigned and in-progress pickups ordered by CollectionPrioritizer score.

    Score formula (CollectionPrioritizer — rule-based heuristic, NOT machine learning):
        score = days_overdue × 2.0 + bin_fill_percent × 0.5 + nearby_complaint_count × 5.0

    All three factors use real spatial data from PostGIS ST_DWithin queries:
        bin_fill_percent: nearest active bin within NEARBY_RADIUS_METERS of pickup location
        nearby_complaint_count: unresolved complaints within NEARBY_RADIUS_METERS

    Priority labels:
        HIGH   >= 10 points
        MEDIUM >= 4 points
        LOW    < 4 points

    Each item includes a score_breakdown field with per-factor contributions.
    """
    scoped_company = _resolve_company_id(current_user, company_id)
    queue = operational_service.get_priority_pickup_queue(db, company_id=scoped_company, limit=limit)
    return {
        "queue": queue,
        "total": len(queue),
        "scoring_note": (
            "score = days_overdue × 2.0 + bin_fill_percent × 0.5 + nearby_complaint_count × 5.0 "
            "(CollectionPrioritizer — rule-based heuristic, not ML). "
            "Each item includes a score_breakdown field with per-factor contributions. "
            f"Spatial radius: {settings.NEARBY_RADIUS_METERS}m. "
            "See docs/operational-metrics.md."
        ),
    }


# ---------------------------------------------------------------------------
# Map data — combined operational layer endpoint
# ---------------------------------------------------------------------------

@router.get("/map-data")
def map_data(
    company_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ALL_OPERATIONAL_ROLES)),
):
    """
    Returns all operational map layers in a single authenticated request:
    - Complaint markers (lat/lng, category, status)
    - Bin markers (lat/lng, fill%, status)
    - Hotspot centroids
    - Active pickup locations (REQUESTED/ASSIGNED)

    RBAC / tenant isolation applied:
    - COMPANY_ADMIN: bins and pickups scoped to their company
    - SUPER_ADMIN / MUNICIPAL_ADMIN: platform-wide
    - Hotspots and complaints are platform-wide for all operational roles

    Marker counts are capped per layer to keep map response size manageable
    at pilot scale. Use individual endpoints for full data export.
    """
    import json as _json

    scoped_company = _resolve_company_id(current_user, company_id)
    from app.models.bins_complaints import Bin, Complaint
    from app.models.enums import ComplaintStatus, PickupStatus
    from app.models.pickup import PickupRequest
    from app.core.geo import latlng_from_point

    # --- Complaints (all unresolved, up to 200) ---
    complaint_q = (
        db.query(Complaint)
        .filter(Complaint.status != ComplaintStatus.RESOLVED)
        .order_by(Complaint.created_at.desc())
        .limit(200)
    )
    complaints = []
    for c in complaint_q.all():
        ll = latlng_from_point(c.location)
        if ll:
            complaints.append({
                "id": str(c.id),
                "latitude": ll[0],
                "longitude": ll[1],
                "category": c.category.value,
                "status": c.status.value,
            })

    # --- Bins (all active, up to 200) ---
    bin_q = db.query(Bin)
    if scoped_company:
        bin_q = bin_q.filter(Bin.waste_company_id == scoped_company)
    bin_q = bin_q.limit(200)
    bins = []
    for b in bin_q.all():
        ll = latlng_from_point(b.location)
        if ll:
            bins.append({
                "id": str(b.id),
                "code": b.code,
                "latitude": ll[0],
                "longitude": ll[1],
                "status": b.status.value,
                "current_fill_percent": b.current_fill_percent,
                "bin_type": b.bin_type,
            })

    # --- Active pickups (REQUESTED/ASSIGNED, up to 100) ---
    pickup_q = (
        db.query(PickupRequest)
        .filter(PickupRequest.status.in_([PickupStatus.REQUESTED, PickupStatus.ASSIGNED]))
        .order_by(PickupRequest.created_at.desc())
    )
    if scoped_company:
        pickup_q = pickup_q.filter(PickupRequest.waste_company_id == scoped_company)
    pickup_q = pickup_q.limit(100)
    pickups = []
    for p in pickup_q.all():
        ll = latlng_from_point(p.location)
        if ll:
            pickups.append({
                "id": str(p.id),
                "latitude": ll[0],
                "longitude": ll[1],
                "status": p.status.value,
                "waste_category": p.waste_category.value,
                "address_text": p.address_text,
            })

    # --- Hotspots (reuse existing detector) ---
    from app.intelligence.hotspot_detector import detect_complaint_hotspots
    hotspots = detect_complaint_hotspots(db, eps_meters=300, min_points=3)

    return {
        "complaints": complaints,
        "bins": bins,
        "pickups": pickups,
        "hotspots": hotspots,
        "caps": {"complaints": 200, "bins": 200, "pickups": 100},
    }

@router.get("/route/{collector_id}")
def optimized_route(
    collector_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(
        UserRole.COLLECTOR, UserRole.COMPANY_ADMIN, UserRole.MUNICIPAL_ADMIN, UserRole.SUPER_ADMIN
    )),
):
    """
    Returns the collector's active assigned pickups in nearest-neighbour optimized order.

    COLLECTOR role: can only request their own route.
    COMPANY_ADMIN: can request any collector in their company.
    MUNICIPAL_ADMIN / SUPER_ADMIN: any collector.

    Algorithm: DeterministicNearestNeighbourOptimizer (haversine greedy nearest-neighbour).
    This is NOT GPS turn-by-turn navigation. It is a suggested collection sequence.
    """
    from app.models.operations import Collector as CollectorModel

    # RBAC: COLLECTOR can only view own route
    if current_user.role == UserRole.COLLECTOR:
        my_collector = (
            db.query(CollectorModel).filter(CollectorModel.user_id == current_user.id).first()
        )
        if not my_collector or my_collector.id != collector_id:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Collector not found")

    # COMPANY_ADMIN: can only view their company's collectors
    if current_user.role == UserRole.COMPANY_ADMIN:
        target = db.get(CollectorModel, collector_id)
        if not target or target.waste_company_id != current_user.waste_company_id:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Collector not found")

    route = operational_service.get_optimized_route(db, collector_id=str(collector_id))
    return route
