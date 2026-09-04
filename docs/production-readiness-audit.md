# EcoTrack — Production Readiness Audit

**Date:** 2026-09-04  
**Auditor:** Kiro (automated code review + manual inspection)  
**Scope:** Full codebase audit prior to Uganda pilot  
**Version:** EcoTrack MVP — post-context-gatherer verified state

---

## Summary

EcoTrack is a genuinely working MVP with a strong security architecture, comprehensive test coverage,
and production-grade data modeling. The codebase is honest about what is and isn't implemented, and the
existing documentation accurately reflects the real state. The number of CRITICAL or HIGH findings is low
and specific — most issues are configuration hardening, missing validation, or observability gaps, not
fundamental design flaws.

**Overall assessment: PILOT READY after fixing the items marked CRITICAL and HIGH below.**

---

## Findings by Severity

### CRITICAL

---

#### C-1 · `DEBUG=True` default in config — can ship to production

**File:** `backend/app/core/config.py`  
**Problem:** `DEBUG: bool = True` is the default value. If the production environment omits this variable,
FastAPI/Starlette can expose stack traces in HTTP error responses. The `.env.example` also sets
`DEBUG=true`, reinforcing this default.  
**Impact:** Sensitive internal implementation details (file paths, database queries, stack frames)
may be exposed to end users/attackers.  
**Fix:** Set `DEBUG: bool = False` as the default. Require explicit opt-in for debug mode. Update
`.env.example` to comment out / default-off.  
**Fix in this phase:** YES

---

#### C-2 · `SECRET_KEY` insecure default can silently reach production

**File:** `backend/app/core/config.py`, `backend/.env.example`  
**Problem:** `SECRET_KEY` defaults to `"CHANGE_ME_INSECURE_DEV_ONLY_SECRET_KEY"`. While labeled
insecure, there is no runtime enforcement that prevents the application from starting with this value
in a non-development environment. A production deployment that forgets to set it will silently issue
JWTs signed with the public, well-known default key.  
**Impact:** An attacker who knows the default can forge JWT access tokens for any user ID and role,
bypassing all authentication and RBAC.  
**Fix:** Add a startup validation that raises on boot if `APP_ENV != "development"` and `SECRET_KEY`
equals the insecure default.  
**Fix in this phase:** YES

---

#### C-3 · CORS allows all origins in Docker Compose (`allow_origins` from env not set)

**File:** `docker-compose.yml`, `backend/app/core/config.py`  
**Problem:** The Docker Compose `backend` service does not set `CORS_ORIGINS`. The config default
is `["http://localhost:3000"]`, which is a development-only value. In Docker, the frontend is served
at the same `localhost:3000`, so this effectively works for development — but the pattern of relying
on a default that was designed for local dev is fragile. More critically, `allow_methods=["*"]` and
`allow_headers=["*"]` are unconditional — not gated on environment — meaning a production deployment
exposed to the internet accepts any HTTP method and any request header from the listed origins.  
**Impact:** If CORS_ORIGINS is misconfigured or wildcarded in production, arbitrary origins can call
the API with full CORS credentials.  
**Fix:** Tighten `allow_methods` and `allow_headers` to only what the API actually needs. Document
the required production CORS_ORIGINS value explicitly.  
**Fix in this phase:** YES (tighten allow_methods/headers)

---

#### C-4 · `SEED_ON_START=true` hardcoded in docker-compose backend service

**File:** `docker-compose.yml`  
**Problem:** `SEED_ON_START: "true"` is hardcoded in the `environment:` block of the backend
service. This means every `docker compose up` (including a production-like deploy from this file)
runs `seed.py`, which overwrites or duplicates demo users with predictable credentials.  
**Impact:** In a production deployment using this compose file, a `super_admin@ecotrack.ug` user
with password `SuperAdmin123!` (or whatever the seed uses) is created/re-created on every restart.  
**Fix:** Remove `SEED_ON_START: "true"` from the hardcoded `environment:` block. Keep it as an
opt-in via the `.env` file only. Provide a separate `docker-compose.dev.yml` or document the
explicit seed command.  
**Fix in this phase:** YES

---

### HIGH

---

#### H-1 · No structured logging — cannot diagnose production incidents

