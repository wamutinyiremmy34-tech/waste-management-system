import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.enums import PickupStatus, WasteCategory


class PickupCreateRequest(BaseModel):
    waste_category: WasteCategory
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address_text: str | None = Field(default=None, max_length=500)
    preferred_date: date | None = None
    preferred_time_window: str | None = Field(default=None, max_length=64)
    notes: str | None = Field(default=None, max_length=2000)


class PickupOut(BaseModel):
    id: uuid.UUID
    requester_user_id: uuid.UUID
    waste_category: WasteCategory
    status: PickupStatus
    address_text: str | None
    preferred_date: date | None
    preferred_time_window: str | None
    notes: str | None
    assigned_collector_id: uuid.UUID | None
    latitude: float
    longitude: float
    created_at: datetime

    model_config = {"from_attributes": True}


class PickupAssignRequest(BaseModel):
    collector_id: uuid.UUID


class PickupStatusUpdateRequest(BaseModel):
    status: PickupStatus


class CollectionCompleteRequest(BaseModel):
    quantity_kg: float = Field(gt=0, le=50000)
    waste_category: WasteCategory | None = None
    completion_notes: str | None = Field(default=None, max_length=2000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class CollectionFailRequest(BaseModel):
    failure_reason: str = Field(min_length=3, max_length=500)


class CollectionOut(BaseModel):
    id: uuid.UUID
    pickup_request_id: uuid.UUID
    collector_id: uuid.UUID
    was_successful: bool
    quantity_kg: float | None
    waste_category: WasteCategory | None
    completion_notes: str | None
    failure_reason: str | None
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int
