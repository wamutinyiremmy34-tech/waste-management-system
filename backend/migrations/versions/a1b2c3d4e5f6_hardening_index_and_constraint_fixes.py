"""hardening: index on assigned_collector_id, fix collections FK

Revision ID: a1b2c3d4e5f6
Revises: 5cc019a9b7c8
Create Date: 2026-09-04 10:00:00.000000

Production-hardening migration:

1. Adds a missing index on pickup_requests.assigned_collector_id.
   The list_assigned_pickups endpoint filters by this column on every
   collector dashboard load; without an index this is a full table scan
   that grows linearly with the total number of pickup requests in the
   system.

2. Fixes a data integrity inconsistency in the collections table:
   collector_id has ondelete='SET NULL' on the FK but the column was
   declared NOT NULL in the SQLAlchemy model. Changes the column to
   nullable so the database constraint matches the intended FK behaviour
   (if a Collector row is deleted, the collection record is preserved
   with a NULL collector_id — the collection itself still happened).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '5cc019a9b7c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Index for collector assignment lookups (M-5 in production-readiness-audit.md)
    op.create_index(
        'ix_pickup_requests_assigned_collector_id',
        'pickup_requests',
        ['assigned_collector_id'],
        unique=False,
    )

    # 2. Fix collections.collector_id nullability to match the FK ondelete=SET NULL (M-8)
    op.alter_column(
        'collections',
        'collector_id',
        existing_type=sa.UUID(),
        nullable=True,
    )


def downgrade() -> None:
    # Reverse nullability change
    op.alter_column(
        'collections',
        'collector_id',
        existing_type=sa.UUID(),
        nullable=False,
    )

    # Remove the index
    op.drop_index('ix_pickup_requests_assigned_collector_id', table_name='pickup_requests')
