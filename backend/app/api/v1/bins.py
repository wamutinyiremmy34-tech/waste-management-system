import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from geoalchemy2 import Geography
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.geo import latlng_from_point, point_from_latlng
from app.models.bins_complaints import Bin
from app.models.enums import BinStatus, UserRole
from app.models.user import User
from app.security.dependencies import get_current_user, require_roles

router = APIRouter(prefix="/bins", tags=["bins"])


class BinCreateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    bin_type: str = Field(min_length=1, max_length=64)
    capacity_liters: float | None = Field(default=None, gt=0)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    zone_id: uuid.UUID | None = None


class BinFillUpdateRequest(BaseModel):
    current_fill_percent: float = Field(ge=0, le=100)


class BinOut(BaseModel):
    id: uuid.UUID
    code: str
    bin_type: str
    capacity_liters: float | None
    status: BinStatus
    current_fill_percent: float
    latitude: float
    longitude: float
    distance_meters: float | None = None


def _out(b: Bin, distance_meters: float | None = None) -> dict:
    lat, lng = latlng_from_point(b.location)
    return {
        "id": b.id,
        "code": b.code,
        "bin_type": b.bin_type,
        "capacity_liters": b.capacity_liters,
        "status": b.status,
        "current_fill_percent": b.current_fill_percent,
        "latitude": lat,
        "longitude": lng,
        "distance_meters": distance_meters,
    }


@router.post("", response_model=BinOut, status_code=201)
def create_bin(
    payload: BinCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.MUNICIPAL_ADMIN, UserRole.COMPANY_ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    existing = db.query(Bin).filter(Bin.code == payload.code).first()
    if existing:
        raise HTTPException(status_code=409, detail="Bin code already exists")
    b = Bin(
        code=payload.code,
        bin_type=payload.bin_type,
        capacity_liters=payload.capacity_liters,
        location=point_from_latlng(payload.latitude, payload.longitude),
        zone_id=payload.zone_id,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return _out(b)


@router.get("/nearby", response_model=list[BinOut])
def nearby_bins(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    radius_meters: float = Query(default=1000, gt=0, le=20000),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Real PostGIS nearby search: casts the geometry to geography so
    ST_DWithin/ST_Distance operate in meters (great-circle), then orders by
    actual distance. This is a genuine spatial query, not a bounding-box
    approximation.
    """
    point = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    distance_expr = func.ST_Distance(
        func.cast(Bin.location, Geography), func.cast(point, Geography)
    )
    results = (
        db.query(Bin, distance_expr.label("distance_meters"))
        .filter(
            func.ST_DWithin(
                func.cast(Bin.location, Geography),
                func.cast(point, Geography),
                radius_meters,
            )
        )
        .order_by("distance_meters")
        .limit(limit)
        .all()
    )
    return [_out(b, distance_meters=round(dist, 1)) for b, dist in results]


@router.get("/{bin_id}", response_model=BinOut)
def get_bin(bin_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    b = db.get(Bin, bin_id)
    if not b:
        raise HTTPException(status_code=404, detail="Bin not found")
    return _out(b)


@router.patch("/{bin_id}/fill-level", response_model=BinOut)
def update_fill_level(
    bin_id: uuid.UUID,
    payload: BinFillUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.COLLECTOR, UserRole.COMPANY_ADMIN, UserRole.SUPER_ADMIN)),
):
    """
    MVP: fill level is set manually or from a valid system event (e.g. a
    collector check-in). This is explicitly NOT sourced from IoT hardware —
    see app/intelligence/bin_data_provider.py for the future sensor hook.
    """
    b = db.get(Bin, bin_id)
    if not b:
        raise HTTPException(status_code=404, detail="Bin not found")
    b.current_fill_percent = payload.current_fill_percent
    if payload.current_fill_percent >= 95:
        b.status = BinStatus.FULL
    elif b.status == BinStatus.FULL:
        b.status = BinStatus.ACTIVE
    db.commit()
    db.refresh(b)
    return _out(b)
