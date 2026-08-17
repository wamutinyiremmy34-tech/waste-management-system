"""
Proves Row-Level Security actually works — not just that the migration
applies cleanly. This test connects directly to the database as the
restricted `ecotrack_app` role (bypassing the FastAPI application entirely)
and confirms that without the right session context, cross-tenant/other-
user rows are genuinely invisible at the SQL level. This is the real test
of defense-in-depth: it proves protection exists even if some future
endpoint's application-layer filter has a bug, because the database itself
won't return the rows.

Uses a completely separate SQLAlchemy engine from the one the rest of the
test suite uses (which connects as the `ecotrack` superuser and therefore
bypasses RLS, by design — see tests/conftest.py) so this test exercises the
restricted role specifically.
"""
import uuid

import pytest
from sqlalchemy import create_engine, text

from app.core.geo import point_from_latlng
from app.models.bins_complaints import Complaint
from app.models.enums import ComplaintCategory, ComplaintStatus, OrganizationType, UserRole
from app.models.notifications_audit import Notification, NotificationType
from app.models.recycling_rewards import PointsLedgerEntry, Reward, RewardRedemption
from app.models.tenant import Organization, OrganizationLocation, RecyclingPartner, WasteCompany
from app.models.user import User
from app.security.auth import hash_password
from tests.conftest import TEST_DATABASE_URL, TestingSessionLocal

RESTRICTED_DATABASE_URL = TEST_DATABASE_URL.replace(
    "ecotrack:ecotrack_dev_pw", "ecotrack_app:ecotrack_app_dev_pw"
)


@pytest.fixture()
def restricted_connection():
    """A raw connection using the restricted, RLS-subject role — not the app."""
    engine = create_engine(RESTRICTED_DATABASE_URL, future=True)
    conn = engine.connect()
    yield conn
    conn.close()
    engine.dispose()


def _set_context(conn, user_id=None, role=None, company_id=None, collector_id=None):
    """Mirrors what app/security/dependencies.py sets per authenticated request."""
    conn.execute(text("SET LOCAL app.user_id = :v"), {"v": str(user_id) if user_id else ""})
    conn.execute(text("SET LOCAL app.role = :v"), {"v": role or ""})
    conn.execute(text("SET LOCAL app.company_id = :v"), {"v": str(company_id) if company_id else ""})
    conn.execute(text("SET LOCAL app.collector_id = :v"), {"v": str(collector_id) if collector_id else ""})


def test_restricted_role_exists_and_can_connect(restricted_connection):
    """Sanity check: the role from the RLS migration is real and connectable."""
    result = restricted_connection.execute(text("SELECT current_user")).scalar()
    assert result == "ecotrack_app"


def test_notifications_invisible_without_matching_session_context(restricted_connection):
    db = TestingSessionLocal()
    user_a = User(
        email=f"rls-a-{uuid.uuid4().hex[:8]}@example.com", hashed_password=hash_password("Passw0rd123"),
        full_name="RLS User A", role=UserRole.CITIZEN, is_active=True,
    )
    user_b = User(
        email=f"rls-b-{uuid.uuid4().hex[:8]}@example.com", hashed_password=hash_password("Passw0rd123"),
        full_name="RLS User B", role=UserRole.CITIZEN, is_active=True,
    )
    db.add_all([user_a, user_b])
    db.flush()
    db.add(
        Notification(
            user_id=user_a.id, type=NotificationType.SYSTEM_ANNOUNCEMENT,
            title="Private to A", body="Only user A should ever see this row",
        )
    )
    db.commit()
    user_a_id = user_a.id
    user_b_id = user_b.id
    db.close()

    with restricted_connection.begin():
        # No session context set at all — a connection that authenticated
        # incorrectly, or a raw psql session someone gained access to,
        # should see nothing.
        rows = restricted_connection.execute(text("SELECT title FROM notifications")).fetchall()
        assert rows == []

    with restricted_connection.begin():
        # Session context claims to be user B — should still see nothing,
        # because the notification belongs to user A.
        _set_context(restricted_connection, user_id=user_b_id, role="CITIZEN")
        rows = restricted_connection.execute(text("SELECT title FROM notifications")).fetchall()
        assert rows == []

    with restricted_connection.begin():
        # Session context correctly claims to be user A — now the row is
        # visible. This proves the policy isn't just "deny everything" —
        # it's genuinely conditional on the session context matching.
        _set_context(restricted_connection, user_id=user_a_id, role="CITIZEN")
        rows = restricted_connection.execute(text("SELECT title FROM notifications")).fetchall()
        assert rows == [("Private to A",)]


