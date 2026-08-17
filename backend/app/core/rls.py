"""
Row-Level Security DDL statements, shared between the Alembic migration
(migrations/versions/3ae23b5a7cc9_row_level_security_defense_in_depth.py)
and the test suite fixture (tests/conftest.py).

Kept in one place so the two never drift apart — the migration is what
actually ships to a real database; the test fixture applies the identical
statements to the ephemeral test database (which is built via
`Base.metadata.create_all()`, not Alembic, so it needs this run separately)
so the policies are genuinely exercised by the automated test suite, not
just assumed to work because the migration applies cleanly.

See docs/multi-tenancy.md for the full explanation of why this exists and
exactly what it does and doesn't protect against.
"""

APP_ROLE = "ecotrack_app"

RLS_TABLES = [
    "notifications", "pickup_requests", "complaints", "collectors", "vehicles",
    "organizations", "organization_locations", "waste_companies", "reward_redemptions", "campaign_participations",
]

CREATE_ROLE_STATEMENTS = [
    """
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ecotrack_app') THEN
            CREATE ROLE ecotrack_app WITH LOGIN PASSWORD 'ecotrack_app_dev_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
        END IF;
    END
    $$;
    """,
    # CONNECT is granted for both databases this project actually uses.
    # Wrapped in IF EXISTS checks so this is safe to run against either
    # database regardless of whether the other one exists yet in a given
    # environment (e.g. a fresh dev machine that hasn't created the test
    # database yet).
    """
    DO $$
    BEGIN
        IF EXISTS (SELECT FROM pg_database WHERE datname = 'ecotrack_dev') THEN
            EXECUTE 'GRANT CONNECT ON DATABASE ecotrack_dev TO ecotrack_app';
        END IF;
        IF EXISTS (SELECT FROM pg_database WHERE datname = 'ecotrack_test') THEN
            EXECUTE 'GRANT CONNECT ON DATABASE ecotrack_test TO ecotrack_app';
        END IF;
    END
    $$;
    """,
    f"GRANT USAGE ON SCHEMA public TO {APP_ROLE};",
    f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {APP_ROLE};",
    f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {APP_ROLE};",
]

INITIAL_RLS_POLICY_STATEMENTS = [
    # notifications: strictly personal data for READS (a user only ever
    # sees their own notifications). WRITES are intentionally NOT
    # restricted to "only for yourself" — a real design mistake in an
    # earlier version of this policy, found only by running the live app
    # end-to-end against the RLS-restricted role. Nearly every real
    # Notification row is created as a SIDE EFFECT of one user's action
    # notifying a DIFFERENT user (e.g. a COMPANY_ADMIN assigning a pickup
    # creates a "your pickup was assigned" notification FOR THE CITIZEN).
    # A strict "user_id must equal the acting session" WITH CHECK broke
    # this real, tested flow with a live 500. Since notifications are
    # low-sensitivity operational messages and the real "who gets notified"
    # logic already lives at the application layer, allowing any
    # authenticated session to insert a notification for any user is an
    # accepted, documented tradeoff — not a claim of precise access control.
    "ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;",
    """
    CREATE POLICY notifications_owner ON notifications
    FOR SELECT
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
    """,
    """
    CREATE POLICY notifications_write ON notifications
    FOR INSERT
    WITH CHECK (current_setting('app.role', true) <> '');
    """,
    # pickup_requests: matches _authorize_pickup_access in pickup_service.py.
    "ALTER TABLE pickup_requests ENABLE ROW LEVEL SECURITY;",
    """
    CREATE POLICY pickup_requests_access ON pickup_requests
    USING (
        requester_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
        OR assigned_collector_id = NULLIF(current_setting('app.collector_id', true), '')::uuid
        OR current_setting('app.role', true) IN ('SUPER_ADMIN', 'COMPANY_ADMIN', 'MUNICIPAL_ADMIN')
    )
    -- WITH CHECK must also allow the assigned COLLECTOR — a real bug found
    -- by testing the live status-update/complete-collection flow end-to-end
    -- under RLS (not caught by earlier direct-SQL tests, which never
    -- exercised a collector's real UPDATE). Collectors legitimately update
    -- their own assigned pickups' status (EN_ROUTE/ARRIVED/COLLECTED) —
    -- omitting this clause meant every real collector action failed with
    -- "new row violates row-level security policy" once RLS was genuinely
    -- exercised via the live app, not just isolated SELECT/INSERT tests.
    WITH CHECK (
        requester_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
        OR assigned_collector_id = NULLIF(current_setting('app.collector_id', true), '')::uuid
        OR current_setting('app.role', true) IN ('SUPER_ADMIN', 'COMPANY_ADMIN', 'MUNICIPAL_ADMIN')
    );
    """,
    # complaints: matches list_complaints/get_complaint in complaints.py.
    "ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;",
    """
    CREATE POLICY complaints_access ON complaints
    USING (
        reporter_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
        OR current_setting('app.role', true) IN ('SUPER_ADMIN', 'MUNICIPAL_ADMIN', 'COMPANY_ADMIN')
    )
    WITH CHECK (
        reporter_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
        OR current_setting('app.role', true) IN ('SUPER_ADMIN', 'MUNICIPAL_ADMIN', 'COMPANY_ADMIN')
    );
    """,
    # collectors: matches list_collectors in collectors.py.
    "ALTER TABLE collectors ENABLE ROW LEVEL SECURITY;",
    """
    CREATE POLICY collectors_access ON collectors
    USING (
        waste_company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
        OR user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
        OR current_setting('app.role', true) IN ('SUPER_ADMIN', 'MUNICIPAL_ADMIN')
    )
    WITH CHECK (
        waste_company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
        OR current_setting('app.role', true) IN ('SUPER_ADMIN', 'MUNICIPAL_ADMIN')
    );
    """,
    # vehicles: matches list_vehicles in vehicles.py.
    "ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;",
    """
    CREATE POLICY vehicles_access ON vehicles
    USING (
        waste_company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
        OR current_setting('app.role', true) IN ('SUPER_ADMIN', 'MUNICIPAL_ADMIN')
    )
    WITH CHECK (
        waste_company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
        OR current_setting('app.role', true) IN ('SUPER_ADMIN', 'MUNICIPAL_ADMIN')
    );
    """,
]

