import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Enum, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import BinStatus, ComplaintCategory, ComplaintStatus
from app.models.mixins import TimestampMixin, UUIDPKMixin


class Bin(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "bins"

    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    bin_type: Mapped[str] = mapped_column(String(64), nullable=False)  # general, recycling, organic...
    capacity_liters: Mapped[float | None] = mapped_column(Float, nullable=True)
    location: Mapped[object] = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collection_zones.id", ondelete="SET NULL"), nullable=True, index=True
    )
    waste_company_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("waste_companies.id", ondelete="SET NULL"), nullable=True
    )
    # Manually updated for MVP, or generated from valid system events (e.g. a
    # collection against this bin resets it to 0). NOT sourced from real IoT
    # hardware — see app/intelligence/bin_data_provider.py for the future hook.
    current_fill_percent: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[BinStatus] = mapped_column(Enum(BinStatus, name="bin_status"), default=BinStatus.ACTIVE)
    last_collected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Complaint(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "complaints"

    reporter_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category: Mapped[ComplaintCategory] = mapped_column(Enum(ComplaintCategory, name="complaint_category"))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    location: Mapped[object] = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    status: Mapped[ComplaintStatus] = mapped_column(
        Enum(ComplaintStatus, name="complaint_status"), default=ComplaintStatus.REPORTED, index=True
    )
    assigned_to_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ComplaintAttachment(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "complaint_attachments"

    complaint_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("file_assets.id", ondelete="CASCADE"), nullable=False
    )
