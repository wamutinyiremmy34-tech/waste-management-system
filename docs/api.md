# API Reference

Base URL: `https://your-domain/api/v1`  
All endpoints require `Authorization: Bearer <access_token>` unless marked public.  
All request/response bodies are JSON (`Content-Type: application/json`).

Interactive docs are available at `/docs` (development/staging only — disabled in production).

---

## Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register a new CITIZEN or COLLECTOR account |
| POST | `/auth/login` | Public | Login, returns `access_token` + `refresh_token` |
| POST | `/auth/refresh` | Public | Rotate refresh token, returns new token pair |
| POST | `/auth/logout` | Public | Revoke refresh token server-side |
| GET | `/auth/me` | Required | Return current user's profile |
| POST | `/auth/password-reset/request` | Public | Request a password reset token |
| POST | `/auth/password-reset/confirm` | Public | Confirm reset with token + new password |

### Register
```json
POST /auth/register
{
  "email": "user@example.com",
  "password": "Passw0rd123",
  "full_name": "Jane Doe",
  "role": "CITIZEN"  // or "COLLECTOR" — only these two are self-registerable
}
```

### Login / Refresh
```json
POST /auth/login
{ "email": "user@example.com", "password": "Passw0rd123" }

→ { "access_token": "eyJ...", "refresh_token": "abc...", "token_type": "bearer" }
```

### Password Reset (Pilot)
```json
POST /auth/password-reset/request
{ "email": "user@example.com" }

→ { "status": "ok", "reset_token": "...", "expires_in_minutes": 30 }
// reset_token is returned directly in pilot mode (no email configured)

POST /auth/password-reset/confirm
{ "token": "...", "new_password": "NewPassw0rd456" }

→ { "status": "ok", "message": "Password updated. Please log in with your new password." }
```

---

## Pickups

Roles: CITIZEN/ORGANIZATION_ADMIN can create. COLLECTOR can advance status. COMPANY_ADMIN/MUNICIPAL_ADMIN/SUPER_ADMIN can assign and view all.

| Method | Path | Description |
|---|---|---|
| POST | `/pickups` | Request a new pickup |
| GET | `/pickups/mine` | List your own pickups (paginated) |
| GET | `/pickups/assigned` | List pickups assigned to you (COLLECTOR only) |
| GET | `/pickups/{id}` | Get single pickup |
| POST | `/pickups/{id}/assign` | Assign collector to pickup |
| PATCH | `/pickups/{id}/status` | Advance pickup status |
| POST | `/pickups/{id}/complete` | Complete a collection (COLLECTOR) |
| POST | `/pickups/{id}/fail` | Report collection failure (COLLECTOR) |

**Status machine:** `REQUESTED → ASSIGNED → EN_ROUTE → ARRIVED → COLLECTED/FAILED`  
Terminals: `COLLECTED`, `FAILED`, `MISSED`, `CANCELLED`

---

## Complaints

| Method | Path | Description |
|---|---|---|
| POST | `/complaints` | Report a complaint (any authenticated user) |
| GET | `/complaints/mine` | Your own complaints |
| GET | `/complaints` | All complaints (admin roles) |
| GET | `/complaints/{id}` | Single complaint |
| PATCH | `/complaints/{id}/status` | Advance complaint status (admin roles) |

---

## Bins & Zones

| Method | Path | Description |
|---|---|---|
| POST | `/bins` | Create bin (admin roles) |
| GET | `/bins/nearby` | PostGIS nearby search (`?latitude=&longitude=&radius_meters=`) |
| GET | `/bins/{id}` | Single bin |
| PATCH | `/bins/{id}/fill-level` | Update fill percentage |
| POST | `/zones` | Create collection zone with polygon boundary |
| GET | `/zones` | List zones |
| GET | `/zones/lookup` | PostGIS point-in-polygon zone lookup |

---

## Collectors & Vehicles

| Method | Path | Description |
|---|---|---|
| POST | `/collectors` | Create collector profile (COMPANY_ADMIN) |
| GET | `/collectors` | List collectors for your company |
| GET | `/collectors/me` | Your collector profile |
| PATCH | `/collectors/me/location` | Update collector GPS location |
| PATCH | `/collectors/{id}/assignment` | Assign zone/vehicle |
| POST | `/vehicles` | Register vehicle (COMPANY_ADMIN) |
| GET | `/vehicles` | List vehicles for your company |
| PATCH | `/vehicles/{id}/status` | Update vehicle status |
| POST | `/vehicles/{id}/maintenance` | Add maintenance record |

---

## Recycling & Rewards

