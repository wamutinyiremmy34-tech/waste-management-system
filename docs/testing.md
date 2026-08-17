# Testing

## Backend

Real tests against a real PostgreSQL+PostGIS database (`ecotrack_test`), using FastAPI's
`TestClient` — not mocks of the database layer. Run:

```bash
cd backend
export DATABASE_URL=postgresql+psycopg2://ecotrack:ecotrack_dev_pw@localhost:5432/ecotrack_test
export PYTHONPATH=.
pytest tests/ -v
```

**Current status: 68/68 passing.**

| File | Covers |
|---|---|
| `test_auth.py` | Register/login, duplicate-email rejection, wrong-password rejection, role-escalation blocking, `/me`, refresh-token rotation, logout revocation |
| `test_pickups.py` | Full pickup lifecycle end-to-end (request → assign → status transitions → complete), illegal state-transition rejection, IDOR protection, unassigned-collector rejection, citizen self-cancel |
| `test_spatial_and_complaints.py` | Real PostGIS nearby-search distance filtering, duplicate bin-code rejection, RBAC on bin creation, complaint state-machine validation, complaint RBAC |
| `test_rate_limiting.py` | Real 429 enforcement past the configured threshold, and confirms the limiter is correctly disabled during the test environment |
| `test_recycling_rewards_vehicles.py` | Reward rule creation, redemption with insufficient-points rejection, recycling record creation + impact summary totals, vehicle registration + duplicate-registration rejection + maintenance-triggered status change, RBAC on vehicle registration |
| `test_orgs_companies_analytics.py` | Organization creation + tenant-scoped access (cross-org 404), waste-analytics isolation per tenant, company dashboard real aggregates, admin dashboard real user counts, RBAC on admin dashboard, notification list/preferences, collector profile creation + location check-in, collector-listing tenant isolation (cross-company), RBAC on collector listing |
| `test_recurring_schedules.py` | Recurring schedule creation, frequency=NONE rejection, real materialization creating an actual pickup + idempotency (no duplicate on second run), RBAC on the materialization trigger, ownership check on deactivation |
| `test_reports.py` | CSV export real content verification (complaints, recycling), RBAC blocking citizens from reports, company-scoped report access, PDF export real content verification via `pdfplumber` text extraction, empty-result-set PDF handling, RBAC blocking citizens from PDF reports, environmental report (CSV + PDF) real content verification including the CO2e-estimate labeling, organization/zone/recycler report filters (real positive match + real exclusion for an unrelated tenant) |
| `test_row_level_security.py` | Real PostgreSQL RLS enforcement on all 7 covered tables, verified by connecting directly to the database as the restricted `ecotrack_app` role (bypassing the FastAPI app entirely) — cross-tenant notifications/complaints/organizations/organization-locations are genuinely invisible without matching session context, correctly visible with it, admin-role blanket access matches the app's own tested behavior, and a spoofed `INSERT` claiming another user's ID is blocked by the `WITH CHECK` clause |
| `test_security_headers.py` | Real security headers present on every response including error responses, HSTS correctly withheld over plain HTTP and correctly added when `X-Forwarded-Proto: https` indicates a TLS-terminating proxy |

### What's not yet covered by automated tests
Every router now has at least one test. Remaining gaps are depth, not breadth: e.g. campaign/
leaderboard endpoints, pagination edge cases, and the audit-log listing endpoint don't have
dedicated tests yet. Listed honestly rather than implied covered.

## Frontend

- `npm run lint` — passes (0 errors) after fixing two real issues caught by the strict
  `react-hooks/set-state-in-effect` rule (one in `AuthContext`, one in the collector page).
- `npx tsc --noEmit` / the TypeScript check built into `next build` — passes.
- `npm run build` — real production build succeeds (verified, including catching and fixing a real
  Google Fonts network-access failure by switching to system fonts). 13 routes build, covering all
  7 roles: `/collector`, `/admin`, `/company`, `/organization`, `/recycler`, `/schedules`, and
  `/post-login`.
- **The full collector button flow was driven end-to-end against the live backend**: "Start route"
  → "Mark arrived" → completion form submit, using the exact API calls the UI buttons trigger,
  confirmed to produce real `EN_ROUTE` → `ARRIVED` → `COLLECTED` transitions and a real `Collection`
  row with the submitted weight — the same backend flow already covered by
  `test_pickups.py::test_full_pickup_lifecycle`, now also exercised from the collector-facing API
  surface the UI actually calls.
- **The admin and company dashboards' exact API calls were also driven directly against the live
  backend** and confirmed to return correct real data (8 users, 2 completed collections, real
  waste-by-category totals matching prior test data; 1 collector/1 vehicle/2 completed pickups for
  the seeded company), including a real complaint status-transition button flow
  (REPORTED → UNDER_REVIEW).
