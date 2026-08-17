import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.enums import UserRole, VehicleStatus
from app.models.operations import Vehicle, VehicleMaintenanceRecord
from app.models.user import User
from app.security.dependencies import require_roles

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


class VehicleCreateRequest(BaseModel):
    registration_number: str = Field(min_length=2, max_length=64)
    vehicle_type: str = Field(min_length=2, max_length=64)
    capacity_kg: float | None = Field(default=None, gt=0)


class VehicleStatusUpdateRequest(BaseModel):
    status: VehicleStatus


class MaintenanceRecordRequest(BaseModel):
    description: str = Field(min_length=3, max_length=1000)
    cost: float | None = Field(default=None, ge=0)


class VehicleOut(BaseModel):
    id: uuid.UUID
    registration_number: str
    vehicle_type: str
    capacity_kg: float | None
    status: VehicleStatus
    waste_company_id: uuid.UUID

    model_config = {"from_attributes": True}


@router.post("", response_model=VehicleOut, status_code=201)
def register_vehicle(
    payload: VehicleCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.COMPANY_ADMIN, UserRole.SUPER_ADMIN)),
):
    if not current_user.waste_company_id and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="User has no associated waste company")
    existing = db.query(Vehicle).filter(Vehicle.registration_number == payload.registration_number).first()
    if existing:
        raise HTTPException(status_code=409, detail="Registration number already exists")
    v = Vehicle(
        waste_company_id=current_user.waste_company_id,
        registration_number=payload.registration_number,
        vehicle_type=payload.vehicle_type,
        capacity_kg=payload.capacity_kg,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@router.get("", response_model=list[VehicleOut])
def list_vehicles(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.COMPANY_ADMIN, UserRole.SUPER_ADMIN, UserRole.MUNICIPAL_ADMIN)),
):
    q = db.query(Vehicle)
    if current_user.role == UserRole.COMPANY_ADMIN:
        q = q.filter(Vehicle.waste_company_id == current_user.waste_company_id)
    return q.all()


@router.patch("/{vehicle_id}/status", response_model=VehicleOut)
def update_vehicle_status(
    vehicle_id: uuid.UUID,
    payload: VehicleStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.COMPANY_ADMIN, UserRole.SUPER_ADMIN)),
):
    v = db.get(Vehicle, vehicle_id)
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if current_user.role == UserRole.COMPANY_ADMIN and v.waste_company_id != current_user.waste_company_id:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    v.status = payload.status
    db.commit()
    db.refresh(v)
    return v


@router.post("/{vehicle_id}/maintenance", status_code=201)
def add_maintenance_record(
    vehicle_id: uuid.UUID,
    payload: MaintenanceRecordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.COMPANY_ADMIN, UserRole.SUPER_ADMIN)),
):
    v = db.get(Vehicle, vehicle_id)
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    record = VehicleMaintenanceRecord(vehicle_id=vehicle_id, description=payload.description, cost=payload.cost)
    db.add(record)
    v.status = VehicleStatus.MAINTENANCE
    db.commit()
    return {"id": str(record.id), "status": "recorded"}
