"""Attendance CRM lock rules.

Shared by the attendance routes (checked when an employee acts) and the
background scheduler (checked for everyone at the deadline), so both apply
exactly the same rule.

Besides today's deadlines, the previous working day is checked too. Without
that, an employee who skipped a whole day was only ever locked by the 11:15
scheduler run — if that run missed them, nothing else would, because every
check only looked at "today".
"""
from datetime import date as dt_date, datetime, time as dt_time, timedelta

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


def previous_working_day(day: dt_date) -> dt_date:
    prev = day - timedelta(days=1)
    while is_day_off(prev):
        prev -= timedelta(days=1)
    return prev


def _lock_reason(day: dt_date, missed_checkin: bool, missed_checkout: bool, missed_day: dt_date | None = None) -> str:
    reasons = []
    if missed_day is not None:
        if missed_checkin:
            reasons.append(f"no check-in on {missed_day.isoformat()}")
        if missed_checkout:
            reasons.append(f"no check-out on {missed_day.isoformat()}")
    else:
        if missed_checkin:
            reasons.append(f"missed check-in before {CHECK_IN_DEADLINE.strftime('%I:%M %p')}")
        if missed_checkout:
            reasons.append(f"missed check-out before {CHECK_OUT_DEADLINE.strftime('%I:%M %p')}")
    return f"Locked on {day.isoformat()}: " + " and ".join(reasons) + "."


def _apply_lock(emp: Employee, day: dt_date, now: datetime, missed_checkin: bool, missed_checkout: bool, missed_day: dt_date | None = None) -> None:
    emp.crm_locked = True
    emp.crm_locked_at = now
    emp.crm_lock_reason = _lock_reason(day, missed_checkin, missed_checkout, missed_day)


def _on_approved_leave(db: Session, employee_id: str, day: dt_date) -> bool:
    return db.query(LeaveRequest.id).filter(
        LeaveRequest.employee_id == employee_id,
        LeaveRequest.status == "approved",
        LeaveRequest.start_date <= day,
        LeaveRequest.end_date >= day,
    ).first() is not None


def _should_check_previous_day(emp: Employee, prev_day: dt_date) -> bool:
    # An admin unlock on (or after) that day already waived its deadlines.
    if emp.crm_unlocked_date and emp.crm_unlocked_date >= prev_day:
        return False
    # Not employed yet that day.
    if emp.date_of_joining and emp.date_of_joining > prev_day:
        return False
    return True


def _missed(att: Attendance | None, check_in_due: bool, check_out_due: bool) -> tuple[bool, bool]:
    return (
        check_in_due and not (att and att.clock_in),
        check_out_due and not (att and att.clock_out),
    )


def evaluate_employee_lock(db: Session, emp: Employee, now: datetime | None = None) -> bool:
    """Lock a single employee if they missed today's deadline or skipped the
    previous working day.

    Returns True if this call locked them. No-op on Fridays, while they are on
    approved leave, if an admin already unlocked them today, or if they are
    already locked. A previous day spent on approved leave is not counted.
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
    if _on_approved_leave(db, emp.id, today):
        return False

    att = db.query(Attendance).filter(
        Attendance.employee_id == emp.id,
        Attendance.date == today,
    ).first()
    missed_checkin, missed_checkout = _missed(att, now.time() > CHECK_IN_DEADLINE, now.time() > CHECK_OUT_DEADLINE)
    if missed_checkin or missed_checkout:
        _apply_lock(emp, today, now, missed_checkin, missed_checkout)
        db.commit()
        db.refresh(emp)
        return True

    prev_day = previous_working_day(today)
    if not _should_check_previous_day(emp, prev_day) or _on_approved_leave(db, emp.id, prev_day):
        return False
    prev_att = db.query(Attendance).filter(
        Attendance.employee_id == emp.id,
        Attendance.date == prev_day,
    ).first()
    missed_checkin, missed_checkout = _missed(prev_att, True, True)
    if not (missed_checkin or missed_checkout):
        return False

    _apply_lock(emp, today, now, missed_checkin, missed_checkout, missed_day=prev_day)
    db.commit()
    db.refresh(emp)
    return True


def _attendance_by_employee(db: Session, ids: list[str], day: dt_date) -> dict[str, Attendance]:
    return {
        att.employee_id: att
        for att in db.query(Attendance).filter(
            Attendance.employee_id.in_(ids),
            Attendance.date == day,
        ).all()
    }


def _employees_on_leave(db: Session, ids: list[str], day: dt_date) -> set[str]:
    return {
        row[0]
        for row in db.query(LeaveRequest.employee_id).filter(
            LeaveRequest.employee_id.in_(ids),
            LeaveRequest.status == "approved",
            LeaveRequest.start_date <= day,
            LeaveRequest.end_date >= day,
        ).all()
    }


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

    employees = db.query(Employee).filter(
        Employee.status == "active",
        Employee.deleted_at.is_(None),
        Employee.user_id.isnot(None),  # only staff who actually have a CRM login
    ).all()
    candidates = [e for e in employees if not e.crm_locked and e.crm_unlocked_date != today]
    if not candidates:
        return 0

    ids = [e.id for e in candidates]
    prev_day = previous_working_day(today)
    today_att = _attendance_by_employee(db, ids, today)
    prev_att = _attendance_by_employee(db, ids, prev_day)
    on_leave_today = _employees_on_leave(db, ids, today)
    on_leave_prev = _employees_on_leave(db, ids, prev_day)

    locked = 0
    for emp in candidates:
        if emp.id in on_leave_today:
            continue
        missed_checkin, missed_checkout = _missed(today_att.get(emp.id), past_checkin, past_checkout)
        if missed_checkin or missed_checkout:
            _apply_lock(emp, today, now, missed_checkin, missed_checkout)
            locked += 1
            continue
        if emp.id in on_leave_prev or not _should_check_previous_day(emp, prev_day):
            continue
        missed_checkin, missed_checkout = _missed(prev_att.get(emp.id), True, True)
        if missed_checkin or missed_checkout:
            _apply_lock(emp, today, now, missed_checkin, missed_checkout, missed_day=prev_day)
            locked += 1

    if locked:
        db.commit()
    return locked
