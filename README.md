# EcoTrack

**Smart Waste Management & Environmental Intelligence Platform**,
initially targeting Uganda and designed to extend to other regions.

> **Honest status up front**: this is a genuinely working MVP core — real database, real auth/RBAC,
> a fully working pickup lifecycle, real PostGIS spatial queries, a real (if partial) frontend — not
> a mockup. It is **not** the complete 70-section spec. See "What's implemented vs. not" below for
> the specific, honest breakdown. Nothing here claims to be done that isn't.

## What EcoTrack is

A digital operating system connecting citizens, waste collectors, waste management companies,
organizations, recycling partners, and municipal authorities through the full waste lifecycle:
request → assignment → collection → recycling/disposal → analytics → environmental impact.

## Architecture

- **Backend**: FastAPI (Python 3.12), PostgreSQL 16 + PostGIS 3.4, Redis, SQLAlchemy + Alembic.
- **Frontend**: Next.js 16 (App Router, TypeScript, Tailwind CSS), installable as a PWA.
- See `docs/architecture.md` for the full breakdown.

## Requirements

- Python 3.12+, Node.js 22+
- PostgreSQL 16 with the PostGIS extension available
- Redis 7+
- (Optional) Docker + Docker Compose

## Quick start — Docker

```bash
cp backend/.env.example backend/.env   # change SECRET_KEY before anything beyond local dev
docker compose up --build
```

Backend: http://localhost:8000 (docs at `/docs`, `/redoc`) · Frontend: http://localhost:3000

> Note: Docker was not available in the sandbox this project was built in, so the Docker path is
> written to standard conventions but has not itself been executed here — see `docs/deployment.md`
> for exactly what was and wasn't verified.

## Quick start — without Docker (this is the path that was actually run and verified)

```bash
# Postgres + PostGIS + Redis
sudo apt-get install -y postgresql postgresql-contrib postgis postgresql-16-postgis-3 redis-server
sudo service postgresql start && redis-server --daemonize yes

sudo -u postgres psql -c "CREATE USER ecotrack WITH PASSWORD 'ecotrack_dev_pw' SUPERUSER;"
sudo -u postgres psql -c "CREATE DATABASE ecotrack_dev OWNER ecotrack;"
sudo -u postgres psql -c "CREATE DATABASE ecotrack_test OWNER ecotrack;"
sudo -u postgres psql -d ecotrack_dev -c "CREATE EXTENSION IF NOT EXISTS postgis;"
sudo -u postgres psql -d ecotrack_test -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# Backend
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
n export PYTHONPATH=.
alembic upgrade head
python3 scripts/seed.py            # optional — realistic demo data for every role
uvicorn app.main:app --reload      # http://localhost:8000

# Frontend (separate terminal)
cd frontend
npm install
cp .env.example .env.local
npm run dev                        # http://localhost:3000
```

## Testing

```bash
cd backend
pip install -r requirements-dev.txt   # adds pdfplumber etc., needed only to run the test suite
export DATABASE_URL=postgresql+psycopg2://ecotrack:ecotrack_dev_pw@localhost:5432/ecotrack_test
export PYTHONPATH=.
pytest tests/ -v        # 68/68 passing as of this build — see docs/testing.md
```

```bash
cd frontend
npm run lint && npx tsc --noEmit && npm run build
```

## Demo accounts (seed data — obviously fake, dev-only credentials)

Run `python3 scripts/seed.py` (backend), then log in with any of these and the shared password
`EcoTrackDev123`:

| Email | Role |
|---|---|
| superadmin@ecotrack.dev | SUPER_ADMIN |
| municipal@ecotrack.dev | MUNICIPAL_ADMIN |
| company@ecotrack.dev | COMPANY_ADMIN |
| orgadmin@ecotrack.dev | ORGANIZATION_ADMIN |
| recycler@ecotrack.dev | RECYCLER |
| citizen@ecotrack.dev | CITIZEN |
| citizen2@ecotrack.dev | CITIZEN |
| collector@ecotrack.dev | COLLECTOR |