def test_complaints_visible_to_admin_role_but_not_unrelated_citizen(restricted_connection):
    db = TestingSessionLocal()
    reporter = User(
        email=f"rls-reporter-{uuid.uuid4().hex[:8]}@example.com", hashed_password=hash_password("Passw0rd123"),
        full_name="RLS Reporter", role=UserRole.CITIZEN, is_active=True,
    )
    other_citizen = User(
        email=f"rls-other-{uuid.uuid4().hex[:8]}@example.com", hashed_password=hash_password("Passw0rd123"),
        full_name="RLS Other Citizen", role=UserRole.CITIZEN, is_active=True,
    )
    db.add_all([reporter, other_citizen])
    db.flush()
    db.add(
        Complaint(
            reporter_user_id=reporter.id,
            category=ComplaintCategory.ILLEGAL_DUMPING,
            description="RLS test complaint — should be hidden from an unrelated citizen",
            location=point_from_latlng(0.3, 32.5),
            status=ComplaintStatus.REPORTED,
        )
    )
    db.commit()
    reporter_id = reporter.id
    other_id = other_citizen.id
    db.close()

    with restricted_connection.begin():
        # An unrelated citizen (not the reporter, not an admin role) sees nothing.
        _set_context(restricted_connection, user_id=other_id, role="CITIZEN")
        rows = restricted_connection.execute(text("SELECT id FROM complaints")).fetchall()
        assert rows == []

    with restricted_connection.begin():
        # The reporter themselves can see it.
        _set_context(restricted_connection, user_id=reporter_id, role="CITIZEN")
        rows = restricted_connection.execute(text("SELECT id FROM complaints")).fetchall()
        assert len(rows) == 1

    with restricted_connection.begin():
        # A SUPER_ADMIN session (matching the app's own current authorization
        # behavior — see complaints.py::list_complaints) can see it too, even
        # though they're a different user entirely.
        _set_context(restricted_connection, user_id=uuid.uuid4(), role="SUPER_ADMIN")
        rows = restricted_connection.execute(text("SELECT id FROM complaints")).fetchall()
        assert len(rows) == 1


def test_insert_with_check_blocks_spoofing_another_users_notification(restricted_connection):
    """
    WITH CHECK enforces the same rule on writes, not just reads: a session
    claiming to be user A cannot INSERT a row claiming to belong to user B.
    """
    db = TestingSessionLocal()
    user_a = User(
        email=f"rls-writer-{uuid.uuid4().hex[:8]}@example.com", hashed_password=hash_password("Passw0rd123"),
        full_name="RLS Writer", role=UserRole.CITIZEN, is_active=True,
    )
    db.add(user_a)
    db.commit()
    user_a_id = user_a.id
    db.close()

    spoofed_target_id = uuid.uuid4()

    with restricted_connection.begin():
        _set_context(restricted_connection, user_id=user_a_id, role="CITIZEN")
        with pytest.raises(Exception):
            restricted_connection.execute(
                text(
                    "INSERT INTO notifications (id, user_id, type, title, is_read, created_at, updated_at) "
                    "VALUES (gen_random_uuid(), :target, 'SYSTEM_ANNOUNCEMENT', 'spoofed', false, now(), now())"
                ),
                {"target": str(spoofed_target_id)},
            )


