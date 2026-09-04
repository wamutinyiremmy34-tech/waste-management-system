# Security

This document reflects the actual security state of EcoTrack after the Production Hardening
phase. Every ✅ corresponds to a real, verified implementation or test — not a checklist copy.

---

## Authentication

| Control | Status | Notes |
|---|---|---|
| Password hashing | ✅ | bcrypt with 72-byte truncation handled explicitly |
| JWT access tokens | ✅ | HS256, 30-minute expiry, `jti` claim, `type` claim |
| Refresh token rotation | ✅ | Opaque tokens stored as SHA-256 hashes; rotated on every use |
| Refresh token revocation | ✅ | Server-side revocation on logout and password reset |
| Frontend logout revokes server-side | ✅ | Fixed in hardening phase — logout now calls `POST /auth/logout` |
| Password reset | ✅ | Implemented in hardening phase — token-based, 30-minute expiry |
| Malformed/expired token handling | ✅ | `decode_access_token` catches `JWTError`, returns 401 |
| Account deactivation | ✅ | `is_active=False` checked on every authenticated request |
| Self-registration role restriction | ✅ | Only CITIZEN and COLLECTOR via public registration |

### Known limitation: refresh token in localStorage

The frontend stores the refresh token in `localStorage` where JavaScript can read it. This is a
known tradeoff in browser SPAs. The practical risk is low because:
- No `dangerouslySetInnerHTML` is used anywhere in the frontend
- No third-party scripts are loaded
- The refresh token is only used in the `/auth/refresh` API call

A production deployment with stronger requirements should consider `HttpOnly` cookie storage
for the refresh token — this requires backend changes to set/read cookies and is noted as a
future improvement.

---

## Authorization (RBAC)

| Control | Status | Notes |
|---|---|---|
| Role enforcement | ✅ | `require_roles()` dependency on every protected endpoint |
| IDOR — citizen pickup access | ✅ tested | Citizens cannot see other citizens' pickups (404) |
| IDOR — collector pickup access | ✅ tested | Collectors cannot see pickups assigned to other collectors |
| IDOR — company vehicle access | ✅ tested | Company admins cannot modify other companies' vehicles |
| Tenant isolation — organizations | ✅ tested | `_authorize_org_access` + RLS on `organizations` table |
| Tenant isolation — waste companies | ✅ tested | `require_same_waste_company` + RLS on `waste_companies` |
| Cross-company collector assignment | ✅ tested | COMPANY_ADMIN cannot assign a collector from another company |
| Admin privilege escalation | ✅ tested | Public registration cannot set privileged roles |

---

## Row-Level Security (RLS)

RLS is active on 13 of 31 tables using the restricted `ecotrack_app` PostgreSQL role
(non-superuser, `NOBYPASSRLS`). See `docs/multi-tenancy.md` for the full table-by-table
decision matrix and `docs/production-readiness-audit.md` for the reasoning behind
intentional exclusions.

**Important production step:** After running migrations, change the `ecotrack_app` role
password from the dev default:
```sql
ALTER ROLE ecotrack_app PASSWORD 'your-secure-password';
```
Then point the application's `DATABASE_URL` at `ecotrack_app` (not the superuser) so RLS
policies are actually enforced. Superusers bypass RLS unconditionally.

---

## Production Configuration Security (Hardening Phase Additions)

| Control | Status | Notes |
|---|---|---|
| `DEBUG=False` default | ✅ Fixed | Default changed from `True` to `False` |
| Insecure `SECRET_KEY` blocked in production | ✅ Fixed | App refuses to start in production with default key |
| Swagger/ReDoc disabled in production | ✅ Fixed | `docs_url=None` when `APP_ENV=production` |
| CORS `allow_methods` restricted | ✅ Fixed | Changed from `["*"]` to explicit verb list |
| CORS `allow_headers` restricted | ✅ Fixed | Changed from `["*"]` to `Authorization, Content-Type, Accept` |
| `SEED_ON_START` not hardcoded | ✅ Fixed | Removed from docker-compose hardcoded env; opt-in via .env only |

---

## Network & Transport

