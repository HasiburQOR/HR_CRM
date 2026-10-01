"""Background scheduler that locks employees at the attendance deadlines.

Runs just after 11:15 AM and 11:30 PM (Asia/Dhaka) so an employee is locked at
the deadline itself, even if they never open the app that day.
"""
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.database import SessionLocal
from app.services.attendance_lock import CHECK_IN_DEADLINE, CHECK_OUT_DEADLINE, sweep_locks
from app.utils.timezone import BD_TZ

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


def run_lock_sweep() -> None:
    """Lock everyone who missed a deadline. Never raises — a failure here must
    not stop future runs or affect request handling."""
    db = SessionLocal()
    try:
        locked = sweep_locks(db)
        if locked:
            logger.info("Attendance lock sweep locked %s employee(s)", locked)
    except Exception:
        db.rollback()
        logger.exception("Attendance lock sweep failed")
    finally:
        db.close()


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    scheduler = AsyncIOScheduler(timezone=BD_TZ)
    # Fire 30s past the deadline so the "now is past the deadline" comparison
    # in sweep_locks is unambiguously true.
    for deadline in (CHECK_IN_DEADLINE, CHECK_OUT_DEADLINE):
        scheduler.add_job(
            run_lock_sweep,
            CronTrigger(hour=deadline.hour, minute=deadline.minute, second=30, timezone=BD_TZ),
            id=f"attendance-lock-{deadline.hour:02d}{deadline.minute:02d}",
            replace_existing=True,
            misfire_grace_time=3600,
            coalesce=True,
        )
    scheduler.start()
    _scheduler = scheduler
    logger.info(
        "Attendance lock scheduler started (%s and %s, Asia/Dhaka)",
        CHECK_IN_DEADLINE.strftime("%I:%M %p"),
        CHECK_OUT_DEADLINE.strftime("%I:%M %p"),
    )


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is None:
        return
    try:
        _scheduler.shutdown(wait=False)
    except Exception:
        logger.exception("Failed to shut down attendance lock scheduler")
    finally:
        _scheduler = None
