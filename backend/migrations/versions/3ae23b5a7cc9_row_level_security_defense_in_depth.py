"""row level security defense in depth

Revision ID: 3ae23b5a7cc9
Revises: 453f4faf0ef0
Create Date: 2026-08-09 22:27:28.544041

Adds a restricted, non-superuser database role (`ecotrack_app`) for the
running application to connect as, and enables PostgreSQL Row-Level
Security (RLS) on the tables holding the most sensitive tenant/personal
data. This is real defense-in-depth: even a bug that skips the
application-layer tenant filter (documented as a known limitation in
docs/multi-tenancy.md prior to this migration) cannot leak cross-tenant
rows to a connection using this role, because the database itself refuses
to return them.

Policies are matched to — not stricter than — the access patterns already
enforced and tested at the application layer, so this migration adds a
backstop without changing legitimate behavior. Migrations, seeding, and the
`ecotrack` superuser role are unaffected — RLS only applies to the new
restricted role, since superusers bypass RLS unconditionally in Postgres.

The actual DDL statements live in app/core/rls.py — shared with
tests/conftest.py so the automated test suite exercises the exact same
policies this migration ships, rather than a copy that could drift.

Session context (which user/role/company is making the request) is
communicated to Postgres via `SET LOCAL app.*` session variables, set once
per authenticated request — see app/security/dependencies.py.
"""
import os
import sys
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import geoalchemy2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from app.core.rls import MIGRATION_1_STATEMENTS, APP_ROLE, RLS_TABLES  # noqa: E402


# revision identifiers, used by Alembic.
revision: str = '3ae23b5a7cc9'
down_revision: Union[str, Sequence[str], None] = '453f4faf0ef0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for statement in MIGRATION_1_STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    for table in RLS_TABLES:
        op.execute(f"DROP POLICY IF EXISTS {table}_owner ON {table};")
        op.execute(f"DROP POLICY IF EXISTS {table}_access ON {table};")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")
    op.execute(f"REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {APP_ROLE};")
    op.execute(f"REVOKE USAGE ON SCHEMA public FROM {APP_ROLE};")
    op.execute(f"DROP ROLE IF EXISTS {APP_ROLE};")
