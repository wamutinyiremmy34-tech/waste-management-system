# Multi-Tenancy

## Model

EcoTrack supports multiple independent tenants of three kinds:

- **Waste companies** (`waste_companies`) — own collectors, vehicles, collection zones.
- **Organizations** (`organizations`) — schools, hotels, offices, etc.; own locations and waste
  records.
- **Recycling partners** (`recycling_partners`) — own recycling records.

A `User` belongs to at most one tenant via a nullable FK (`organization_id`, `waste_company_id`, or
`recycler_id` — exactly one is populated depending on role; `CITIZEN` and `SUPER_ADMIN` have none).
Municipal admins are not tied to a single company/organization — they have broader (city-wide)
visibility by design.

This is **row-level multi-tenancy** (shared tables, tenant-scoping foreign keys), not
schema-per-tenant or database-per-tenant. That's the right tradeoff for this MVP's scale — it keeps
migrations and cross-tenant municipal/admin reporting simple.

## Isolation enforcement — two layers now, not one

**Application layer** (primary): every list/detail endpoint that returns tenant-scoped data filters
by the caller's tenant ID unless they're a `SUPER_ADMIN` (and, for some views, `MUNICIPAL_ADMIN`,
which spans companies within a municipality by design). See `docs/authorization.md` for the
mechanism and the automated tests that verify a user **cannot** access another tenant's data by
manipulating an ID in the URL.

**Database layer** (real defense-in-depth): PostgreSQL Row-Level Security (RLS) is enabled on 13
tables — `notifications`, `pickup_requests`, `complaints`, `collectors`, `vehicles`, `organizations`,
`organization_locations`, `waste_companies`, `reward_redemptions`, `campaign_participations`,
`points_ledger_entries`, `recycling_records`, `waste_records` — via five migrations and a restricted,
non-superuser database role (`ecotrack_app`) that the running application connects as. The DDL
itself lives in `app/core/rls.py`, shared between all migrations and the test suite so they can
never drift apart.

### How this actually works

1. A new Postgres role, `ecotrack_app`, is `NOSUPERUSER NOBYPASSRLS` — unlike the migration/seed
   role (`ecotrack`, a superuser), it cannot bypass RLS policies. Postgres superusers bypass RLS
   unconditionally regardless of any policy, so using a non-superuser role for the running
   application is *required* for RLS to provide any real protection at all — this is not optional
   plumbing.
2. Each authenticated request sets Postgres session variables
   (`SET LOCAL app.user_id`, `app.role`, `app.company_id`, `app.collector_id`) in
   `app/security/dependencies.py::get_current_user`, right after the JWT is verified and the user is
   loaded.
3. Every RLS policy reads those session variables via `current_setting(...)` and only returns rows
   that match — e.g. `notifications_owner` only returns rows where `user_id` equals the session's
   `app.user_id`. Policies are written to **match, not exceed,** the access patterns already tested
   at the application layer (e.g. `SUPER_ADMIN`/`MUNICIPAL_ADMIN`/`COMPANY_ADMIN` currently see all
   complaints platform-wide per `complaints.py::list_complaints` — the RLS policy grants the same,
   not a broader or narrower set), so this is a genuine backstop, not a behavior change.

### Verified four independent ways, not assumed

1. `backend/tests/test_row_level_security.py` connects **directly to the database as the restricted
   role**, bypassing the FastAPI application entirely, and proves: an unrelated citizen sees zero
   rows of another citizen's notifications/complaints even though the rows exist; the correct
   citizen (with matching session context) sees exactly their own; an admin-role session sees the
   same blanket data the app already grants that role; and a session claiming to be user A cannot
   `INSERT` a row claiming to belong to user B (the `WITH CHECK` clause blocks it). The organizations
   extension added two more: an `ORGANIZATION_ADMIN` cannot see another organization's row or its
   locations, but can see their own, and `SUPER_ADMIN` retains blanket visibility — 6/6 passing.
2. The full existing 47-test suite still passes unchanged (51 total now) — the new role/policies
   don't affect the superuser connection those tests use, confirming no regression.
3. **The live application was started connected as the restricted role** (`DATABASE_URL` pointed at
   `ecotrack_app` instead of `ecotrack`) and exercised over real HTTP: a citizen's own notifications
   and pickups returned correctly, an admin's platform-wide dashboard and complaint list returned
   correct real aggregate data, and the existing IDOR test (citizen B requesting citizen A's pickup
   by ID) still correctly returned 404 — proving RLS is transparent to legitimate traffic while
   still blocking illegitimate access underneath it.
