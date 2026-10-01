"""Attendance CRM lock rules.

Shared by the attendance routes (checked when an employee acts) and the
background scheduler (checked for everyone at the deadline), so both apply
exactly the same rule.
"""
from datetime import date as dt_date, datetime, time as dt_time

from sqlalchemy.orm import Session

from app.models.attendance import Attendance
from app.models.employee import Employee
from app.models.leave import LeaveRequest
from app.utils.timezone import get_bd_now

# Every day except Friday, an employee must check in by CHECK_IN_DEADLINE and
# check out by CHECK_OUT_DEADLINE or their attendance access is locked until
# an admin unlocks it.
CHECK_IN_DEADLINE = dt_time(11, 15)
CHECK_OUT_DEADLINE = dt_time(23, 30)
FRIDAY_WEEKDAY = 4  # Python date.weekday(): Monday=0 ... Sunday=6


def is_day_off(day: dt_date) -> bool:
    return day.weekday() == FRIDAY_WEEKDAY


def _lock_reason(day: dt_date, missed_checkin: bool, missed_checkout: bool) -> str:
    reasons = []
    if missed_checkin:
        reasons.append(f"missed check-in before {CHECK_IN_DEADLINE.strftime('%I:%M %p')}")
    if missed_checkout:
        reasons.append(f"missed check-out before {CHECK_OUT_DEADLINE.strftime('%I:%M %p')}")
    return f"Locked on {day.isoformat()}: " + " and ".join(reasons) + "."


def _apply_lock(emp: Employee, day: dt_date, now: datetime, missed_checkin: bool, missed_checkout: bool) -> None:
    emp.crm_locked = True
    emp.crm_locked_at = now
    emp.crm_lock_reason = _lock_reason(day, missed_checkin, missed_checkout)


def _on_approved_leave(db: Session, employee_id: str, day: dt_date) -> bool:
    return db.query(LeaveRequest.id).filter(
        LeaveRequest.employee_id == employee_id,
        LeaveRequest.status == "approved",
        LeaveRequest.start_date <= day,
        LeaveRequest.end_date >= day,
    ).first() is not None


def evaluate_employee_lock(db: Session, emp: Employee, now: datetime | None = None) -> bool:
    """Lock a single employee if they have missed today's deadline.

    Returns True if this call locked them. No-op on Fridays, while they are on
    approved leave, if an admin already unlocked them today, or if they are
    already locked.
    """
    if emp.crm_locked:
        return False
    now = now or get_bd_now()
    today = now.date()
    if is_day_off(today):
        return False
    if emp.crm_unlocked_date == today:
        # An admin already unlocked this employee for today — don't
        # immediately re-lock them for the same missed deadline.
        return False

    att = db.query(Attendance).filter(
        Attendance.employee_id == emp.id,
        Attendance.date == today,
    ).first()
    missed_checkin = now.time() > CHECK_IN_DEADLINE and not (att and att.clock_in)
    missed_checkout = now.time() > CHECK_OUT_DEADLINE and not (att and att.clock_out)
    if not (missed_checkin or missed_checkout):
        return False
    if _on_approved_leave(db, emp.id, today):
        return False

    _apply_lock(emp, today, now, missed_checkin, missed_checkout)
    db.commit()
    db.refresh(emp)
    return True


def sweep_locks(db: Session, now: datetime | None = None) -> int:
    """Apply the lock rule to every active employee at once.

    Used by the scheduler so employees are locked at the deadline itself,
    whether or not they ever open the app. Returns how many were locked.
    """
    now = now or get_bd_now()
    today = now.date()
    if is_day_off(today):
        return 0

    past_checkin = now.time() > CHECK_IN_DEADLINE
    past_checkout = now.time() > CHECK_OUT_DEADLINE
    if not past_checkin and not past_checkout:
        return 0

    employees = db.query(Employee).filter(
        Employee.status == "active",
        Employee.deleted_at.is_(None),
        Employee.user_id.isnot(None),  # only staff who actually have a CRM login
    ).all()
    candidates = [e for e in employees if not e.crm_locked and e.crm_unlocked_date != today]
    if not candidates:
        return 0

    ids = [e.id for e in candidates]
    attendance_by_employee = {
        att.employee_id: att
        for att in db.query(Attendance).filter(
            Attendance.employee_id.in_(ids),
            Attendance.date == today,
        ).all()
    }
    on_leave = {
        row[0]
        for row in db.query(LeaveRequest.employee_id).filter(
            LeaveRequest.employee_id.in_(ids),
            LeaveRequest.status == "approved",
            LeaveRequest.start_date <= today,
            LeaveRequest.end_date >= today,
        ).all()
    }

    locked = 0
    for emp in candidates:
        if emp.id in on_leave:
            continue
        att = attendance_by_employee.get(emp.id)
        missed_checkin = past_checkin and not (att and att.clock_in)
        missed_checkout = past_checkout and not (att and att.clock_out)
        if not (missed_checkin or missed_checkout):
            continue
        _apply_lock(emp, today, now, missed_checkin, missed_checkout)
        locked += 1

    if locked:
        db.commit()
    return locked
