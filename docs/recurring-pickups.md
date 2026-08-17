# Recurring Pickup Scheduling

Per spec section 13 — "do not create thousands of unnecessary database records in advance."

## How it works

`RecurringSchedule` stores the recurrence *rule* (frequency, waste category, location,
`next_run_date`) — one row per subscription, not one row per future occurrence.

`app/services/scheduler_service.py::materialize_due_schedules()` finds schedules whose
`next_run_date` is today or earlier, creates exactly one real `PickupRequest` for each, advances
`next_run_date` to the next occurrence, and sends the citizen a notification. This is idempotent:
running it twice in the same day does not create a duplicate pickup, because advancing
`next_run_date` moves the schedule out of the "due" window — verified by an automated test
(`test_materialization_creates_real_pickup_and_advances_schedule`) and manually against the live
dev database (a schedule due yesterday materialized exactly one pickup on the first run, zero on
an immediate second run).

## Running it

**Production**: intended to run on a periodic schedule via standard OS/infra tooling — cron,
a systemd timer, or a scheduled container/Kubernetes job — invoking:

```bash
cd backend && PYTHONPATH=. python scripts/run_scheduler.py
```

Example crontab entry (daily at 06:00):
```
0 6 * * * cd /path/to/backend && PYTHONPATH=. .venv/bin/python scripts/run_scheduler.py >> /var/log/ecotrack-scheduler.log 2>&1
```

**Manual/testing**: `POST /api/v1/recurring-schedules/run-materialization` (SUPER_ADMIN only) runs
the exact same function over HTTP, mainly so it can be exercised/verified without shelling into a
container. This endpoint is not intended to be polled as the real scheduling mechanism — a cron/
systemd timer calling the script is.

## API

- `POST /api/v1/recurring-schedules` — citizen/org-admin creates a schedule.
- `GET /api/v1/recurring-schedules/mine` — list your own schedules.
- `PATCH /api/v1/recurring-schedules/{id}/deactivate` — stop future materialization.

## What's simplified for the MVP

`_next_run_date()`'s MONTHLY handling clamps to day 28 to avoid invalid dates (no Feb 30) rather
than doing full calendar-aware month arithmetic — a reasonable simplification for an MVP, flagged
here rather than silently assumed to be perfectly calendar-accurate. CUSTOM frequency schedules
currently advance by a flat 7 days as a safe default; true custom-interval support (e.g. "every 10
days") is not implemented — CUSTOM exists in the enum and schema for future use but has no distinct
behavior yet.