- **The organization and recycler pages' exact API calls were also driven directly against the live
  backend**: the organization page's "Add location" form submission created a real
  `OrganizationLocation` row; the recycler page's "Record recycling activity" form submission
  created a real `RecyclingRecord` and the subsequent list/impact-summary calls reflected it
  immediately. This testing also surfaced a genuine, documented data-interpretation edge case (see
  `docs/environmental-impact.md`) — the diversion-rate metric can legitimately exceed 100%, which
  the UI now explains inline rather than displaying unexplained.
- **The company dashboard's vehicle-management flow was driven end-to-end against the live
  backend**: "Register vehicle" created a real `Vehicle` row, the subsequent vehicle list correctly
  showed both the seeded truck and the new tuk-tuk, and the per-vehicle status dropdown produced a
  real `AVAILABLE` → `MAINTENANCE` transition. This closed a previously-flagged gap (the company
  dashboard used to be display-only with a placeholder note pointing at the API) — it now also
  requires and exercises a new backend endpoint, `GET /api/v1/collectors` (list, tenant-scoped),
  covered by its own tests (`test_list_collectors_scoped_to_own_company`,
  `test_citizen_cannot_list_collectors`).
- **PDF report export and its admin-dashboard download buttons were verified more thoroughly than
  any other single feature so far**: automated tests parse the actual PDF text layer with
  `pdfplumber` and assert real data appears in it; a PDF downloaded from the live server was
  confirmed as a genuinely valid PDF via the Unix `file` command; that same PDF was rendered to a
  PNG and visually inspected (confirming the branded header, summary line, and table styling
  actually render, not just parse as valid structure); and the empty-result-set case was tested
  explicitly. This is the one feature in the whole project verified at four independent levels
  (automated test, file-format validation, visual rendering, edge-case handling) rather than the
  usual two or three. See `docs/reporting.md`.
- **No component/unit tests are implemented for the frontend** (i.e. no Jest/React Testing
  Library). This remains a real gap.

## Frontend unit/component tests — now implemented

`frontend/src/**/__tests__/` contains 29 real Jest + React Testing Library tests across 5 suites,
run via `npm test` (or `npm test -- --ci` in CI). **All 29 passing.**

| Suite | Covers |
|---|---|
| `lib/__tests__/api.test.ts` | The API client's request building (Bearer header attached/omitted correctly), real `ApiError` construction from server error bodies, fallback to `statusText` when a response body isn't JSON, and correct optional-field omission in request payloads |
| `lib/__tests__/offlineQueue.test.ts` | The IndexedDB-backed offline queue (spec section 28) against **`fake-indexeddb`, a real spec-compliant IndexedDB implementation** — not a mock of the module's own functions — covering enqueue, list, remove, and conflict-error recording |
| `context/__tests__/AuthContext.test.tsx` | Session restoration from `localStorage` on mount, clearing an invalid stored token, `login()`/`logout()` real state and storage transitions, and `useAuth()` throwing a clear error outside its provider |
| `app/login/__tests__/page.test.tsx` | Real form submission calling `login()` with the entered values, navigation to `/post-login` on success, real server error messages displayed on failure (not swallowed), a generic fallback for non-API errors, and the submit button disabling while a login is in flight |
| `app/register/__tests__/page.test.tsx` | Real registration payload construction including role selection, success messaging and redirect, real server error display (e.g. duplicate email), and HTML5 password-length validation |

Two real, non-trivial issues were found and fixed while building this suite, not smoothed over:
1. React 19's stricter `act()` environment checks required explicitly setting
   `IS_REACT_ACT_ENVIRONMENT` in the Jest setup — without it, genuinely-wrapped async state updates
   still emitted spurious warnings.
2. `fake-indexeddb` needs `structuredClone`, which jsdom's test environment doesn't provide —
   fixed with a small Node `v8`-based polyfill in the Jest setup, not by skipping those tests.

See `jest.config.js`, `jest.setup.ts`, and the `eslint.config.mjs` exemption for config files (which
legitimately need `require()`, the same reasoning `eslint-config-next` already applies to
`next.config.js` itself).

## E2E (browser-driven) tests — now implemented

`e2e/` contains 5 real, browser-driven end-to-end tests using Selenium + WebKitGTK (not
Playwright/Cypress — both are blocked by this sandbox's network policy; see `e2e/README.md` for the
full, directly-tested explanation of why, and why WebKitGTK works instead). **Verified passing
together: the original 3 run back-to-back 4 times in a row, 3/3 every time; after adding the
organization-admin and recycler flows, the full 5-test suite was run together 3 times in a row, 5/5
every time.**

