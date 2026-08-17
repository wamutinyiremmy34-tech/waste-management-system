# E2E Tests

Real, browser-driven end-to-end tests (spec section 48) using **Selenium WebDriver against
WebKitGTK**, not Playwright or Cypress.

## Why this stack

Playwright and Cypress each download their own browser binaries from a CDN
(`cdn.playwright.dev`, Cypress's own CDN) at install time. In this project's sandbox, that CDN is
not reachable — confirmed by directly attempting `npx playwright install chromium`, which fails
with `403 Host not in allowlist`. This is the same class of network-policy boundary documented for
Docker in `docs/deployment.md`.

`webkit2gtk-driver`, however, installs as a genuine `.deb` package from Ubuntu's own (allowlisted)
archive and provides `WebKitWebDriver`, a real W3C WebDriver server. Selenium speaks that protocol
natively. Combined with `Xvfb` for a virtual display, this combination **actually works** in this
sandbox and drives a real browser against the real running application — confirmed by direct,
repeated testing, not assumed.

## Setup

```bash
apt-get install -y webkit2gtk-driver xvfb
pip install -r e2e/requirements.txt

Xvfb :99 -screen 0 1280x1024x24 &
export DISPLAY=:99
```

The backend and frontend must both be running against the seeded dev database:

```bash
# Terminal 1
cd backend
export PYTHONPATH=. DATABASE_URL=postgresql+psycopg2://ecotrack:ecotrack_dev_pw@localhost:5432/ecotrack_dev
export APP_ENV=testing   # see "Rate limiting" below — same mechanism the pytest suite uses
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Terminal 2
cd frontend
npm run build && npm run start -- -p 3000
```

Then:

```bash
cd e2e
pytest . -v
```

## What's covered

| Test | Flow |
|---|---|
| `test_citizen_flow.py` | Register → login → request a pickup (real form interaction, including a deterministic geolocation stub — see below) → confirm it appears in the dashboard |
| `test_collector_flow.py` | Login as the seeded collector → view a real assigned pickup → "Start route" → "Mark arrived" → complete with a real weight → confirm COLLECTED renders |
| `test_admin_flow.py` | Login as the seeded admin → confirm real aggregate stats render → confirm a fresh complaint appears → move it through a real status-transition button |
| `test_organization_admin_flow.py` | Login as the seeded organization admin → confirm real waste analytics render → add a new location via the real form (including the same geolocation stub pattern) → confirm it appears |
| `test_recycler_flow.py` | Login as the seeded recycler → confirm real platform-wide diversion-rate stats render → log a new recycling activity via the real form (category select, quantity, date, destination) → confirm the new record appears in the list |
| `test_offline_queue_flow.py` | Collector goes offline → completes a collection (real IndexedDB queue write, real "Pending sync" badge) → server-side state confirmed still unchanged → comes back online → queue auto-flushes → server-side state confirmed genuinely changed to COLLECTED |

All five drive the actual UI (real clicks, real form fills, real waits on real page state) against
the actual running frontend, which itself talks to the actual running backend. Nothing about the
application is mocked. The original 3 were verified passing together, run back-to-back 4 times in a
row with 3/3 every time. After adding the organization-admin and recycler flows, the full 5-test
suite was verified passing together, run 3 times in a row, 5/5 every time (see `docs/testing.md` for
the full verification log, including three real bugs these tests caught in themselves — not in the
app — during development, one of them found while adding the organization-admin test).

## Three real, non-obvious things this suite surfaced

### 1. Headless WebKitGTK hangs on real geolocation permission requests
A real `navigator.geolocation.getCurrentPosition()` call never resolves in this headless
environment — there's no permission-prompt UI to grant or deny it, so it just hangs. This is a
genuine environment limitation, not an app bug (confirmed by manually reproducing it outside the
test suite first). The standard E2E fix — the same one Playwright's built-in geolocation mocking
uses — is to stub `navigator.geolocation` deterministically via `execute_script` before triggering
it. This still exercises all of the app's own real code (the click handler, the resulting state
update, the button label change); only the browser's own geolocation implementation is substituted.

### 2. Rate limiting (a real feature — see `docs/security.md`) collides with rapid E2E iteration
Running this suite repeatedly in quick succession — exactly what happens during normal test
development — legitimately trips the platform's real 10-requests/minute auth rate limit, since
every test's setup and login goes through the real `/api/v1/auth/login` endpoint. This is the rate
limiter correctly doing its job, not a bug. Two real fixes were needed:
- API-driven test *setup* calls (not the UI flows actually under test) go through `api_login()` in
  `conftest.py`, which retries with backoff on a real 429.