# Added in migrations/versions/9293c1afe69d_extend_rls_to_organizations_and_.py.
ORGANIZATION_RLS_POLICY_STATEMENTS = [
    # organizations: matches get_organization/organization_waste_analytics in
    # organizations.py — non-admins see only their own organization row;
    # SUPER_ADMIN/MUNICIPAL_ADMIN see all. No endpoint currently lists
    # organizations across tenants for a non-admin role, so this scoping
    # doesn't break any existing legitimate access pattern (unlike
    # points_ledger_entries/recycling_records/waste_records, deliberately
    # NOT given RLS in this pass — see docs/multi-tenancy.md for why: each
    # has a genuine platform-wide aggregate-read endpoint, such as the
    # rewards leaderboard or the recycling impact summary, that a per-tenant
    # policy would silently break for every non-admin caller).
    "ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;",
    """
    CREATE POLICY organizations_access ON organizations
    USING (
        id = NULLIF(current_setting('app.org_id', true), '')::uuid
        OR current_setting('app.role', true) IN ('SUPER_ADMIN', 'MUNICIPAL_ADMIN')
    )
    WITH CHECK (
        current_setting('app.role', true) IN ('SUPER_ADMIN', 'MUNICIPAL_ADMIN')
    );
    """,
    # organization_locations: matches add_location in organizations.py — an
    # ORGANIZATION_ADMIN may only act on their own organization's locations.
    "ALTER TABLE organization_locations ENABLE ROW LEVEL SECURITY;",
    """
    CREATE POLICY organization_locations_access ON organization_locations
    USING (
        organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
        OR current_setting('app.role', true) IN ('SUPER_ADMIN', 'MUNICIPAL_ADMIN')
    )
    WITH CHECK (
        organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
        OR current_setting('app.role', true) IN ('SUPER_ADMIN', 'MUNICIPAL_ADMIN')
    );
    """,
]

# Added in a third RLS migration — waste_companies matches the already-
# tested get_company scoping in companies.py (non-admin roles only see
# their own company; SUPER_ADMIN/MUNICIPAL_ADMIN see all). reward_redemptions
# and campaign_participations currently have NO read endpoint at all (only
# a POST /rewards/redeem write path, and no endpoints whatsoever for
# campaign_participations), so adding RLS here is pure defense-in-depth for
# future/direct-SQL access with zero risk of breaking any existing tested
# behavior — unlike bins/collection_zones, which DO have genuine public-read
# endpoints (nearby-bin search, zone lookup) open to any authenticated user
# regardless of tenant, and are deliberately excluded for the same reason as
# points_ledger_entries/recycling_records/waste_records.
EXTENDED_RLS_POLICY_STATEMENTS = [
    "ALTER TABLE waste_companies ENABLE ROW LEVEL SECURITY;",
    """
    CREATE POLICY waste_companies_access ON waste_companies
    USING (
        id = NULLIF(current_setting('app.company_id', true), '')::uuid
        OR current_setting('app.role', true) IN ('SUPER_ADMIN', 'MUNICIPAL_ADMIN')
    )
    WITH CHECK (
        current_setting('app.role', true) IN ('SUPER_ADMIN', 'MUNICIPAL_ADMIN')
    );
    """,
    "ALTER TABLE reward_redemptions ENABLE ROW LEVEL SECURITY;",
    """
    CREATE POLICY reward_redemptions_owner ON reward_redemptions
    USING (
        user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
        OR current_setting('app.role', true) = 'SUPER_ADMIN'
    )
    WITH CHECK (
        user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
        OR current_setting('app.role', true) = 'SUPER_ADMIN'
    );
    """,
    "ALTER TABLE campaign_participations ENABLE ROW LEVEL SECURITY;",
    """
    CREATE POLICY campaign_participations_owner ON campaign_participations
    USING (
        user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
        OR current_setting('app.role', true) = 'SUPER_ADMIN'
    )
    WITH CHECK (
        user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
        OR current_setting('app.role', true) = 'SUPER_ADMIN'
    );
    """,
]

