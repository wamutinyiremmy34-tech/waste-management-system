import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from geoalchemy2.functions import (
    ST_Contains,
    ST_MakePoint,
    ST_SetSRID,
)
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.enums import UserRole
from app.models.operations import CollectionZone
from app.models.user import User
from app.security.dependencies import get_current_user, require_roles

router = APIRouter(prefix="/zones", tags=["zones"])


class ZoneCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    waste_company_id: uuid.UUID
    # GeoJSON-style polygon: list of [lng, lat] pairs, first == last (closed ring)
    boundary_coordinates: list[list[float]] = Field(min_length=4)


class ZoneOut(BaseModel):
    id: uuid.UUID
    name: str
    waste_company_id: uuid.UUID
    is_active: bool


def _validate_ring(coords: list[list[float]]) -> None:
    if coords[0] != coords[-1]:
        raise HTTPException(status_code=422, detail="Polygon ring must be closed (first point == last point)")


@router.post("", response_model=ZoneOut, status_code=201)
def create_zone(
    payload: ZoneCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.COMPANY_ADMIN, UserRole.MUNICIPAL_ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    _validate_ring(payload.boundary_coordinates)
    if current_user.role == UserRole.COMPANY_ADMIN and current_user.waste_company_id != payload.waste_company_id:
        raise HTTPException(status_code=403, detail="Cannot create a zone for another company")

    ring = ", ".join(f"{lng} {lat}" for lng, lat in payload.boundary_coordinates)
    wkt = f"POLYGON(({ring}))"
    zone = CollectionZone(
        name=payload.name,
        waste_company_id=payload.waste_company_id,
        boundary=func.ST_GeomFromText(wkt, 4326),
    )
    db.add(zone)
    db.commit()
    db.refresh(zone)
    return ZoneOut(id=zone.id, name=zone.name, waste_company_id=zone.waste_company_id, is_active=zone.is_active)


@router.get("", response_model=list[ZoneOut])
def list_zones(
    waste_company_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(CollectionZone)
    if waste_company_id:
        q = q.filter(CollectionZone.waste_company_id == waste_company_id)
    zones = q.all()
    return [ZoneOut(id=z.id, name=z.name, waste_company_id=z.waste_company_id, is_active=z.is_active) for z in zones]


@router.get("/lookup", response_model=Optional[ZoneOut])
def zone_for_point(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Real PostGIS point-in-polygon lookup (ST_Contains) — which zone, if any, contains this point."""
    point = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    zone = db.query(CollectionZone).filter(ST_Contains(CollectionZone.boundary, point)).first()
    if not zone:
        return None
    return ZoneOut(id=zone.id, name=zone.name, waste_company_id=zone.waste_company_id, is_active=zone.is_active)