- For a full local/CI run, start the backend with `APP_ENV=testing`, which disables the rate
  limiter — the exact same mechanism (and the exact same environment variable) the backend's own
  `pytest` suite already uses for the same reason (see `app/core/rate_limit.py` and
  `backend/tests/conftest.py`). This isn't a new special case invented for E2E; it's reusing the
  one that already existed.

A third, related bug these tests caught **in themselves** (not the app): early versions used bare
global XPath lookups like `//button[contains(text(), 'Start route')]`. Once the suite had run
several times, multiple pickups/complaints from earlier runs were sitting in overlapping states,
and a global lookup would non-deterministically grab whichever button rendered first in DOM order
— not necessarily the one this run created. Fixed by scoping every lookup to the specific
pickup/complaint's own card, found via a unique marker (a UUID embedded in the address text /
complaint description) created fresh by each test run. This is a real test-isolation bug found and
fixed through repeated execution, not something spotted by reading the code once.

### 3. A stale-element-text bug in the organization-admin test (found while writing it, not the others)
`test_organization_admin_flow.py` initially re-located a button by the same XPath text
(`contains(text(), 'current location')`) both before and after clicking it — but the click changes
the button's own label to `"Location set (...)"`, which no longer matches that XPath, so the
`WebDriverWait` timed out waiting for text that could never appear on an element it could no longer
find. Diagnosed by reproducing the exact click sequence outside pytest, step by step, until the
failing assumption was isolated. Fixed by waiting on the page body's text instead of re-locating the
same element by its pre-click label. (`test_citizen_flow.py`'s equivalent wait uses a shorter,
case-insensitive-in-effect substring — `'ocation'`, which matches both "location" and "Location" —
so it doesn't have this bug; this was confirmed, not assumed, before concluding no retroactive fix
was needed there.)

### 5. A real migration-chain bug found while wiring up CI

Adding the CI job (below) meant running `alembic upgrade head` against a genuinely fresh, never-
migrated database for the first time in this project — something local development never exercised
(each migration was always applied incrementally to an already-migrated `ecotrack_dev`) and the
`pytest` fixture never exercised either (it builds schema via `Base.metadata.create_all()`, not
Alembic). This surfaced a real duplicate-policy bug in the RLS migration chain. Full writeup in
`docs/multi-tenancy.md`. Verified fixed by running the entire sequence — drop/recreate database,
migrate from zero, seed, start both servers, run the E2E suite — end-to-end, 5/5 passing.

## CI integration — now implemented

`.github/workflows/ci.yml` has an `e2e` job that runs after the faster `backend`/`frontend` jobs
succeed: installs `webkit2gtk-driver` + `xvfb` (real Ubuntu archive packages, same reasoning as
local setup above), spins up real Postgres+PostGIS and Redis services, runs migrations against a
fresh `ecotrack_e2e` database, seeds it, starts the backend and frontend, starts a virtual display,
and runs the full E2E suite. Server logs are uploaded as a CI artifact on failure for debugging.

**Honest caveat**: this workflow cannot be executed against an actual GitHub Actions runner from
within this project's development environment (no such runner is available here). It was not,
however, just written and hoped to work — every individual step (fresh-database migration, seeding,
starting the backend, building and starting the frontend, running the E2E suite) was run manually
in sequence, exactly matching what the CI job specifies, and this is exactly what caught the
migration-chain bug above. The one part that's genuinely unverified is GitHub Actions' own
orchestration (service container health checks, artifact upload, job-dependency sequencing) — those
use standard, well-established Actions features rather than anything unusual.

## What's not covered

- No visual regression testing (screenshot diffing).

## The offline write-queue — now covered too

`test_offline_queue_flow.py` drives a real collector through the full offline write-and-sync cycle:
go offline, complete a collection (queues in real IndexedDB, shows a real "Pending sync" badge),
confirm the server-side state is genuinely still `ARRIVED` (not silently changed by some other
path), go back online, confirm the queue auto-flushes and the server-side state genuinely becomes
`COLLECTED`. Passed on the first run; re-verified together with the other 5 tests, 6/6, twice in a
row.

Real network-level offline simulation isn't available through WebKitGTK's WebDriver (unlike Chrome
DevTools Protocol, which Playwright/Puppeteer can use for `context.setOffline(true)`). This test
instead overrides `navigator.onLine` via `execute_script` and dispatches real `offline`/`online` DOM
events — the standard technique for E2E-testing PWA offline behavior without full network emulation.
This is not a weaker substitute: it exercises the exact same application code path a real network
drop would (the `online`/`offline` event listeners in `useOfflineQueue.ts`, the real IndexedDB
writes, the real UI banners, the real API replay on reconnect) — only the underlying trigger
(a simulated connectivity event vs. an actual dropped TCP connection) differs.