# Added in a fourth RLS migration — the two-tier read/write pattern flagged
# as future work when points_ledger_entries/recycling_records/waste_records
# were first excluded (see docs/multi-tenancy.md). Each of these tables has
# a genuine platform-wide read requirement (the rewards leaderboard, the
# recycling impact summary) but a real, narrower write pattern once you look
# at exactly which endpoint inserts each row:
#
# - points_ledger_entries: most rows are inserted by pickup_service.py's
#   complete_collection() when a COLLECTOR completes a citizen's pickup —
#   crediting the CITIZEN (pickup.requester_user_id), not the acting
#   COLLECTOR themselves. A strict "must equal the acting user" WITH CHECK
#   would break this real, tested reward-crediting flow. The write policy
#   here is therefore: the row's own user (self-service redemptions) OR a
#   COLLECTOR session OR SUPER_ADMIN — a real, honestly-scoped improvement
#   over "any restricted-role connection can write anything," but NOT as
#   precise as "only for a pickup this exact collector actually completed"
#   (which would need a policy referencing pickup_requests/collectors via a
#   subquery — a reasonable further tightening, not done here).
# - recycling_records: always inserted with recycler_id = the acting
#   RECYCLER's own recycler_id (see recycling.py), so the write policy can
#   be precise: recycler_id must match the session's own app.recycler_id.
# - waste_records: always inserted by complete_collection() with
#   waste_company_id = the acting COLLECTOR's own company, so the write
#   policy is precise: waste_company_id must match app.company_id.
TWO_TIER_RLS_POLICY_STATEMENTS = [
    "ALTER TABLE points_ledger_entries ENABLE ROW LEVEL SECURITY;",
    # Broad SELECT — matches the existing GET /rewards/leaderboard behavior
    # (any authenticated user aggregates across ALL users' entries today).
    """
    CREATE POLICY points_ledger_entries_read ON points_ledger_entries
    FOR SELECT
    USING (current_setting('app.role', true) <> '');
    """,
    # Narrower write — see the reasoning above for why COLLECTOR is included.
    """
    CREATE POLICY points_ledger_entries_write ON points_ledger_entries
    FOR INSERT
    WITH CHECK (
        user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
        OR current_setting('app.role', true) IN ('COLLECTOR', 'SUPER_ADMIN')
    );
    """,
    "ALTER TABLE recycling_records ENABLE ROW LEVEL SECURITY;",
    """
    CREATE POLICY recycling_records_read ON recycling_records
    FOR SELECT
    USING (current_setting('app.role', true) <> '');
    """,
    """
    CREATE POLICY recycling_records_write ON recycling_records
    FOR INSERT
    WITH CHECK (
        recycler_id = NULLIF(current_setting('app.recycler_id', true), '')::uuid
        OR current_setting('app.role', true) = 'SUPER_ADMIN'
    );
    """,
    "ALTER TABLE waste_records ENABLE ROW LEVEL SECURITY;",
    """
    CREATE POLICY waste_records_read ON waste_records
    FOR SELECT
    USING (current_setting('app.role', true) <> '');
    """,
    """
    CREATE POLICY waste_records_write ON waste_records
    FOR INSERT
    WITH CHECK (
        waste_company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
        OR current_setting('app.role', true) = 'SUPER_ADMIN'
    );
    """,
]

RLS_POLICY_STATEMENTS = (
    INITIAL_RLS_POLICY_STATEMENTS
    + ORGANIZATION_RLS_POLICY_STATEMENTS
    + EXTENDED_RLS_POLICY_STATEMENTS
    + TWO_TIER_RLS_POLICY_STATEMENTS
)

# What migration 3ae23b5a7cc9 actually applies — the role/grants plus only
# the first 5 tables' policies. Later migrations apply the remaining
# statement groups on their own afterward. ALL_STATEMENTS below (role +
# every policy combined) is for the test fixture (tests/conftest.py), which
# rebuilds the whole schema from scratch every session and wants everything
# applied in one pass — it is NOT what any single migration should run,
# since migrations apply incrementally to a database that already has the
# previous migration's DDL in place.
MIGRATION_1_STATEMENTS = CREATE_ROLE_STATEMENTS + INITIAL_RLS_POLICY_STATEMENTS

ALL_STATEMENTS = CREATE_ROLE_STATEMENTS + RLS_POLICY_STATEMENTS