def test_organizations_invisible_to_unrelated_org_admin(restricted_connection):
    """
    Extends RLS coverage (migration 9293c1afe69d) — an ORGANIZATION_ADMIN
    for one organization cannot see another organization's row, but the
    admin of the matching organization can, and SUPER_ADMIN/MUNICIPAL_ADMIN
    retain the blanket visibility the app already grants them.
    """
    db = TestingSessionLocal()
    org_a = Organization(name=f"RLS Org A {uuid.uuid4().hex[:6]}", org_type=OrganizationType.SCHOOL)
    org_b = Organization(name=f"RLS Org B {uuid.uuid4().hex[:6]}", org_type=OrganizationType.OFFICE)
    db.add_all([org_a, org_b])
    db.commit()
    org_a_id = org_a.id
    org_b_id = org_b.id
    db.close()

    with restricted_connection.begin():
        # An admin of org A should not see org B's row at all.
        _set_context(restricted_connection, role="ORGANIZATION_ADMIN")
        restricted_connection.execute(text("SET LOCAL app.org_id = :v"), {"v": str(org_a_id)})
        rows = restricted_connection.execute(
            text("SELECT id FROM organizations WHERE id = :target"), {"target": str(org_b_id)}
        ).fetchall()
        assert rows == []

    with restricted_connection.begin():
        # The same admin CAN see their own organization.
        _set_context(restricted_connection, role="ORGANIZATION_ADMIN")
        restricted_connection.execute(text("SET LOCAL app.org_id = :v"), {"v": str(org_a_id)})
        rows = restricted_connection.execute(
            text("SELECT id FROM organizations WHERE id = :target"), {"target": str(org_a_id)}
        ).fetchall()
        assert len(rows) == 1

    with restricted_connection.begin():
        # SUPER_ADMIN retains blanket visibility (matching the app's own
        # current behavior for that role).
        _set_context(restricted_connection, role="SUPER_ADMIN")
        rows = restricted_connection.execute(
            text("SELECT id FROM organizations WHERE id IN (:a, :b)"), {"a": str(org_a_id), "b": str(org_b_id)}
        ).fetchall()
        assert len(rows) == 2


def test_organization_locations_scoped_same_as_parent_organization(restricted_connection):
    db = TestingSessionLocal()
    org_a = Organization(name=f"RLS Loc Org A {uuid.uuid4().hex[:6]}", org_type=OrganizationType.HOTEL)
    org_b = Organization(name=f"RLS Loc Org B {uuid.uuid4().hex[:6]}", org_type=OrganizationType.HOTEL)
    db.add_all([org_a, org_b])
    db.flush()
    loc_a = OrganizationLocation(
        organization_id=org_a.id, label="Org A HQ", location=point_from_latlng(0.3, 32.5)
    )
    db.add(loc_a)
    db.commit()
    org_a_id = org_a.id
    org_b_id = org_b.id
    db.close()

    with restricted_connection.begin():
        # An admin of org B should not see org A's location.
        _set_context(restricted_connection, role="ORGANIZATION_ADMIN")
        restricted_connection.execute(text("SET LOCAL app.org_id = :v"), {"v": str(org_b_id)})
        rows = restricted_connection.execute(text("SELECT id FROM organization_locations")).fetchall()
        assert rows == []

    with restricted_connection.begin():
        # An admin of org A sees it.
        _set_context(restricted_connection, role="ORGANIZATION_ADMIN")
        restricted_connection.execute(text("SET LOCAL app.org_id = :v"), {"v": str(org_a_id)})
        rows = restricted_connection.execute(text("SELECT id FROM organization_locations")).fetchall()
        assert len(rows) == 1


def test_waste_companies_invisible_to_unrelated_company_admin(restricted_connection):
    db = TestingSessionLocal()
    company_a = WasteCompany(name=f"RLS Company A {uuid.uuid4().hex[:6]}")
    company_b = WasteCompany(name=f"RLS Company B {uuid.uuid4().hex[:6]}")
    db.add_all([company_a, company_b])
    db.commit()
    company_a_id = company_a.id
    company_b_id = company_b.id
    db.close()

    with restricted_connection.begin():
        _set_context(restricted_connection, role="COMPANY_ADMIN")
        restricted_connection.execute(text("SET LOCAL app.company_id = :v"), {"v": str(company_a_id)})
        rows = restricted_connection.execute(
            text("SELECT id FROM waste_companies WHERE id = :target"), {"target": str(company_b_id)}
        ).fetchall()
        assert rows == []

    with restricted_connection.begin():
        _set_context(restricted_connection, role="COMPANY_ADMIN")
        restricted_connection.execute(text("SET LOCAL app.company_id = :v"), {"v": str(company_a_id)})
        rows = restricted_connection.execute(
            text("SELECT id FROM waste_companies WHERE id = :target"), {"target": str(company_a_id)}
        ).fetchall()
        assert len(rows) == 1


