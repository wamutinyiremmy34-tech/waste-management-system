# Backup and Recovery

EcoTrack uses PostgreSQL with PostGIS. All spatial data (bins, zones, pickup locations,
complaint locations) lives in the same database and is included automatically in every backup
taken with the tools below.

**Backup automation is NOT configured.** This document describes the manual procedures
operators must run until automation is wired to a cron job or cloud-native backup service.

---

## 1. Database Backup

### Full logical backup (recommended for most cases)

Uses `pg_dump` — produces a portable SQL archive that works across minor PostgreSQL versions
and includes all PostGIS geometry data correctly.

```bash
# Running locally (outside Docker)
PGPASSWORD=your_db_password pg_dump \
  -h localhost -U ecotrack -d ecotrack_dev \
  --format=custom \
  --file=ecotrack_$(date +%Y%m%d_%H%M%S).pgdump

# Inside Docker Compose
docker exec ecotrack_db pg_dump \
  -U ecotrack -d ecotrack_dev \
  --format=custom \
  --file=/tmp/ecotrack_$(date +%Y%m%d_%H%M%S).pgdump

# Then copy out of the container
docker cp ecotrack_db:/tmp/ecotrack_YYYYMMDD_HHMMSS.pgdump ./backups/
```

The `--format=custom` flag produces a compressed binary dump that is faster to restore than
plain SQL and supports parallel restore. Always use this format unless you specifically need
to inspect the SQL.

### Verify the backup is not empty

```bash
pg_restore --list ecotrack_backup.pgdump | head -20
```

If the output is empty or shows errors, the backup is corrupt — retake it.

---

## 2. Restore

### Full restore to a clean database

```bash
# Create an empty target database with PostGIS
createdb -U ecotrack ecotrack_restore
psql -U ecotrack -d ecotrack_restore -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# Restore
pg_restore \
  -h localhost -U ecotrack \
  -d ecotrack_restore \
  --no-owner --no-acl \
  ecotrack_backup.pgdump
```

`--no-owner` and `--no-acl` prevent ownership/permission errors when restoring to a
different database user.

### Verify PostGIS data survived

```bash
psql -U ecotrack -d ecotrack_restore -c \
  "SELECT COUNT(*) FROM pickup_requests WHERE location IS NOT NULL;"
```

If the count matches the source database, spatial data is intact.

---

## 3. Migration Recovery

If a migration fails partway through:

1. **Check Alembic state:**
   ```bash
   alembic current
   alembic history
   ```

2. **Downgrade to the last known good revision:**
   ```bash
   alembic downgrade <previous_revision_id>
   ```

3. **Fix the migration file**, then re-run:
   ```bash
   alembic upgrade head
   ```

If `downgrade` also fails (e.g. a DDL operation left the schema in an inconsistent state),
restore from the last backup taken before the migration attempt.

**Always take a backup before running `alembic upgrade head` on a production database.**

---

## 4. Redis Recovery

Redis is used only for rate limiting. Redis data is ephemeral by design — there is no
persistent queue or session state stored in Redis that cannot be recreated.

If Redis fails or is wiped:
- Rate limit counters reset to zero (slightly more permissive for the next 60-second window)
- The application continues functioning normally (rate limiter fails open — see `docs/security.md`)
- No pickup data, user data, or session data is lost

No special Redis recovery procedure is needed.

---

## 5. Important Environment Variables to Preserve

These must be documented securely outside the codebase (e.g. a password manager):

| Variable | Why it matters |
|---|---|
| `SECRET_KEY` | JWTs signed with this key. If lost, all sessions are invalidated. All refresh tokens become unusable. |
| `DATABASE_URL` | Connection string including password. |
| `REDIS_URL` | If Redis requires authentication. |

If `SECRET_KEY` changes, all logged-in users are forced to re-authenticate. This is acceptable
in an emergency (e.g. key compromise) but should be coordinated with operators.

---

## 6. Recommended Backup Schedule (Pilot)

| Frequency | Action |
|---|---|
| Daily | `pg_dump` to a local or remote storage location |
| Before any migration | Manual `pg_dump` immediately before `alembic upgrade head` |
| Before deploying a new version | Manual `pg_dump` |
| Weekly | Test restore to a separate DB to verify backup integrity |

---

## 7. Disaster Recovery Checklist

If the database host is lost:

1. Provision a new PostgreSQL + PostGIS instance (same version: `postgis/postgis:16-3.4`)
2. Create the `ecotrack` superuser and `ecotrack_dev`/`ecotrack_prod` database
3. Enable PostGIS: `CREATE EXTENSION postgis;`
4. Restore from latest backup: `pg_restore --no-owner --no-acl ...`
5. Run `alembic upgrade head` to apply any migrations newer than the backup
6. Verify row counts in key tables: `users`, `pickup_requests`, `organizations`
7. Update `DATABASE_URL` in the app's environment and restart
8. Run a health check: `GET /api/v1/health`
9. Confirm PostGIS spatial queries work: `GET /api/v1/bins/nearby?latitude=0.3&longitude=32.5`
