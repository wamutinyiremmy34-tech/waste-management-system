"""extend rls to organizations and organization locations

Revision ID: 9293c1afe69d
Revises: 3ae23b5a7cc9
Create Date: 2026-08-10 02:12:41.835531

Extends the Row-Level Security work from the previous migration
(3ae23b5a7cc9) to two more tables: `organizations` and
`organization_locations`. Deliberately does NOT extend RLS to
points_ledger_entries, recycling_records, or waste_records in this pass —
each has a genuine platform-wide aggregate-read endpoint (the rewards
leaderboard, the recycling impact summary) that a naive per-tenant policy
would silently break for every non-admin caller. See docs/multi-tenancy.md.
"""
import os
import sys
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import geoalchemy2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from app.core.rls import ORGANIZATION_RLS_POLICY_STATEMENTS  # noqa: E402


# revision identifiers, used by Alembic.
revision: str = '9293c1afe69d'
down_revision: Union[str, Sequence[str], None] = '3ae23b5a7cc9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for statement in ORGANIZATION_RLS_POLICY_STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS organizations_access ON organizations;")
    op.execute("ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;")
    op.execute("DROP POLICY IF EXISTS organization_locations_access ON organization_locations;")
    op.execute("ALTER TABLE organization_locations DISABLE ROW LEVEL SECURITY;")