def test_reward_redemptions_invisible_to_unrelated_user(restricted_connection):
    db = TestingSessionLocal()
    user_a = User(
        email=f"rls-redeem-a-{uuid.uuid4().hex[:8]}@example.com", hashed_password=hash_password("Passw0rd123"),
        full_name="RLS Redeem A", role=UserRole.CITIZEN, is_active=True,
    )
    user_b = User(
        email=f"rls-redeem-b-{uuid.uuid4().hex[:8]}@example.com", hashed_password=hash_password("Passw0rd123"),
        full_name="RLS Redeem B", role=UserRole.CITIZEN, is_active=True,
    )
    reward = Reward(name="RLS Test Reward", points_cost=10)
    db.add_all([user_a, user_b, reward])
    db.flush()
    db.add(RewardRedemption(user_id=user_a.id, reward_id=reward.id, points_spent=10, status="PENDING"))
    db.commit()
    user_a_id = user_a.id
    user_b_id = user_b.id
    db.close()

    with restricted_connection.begin():
        _set_context(restricted_connection, user_id=user_b_id, role="CITIZEN")
        rows = restricted_connection.execute(text("SELECT id FROM reward_redemptions")).fetchall()
        assert rows == []

    with restricted_connection.begin():
        _set_context(restricted_connection, user_id=user_a_id, role="CITIZEN")
        rows = restricted_connection.execute(text("SELECT id FROM reward_redemptions")).fetchall()
        assert len(rows) == 1


def test_points_ledger_broad_read_matches_leaderboard_behavior(restricted_connection):
    """
    Any authenticated session can SELECT across the whole points_ledger_entries
    table — this is not a bug, it's RLS matching the app's own already-shipped
    leaderboard behavior (GET /rewards/leaderboard aggregates across ALL
    users). See app/core/rls.py for the full reasoning.
    """
    db = TestingSessionLocal()
    user_a = User(
        email=f"rls-points-a-{uuid.uuid4().hex[:8]}@example.com", hashed_password=hash_password("Passw0rd123"),
        full_name="RLS Points A", role=UserRole.CITIZEN, is_active=True,
    )
    db.add(user_a)
    db.flush()
    db.add(PointsLedgerEntry(user_id=user_a.id, activity_type="VERIFIED_PICKUP", points=10))
    db.commit()
    db.close()

    with restricted_connection.begin():
        # A completely unrelated citizen session can still read it — matching
        # the leaderboard's genuine platform-wide read requirement.
        _set_context(restricted_connection, role="CITIZEN")
        restricted_connection.execute(text("SET LOCAL app.user_id = :v"), {"v": str(uuid.uuid4())})
        rows = restricted_connection.execute(text("SELECT points FROM points_ledger_entries")).fetchall()
        assert len(rows) >= 1


def test_points_ledger_write_blocks_unrelated_citizen_but_allows_collector(restricted_connection):
    db = TestingSessionLocal()
    citizen = User(
        email=f"rls-points-cit-{uuid.uuid4().hex[:8]}@example.com", hashed_password=hash_password("Passw0rd123"),
        full_name="RLS Points Citizen", role=UserRole.CITIZEN, is_active=True,
    )
    other_citizen = User(
        email=f"rls-points-other-{uuid.uuid4().hex[:8]}@example.com", hashed_password=hash_password("Passw0rd123"),
        full_name="RLS Points Other", role=UserRole.CITIZEN, is_active=True,
    )
    db.add_all([citizen, other_citizen])
    db.commit()
    citizen_id = citizen.id
    other_citizen_id = other_citizen.id
    db.close()

    # An unrelated citizen cannot credit points to someone else's account.
    with restricted_connection.begin():
        _set_context(restricted_connection, user_id=other_citizen_id, role="CITIZEN")
        with pytest.raises(Exception):
            restricted_connection.execute(
                text(
                    "INSERT INTO points_ledger_entries (id, user_id, activity_type, points, created_at, updated_at) "
                    "VALUES (gen_random_uuid(), :target, 'SPOOFED', 999, now(), now())"
                ),
                {"target": str(citizen_id)},
            )

    # A COLLECTOR session CAN credit a citizen's account — this is the real,
    # intentional (if coarser than ideal) allowance for the pickup-completion
    # reward flow. See app/core/rls.py for the honest limitation this
    # represents (not scoped to "a pickup this collector actually completed").
    with restricted_connection.begin():
        _set_context(restricted_connection, user_id=uuid.uuid4(), role="COLLECTOR")
        restricted_connection.execute(
            text(
                "INSERT INTO points_ledger_entries (id, user_id, activity_type, points, created_at, updated_at) "
                "VALUES (gen_random_uuid(), :target, 'VERIFIED_PICKUP', 10, now(), now())"
            ),
            {"target": str(citizen_id)},
        )
        # No exception raised — confirms the allowance is real and works.


