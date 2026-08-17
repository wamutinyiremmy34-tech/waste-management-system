"""extend rls to waste companies reward redemptions campaign participations

Revision ID: 952ef4687693
Revises: 9293c1afe69d
Create Date: 2026-08-10 03:20:00.000000

Extends Row-Level Security to 3 more tables: waste_companies (matches the
already-tested get_company scoping), reward_redemptions and
campaign_participations (both currently have no read endpoint at all, so
this is pure defense-in-depth with zero risk to existing behavior). See
docs/multi-tenancy.md for the full reasoning, including why bins,
collection_zones, points_ledger_entries, recycling_records, and
waste_records are deliberately NOT given naive per-tenant RLS.
"""
import os
import sys
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import geoalchemy2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from app.core.rls import EXTENDED_RLS_POLICY_STATEMENTS  # noqa: E402


# revision identifiers, used by Alembic.
revision: str = '952ef4687693'
down_revision: Union[str, Sequence[str], None] = '9293c1afe69d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for statement in EXTENDED_RLS_POLICY_STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS waste_companies_access ON waste_companies;")
    op.execute("ALTER TABLE waste_companies DISABLE ROW LEVEL SECURITY;")
    op.execute("DROP POLICY IF EXISTS reward_redemptions_owner ON reward_redemptions;")
    op.execute("ALTER TABLE reward_redemptions DISABLE ROW LEVEL SECURITY;")
    op.execute("DROP POLICY IF EXISTS campaign_participations_owner ON campaign_participations;")
    op.execute("ALTER TABLE campaign_participations DISABLE ROW LEVEL SECURITY;")