| Control | Status | Notes |
|---|---|---|
| HTTPS / TLS | ⚠️ Not implemented | Must be configured at the reverse proxy (nginx/Caddy) before production |
| HSTS | ✅ | Set automatically when request arrives over HTTPS or via trusted proxy |
| X-Content-Type-Options | ✅ | `nosniff` on all responses |
| X-Frame-Options | ✅ | `DENY` on all responses |
| Referrer-Policy | ✅ | `strict-origin-when-cross-origin` |
| Permissions-Policy | ✅ | Geolocation, camera, microphone denied |
| Request correlation ID | ✅ Fixed | `X-Request-ID` on all responses for incident tracing |

---

## Input Validation & Injection

| Control | Status | Notes |
|---|---|---|
| SQL injection | ✅ | 100% SQLAlchemy ORM/Core with parameter binding; no interpolated SQL |
| XSS | ✅ | React escapes all content; no `dangerouslySetInnerHTML` |
| File upload — extension | ✅ | Allowlist: `.jpg`, `.jpeg`, `.png`, `.webp` |
| File upload — MIME type | ✅ | Checked against `ALLOWED_IMAGE_TYPES` |
| File upload — magic bytes | ✅ | JPEG, PNG, WEBP signatures validated |
| File upload — size | ✅ | Configurable `MAX_UPLOAD_SIZE_MB` |
| Server-generated storage keys | ✅ | Client filenames never used for storage paths |
| Path traversal | ✅ | Storage keys are UUIDs with validated extension; no path traversal possible |
| Pydantic validation | ✅ | All request bodies validated; coordinate bounds, string lengths enforced |

---

## Rate Limiting

Redis-backed fixed-window rate limiter (`app/core/rate_limit.py`):
- General API: 60 requests/minute per IP
- Auth endpoints (`/login`, `/register`, `/refresh`): 10 requests/minute per IP
- Disabled in `APP_ENV=testing` to avoid CI collisions

**Known limitation:** Rate limiting is per-IP. Behind NAT or corporate proxies, multiple
users share one IP. For production behind a reverse proxy that sets `X-Forwarded-For`,
consider using that header for per-client identification.

**Fail-open behavior:** If Redis is unavailable, the rate limiter is bypassed rather than
taking the API down. This is an explicit availability-over-security tradeoff.

---

## Observability & Audit

| Control | Status | Notes |
|---|---|---|
| Structured logging | ✅ Fixed | Added in hardening phase — all services log to stdout |
| Auth failure logging | ✅ Fixed | Failed logins and invalid tokens logged with context |
| Global exception handler | ✅ Fixed | Unhandled exceptions logged with correlation ID; safe 500 to client |
| IntegrityError handler | ✅ Fixed | DB uniqueness violations return 409, not 500 |
| Audit log table | ✅ | Key actions (login, pickup state changes, role changes) written to `audit_logs` |
| Sensitive data in logs | ✅ | Passwords, JWTs, refresh tokens are never logged |

---

## Dependency Vulnerabilities

| Tool | Result | Notes |
|---|---|---|
| `pip-audit` | 1 finding | `ecdsa` timing side-channel — not exploitable (HS256 only, see below) |
| `npm audit` | 0 vulnerabilities | Clean |

**The `ecdsa` finding explained:** `pip-audit` flags `ecdsa==0.19.2` (`PYSEC-2026-1325`,
a timing side-channel in pure-Python ECDSA signing). This project uses `HS256` (HMAC-based,
not ECDSA) for all JWTs. `ecdsa` is present only as an unused transitive dependency of
`python-jose`. The vulnerable code path is never invoked. Kept visible in CI (non-blocking)
so any future change to ECDSA-based algorithms surfaces this for fresh review.

---

## What Is NOT Implemented (Honest Gaps)

| Gap | Impact | Plan |
|---|---|---|
| Email/SMS password reset delivery | Operators must relay reset tokens manually | Phase 2: wire email provider |
| `HttpOnly` cookie for refresh token | localStorage accessible to JS | Future: backend cookie support |
| Per-user rate limiting | Shared-IP limits affect multiple users | Phase 2: use `X-Forwarded-For` |
| Automated dependency updates | Manual review required | Add Dependabot or Renovate |
| Penetration testing | No formal pentest performed | Recommended before public launch |