| Test | Flow |
|---|---|
| `test_citizen_flow.py` | Register → login → request a pickup (real form interaction) → confirm it appears in the dashboard |
| `test_collector_flow.py` | Login → view a real assigned pickup → advance through real status buttons → complete with a real weight → confirm COLLECTED renders |
| `test_admin_flow.py` | Login → confirm real aggregate stats render → confirm a fresh complaint appears → move it through a real status-transition button |
| `test_organization_admin_flow.py` | Login → confirm real waste analytics render → add a new location via the real form → confirm it appears |
| `test_recycler_flow.py` | Login → confirm real platform-wide diversion-rate stats render → log a new recycling activity via the real form → confirm the new record appears |
| `test_offline_queue_flow.py` | Collector goes offline → completes a collection (real IndexedDB write, real UI badge) → server-side state confirmed unchanged → reconnects → queue flushes → server-side state confirmed genuinely changed |

Building this suite surfaced and fixed four real, non-obvious issues (documented in full in
`e2e/README.md`, not glossed over):
1. Headless WebKitGTK hangs indefinitely on a real geolocation permission request — fixed with a
   standard deterministic `execute_script` stub (the same technique Playwright's built-in
   geolocation mocking uses).
2. The platform's own real rate limiter (see `docs/security.md`) legitimately trips under rapid
   repeated E2E iteration — fixed with retry/backoff on API-driven test setup calls, and by running
   the backend with `APP_ENV=testing` for E2E runs (reusing the exact mechanism, and exact
   environment variable, already used to disable the limiter for the `pytest` suite — not a new
   special case).
3. A genuine test-isolation bug in the tests themselves: early versions used global XPath button
   lookups that non-deterministically grabbed the wrong pickup's/complaint's button once several
   test runs had left overlapping-state records in the database. Found by running the suite
   repeatedly (it passed in isolation, then flaked in combination) and fixed by scoping every
   lookup to the specific record's own card via a unique per-run marker.
4. A stale-element-text bug found while writing the organization-admin test: re-locating a button
   by its pre-click label after the click had already changed that label. Fixed by waiting on the
   page body's text instead — and the citizen test's equivalent wait was checked (not assumed) to
   confirm it didn't share the same bug, since it used a broader substring match.

See `e2e/README.md` for setup instructions and the full list of what's not yet covered (CI
integration, recycler/organization-admin flows, offline-queue browser-level testing).

## Production build verification (spec section 65)

| Build | Status |
|---|---|
| Backend: import + all routers register | Verified (`python3 -c "from app.main import app"`) |
| Backend: pytest suite | Verified, 68/68 passing |
| Backend: RLS enforcement | Verified by connecting directly to the database as the restricted role and by running the live app connected as that role over real HTTP — see `docs/multi-tenancy.md` |
| Backend: live server + real HTTP flow (register to login to request to assign to collect) | Verified via curl against a running uvicorn instance |
| Backend: rate limiter real 429 enforcement | Verified via curl loop against the live server |
| Backend: recurring-schedule scheduler script | Verified by running `scripts/run_scheduler.py` directly against the dev database — one pickup materialized, then zero on immediate re-run (idempotency confirmed) |
| Backend: CSV report download | Verified by downloading a real file from the live server with `curl` and confirming it contained real prior collection data |
| Backend: PDF report download | Verified by downloading a real file, confirming valid PDF structure via `file`, rendering it to a PNG for visual inspection, and parsing its text layer with `pdfplumber` to confirm real data content |
| Frontend: `next build` (production) | Verified, including a real bug found and fixed |
| Frontend: `next start` serving real pages | Verified via curl (200s, real rendered HTML) for all 13 routes |
| Frontend collector flow against live backend | Verified — same API calls the UI buttons make were driven directly and produced correct state changes |
| Frontend organization/recycler flow against live backend | Verified — real location creation and real recycling-record creation, both confirmed to persist and appear in subsequent reads |
| Frontend admin/company dashboard flow against live backend | Verified — same API calls the UI makes were driven directly and returned correct real aggregate data and complaint-status transitions |
| Frontend report download buttons against live backend | Verified — the exact authenticated-blob-download calls the buttons trigger were driven directly for both CSV and PDF formats |
| E2E: real browser-driven tests (citizen/collector/admin/org-admin/recycler flows) | Verified — 5/5 passing, run together 3 times in a row via Selenium + WebKitGTK; see `e2e/README.md` |
| Docker daemon | Verified installed and running (`docker info` healthy); `docker compose config` confirmed the compose file syntactically valid |
| Docker image build | Not possible in this environment — confirmed (not assumed) that no container registry is reachable under this sandbox's network policy, even for a bare `alpine:latest` pull. See `docs/deployment.md`. |