**File:** All service and API modules  
**Problem:** The application uses no structured logging at all. There are no `import logging`
statements in any service module. Errors are only visible if uvicorn/Python crashes with an
unhandled exception. Failed pickups, scheduler errors, Redis failures, auth failures, and unexpected
exceptions are all silent.  
**Impact:** In production, operators have no way to diagnose why pickups are failing, why the
scheduler is not materializing schedules, or whether authentication attacks are happening.  
**Fix:** Add a structured logging configuration (stdlib `logging`, JSON formatter for production).
Log auth failures, authorization failures, scheduler runs, Redis errors, and unexpected exceptions
with contextual user_id, endpoint, and error details. Do NOT log passwords, JWT values, or PII.  
**Fix in this phase:** YES

---

#### H-2 · No request-level exception handler — 500s expose stack traces

**File:** `backend/app/main.py`  
**Problem:** FastAPI's default unhandled-exception behavior returns the Python exception string
in `{"detail": "Internal Server Error"}`. With `DEBUG=True` (see C-1), this includes the full
traceback. Even with DEBUG=False, unhandled exceptions are not logged, making them invisible to
operators.  
**Impact:** Any unexpected exception (e.g. a missing PostGIS extension, a corrupted DB row, an
unhandled edge case) produces a logged-nowhere silent failure from the operator's perspective.  
**Fix:** Add a global exception handler in `main.py` that logs unexpected exceptions with a
correlation ID and returns a safe `500` JSON response.  
**Fix in this phase:** YES

---

#### H-3 · `AuthContext` logout does not call the backend `/auth/logout` endpoint

**File:** `frontend/src/context/AuthContext.tsx`  
**Problem:** The `logout()` function only removes tokens from `localStorage`. It never calls
`POST /api/v1/auth/logout` to revoke the refresh token server-side. If an attacker steals the
refresh token (from localStorage, XSS, etc.), they can continue issuing new access tokens
indefinitely even after the user logs out.  
**Impact:** Refresh token revocation is a documented security feature that the frontend silently
never uses. Logout does not actually end the session from a security standpoint.  
**Fix:** Call `api.logout(refreshToken)` before clearing localStorage in the logout function.  
**Fix in this phase:** YES

---

#### H-4 · Frontend stores refresh token in localStorage — accessible to JavaScript

**File:** `frontend/src/context/AuthContext.tsx`  
**Problem:** `localStorage.setItem("ecotrack_refresh_token", tokens.refresh_token)` stores the
long-lived (14-day) refresh token in `localStorage`, where it is accessible to any JavaScript
running on the page (including injected scripts via any future XSS vulnerability).  
**Impact:** Any XSS attack can exfiltrate the refresh token and create persistent sessions.  
**Severity note:** This is a known web security tradeoff in SPAs. Since the app has no XSS vectors
currently and no `dangerouslySetInnerHTML` use, the practical risk is limited — but it should be
documented and the token should only be used as intended (the `/auth/refresh` call).  
**Fix (pragmatic for MVP):** Document the risk. Ensure the refresh token is used only in the
`/auth/refresh` call and never sent to any third-party service. Add a note in `security.md`.  
**Fix in this phase:** YES (documentation + ensure usage is correct)

---

#### H-5 · `pickup_service._authorize_pickup_access` has a broken code path for COLLECTOR

**File:** `backend/app/services/pickup_service.py`  
**Problem:** In `_authorize_pickup_access`, the COLLECTOR branch calls `db_get_collector_for_user(current_user)`
which uses `object_session(user)`. If the user's SQLAlchemy session has been detached or the
session state is unexpected, this silently returns `None`, and the function falls through to the
`raise HTTPException(404)` — denying the collector access to their own assigned pickup.  
**Impact:** Collectors may intermittently get 404 on their own pickups, causing silent operational
failures.  
**Fix:** The existing `pickup_service.py` already queries the collector in `list_assigned_pickups`
and `update_pickup_status` using `db.query(Collector)`. Standardize `_authorize_pickup_access` to
accept `db` as a parameter and use a consistent query, eliminating the fragile `object_session` call.  
**Fix in this phase:** YES

---

#### H-6 · Password reset flow: `PasswordResetToken` model exists but has no API endpoint