4. The migration was applied to both the dev and test databases and its role/policy state queried
   directly (`\du`, `pg_class.relrowsecurity`, `pg_policies`) to confirm it matches what the code
   claims, not just that `alembic upgrade head` exited zero.

### A known, documented limitation of this implementation

`SET LOCAL` is scoped to the current transaction. If a request's service layer calls `db.commit()`
and then performs further RLS-covered queries afterward in the *same* request, those later queries
run without the session context. The failure direction there is safe — every policy compares against
`NULLIF(current_setting(...), '')`, which evaluates to `NULL`/false when unset, so the result is
rows being hidden (a functionality bug: "can't find my own data") rather than exposed (a security
hole: "can see someone else's data"). This is called out explicitly rather than claimed away; a more
robust version would re-assert the session context after any mid-request commit, or use a connection
pool `checkout` event to set it once per checked-out connection instead of per-transaction.

## What was explicitly tested (application layer)

- A `COMPANY_ADMIN` cannot assign a pickup to a collector belonging to a different company
  (`pickup_service.assign_pickup` checks `collector.waste_company_id != current_user.waste_company_id`).
- A citizen cannot view another citizen's pickup by guessing/incrementing the pickup ID.
- Organization waste analytics (`GET /api/v1/organizations/{id}/waste-analytics`) 404s for a user
  from a different organization rather than leaking totals.

## What's not covered by RLS yet — and one important nuance found while extending it

10 of 31 tables have RLS policies now (up from 5, then 7, then 10 across three passes).
`vehicle_maintenance_records`, `complaint_attachments`, and others follow the exact same
straightforward pattern already established and are reasonable next extensions.

**`points_ledger_entries`, `recycling_records`, and `waste_records` were deliberately NOT given
per-tenant RLS**, and this is worth explaining rather than just listing as "not done yet" — while
extending RLS in this pass, each of these was checked against its actual endpoints first (the same
discipline used for the original 5 tables), and each has a genuine platform-wide aggregate-read
endpoint that a naive "scope to the caller's own company/user" policy would silently break:

- `GET /api/v1/rewards/leaderboard` — any authenticated user aggregates points **across all users**
  to build a leaderboard. A policy limiting reads to `user_id = app.user_id` would make every
  non-admin caller's leaderboard show only their own single row.
