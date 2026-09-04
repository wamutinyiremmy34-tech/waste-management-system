# EcoTrack Pilot Runbook

**For: Oars Technologies operations team**  
**Scope: Uganda pilot deployment**  
**Platform: EcoTrack MVP — Production Hardening phase**

---

## Before the Pilot

### 1. Infrastructure Setup

**Minimum required:**
- 1 server (or VM): 2 vCPU, 4GB RAM, 20GB disk (SSD preferred)
- Ubuntu 22.04 LTS (or compatible)
- Docker + Docker Compose installed
- Outbound internet for container registry pulls and npm/pip packages
- Domain name or fixed IP for the frontend (for PWA install on collector devices)

**Ports to open:**
- `443` (HTTPS, frontend) — recommended behind nginx/Caddy
- `8000` (backend API) — proxied behind nginx, not exposed directly
- `5432` (PostgreSQL) — NOT exposed externally, internal only
- `6379` (Redis) — NOT exposed externally, internal only

### 2. Initial Configuration

```bash
# Clone the repo
git clone https://github.com/oarstechnologies/ecotrack.git
cd ecotrack

# Configure backend
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set:

```
APP_ENV=production
DEBUG=false
SECRET_KEY=<generated with: python3 -c "import secrets; print(secrets.token_urlsafe(48))">
DATABASE_URL=postgresql+psycopg2://ecotrack:YOUR_STRONG_DB_PASSWORD@db:5432/ecotrack_prod
REDIS_URL=redis://redis:6379/0
CORS_ORIGINS=["https://your-pilot-domain.com"]
SEED_ON_START=false
```

**Never** set `SEED_ON_START=true` in production.

### 3. Database Setup

```bash
# Start only the database first
docker compose up -d db

# Wait for it to be healthy
docker compose ps

# Run migrations
docker compose run --rm backend alembic upgrade head

# Verify PostGIS is working
docker exec ecotrack_db psql -U ecotrack -d ecotrack_prod \
  -c "SELECT PostGIS_Version();"
```

After migrations, change the RLS application role password:
```bash
docker exec ecotrack_db psql -U ecotrack -d ecotrack_prod \
  -c "ALTER ROLE ecotrack_app PASSWORD 'your-secure-app-role-password';"