**File:** `backend/app/models/user.py`, `backend/app/api/v1/auth.py`  
**Problem:** The `PasswordResetToken` model is defined in the schema and migrated, but there are
no API endpoints for initiating or completing a password reset. The `add_staff` endpoint generates
a temp password and notes "the caller is expected to trigger a real password-reset flow" — but the
flow does not exist.  
**Impact:** There is no way for users or new staff members to reset their passwords. This is an
operational blocker for a real pilot where an admin adds staff members.  
**Fix:** Implement `POST /auth/password-reset/request` and `POST /auth/password-reset/confirm`
endpoints. For pilot (no email): the token is returned in the API response so an admin can
manually communicate it. Document clearly that email delivery is not wired.  
**Fix in this phase:** YES (minimal functional endpoints, no email required)

---

#### H-7 · `ecotrack_app` restricted DB role password is hardcoded in `rls.py`

**File:** `backend/app/core/rls.py`  
**Problem:** The RLS migration creates the restricted role with `PASSWORD 'ecotrack_app_dev_pw'`
hardcoded in the DDL. There is no way to configure this password without editing the source code.  
**Impact:** In production, the RLS-enforcing DB role uses a publicly-known password from the
repository. Connecting directly to the DB with this role bypasses application-layer checks.  
**Fix:** The password in `rls.py` is `ecotrack_app_dev_pw` — clearly marked dev. Document in
`.env.example` that operators should `ALTER ROLE ecotrack_app PASSWORD '...'` after running
migrations in production. Add to the pilot runbook.  
**Fix in this phase:** YES (documentation)

---

### MEDIUM

---

#### M-1 · No `Content-Security-Policy` header

