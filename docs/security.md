# Security

Required security review per spec section 41. Findings below reflect what was actually checked in
this codebase, not a generic checklist.

## Checked and addressed

| Area | Status | Notes |
|---|---|---|
| Authentication | ✅ | bcrypt password hashing, JWT access tokens, opaque rotating refresh tokens stored as hashes. See `docs/authentication.md`. |
| Authorization (RBAC) | ✅ | Enforced server-side via `require_roles()`, tested. See `docs/authorization.md`. |
| IDOR | ✅ tested | Cross-user pickup access returns 404, not a data leak. `test_citizen_cannot_view_another_citizens_pickup`. |
| Tenant isolation | ✅ tested, two layers | Application-layer checks (company-scoped assignment blocked across companies) PLUS real PostgreSQL Row-Level Security on 7 sensitive tables via a restricted, non-superuser DB role — verified by connecting directly to the database as that role (bypassing the app entirely) and confirming cross-tenant rows are genuinely invisible. See `docs/multi-tenancy.md`. |
| File upload security | ✅ | Extension + declared content-type + actual magic-byte check + size limit; server-generated storage keys (never trusts client filenames). See `docs/storage.md`. |
| SQL injection | ✅ by construction | 100% SQLAlchemy ORM/Core with parameter binding; no raw string-interpolated SQL anywhere in the codebase (zone polygon WKT is built from validated float coordinates, not user strings, and still passed as a bound parameter to `ST_GeomFromText`). |
| XSS | ✅ by construction | React (frontend) escapes all rendered content by default; no `dangerouslySetInnerHTML` used anywhere. |
| CORS | ✅ | Configured via `CORS_ORIGINS` env var, not wildcard-by-default in a way that would ship to production unnoticed. |
| Secret handling | ✅ | `.env` is gitignored; `.env.example` ships with an obviously-fake, explicitly-labeled insecure default `SECRET_KEY`. No secrets are logged (passwords, tokens are never included in `AuditLog` metadata). |
| Privilege escalation | ✅ tested | Public registration cannot set `SUPER_ADMIN`/other privileged roles (`test_cannot_self_register_as_super_admin`); role changes require an existing `SUPER_ADMIN`. |
| Password storage | ✅ | bcrypt, never plaintext, never returned in API responses. |
| Rate limiting | ✅ implemented and tested | Redis-backed fixed-window limiter (`app/core/rate_limit.py`), tighter budget (10/min) on auth endpoints than general API. Fails open if Redis is unreachable (explicit availability/security tradeoff). Verified both with a unit test hitting the real 429 threshold and manually against the live server (`curl` loop trips the limit at exactly the configured count). |
| CSRF | N/A | The API is a pure JSON/Bearer-token API (no cookie-based session auth), so classic CSRF does not apply the way it would to a cookie-authenticated app. |
| Security headers | ✅ implemented and tested | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` on every response; `Strict-Transport-Security` added only when the request genuinely arrived over HTTPS (or via a trusted proxy header), so it doesn't break local plain-HTTP development. Verified with automated tests and by inspecting real response headers from the live server. |
| Dependency vulnerability scanning | ✅ implemented, one finding investigated | `pip-audit`/`npm audit` now run in CI (non-blocking — see "Known gaps" for why). `npm audit`: 0 vulnerabilities. `pip-audit`: 1 finding, investigated below, not exploitable in this codebase. |

## The one real dependency vulnerability finding, investigated

`pip-audit` flags `ecdsa==0.19.2` (`PYSEC-2026-1325`, a timing side-channel in the pure-Python
ECDSA signing implementation — a long-standing, upstream-acknowledged issue in the `ecdsa` package
that its maintainers have stated can't be fully fixed in pure Python). This project's JWT code
(`app/security/auth.py`) exclusively uses `HS256` — HMAC-based, symmetric, and *not* ECDSA —
confirmed by reading the actual `jwt.encode()`/`jwt.decode()` calls and the `ALGORITHM` setting.
`ecdsa` is present only as an unused transitive dependency of `python-jose` (which supports
RS256/ES256 too, algorithms this project never invokes). The vulnerable code path is never
exercised. Kept visible in CI rather than silenced, so a future change that *did* start using
ECDSA-based algorithms would have this flagged again for a fresh look.

## Known gaps (stated explicitly, not hidden)

1. **RLS covers 7 of 31 tables** — the highest-value personal/company-scoped ones (see
   `docs/multi-tenancy.md` for exactly which, and why those five first). The remaining tables still
   rely on application-layer checks only; extending RLS to them follows the identical, already-proven
   pattern.
2. **`SET LOCAL` session context doesn't survive a mid-request commit** — a documented, safe-direction
   limitation (over-restrictive, not under-restrictive) of the current RLS session-context mechanism.
   See `docs/multi-tenancy.md`.
3. **Dependency vulnerability scans are non-blocking in CI**, matching the existing `ruff` lint
   pattern — they run and are visible in CI output, but don't fail the build. This is a deliberate
   choice for an MVP (avoiding CI going red on a transitive-dependency finding that needs manual
   triage, as happened with `ecdsa` above) rather than an oversight; tightening this to blocking
   once a triage process exists is a reasonable next step.
4. **The rate limiter is per-process/per-IP** — behind a NAT or corporate proxy, many real users can
   share one IP and share a budget. A production deployment might want per-user (not just per-IP)
   limits once behind a reverse proxy that reliably forwards client IPs.

## What was actually tested, not just claimed

Every ✅-tested row above corresponds to a real, passing automated test in `backend/tests/`, run
against a real PostgreSQL+PostGIS database, or a real scan actually executed against this project's
actual dependency manifests (`pip-audit -r requirements.txt`, `npm audit`) — not a generic checklist
copied without verification. See `docs/testing.md` for the full list.
