"""two tier rls for points recycling waste records

Revision ID: 5cc019a9b7c8
Revises: 952ef4687693
Create Date: 2026-08-10 04:50:00.000000

Adds RLS to points_ledger_entries, recycling_records, and waste_records —
the three tables previously deliberately excluded because they have a
genuine platform-wide read requirement (the rewards leaderboard, the
recycling impact summary). Uses a real two-tier policy per table: broad
SELECT for any authenticated session (matching the app's own already-shipped
behavior), narrower INSERT restricted to the actual writer identity for
each table (see the detailed reasoning in app/core/rls.py, including the
one real, honestly-documented imprecision for points_ledger_entries, where
a COLLECTOR session can credit any user, not just one tied to a pickup they
actually completed).
"""
import os
import sys
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import geoalchemy2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from app.core.rls import TWO_TIER_RLS_POLICY_STATEMENTS  # noqa: E402


# revision identifiers, used by Alembic.
revision: str = '5cc019a9b7c8'
down_revision: Union[str, Sequence[str], None] = '952ef4687693'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for statement in TWO_TIER_RLS_POLICY_STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    for table in ("points_ledger_entries", "recycling_records", "waste_records"):
        op.execute(f"DROP POLICY IF EXISTS {table}_read ON {table};")
        op.execute(f"DROP POLICY IF EXISTS {table}_write ON {table};")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")