**File:** `backend/app/core/security_headers.py`  
**Problem:** Security headers include `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
and `Permissions-Policy`, but no `Content-Security-Policy`. For a pure JSON API this is less critical,
but if the Swagger UI (`/docs`) is accessible in production, it can be a reflected-XSS vector.  
**Fix:** Disable `/docs` and `/redoc` in production (`APP_ENV=production`), or add a restrictive CSP.  
**Fix in this phase:** YES (disable docs in production)

---

#### M-2 · Swagger/ReDoc UI accessible in all environments

**File:** `backend/app/main.py`  
**Problem:** `FastAPI(docs_url="/docs", redoc_url="/redoc")` exposes the full interactive API
documentation at public URLs in all environments, including production. This reveals the complete
API surface and allows unauthenticated users to enumerate all endpoints.  
**Fix:** Set `docs_url=None, redoc_url=None` when `APP_ENV == "production"`.  
**Fix in this phase:** YES

---

#### M-3 · Redis failure closes the entire connection silently in scheduler

**File:** `backend/app/services/scheduler_service.py`, `backend/scripts/run_scheduler.py`  
**Problem:** The scheduler has no logging and no error handling around the DB operations. If a
database transaction fails mid-run (e.g. a PostGIS geometry issue), the scheduler silently fails
and `next_run_date` is not advanced — but some pickups may have already been created.  
**Fix:** Add try/except per-schedule with rollback and logging. Advance `next_run_date` even on
partial failure to prevent duplicate pickup creation on retry.  
**Fix in this phase:** YES

---

#### M-4 · `docker-compose.yml` backend health check only partially validates

**File:** `docker-compose.yml`  
**Problem:** The Dockerfile `HEALTHCHECK` calls `GET /api/v1/health` which checks DB and Redis.
However, the compose `depends_on: condition: service_healthy` only waits for the DB and Redis
services to be healthy — it does not wait for the backend health check to pass before starting
dependent services. The frontend starts as soon as the backend container starts, not when it is
ready.  
**Fix:** This is intentional (frontend has no health check `depends_on` for backend) — document
the startup sequencing clearly. Alternatively, add a backend health check dependency to frontend.  
**Fix in this phase:** YES (documentation + add depends_on for frontend)

---

#### M-5 · No index on `pickup_requests.assigned_collector_id`

**File:** `backend/migrations/versions/453f4faf0ef0_initial_schema.py`  
**Problem:** `list_assigned_pickups` filters by `assigned_collector_id` on every collector page
load. The initial migration creates indexes on `requester_user_id`, `organization_id`, `status`,
and `waste_company_id`, but not `assigned_collector_id`.  
**Impact:** As the pickups table grows, every collector dashboard load does a full table scan.  
**Fix:** Add a migration that creates `ix_pickup_requests_assigned_collector_id`.  
**Fix in this phase:** YES

---

#### M-6 · `useOfflineQueue` duplicate submission risk on fast reconnect

**File:** `frontend/src/hooks/useOfflineQueue.ts`  
**Problem:** When the device goes online, `flush()` is triggered by the `online` event listener AND
by the `useEffect` watching `[isOnline, token, pending.length]`. Both can trigger near-simultaneously,
potentially starting two concurrent flush operations despite the `syncing` guard.  
**Problem 2:** `queueOrSend` checks `navigator.onLine` directly, which can be `true` even during
intermittent connectivity — an action can be sent online, appear to fail (network timeout), and then
also be queued, resulting in duplicate server calls on reconnect.  
**Fix:** The `syncing` guard already prevents concurrent flushes. The duplicate-send risk on flaky
connections needs documentation and the existing `ApiError` catch behavior is correct (only network
errors, not 4xx, fall through to queue). Document the behavior; add a note that 5xx responses
are not retried as duplicates (server rejects the duplicate state transition via the state machine).  
**Fix in this phase:** YES (documentation + guard verification)

---

#### M-7 · Frontend error handling uses `window.prompt()` for failure reason

**File:** `frontend/src/app/collector/page.tsx`  
**Problem:** `reportFailure()` uses `window.prompt()` to collect the failure reason. `window.prompt`
is blocking, has inconsistent behavior across mobile browsers, and is inaccessible (screen readers,
keyboard navigation cannot interact with it reliably).  
**Fix:** Replace with an inline input form, consistent with the existing completion form pattern.  
**Fix in this phase:** YES

---

#### M-8 · `collections` table `collector_id` FK allows SET NULL but column is NOT NULL in model

**File:** `backend/migrations/versions/453f4faf0ef0_initial_schema.py`  
**Problem:** `collections.collector_id` FK has `ondelete="SET NULL"` but the SQLAlchemy model
declares `nullable=False`. If a Collector is deleted, the FK would attempt to SET NULL but the NOT
NULL constraint would cause a DB error. This is a data integrity inconsistency.  
**Fix:** Change the model/migration to either `nullable=True` or change the FK to `ondelete="RESTRICT"`.
`RESTRICT` is safer since you typically want to know if a collector is being deleted who has
collections.  
**Fix in this phase:** YES (migration to fix the constraint)

---

#### M-9 · No pagination on several list endpoints

**File:** `backend/app/api/v1/recycling.py`, `backend/app/api/v1/collectors.py`, `backend/app/api/v1/vehicles.py`  
**Problem:** `list_recycling_records` has a hardcoded `.limit(500)`, `list_collectors` and
`list_vehicles` have no pagination or limits at all. With a large dataset these become unbounded
queries.  
**Fix:** Add consistent pagination (page/page_size query params) matching the existing pattern.
The `.limit(500)` in recycling is a reasonable interim but should be `limit(settings.MAX_PAGE_SIZE)`.  
**Fix in this phase:** MEDIUM priority — document as known limitation for pilot.

---

#### M-10 · `AuthContext` does not handle token expiry / 401 responses automatically

**File:** `frontend/src/context/AuthContext.tsx`, `frontend/src/lib/api.ts`  
**Problem:** When an access token expires, API calls throw `ApiError(401)`. Each page catches
errors differently (or not at all). There is no centralized 401 → auto-refresh → retry mechanism.
A user whose token expires mid-session gets a generic error, not a smooth re-authentication.  
**Fix:** Add a 401 interceptor in the `api.ts` `request()` function that attempts a token refresh
using the stored refresh token. If refresh succeeds, retry the original request. If refresh fails,
call logout.  
**Fix in this phase:** YES

---

### LOW

---

#### L-1 · `requirements.txt` includes test-only packages

**File:** `backend/requirements.txt`  
**Problem:** `pytest`, `pytest-asyncio`, and `httpx` are in `requirements.txt` (production deps)
rather than `requirements-dev.txt`. This adds unnecessary packages to the production Docker image.  
**Fix:** Move test-only packages to `requirements-dev.txt`. Update Dockerfile to only install
`requirements.txt`.  
**Fix in this phase:** YES

---

#### L-2 · Frontend `logout` leaves user on current page briefly before redirect

**File:** `frontend/src/context/AuthContext.tsx`  
**Problem:** `logout()` clears state synchronously but navigation back to `/login` depends on
each page's `useEffect` watching `token`. There is a brief flash of the protected page with no
token before the redirect.  
**Fix:** Add `router.push('/login')` directly inside the logout handler in AuthContext.  
**Fix in this phase:** LOW priority — minor UX issue, acceptable for pilot.

---

#### L-3 · CI lint step is non-blocking (`ruff check ... || true`)

**File:** `.github/workflows/ci.yml`  
**Problem:** Ruff lint failures do not fail the CI build (`|| true`). Type checking (`tsc --noEmit`)
is run for the frontend but not the backend (no mypy step that blocks).  
**Fix:** Remove `|| true` from ruff to make lint blocking. Add `mypy app/` as a non-blocking check
initially to surface type errors.  
**Fix in this phase:** LOW — do not break CI on existing issues; tighten incrementally.

---

#### L-4 · `bin` code uniqueness relies on application-layer check only

**File:** `backend/app/api/v1/bins.py`  
**Problem:** The "bin code already exists" check in `create_bin` does a DB query before insert.
The `bins.code` column has a `UNIQUE` constraint in the migration, so a race condition would
surface as a 500 (IntegrityError) rather than a 409.  
**Fix:** Catch `IntegrityError` and return a 409 in all uniqueness-checking endpoints.  
**Fix in this phase:** YES (add IntegrityError handler to main.py)

---

#### L-5 · Zone polygon injection risk — minimal but present

**File:** `backend/app/api/v1/zones.py`  
**Problem:** Zone boundary is converted to a WKT string via `f"POLYGON(({ring}))"` from validated
floats. Since floats are validated by Pydantic, the actual injection risk is near-zero. However,
the pattern of string-formatting a SQL function argument is worth documenting.  
**Status:** Accepted risk — all inputs are validated `float` values, not user strings.  
**Fix in this phase:** DOCUMENTATION ONLY

---

#### L-6 · `annotated-doc==0.0.5` in requirements.txt appears unused

**File:** `backend/requirements.txt`  
**Problem:** `annotated-doc` is not imported anywhere in the codebase. It appears to be an
accidental/leftover dependency.  
**Fix:** Remove from `requirements.txt`.  
**Fix in this phase:** YES

---

#### L-7 · No `robots.txt` or security.txt

**Files:** `frontend/public/`  
**Problem:** No `robots.txt` to prevent search engine indexing of the app. No `security.txt`
for responsible disclosure.  
**Fix:** Add `public/robots.txt` with `Disallow: /` (this is a private operational app, not a
public website). Add `public/.well-known/security.txt`.  
**Fix in this phase:** YES

---

### FUTURE

---

#### F-1 · Email/SMS/Push notification channels not implemented

The interfaces exist in `notifications/providers.py`. No external channel is wired. Documented
honestly. Acceptable for pilot — in-app notifications work.

#### F-2 · S3 storage backend not implemented

`STORAGE_BACKEND=s3` is documented as a future option. Only `local` works. Documented. Acceptable
for pilot — local storage works if the backend volume is persisted.

#### F-3 · `WasteForecaster`, IoT, computer vision, payment interfaces

All noted as Phase 2/3 in `future_interfaces.py`. Not needed for pilot.

#### F-4 · Per-user rate limiting (not just per-IP)

Documented as a known gap in `security.md`. Acceptable for pilot.

#### F-5 · `CUSTOM` recurrence frequency handling in scheduler

Enum value exists, scheduler falls back to 7-day interval. Document the gap.

#### F-6 · Leaderboard exposes user full names (privacy consideration)

`GET /rewards/leaderboard` returns `full_name` for all top-20 users. This is a deliberate design
choice but worth revisiting before public launch (anonymize or use display name).

#### F-7 · Refresh token family detection (stolen token detection)

Refresh token rotation is implemented and revocation works. The next level — detecting a stolen
token by revoking the entire family when a revoked token is reused — is not implemented. Acceptable
for pilot.

#### F-8 · Database backup automation

PostgreSQL backups are not automated. Documented in `backup-and-recovery.md` as manual. Acceptable
for a supervised pilot with explicit backup instructions.

---

## RLS Table Coverage Decision Matrix

| Table | RLS | Rationale |
|---|---|---|
| `notifications` | ✅ | Personal data — SELECT restricted to own rows |
| `pickup_requests` | ✅ | Personal + tenant data — restricted by user/collector/company |
| `complaints` | ✅ | Personal data — restricted to reporter or admin roles |
| `collectors` | ✅ | Company-scoped — restricted by waste_company_id |
| `vehicles` | ✅ | Company-scoped — restricted by waste_company_id |
| `organizations` | ✅ | Tenant data — restricted by org_id or admin roles |
| `organization_locations` | ✅ | Tenant data — restricted by org_id or admin roles |
| `waste_companies` | ✅ | Tenant data — restricted by company_id or admin roles |
| `reward_redemptions` | ✅ | Personal data — restricted to own user |
| `campaign_participations` | ✅ | Personal data — restricted to own user |
| `points_ledger_entries` | ✅ | Broad SELECT (leaderboard), narrow INSERT |
| `recycling_records` | ✅ | Broad SELECT (impact), narrow INSERT by recycler |
| `waste_records` | ✅ | Broad SELECT (impact), narrow INSERT by company |
| `users` | ❌ INTENTIONAL | No row-level endpoint to list "all users" for non-admin. App-layer checks enforce visibility. Admin endpoints are SUPER_ADMIN only. Adding RLS here would break `/auth/me` (which queries by PK — trivially safe) — not worth the complexity. |
| `bins` | ❌ INTENTIONAL | Platform-wide read endpoint (nearby search). Any authenticated user can see bins. No secret data. |
| `collection_zones` | ❌ INTENTIONAL | Platform-wide read (zone lookup for all users). No secret data. |
| `collections` | ❌ INTENTIONAL | Read access already gated via pickup_requests RLS + app checks. Adding independent RLS would require a join policy. App-layer is sufficient. |
| `waste_records` | ✅ | See above |
| `recycling_partners` | ❌ INTENTIONAL | Public lookup data — who recycles what. No personal data. |
| `refresh_tokens` | ❌ INTENTIONAL | Never queried via authenticated app sessions — only via internal service methods by token hash. |
| `password_reset_tokens` | ❌ INTENTIONAL | Same as refresh_tokens — internal only. |
| `audit_logs` | ❌ INTENTIONAL | Write-only from app perspective (no audit log read API except SUPER_ADMIN). RLS complexity not worth it. |
| `notification_preferences` | ❌ LOW RISK | Only the user's own preferences are ever accessed. App-layer filters by user_id. |
| `file_assets` | ❌ LOW RISK | Storage keys are UUIDs — not guessable. App-layer enforces ownership on file access endpoints. |
| `complaint_attachments` | ❌ LOW RISK | Inherits complaint ownership via FK. App layer checks complaint ownership first. |
| `reward_rules` | ❌ INTENTIONAL | Platform-wide read (catalog). No secret data. |
| `rewards` | ❌ INTENTIONAL | Platform-wide read (catalog). No secret data. |
| `campaigns` | ❌ INTENTIONAL | Platform-wide read. No secret data. |
| `vehicle_maintenance_records` | ❌ LOW RISK | Company-scoped via vehicle FK. App-layer enforces company scope. |
| `recurring_schedules` | ❌ LOW RISK | App-layer restricts to `requester_user_id`. Adding RLS here follows the same pattern as pickup_requests — reasonable future addition. |

---

## Issues Fixed in This Phase

The following CRITICAL and HIGH findings are fixed in the implementation that follows this audit:

- **C-1:** Set `DEBUG=False` as default
- **C-2:** Startup validation for insecure SECRET_KEY in production
- **C-3:** Tighten CORS `allow_methods`/`allow_headers`
- **C-4:** Remove `SEED_ON_START=true` from compose hardcoded environment
- **H-1:** Add structured logging to backend
- **H-2:** Add global exception handler to main.py
- **H-3:** Fix frontend logout to call backend revocation endpoint
- **H-5:** Fix `_authorize_pickup_access` fragile collector lookup
- **H-6:** Implement minimal password reset endpoints
- **M-1/M-2:** Disable Swagger UI docs in production
- **M-5:** Add migration for `assigned_collector_id` index
- **M-7:** Replace `window.prompt()` with inline failure form
- **M-8:** Fix `collections.collector_id` FK/nullable inconsistency
- **M-10:** Add 401 auto-refresh interceptor in frontend API client
- **L-1:** Move test deps to requirements-dev.txt
- **L-4:** Add IntegrityError handler to main.py
- **L-6:** Remove unused `annotated-doc` dependency
- **L-7:** Add robots.txt and security.txt
- **H-7, H-4:** Documentation added to security.md and pilot runbook