def test_recycling_records_write_blocked_for_unrelated_recycler(restricted_connection):
    db = TestingSessionLocal()
    partner_a = RecyclingPartner(name=f"RLS Recycler A {uuid.uuid4().hex[:6]}")
    partner_b = RecyclingPartner(name=f"RLS Recycler B {uuid.uuid4().hex[:6]}")
    db.add_all([partner_a, partner_b])
    db.commit()
    partner_a_id = partner_a.id
    partner_b_id = partner_b.id
    db.close()

    # Recycler A's session cannot insert a record claiming to be from Recycler B.
    with restricted_connection.begin():
        _set_context(restricted_connection, role="RECYCLER")
        restricted_connection.execute(text("SET LOCAL app.recycler_id = :v"), {"v": str(partner_a_id)})
        with pytest.raises(Exception):
            restricted_connection.execute(
                text(
                    "INSERT INTO recycling_records (id, recycler_id, waste_category, quantity_kg, received_date, created_at, updated_at) "
                    "VALUES (gen_random_uuid(), :target, 'PLASTIC', 5.0, CURRENT_DATE, now(), now())"
                ),
                {"target": str(partner_b_id)},
            )

    # Recycler A's session CAN insert its own record.
    with restricted_connection.begin():
        _set_context(restricted_connection, role="RECYCLER")
        restricted_connection.execute(text("SET LOCAL app.recycler_id = :v"), {"v": str(partner_a_id)})
        restricted_connection.execute(
            text(
                "INSERT INTO recycling_records (id, recycler_id, waste_category, quantity_kg, received_date, created_at, updated_at) "
                "VALUES (gen_random_uuid(), :target, 'PLASTIC', 5.0, CURRENT_DATE, now(), now())"
            ),
            {"target": str(partner_a_id)},
        )


def test_waste_records_broad_read_and_scoped_write(restricted_connection):
    db = TestingSessionLocal()
    company_a = WasteCompany(name=f"RLS Waste Co A {uuid.uuid4().hex[:6]}")
    company_b = WasteCompany(name=f"RLS Waste Co B {uuid.uuid4().hex[:6]}")
    db.add_all([company_a, company_b])
    db.commit()
    company_a_id = company_a.id
    company_b_id = company_b.id
    db.close()

    # Broad read — matches GET /recycling/impact-summary's platform-wide totals.
    with restricted_connection.begin():
        _set_context(restricted_connection, role="CITIZEN")
        restricted_connection.execute(text("SET LOCAL app.user_id = :v"), {"v": str(uuid.uuid4())})
        # Should not raise, even with zero rows — the point is the SELECT
        # itself isn't blocked by RLS for an unrelated citizen.
        restricted_connection.execute(text("SELECT COUNT(*) FROM waste_records")).fetchall()

    # Scoped write — company B's session cannot insert a record for company A.
    with restricted_connection.begin():
        _set_context(restricted_connection, role="COLLECTOR")
        restricted_connection.execute(text("SET LOCAL app.company_id = :v"), {"v": str(company_b_id)})
        with pytest.raises(Exception):
            restricted_connection.execute(
                text(
                    "INSERT INTO waste_records (id, waste_company_id, category, quantity_kg, recorded_at, created_at, updated_at) "
                    "VALUES (gen_random_uuid(), :target, 'ORGANIC', 5.0, now(), now(), now())"
                ),
                {"target": str(company_a_id)},
            )
