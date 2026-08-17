"""
Runs the recurring-pickup materialization job once and exits. Intended to be
invoked periodically (e.g. daily) by cron, a systemd timer, or a scheduled
Docker/Kubernetes job — this script itself has no built-in scheduling loop,
by design, so the actual cadence is controlled by standard OS/infra tooling
rather than a custom in-process scheduler.

Usage:
    PYTHONPATH=. python scripts/run_scheduler.py

Example crontab entry (run daily at 06:00):
    0 6 * * * cd /path/to/backend && PYTHONPATH=. .venv/bin/python scripts/run_scheduler.py >> /var/log/ecotrack-scheduler.log 2>&1
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import SessionLocal
from app.services.scheduler_service import materialize_due_schedules


def main():
    db = SessionLocal()
    try:
        created = materialize_due_schedules(db)
        print(f"Materialized {len(created)} pickup(s) from due recurring schedules.")
        for p in created:
            print(f"  - {p.id} ({p.waste_category.value}) for schedule {p.recurring_schedule_id}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
