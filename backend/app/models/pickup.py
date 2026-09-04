import uuid
from datetime import date, datetime

from geoalchemy2 import Geometry
from sqlalchemy import Date, DateTime, Enum, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import PickupStatus, RecurrenceFrequency, WasteCategory
from app.models.mixins import TimestampMixin, UUIDPKMixin


class RecurringSchedule(Base, UUIDPKMixin, TimestampMixin):
    """
    A recurrence rule, not pre-materialized pickups. PickupRequest rows are
    generated on demand (by a scheduler service) from this rule so we never
    write thousands of speculative rows in advance.
    """

    __tablename__ = "recurring_schedules"

    requester_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True
    )
    frequency: Mapped[RecurrenceFrequency] = mapped_column(
        Enum(RecurrenceFrequency, name="recurrence_frequency"), nullable=False
    )
    day_of_week: Mapped[int | None] = mapped_column(nullable=True)  # 0=Mon..6=Sun
    waste_category: Mapped[WasteCategory] = mapped_column(Enum(WasteCategory, name="waste_category"))
    location: Mapped[object] = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    address_text: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    next_run_date: Mapped[date | None] = mapped_column(Date, nullable=True)


class PickupRequest(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "pickup_requests"

    requester_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    waste_company_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("waste_companies.id", ondelete="SET NULL"), nullable=True, index=True
    )
    recurring_schedule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("recurring_schedules.id", ondelete="SET NULL"), nullable=True
    )

    waste_category: Mapped[WasteCategory] = mapped_column(Enum(WasteCategory, name="waste_category"))
    location: Mapped[object] = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    address_text: Mapped[str | None] = mapped_column(String(500), nullable=True)
    preferred_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    preferred_time_window: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("file_assets.id", ondelete="SET NULL"), nullable=True
    )

    status: Mapped[PickupStatus] = mapped_column(
        Enum(PickupStatus, name="pickup_status"), default=PickupStatus.REQUESTED, index=True
    )
    assigned_collector_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collectors.id", ondelete="SET NULL"), nullable=True
    )
    assigned_zone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collection_zones.id", ondelete="SET NULL"), nullable=True
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    collection = relationship("Collection", back_populates="pickup_request", uselist=False)


class Collection(Base, UUIDPKMixin, TimestampMixin):
    """Proof-of-collection record, created when a collector completes (or fails) a pickup."""

    __tablename__ = "collections"

    pickup_request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pickup_requests.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    collector_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collectors.id", ondelete="SET NULL"), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    collection_location: Mapped[object | None] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326), nullable=True
    )
    quantity_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    waste_category: Mapped[WasteCategory | None] = mapped_column(
        Enum(WasteCategory, name="waste_category"), nullable=True
    )
    proof_photo_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("file_assets.id", ondelete="SET NULL"), nullable=True
    )
    completion_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    was_successful: Mapped[bool] = mapped_column(default=True)

    pickup_request = relationship("PickupRequest", back_populates="collection")


class WasteRecord(Base, UUIDPKMixin, TimestampMixin):
    """
    Ledger-style waste tracking record, decoupled from pickups so that
    organizations/companies can log waste independent of the pickup flow
    (e.g. bulk weigh-in at a transfer station).
    """

    __tablename__ = "waste_records"

    source_organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    waste_company_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("waste_companies.id", ondelete="SET NULL"), nullable=True, index=True
    )
    collector_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collectors.id", ondelete="SET NULL"), nullable=True
    )
    collection_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collections.id", ondelete="SET NULL"), nullable=True
    )
    category: Mapped[WasteCategory] = mapped_column(Enum(WasteCategory, name="waste_category"))
    quantity_kg: Mapped[float] = mapped_column(Float, nullable=False)
    destination: Mapped[str | None] = mapped_column(String(255), nullable=True)  # landfill / recycler name
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    location: Mapped[object | None] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326), nullable=True
    )