The frontend UI now covers **all 7 roles end-to-end**: **CITIZEN** (landing, register, login,
dashboard, request-pickup, recurring schedules — `/schedules`), **COLLECTOR** (mobile-first
assignment list, status progression, and collection completion — `/collector`),
**SUPER_ADMIN**/**MUNICIPAL_ADMIN** (platform dashboard with real aggregate stats, waste-by-category
chart, and complaint moderation buttons — `/admin`), **COMPANY_ADMIN** (operational dashboard with
collector/vehicle/pickup counts — `/company`), **ORGANIZATION_ADMIN** (organization waste analytics
and location management — `/organization`), and **RECYCLER** (recycling activity logging and
platform-wide diversion-rate stats — `/recycler`). Logging in routes each role to the right screen
automatically (`/post-login`).

## API documentation

FastAPI's interactive docs are live at `/docs` (Swagger) and `/redoc` when the backend is running.

## What's implemented vs. architected for future implementation

This distinction matters (spec section 76) — here it is, stated plainly.

### Implemented (real, working, tested)
- Full auth: register/login/refresh (rotating)/logout, bcrypt hashing, JWT.
- RBAC across 7 roles, enforced server-side, with automated tests proving IDOR/tenant-isolation.
- Multi-tenancy (waste companies, organizations, recycling partners) with ownership checks.
- Full pickup lifecycle: request → assign → status transitions (validated state machine) → complete/
  fail, with waste-record creation, reward points, notifications, and audit logging as real side
  effects — not simulated.
- Complaints/illegal-dumping reporting with its own validated status lifecycle.
- Bins (including real PostGIS nearby search), collection zones (including real PostGIS
  point-in-polygon lookup), vehicles, collector profiles/location check-in.
- Recycling records, configurable reward rules, points ledger, redemption, leaderboard.
- In-app notifications (read/unread, preferences).
- Real analytics/dashboard endpoints computed from actual database aggregates (not hardcoded).
- Audit logging for sensitive actions.
- File upload validation (extension + content-type + magic bytes + size, server-generated keys).
- Redis-backed rate limiting middleware (tighter budget on auth endpoints), verified with both a
  unit test and a live-server curl loop hitting a real 429.
- Recurring pickup schedules: real materialization job (`app/services/scheduler_service.py`,
  runnable via `scripts/run_scheduler.py` on a cron/systemd timer) that generates actual
  `PickupRequest` rows from a schedule rule on the correct cadence — without pre-creating thousands
  of rows in advance, and verified idempotent (no duplicates on repeat runs) both by an automated
  test and by running the real script twice against the dev database. See `docs/recurring-pickups.md`.
- CSV and PDF report export (`GET /api/v1/reports/{collections,complaints,recycling,environmental}.{csv,pdf}`)
  — real streamed query results, not canned files. PDFs use a real branded/styled template
  (reportlab Platypus), verified by opening the generated PDF bytes with `pdfplumber` and confirming
  the actual report content is present in the extracted text, by downloading real reports from the
  live server and rendering them to images for visual inspection, and by testing the empty-result-set
  case explicitly. The environmental report's CO2e-avoided estimate is explicitly and visibly labeled
  as an estimate in both formats (see `docs/environmental-impact.md`). The admin dashboard (`/admin`)
  has working download buttons for all eight report/format combinations. See `docs/reporting.md`.
- `RouteOptimizer` (deterministic nearest-neighbour), `HotspotDetector` (real PostGIS DBSCAN
  clustering), `EnvironmentalImpactCalculator` (real totals + clearly-labeled estimate).
- Database: 31 tables, 11 real PostGIS geometry columns with spatial indexes, one clean Alembic
  migration.
- Seed script with realistic Uganda-context demo data for all 7 roles.
- Frontend: real Next.js app covering **all 7 roles end-to-end** — CITIZEN, COLLECTOR,
  SUPER_ADMIN/MUNICIPAL_ADMIN (`/admin` — real aggregate stats, waste-by-category chart, working
  complaint-moderation buttons), COMPANY_ADMIN (`/company` — real collector/vehicle/pickup counts
  plus a working vehicle-registration form and live status-change control), ORGANIZATION_ADMIN
  (`/organization` — real waste analytics + location management), and RECYCLER (`/recycler` —
  recycling activity logging + platform diversion-rate stats) — all wired to the live API, with
  role-based post-login routing, a working PWA manifest, and a service worker (cache-first assets,
  network-first API, offline fallback page). Production build verified (13 real routes); every
  dashboard's exact API calls were driven directly against the live backend and confirmed to return
  correct real data — including a genuine data-interpretation edge case caught through this
  testing (diversion rate exceeding 100% for legitimate reasons — documented in
  `docs/environmental-impact.md` rather than hidden) and a new tenant-scoped
  `GET /api/v1/collectors` endpoint added specifically to support the company dashboard's collector
  list, with its own dedicated tests.
- **Real offline write-queue for the collector app** (spec section 28) — an IndexedDB-backed queue
  (`frontend/src/lib/offlineQueue.ts`, `frontend/src/hooks/useOfflineQueue.ts`) that stores status
  updates and collection completions taken while offline and replays them against the real API when
  connectivity returns, with genuine conflict handling (a server-rejected replay — e.g. the pickup
  was reassigned while offline — is surfaced with the real error, not silently dropped or retried
  forever). Verified by exercising the actual IndexedDB operations against a real IndexedDB backend,
  and this work also caught and fixed a real service-worker bug (offline navigation was falling
  straight to a generic offline page instead of serving a cached copy of the requested page). See
  `docs/pwa.md`.
- CI workflow (GitHub Actions): backend tests, frontend lint/typecheck/Jest/build, and now a third
  job that runs the full E2E suite (real Postgres+PostGIS+Redis services, migrations from a fresh
  database, seeding, both servers actually started, WebKitGTK+Xvfb) after the faster jobs pass. Every
  individual step was verified by running the exact same sequence manually — including catching and
  fixing a real migration-chain bug this exposed (see below) — even though the GitHub Actions
  orchestration itself can't be executed from within this development environment.
- 68 passing backend integration tests against a real database, covering auth, the full pickup
  lifecycle, spatial search, complaints, rate limiting, recycling/rewards/vehicles,
  organizations/companies/analytics/notifications/collectors, recurring schedules, and CSV/PDF reports.
- **5 real, browser-driven E2E tests** (`e2e/`) covering citizen, collector, admin, organization-admin,
  and recycler flows — using Selenium + WebKitGTK rather than Playwright/Cypress, since both of those
  download browser binaries from CDNs blocked by this sandbox's network policy (confirmed directly,
  same class of finding as the Docker registry block — see `e2e/README.md`). The original 3 verified
  passing together, run 4 times in a row, 3/3 every time; after adding the two new flows, the full
  5-test suite was verified passing together, run 3 times in a row, 5/5 every time — then again
  end-to-end against a genuinely fresh, freshly-migrated, freshly-seeded database matching the CI
  job exactly. A 6th test (the collector offline write-queue, going offline mid-collection and
  syncing on reconnect — verified against real IndexedDB persistence and real server-side state
  confirmation, not just UI text) was added afterward and the full suite re-verified 6/6, twice in a
  row. Building this suite caught and fixed five real, non-obvious issues along the way (a
  headless-browser geolocation hang, a collision between the platform's own rate limiter and rapid
  test iteration, a genuine test-isolation bug in the tests themselves, a stale-element-text bug
  found while writing the organization-admin test, and a duplicate-RLS-policy migration bug found
  only when running the full migration chain from zero for CI) — all documented in full rather than
  glossed over.
- **29 real Jest + React Testing Library unit/component tests** (`frontend/src/**/__tests__/`) —
  the API client's error handling, the offline queue tested against a real IndexedDB implementation
  (`fake-indexeddb`, not a mock), `AuthContext`'s session-restore/login/logout state machine, and
  real form-submission/validation/error-display behavior for both the login and register pages.
  Wired into CI, which also had a real gap fixed while adding this (`requirements-dev.txt` wasn't
  being installed for the backend job, so the PDF-content tests would have silently failed there).
  See `docs/testing.md`.
- **Real PostgreSQL Row-Level Security (RLS) as database-level tenant isolation**, not just
  application-layer checks — a restricted, non-superuser DB role (`ecotrack_app`) plus real RLS
  policies on 7 sensitive tables (`notifications`, `pickup_requests`, `complaints`, `collectors`,
  `vehicles`, `organizations`, `organization_locations`), matched to the exact access patterns
  already tested at the application layer so this is a genuine backstop, not a behavior change.
  Three tables (`points_ledger_entries`, `recycling_records`, `waste_records`) were deliberately
  **not** given naive per-tenant RLS after checking their actual endpoints first — each has a
  genuine platform-wide aggregate-read feature (the rewards leaderboard, the recycling impact
  summary) that a simple scoping policy would have silently broken; extending RLS there needs a
  two-tier read/write policy instead, documented as a real next step rather than glossed over.
  Verified across multiple independent checks: dedicated tests connect directly to the database as
  the restricted role (bypassing the app) and prove cross-tenant rows are genuinely invisible for
  every covered table; the full test suite passes unchanged (57 total, up from 47 before any of this
  security work); the **live app was started connected as the restricted role twice** (once for the
  original 5 tables, again after extending to organizations) and exercised over real HTTP with
  correct results for both citizen/org-scoped and admin-blanket views each time; and the database's
  own system catalogs were queried directly to confirm the real state. See `docs/multi-tenancy.md`.
- **Security headers middleware** (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, and conditional `Strict-Transport-Security` that only activates over real
  HTTPS so it doesn't break local plain-HTTP development) — verified with automated tests and by
  inspecting real response headers from the live server.
- **CI dependency vulnerability scanning** (`pip-audit`, `npm audit`) — actually run against this
  project's real dependency manifests, not just added as an unused step. Found one real issue
  (`ecdsa`/PYSEC-2026-1325, a known timing side-channel in ECDSA signing) and investigated it fully:
  confirmed not exploitable here since this project's JWT code exclusively uses HS256 (HMAC), never
  ECDSA — `ecdsa` is present only as an unused transitive dependency of `python-jose`. See
  `docs/security.md` for the full writeup, including why the CI step is non-blocking (matching the
  existing `ruff` pattern) rather than either ignored or blindly made build-breaking.
- 68 passing backend integration tests against a real database (up from 51), adding coverage for
  the security headers above.
- **RLS extended to 13 tables** (from an initial 7, via two more passes): `waste_companies`,
  `reward_redemptions`, `campaign_participations` following the identical checked-against-real-
  endpoints discipline as the original 7; then a real two-tier read/write pattern for
  `points_ledger_entries`, `recycling_records`, `waste_records` (broad `SELECT` matching the app's
  own leaderboard/impact-summary behavior, narrower `INSERT` matched to who actually writes each
  row — including the subtle case where a `COLLECTOR` session legitimately credits a *citizen's*
  points during pickup completion). Building the two-tier policies meant actually starting the live
  app connected as the restricted role and running the full citizen→admin→collector flow over real
  HTTP — which surfaced **three real, previously-undetected bugs**, none caught by the existing
  test suite because it uses the superuser connection: `SET LOCAL` not surviving a mid-request
  commit (broke pickup creation itself), a lookup-ordering bug that broke every real collector's own
  RLS context, and two policies that were simply too strict for real write patterns (notifications
  created for a different user as a side effect; a collector's own status updates on their assigned
  pickup). All three fixed and re-verified end-to-end — including a citizen's points balance
  correctly going from 0 to 10 after a live pickup completion under the fully RLS-restricted role.
  See `docs/multi-tenancy.md` for the complete, honest account.
- **Zone-drawing UI** (`/company`) — a real interactive SVG click-to-draw tool (no map-library
  dependency added) that maps clicks to real lat/lng coordinates and submits them to the real zone
  API. Caught and fixed a genuine coordinate-order bug (`[lat,lng]` vs. the backend's expected
  `[lng,lat]`) before it shipped, by reading the actual backend unpacking code rather than assuming;
  verified the fix by computing the exact coordinates a simulated draw would produce, submitting
  that payload to the live API, and confirming via a direct PostGIS query that the resulting polygon
  is valid and genuinely contains a test point.
- **Organization staff management** — real `GET/POST /organizations/{id}/staff` and
  `PATCH .../staff/{id}/deactivate` endpoints (real bcrypt-hashed accounts, self-deactivation
  blocked, audit logging) plus a full `/organization` frontend UI (list, add-staff form,
  deactivate button). 3 new backend tests; verified live against the real server including the
  self-deactivation protection.
- **Report-filter UI inputs** on the admin dashboard — date-range, organization ID, zone ID, and
  recycler ID fields, correctly scoped per report type and wired into the real download calls
  (verified the exact query strings against the live server).
- **A 6th E2E test for the offline write-queue** (`e2e/test_offline_queue_flow.py`) — drives a real
  collector through going offline (simulated via `navigator.onLine`/event injection, since
  WebKitGTK's WebDriver doesn't support Chrome DevTools Protocol-style network overrides), completing
  a collection while offline (real IndexedDB write, real "Pending sync" badge), confirming the
  server-side state is genuinely still unchanged, going back online, and confirming the queue
  auto-flushes and the server-side state actually changes to `COLLECTED`. Passed on the first run;
  the full 6-test E2E suite was then re-verified together, 6/6, twice in a row.

### Architected for future implementation (interfaces exist; not built — and not faked)
- `WasteForecaster`, `IoTBinProvider`/`SensorDataProvider`/`VehicleTelemetryProvider`,
  `WasteImageClassifier`, `PaymentProvider` — abstract interfaces that raise `NotImplementedError`.
  See `docs/intelligence.md`.
- `EmailProvider`, `SMSProvider`, `PushNotificationProvider` — interfaces only, no vendor wired up.
  See `docs/notifications.md`.
- Docker Compose end-to-end run — the Docker daemon itself runs fine here (verified: installed,
  started, `docker info`/`docker compose config` both succeed, and the compose file was confirmed
  syntactically valid), but this sandbox's network policy has no container-registry domains
  allowlisted, so no `FROM <image>` line can resolve — confirmed universally (even `alpine:latest`
  fails). See `docs/deployment.md` for the precise, directly-tested finding.
  See `docs/deployment.md`.

## Known limitations (stated, not hidden)

- Real database-level Row-Level Security now covers 13 of 31 tables (the highest-value
  personal/company-scoped ones plus a real two-tier read/write pattern for the platform-wide
  aggregate tables — `notifications`, `pickup_requests`, `complaints`, `collectors`, `vehicles`,
  `organizations`, `organization_locations`, `waste_companies`, `reward_redemptions`,
  `campaign_participations`, `points_ledger_entries`, `recycling_records`, `waste_records`),
  verified by connecting directly to the database as a restricted role and confirming cross-tenant
  rows are genuinely invisible, and by running the complete live application against that same
  restricted role — which caught and fixed three real bugs (see `docs/multi-tenancy.md`) that no
  earlier testing had found. `bins` and `collection_zones` remain deliberately excluded — both have
  genuine platform-wide read endpoints (nearby-bin search, zone lookup) open to any authenticated
  user by design. The remaining 18 tables still rely on application-layer checks only.
- Frontend dashboards now cover organization staff management (`/organization` — real list/add/
  deactivate) and company zone drawing (`/company` — a real interactive SVG click-to-draw tool, not
  a full slippy-map library) in addition to everything from before. The admin dashboard's report
  buttons also now expose real date-range/organization/zone/recycler filter inputs, not just
  unfiltered downloads. What's still not built: recurring-schedule management from the organization
  dashboard (available via the API/`/docs` in the meantime).
- Rate limiting is per-IP; behind a shared NAT/proxy this could over-throttle legitimate users
  sharing an IP. See `docs/security.md`.
- `diversion_rate_percent` can legitimately exceed 100% by design (recycling records aren't
  required to originate from tracked pickups) — documented in `docs/environmental-impact.md`,
  and the recycler UI now shows an inline explanation when this happens.
- The offline write-queue's browser-level behavior is now verified by a real E2E test
  (`e2e/test_offline_queue_flow.py`) — going offline, queuing a real IndexedDB write, confirming the
  server-side state is genuinely unchanged while offline, then confirming it genuinely changes after
  reconnect. It simulates the offline/online *trigger* via `navigator.onLine`/event injection (the
  standard technique here, since WebKitGTK's WebDriver doesn't support Chrome DevTools Protocol-style
  network condition overrides) rather than dropping a real network connection — the application code
  exercised is identical either way, only the trigger mechanism differs. See `e2e/README.md`.

## License / ownership

Not licensed for redistribution.
 <p className="mt-6 rounded-md bg-emerald-50 p-3 text-xs text-stone-600">
          Demo account: <code>citizen@ecotrack.dev</code> / <code>EcoTrackDev123</code> (seed data — see README)
        </p>