- `GET /api/v1/recycling/impact-summary` — any authenticated user sees platform-wide totals across
  **all** recycling and waste records, by design (it's the environmental-impact dashboard data).
  Scoping reads to the caller's own recycler/company would break this for everyone except admins.

This is exactly the failure mode a rushed RLS rollout risks: enabling RLS on a table without first
checking every endpoint that reads it can silently break real, tested functionality instead of just
adding protection. Extending RLS to these three tables properly would need a two-tier policy (broad
read access for aggregate/leaderboard-style endpoints, tighter write access) rather than the simple
single-policy pattern used elsewhere — a reasonable but more involved follow-up, not a quick copy-paste
of the existing policies.

This same discipline was also what led to `bins` and `collection_zones` being excluded in a later
pass (adding `waste_companies`, `reward_redemptions`, `campaign_participations`): `GET
/api/v1/bins/nearby` and `GET /api/v1/zones`/`GET /api/v1/zones/lookup` are open to any
authenticated user by design (a citizen needs to find bins/zones near them regardless of which
company owns them), so the same "genuine public-read endpoint" reasoning applies. `waste_companies`
(matches the already-tested `get_company` scoping) and `reward_redemptions`/`campaign_participations`
(no read endpoint exists for either yet, so RLS there is pure defense-in-depth with zero risk to
existing behavior) were safe to add.

### A real migration-chain bug found while wiring up CI, not before

While adding CI integration for the E2E suite (which requires running `alembic upgrade head`
against a genuinely fresh, never-migrated database — something no prior verification in this
project had actually exercised, since local dev always incrementally applied one new migration to
an already-migrated `ecotrack_dev`), a real bug surfaced: migration `3ae23b5a7cc9` had been changed,
during a later refactor of `app/core/rls.py`, to reference the combined `ALL_STATEMENTS` constant —
which by that point included the `organizations`/`organization_locations` policies added in
migration `9293c1afe69d`. Running both migrations against a blank database meant migration 1 created
those policies *and* migration 2 tried to create them again, failing with
`DuplicateObject: policy "organizations_access" for table "organizations" already exists`.

This is exactly the kind of bug that only surfaces when the full migration chain is actually run
from zero — which `conftest.py`'s test fixture never does (it builds schema via
`Base.metadata.create_all()` plus a single flat application of `ALL_STATEMENTS`, never through
Alembic at all), and which local development never did either (each migration was applied
incrementally to a database that already had the previous one). Fixed by adding a precisely-scoped
`MIGRATION_1_STATEMENTS` constant (role/grants + only the first 5 tables' policies) and pointing
migration 1 at that instead of the combined list. Verified by dropping and recreating a database
from scratch and running `alembic upgrade head` end-to-end — confirmed all migrations apply
cleanly and the resulting policy set has no duplicates. The same from-scratch sequence (migrate →
seed → start backend → build+start frontend → run E2E suite) was then run all the way through and
passed 5/5 — see `e2e/README.md` and `docs/testing.md`. A third RLS migration (extending to
`waste_companies`/`reward_redemptions`/`campaign_participations`) was added afterward and verified
the same way — a truly fresh database migrated cleanly through all 4 migrations with exactly one
policy per covered table, no duplicates.

## Three more real bugs found by actually running the live app under RLS

Adding the two-tier read/write policies for `points_ledger_entries`/`recycling_records`/
`waste_records` (see below) prompted starting the live application connected as the restricted
`ecotrack_app` role and running the full citizen-request → admin-assign → collector-complete flow
over real HTTP — not just the isolated direct-SQL policy tests. That surfaced three genuine bugs
that no earlier testing had caught, because the earlier tests never happened to exercise these
exact code paths under RLS:

1. **`SET LOCAL` doesn't survive a mid-request commit.** `pickup_service.create_pickup()` commits,
   then calls `db.refresh()` — which failed to find the row it had just inserted, because `SET
   LOCAL`'s context ends with the commit. Fixed by switching to plain `SET` (session-scoped) plus a
   connection-pool `checkin` event that runs `RESET ALL` so the context never leaks between
   requests — which in turn needed `get_db()` to bind the SQLAlchemy Session to one explicitly
   checked-out `Connection` for the whole request (SQLAlchemy's default Engine-bound Session
   releases its connection back to the pool after every commit, which would have made the `RESET
   ALL` fire mid-request and undone the fix). See `app/core/database.py` and
   `app/security/dependencies.py`.
2. **A lookup ordering bug**: `_set_rls_session_context` queried the `collectors` table to resolve
   `app.collector_id` *before* setting any `app.*` context on the connection — but `collectors` now
   has RLS too, so that lookup silently returned zero rows for every real collector, permanently
   breaking `assigned_collector_id = app.collector_id` checks for their own real assignments. Fixed
   by setting `app.user_id`/`app.role` first (sufficient to satisfy the collectors policy's own-row
   clause), then performing the lookup.
3. **Two policies were simply too strict for real write patterns**, both only found by running the
   actual live flow: `notifications`'s `WITH CHECK` required `user_id = app.user_id`, but nearly
   every real notification is created as a side effect of a *different* user's action (a
   `COMPANY_ADMIN` assigning a pickup notifies the citizen) — fixed by relaxing the INSERT check to
   any authenticated session, since notifications are low-sensitivity and the real "who gets
   notified" logic lives at the application layer. `pickup_requests`'s `WITH CHECK` never included
   the assigned `COLLECTOR`, so every real status update a collector makes (`EN_ROUTE`, `ARRIVED`,
   completion) failed — fixed by adding the same `assigned_collector_id = app.collector_id` clause
   already present in the `USING` half of the policy.

After all three fixes, the complete real flow was run end-to-end against the live, RLS-restricted
app: a citizen's points balance went from 0 to 10 after a collector completed their pickup (proving
the two-tier `points_ledger_entries` write policy's `COLLECTOR`-credits-`CITIZEN` allowance
genuinely works), the pickup correctly showed `COLLECTED`, and the existing IDOR test (citizen B
requesting citizen A's pickup) still correctly returned 404. The full 68-test pytest suite was
re-verified passing after each fix.

**The honest lesson here**: RLS policies designed by reading code and reasoning about who *should*
write which rows are not a substitute for actually running the real application against them
end-to-end. Three of the four RLS-related bugs in this project were found this way, not by static
review — and it's likely more exist in the untested combinations of the remaining 21 tables were RLS
extended further without this same live-flow verification.