| Method | Path | Description |
|---|---|---|
| POST | `/recycling` | Log recycling activity (RECYCLER) |
| GET | `/recycling` | List recycling records |
| GET | `/recycling/impact-summary` | Platform-wide recycling stats |
| POST | `/rewards/rules` | Create reward rule (SUPER_ADMIN) |
| GET | `/rewards/rules` | List active reward rules |
| POST | `/rewards/catalog` | Add redeemable reward (SUPER_ADMIN) |
| GET | `/rewards/catalog` | List available rewards |
| GET | `/rewards/balance` | Your points balance |
| GET | `/rewards/history` | Your points ledger history |
| POST | `/rewards/redeem` | Redeem a reward |
| GET | `/rewards/leaderboard` | Top 20 points earners |

---

## Organizations & Companies

| Method | Path | Description |
|---|---|---|
| POST | `/organizations` | Create organization (SUPER_ADMIN/MUNICIPAL_ADMIN) |
| GET | `/organizations/{id}` | Get organization (own org or admin) |
| GET | `/organizations/{id}/waste-analytics` | Waste totals by category |
| POST | `/organizations/{id}/locations` | Add branch location |
| GET | `/organizations/{id}/staff` | List staff |
| POST | `/organizations/{id}/staff` | Add staff member |
| PATCH | `/organizations/{id}/staff/{uid}/deactivate` | Deactivate staff |
| POST | `/companies` | Create waste company (SUPER_ADMIN/MUNICIPAL_ADMIN) |
| GET | `/companies/{id}` | Get company |
| GET | `/companies/{id}/dashboard` | Operational stats |

---

## Analytics & Reports

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/analytics/admin-dashboard` | SUPER_ADMIN, MUNICIPAL_ADMIN | Aggregate platform stats |
| GET | `/analytics/waste-by-category` | + COMPANY_ADMIN | Waste totals by category |
| GET | `/analytics/complaint-analytics` | + COMPANY_ADMIN | Complaint breakdowns |
| GET | `/reports/collections.csv` | Admin/company roles | CSV report with filters |
| GET | `/reports/collections.pdf` | Admin/company roles | PDF report with filters |
| GET | `/reports/complaints.csv` | Admin/company roles | — |
| GET | `/reports/complaints.pdf` | Admin/company roles | — |
| GET | `/reports/recycling.csv` | Admin/company roles | — |
| GET | `/reports/recycling.pdf` | Admin/company roles | — |
| GET | `/reports/environmental.csv` | Admin/company roles | CO2e impact summary |
| GET | `/reports/environmental.pdf` | Admin/company roles | — |

Report endpoints support query params: `date_from`, `date_to`, `organization_id`, `zone_id`, `recycler_id`.

---

## Notifications

| Method | Path | Description |
|---|---|---|
| GET | `/notifications` | List your notifications (paginated) |
| PATCH | `/notifications/{id}/read` | Mark as read |
| GET | `/notifications/preferences` | Get notification preferences |
| PATCH | `/notifications/preferences` | Update preferences |

---

## Admin

All endpoints require `SUPER_ADMIN` role.

| Method | Path | Description |
|---|---|---|
| GET | `/admin/users` | List all users (filterable by role) |
| PATCH | `/admin/users/{id}/role` | Change a user's role |
| PATCH | `/admin/users/{id}/active` | Activate/deactivate a user |
| GET | `/admin/audit-logs` | Paginated audit log |

---

## Recurring Schedules

| Method | Path | Description |
|---|---|---|
| POST | `/recurring-schedules` | Create a recurring schedule |
| GET | `/recurring-schedules/mine` | List your active schedules |
| PATCH | `/recurring-schedules/{id}/deactivate` | Deactivate a schedule |

---

## Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/health` | None | DB + Redis health check |

Returns `{"status":"ok"}` or `{"status":"degraded","checks":{"database":"error",...}}`.

---

## Error responses

All errors return JSON:
```json
{ "detail": "Human-readable error message" }
```

For unhandled 500s, a `correlation_id` is also included:
```json
{ "detail": "An unexpected error occurred...", "correlation_id": "a3f9c1b2" }
```

| Code | Meaning |
|---|---|
| 400 | Bad request (e.g. invalid reset token) |
| 401 | Missing or invalid/expired access token |
| 403 | Authenticated but not permitted |
| 404 | Resource not found (also used for IDOR — existence not revealed) |
| 409 | Conflict (duplicate email, duplicate bin code, etc.) |
| 422 | Validation error (Pydantic / business rule violation) |
| 429 | Rate limit exceeded |
| 500 | Unexpected server error (logged server-side with correlation_id) |