```

Update `DATABASE_URL` in `.env` to use `ecotrack_app` (not the superuser) for the application
process. Keep the superuser connection only for migration commands.

### 4. Create the First SUPER_ADMIN

There is no self-registration path for SUPER_ADMIN. Create the first admin directly:

```bash
docker compose run --rm backend python3 -c "
from app.core.database import SessionLocal
from app.models.user import User
from app.models.enums import UserRole
from app.security.auth import hash_password
db = SessionLocal()
admin = User(
    email='admin@yourdomain.com',
    hashed_password=hash_password('ChangeThisPassword1!'),
    full_name='System Administrator',
    role=UserRole.SUPER_ADMIN,
    is_active=True,
)
db.add(admin)
db.commit()
print('Admin created:', admin.id)
db.close()
"
```

Immediately log in and change the password via the password-reset flow.

### 5. Create Waste Companies and Organizations

Via the API (authenticated as SUPER_ADMIN):

```bash
# Get a token
TOKEN=$(curl -s -X POST https://your-domain/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"your-password"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Create a waste company
curl -X POST https://your-domain/api/v1/companies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Kampala Waste Services","contact_email":"ops@kws.ug"}'

# Create an organization
curl -X POST https://your-domain/api/v1/organizations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Makerere University","org_type":"UNIVERSITY","latitude":0.334,"longitude":32.567}'
```

### 6. Create Collectors and Zones

1. Register collector user accounts via `POST /api/v1/auth/register` with `role: "COLLECTOR"`
2. Log in as COMPANY_ADMIN and create collector profiles via `POST /api/v1/collectors`
3. Draw collection zones via the Company dashboard Zone Drawer UI
4. Assign collectors to zones via `PATCH /api/v1/collectors/{id}/assignment`

### 7. Register Vehicles

Via the Company dashboard or API:
```bash
curl -X POST https://your-domain/api/v1/vehicles \
  -H "Authorization: Bearer $COMPANY_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"registration_number":"UG-0001","vehicle_type":"Tipper Truck","capacity_kg":5000}'
```

### 8. Pre-Pilot Health Check

```bash
# Full health check
curl https://your-domain/api/v1/health

# Expected: {"status":"ok","checks":{"database":"ok","redis":"ok"},...}
```

If `status` is `degraded`, fix the failing component before going live.

### 9. Take a Pre-Pilot Backup

```bash
docker exec ecotrack_db pg_dump -U ecotrack -d ecotrack_prod \
  --format=custom --file=/tmp/pre_pilot_backup.pgdump
docker cp ecotrack_db:/tmp/pre_pilot_backup.pgdump ./backups/
```

---

## During the Pilot

### Monitoring

**Check application health:**
```bash
# Every 5 minutes via cron (example)
curl -sf https://your-domain/api/v1/health | python3 -m json.tool
```

**Check logs:**
```bash
# All logs
docker compose logs --tail=100 backend

# Follow in real time
docker compose logs -f backend

# Auth failures only
docker compose logs backend | grep "Failed login\|Invalid or expired"

# Scheduler activity
docker compose logs backend | grep "ecotrack.scheduler"

# Errors
docker compose logs backend | grep "ERROR\|CRITICAL"
```

**Key log patterns to watch:**
| Pattern | Meaning |
|---|---|
| `Failed login attempt` | Possible brute force — check IP |
| `Unhandled exception` | Bug in production — check full log with `correlation_id` |
| `Health check degraded` | Database or Redis issue |
| `Scheduler run complete` | Scheduled pickups materialized |
| `Failed to materialize recurring schedule` | A schedule has a data issue — check `schedule_id` |

### Handling Failed Pickups

1. Log in as SUPER_ADMIN or MUNICIPAL_ADMIN
2. Go to Admin dashboard → check `failed_collections` count
3. For a specific failure: `GET /api/v1/pickups/{id}` and check `status` and `failure_reason`
4. If a collector reported a false failure, status cannot be reversed (state machine is final)
   — create a new pickup request on behalf of the citizen

### Handling Complaints

1. Admin dashboard shows unresolved complaint count
2. `GET /api/v1/complaints?status=REPORTED` to see new reports
3. Transition through: `REPORTED → UNDER_REVIEW → ASSIGNED → IN_PROGRESS → RESOLVED`
4. Use `resolution_notes` field to document what was done

### Collector Issues

**Collector cannot see their assignments:**
- Check `GET /api/v1/collectors/me` — does a collector profile exist?
- If not, create via `POST /api/v1/collectors` as COMPANY_ADMIN

**Offline sync not working:**
- Check the browser console on the collector's device for IndexedDB errors
- Check that the collector's device has a valid (non-expired) access token
- The offline queue retries automatically on reconnect — if actions are stuck,
  check for `lastError` in the "could not sync" banner

**Duplicate collection after offline sync:**
- The server state machine prevents this at the API level (COLLECTED → COLLECTED is rejected)
- The `was_successful` field on the Collection record is the source of truth

### User Issues

**Password reset (no email configured):**
```bash
# As SUPER_ADMIN via API
curl -X POST https://your-domain/api/v1/auth/password-reset/request \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
# Response includes reset_token — share it securely with the user
```

**Deactivate a problematic account:**
```bash
curl -X PATCH https://your-domain/api/v1/admin/users/{user_id}/active \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_active": false}'
```

### Recurring Schedules

The scheduler must be run periodically to materialize recurring pickups.
Recommended: daily via cron.

```bash
# Manual run
docker compose run --rm backend python3 scripts/run_scheduler.py

# Cron (add to host crontab)
0 6 * * * docker compose -f /path/to/docker-compose.yml run --rm backend python3 scripts/run_scheduler.py >> /var/log/ecotrack-scheduler.log 2>&1
```

---

## Emergency Procedures

### Database Failure

1. Check container status: `docker compose ps db`
2. Check logs: `docker compose logs db`
3. If container is stopped: `docker compose start db`
4. If data volume is intact but container is corrupt: `docker compose rm db && docker compose up -d db`
5. If data volume is lost: restore from backup (see `docs/backup-and-recovery.md`)

### Redis Failure

The application fails open on Redis unavailability — rate limiting is disabled but the API
continues working. Restart Redis:

```bash
docker compose restart redis
```

No data loss — Redis only holds rate limit counters.

### Backend Failure

```bash
docker compose restart backend

# Check startup logs
docker compose logs --tail=50 backend
```

If startup fails with `RuntimeError: SECRET_KEY is set to the insecure default`, set a real
`SECRET_KEY` in `backend/.env` and restart.

If startup fails with a database connection error, verify `DATABASE_URL` in `.env` and that
the `db` container is healthy.

### Frontend Failure

```bash
docker compose restart frontend
docker compose logs --tail=50 frontend
```

If the frontend build failed (common after a code update), rebuild:
```bash
docker compose up -d --build frontend
```

### Bad Migration

If `alembic upgrade head` produces an error:

1. Check current migration state: `docker compose run --rm backend alembic current`
2. Downgrade: `docker compose run --rm backend alembic downgrade -1`
3. Restore from pre-migration backup if downgrade also fails (see `docs/backup-and-recovery.md`)

### Compromised Account

If a SUPER_ADMIN or COMPANY_ADMIN account is suspected compromised:

1. Immediately deactivate: `PATCH /api/v1/admin/users/{id}/active` with `{"is_active": false}`
2. Revoke all sessions by resetting their password (this revokes all refresh tokens)
3. Review `audit_logs` for the user: `GET /api/v1/admin/audit-logs`
4. If SECRET_KEY is suspected compromised, rotate it in `.env` and restart — this invalidates
   ALL sessions platform-wide (all users must re-login)

### Suspicious Activity

Signs to watch for in logs:
- Many `Failed login attempt` entries from the same IP → possible brute force
- `Role SUPER_ADMIN` access at unexpected hours → compromised account
- Unusual volume of pickup requests from one user → check `reporter_user_id`

Response:
1. Deactivate the account in question
2. Review audit logs
3. If brute force: the rate limiter (10/min on auth endpoints) provides some protection;
   consider blocking the IP at the firewall level for persistent attacks

---

## After the Pilot

### Review Metrics

```bash
TOKEN=<admin_token>

# Dashboard summary
curl -H "Authorization: Bearer $TOKEN" https://your-domain/api/v1/analytics/admin-dashboard

# Waste by category
curl -H "Authorization: Bearer $TOKEN" https://your-domain/api/v1/analytics/waste-by-category

# Complaint analytics
curl -H "Authorization: Bearer $TOKEN" https://your-domain/api/v1/analytics/complaint-analytics
```

### Export Reports

From the Admin dashboard, download:
- `collections.csv` / `collections.pdf` — full collection history
- `complaints.csv` / `complaints.pdf` — all complaints and resolutions
- `recycling.csv` / `recycling.pdf` — recycling activity
- `environmental.csv` / `environmental.pdf` — environmental impact summary

Filter by date range and organization as needed.

### Inspect Key Outcomes

| Question | API endpoint |
|---|---|
| How many pickups were completed? | `admin-dashboard` → `completed_collections` |
| What waste categories dominated? | `waste-by-category` |
| What complaints remain unresolved? | `GET /complaints?status=REPORTED` |
| Which collectors completed the most? | Cross-reference `collections.csv` |
| Are citizens earning points? | `GET /rewards/leaderboard` |

### Database Backup Before Teardown

```bash
docker exec ecotrack_db pg_dump -U ecotrack -d ecotrack_prod \
  --format=custom --file=/tmp/post_pilot_final.pgdump
docker cp ecotrack_db:/tmp/post_pilot_final.pgdump ./backups/
```

Archive this backup before decommissioning the server.

### Review System Errors

```bash
docker compose logs backend | grep "Unhandled exception" | wc -l
docker compose logs backend | grep "correlation_id" | tail -20
```

Any `Unhandled exception` entries should be investigated before the next phase.
