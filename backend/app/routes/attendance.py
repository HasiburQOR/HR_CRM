from typing import Any
from datetime import date as dt_date, time as dt_time, datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.attendance import Attendance
from app.models.employee import Employee
from app.models.user import User
from app.schemas.attendance import AttendanceCreate, AttendanceUpdate
from app.utils.dependencies import get_current_user, get_user_role_name, require_admin
from app.utils.response import success_response, paginated_response
from app.services.attendance import AttendanceService
from app.services.attendance_lock import CHECK_IN_DEADLINE, CHECK_OUT_DEADLINE, evaluate_employee_lock
from app.utils.timezone import get_bd_now
from app.models.setting import Setting

router = APIRouter(prefix="/attendances", tags=["attendances"])


def _parse_hhmm(s: str | None) -> dt_time | None:
    if not s:
        return None
    try:
        if "T" in str(s):
            s = str(s).split("T")[1][:5]
        parts = str(s).split(":")
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
        return dt_time(h, m)
    except (ValueError, IndexError):
        return None


def _iso_date_or_400(value: str, param: str) -> str:
    """Validate an ISO (YYYY-MM-DD) date query param or raise 400."""
    try:
        dt_date.fromisoformat(value)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail=f"{param} must be a valid ISO date (YYYY-MM-DD)")
    return value


def _att_seconds(att: Attendance) -> float | None:
    """Raw seconds between clock-in and clock-out (no lunch deduction)."""
    if not att.clock_in or not att.clock_out:
        return None
    total_seconds = (
        datetime.combine(dt_date.min, att.clock_out)
        - datetime.combine(dt_date.min, att.clock_in)
    ).total_seconds()
    return total_seconds if total_seconds > 0 else None


def _att_to_dict(att: Attendance, emp: Employee | None) -> dict:
    # Raw hours worked = check-out minus check-in (lunch tracked separately)
    seconds = _att_seconds(att)
    hours_worked = round(seconds / 3600, 2) if seconds is not None else None

    return {
        "id": att.id,
        "employee_id": att.employee_id,
        "employee_name": f"{emp.first_name} {emp.last_name}" if emp else "Unknown",
        "employee_code": emp.employee_id if emp else None,
        "date": str(att.date),
        "check_in": str(att.clock_in) if att.clock_in else "",
        "check_out": str(att.clock_out) if att.clock_out else "",
        "clock_in": str(att.clock_in) if att.clock_in else None,
        "clock_out": str(att.clock_out) if att.clock_out else None,
        "status": att.status,
        "lunch_taken": bool(att.auto_lunch_counted),
        "lunch_included": bool(att.auto_lunch_counted),
        "auto_lunch_counted": bool(att.auto_lunch_counted),
        "hours_worked": hours_worked,
        "notes": att.notes or "",
        "created_at": att.created_at.isoformat() if att.created_at else None,
        "updated_at": att.updated_at.isoformat() if att.updated_at else None,
    }


def _get_current_employee(db: Session, current_user: Any) -> Employee | None:
    return db.query(Employee).filter(Employee.user_id == current_user.id, Employee.deleted_at.is_(None)).first()


def _is_employee_role(db: Session, current_user: Any) -> bool:
    return get_user_role_name(current_user, db) == "employee"


def _check_and_apply_lock(db: Session, emp: Employee) -> None:
    """Lock the employee's attendance access if they have already missed
    today's deadline. The scheduler does this for everyone at the deadline
    itself; this covers an employee acting in between runs."""
    evaluate_employee_lock(db, emp)


def _ensure_not_locked(emp: Employee) -> None:
    if emp.crm_locked:
        raise HTTPException(
            status_code=403,
            detail=emp.crm_lock_reason or "Attendance access is locked. Contact an administrator to unlock it.",
        )


# ---------------------------------------------------------------------------
# Check-in / Check-out actions — MUST be defined BEFORE /{attendance_id} routes
# ---------------------------------------------------------------------------

class _CheckIn(BaseModel):
    employee_id: str
    date: str | None = None
    check_in: str | None = None
    lunch_included: bool = False
    notes: str | None = None


class _CheckOut(BaseModel):
    employee_id: str
    date: str | None = None
    check_out: str | None = None
    notes: str | None = None


def _ensure_employee(db: Session, employee_id: str) -> Employee:
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp


@router.post("/actions/check-in")
def action_check_in(payload: _CheckIn, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    emp = _ensure_employee(db, payload.employee_id)
    is_employee = _is_employee_role(db, current_user)
    if is_employee:
        my_emp = _get_current_employee(db, current_user)
        if my_emp and my_emp.id != emp.id:
            raise HTTPException(status_code=403, detail="Cannot check in for another employee")
        _check_and_apply_lock(db, emp)
        _ensure_not_locked(emp)
        # Employees can no longer back/future-date or hand-pick a time —
        # check-in is always recorded against the current server date/time.
        today = get_bd_now().date()
        ci = get_bd_now().time().replace(microsecond=0)
    else:
        today = dt_date.today()
        if payload.date:
            today = dt_date.fromisoformat(payload.date[:10])
        ci = _parse_hhmm(payload.check_in) or get_bd_now().time().replace(microsecond=0)

    att = db.query(Attendance).filter(Attendance.employee_id == emp.id, Attendance.date == today).first()

    # If already checked in AND checked out for today, reject duplicate
    if att and att.clock_in and att.clock_out:
        raise HTTPException(status_code=400, detail="Already checked in and out for today. Only one check-in and one check-out per day is allowed.")

    if att:
        # Has check-in but no check-out — update existing
        att.clock_in = ci
        if payload.lunch_included:
            att.auto_lunch_counted = True
        if payload.notes:
            att.notes = payload.notes
        if not att.status:
            att.status = "present"
    else:
        # No record for today — create new
        att = Attendance(
            employee_id=emp.id,
            date=today,
            clock_in=ci,
            status="present",
            auto_lunch_counted=bool(payload.lunch_included),
            notes=payload.notes,
        )
        db.add(att)

    db.commit()
    db.refresh(att)
    return success_response(data=_att_to_dict(att, emp))


@router.post("/actions/check-out")
def action_check_out(payload: _CheckOut, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    emp = _ensure_employee(db, payload.employee_id)
    is_employee = _is_employee_role(db, current_user)
    if is_employee:
        my_emp = _get_current_employee(db, current_user)
        if my_emp and my_emp.id != emp.id:
            raise HTTPException(status_code=403, detail="Cannot check out for another employee")
        _check_and_apply_lock(db, emp)
        _ensure_not_locked(emp)
        # Employees can no longer back/future-date or hand-pick a time —
        # check-out is always recorded against the current server date/time.
        today = get_bd_now().date()
        co = get_bd_now().time().replace(microsecond=0)
    else:
        today = dt_date.today()
        if payload.date:
            today = dt_date.fromisoformat(payload.date[:10])
        co = _parse_hhmm(payload.check_out) or get_bd_now().time().replace(microsecond=0)

    att = db.query(Attendance).filter(Attendance.employee_id == emp.id, Attendance.date == today).order_by(Attendance.created_at.desc()).first()

    if not att or not att.clock_in:
        raise HTTPException(status_code=400, detail="Must check in before checking out")

    # Already checked out — reject duplicate
    if att.clock_out:
        raise HTTPException(status_code=400, detail="Already checked out for today. Only one check-in and one check-out per day is allowed.")

    att.clock_out = co
    if payload.notes:
        att.notes = (att.notes or "") + ("; " if att.notes else "") + payload.notes

    db.commit()
    db.refresh(att)
    return success_response(data=_att_to_dict(att, emp))


# ---------------------------------------------------------------------------
# Attendance CRM lock status / admin unlock
# NOTE: static paths MUST be defined BEFORE /{attendance_id} routes
# ---------------------------------------------------------------------------

@router.get("/lock-status")
def get_lock_status(db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        emp = _get_current_employee(db, current_user)
        if not emp:
            return success_response(data={"locked": False, "reason": None})
        _check_and_apply_lock(db, emp)
        return success_response(data={"locked": bool(emp.crm_locked), "reason": emp.crm_lock_reason})
    return success_response(data={"locked": False, "reason": None})


@router.get("/locked-employees")
def list_locked_employees(db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    employees = db.query(Employee).filter(Employee.crm_locked.is_(True), Employee.deleted_at.is_(None)).all()
    data = [
        {
            "id": e.id,
            "employee_id": e.employee_id,
            "name": f"{e.first_name} {e.last_name}",
            "reason": e.crm_lock_reason,
            "locked_at": e.crm_locked_at.isoformat() if e.crm_locked_at else None,
        }
        for e in employees
    ]
    return success_response(data=data)


@router.post("/unlock/{employee_id}")
def unlock_employee_attendance(employee_id: str, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    emp = _ensure_employee(db, employee_id)
    emp.crm_locked = False
    emp.crm_lock_reason = None
    emp.crm_locked_at = None
    emp.crm_unlocked_date = get_bd_now().date()
    db.commit()
    return success_response(data={"id": emp.id, "locked": False})


# ---------------------------------------------------------------------------
# Employee self-edit permission (admin-controlled editing window)
# NOTE: /permissions routes MUST be defined BEFORE /{attendance_id} routes
# ---------------------------------------------------------------------------

EMPLOYEE_EDIT_SETTING_KEY = "attendance_allow_employee_edit"


def _employee_edit_enabled(db: Session) -> bool:
    """True only while an admin has opened the employee attendance editing window."""
    setting = db.query(Setting).filter(Setting.key == EMPLOYEE_EDIT_SETTING_KEY).first()
    if not setting or setting.value is None:
        return False
    return str(setting.value).strip().lower() in ("1", "true", "yes", "on")


@router.get("/permissions")
def get_attendance_permissions(db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    return success_response(data={"employee_edit_enabled": _employee_edit_enabled(db)})


class _PermissionsUpdate(BaseModel):
    employee_edit_enabled: bool


@router.put("/permissions")
def update_attendance_permissions(payload: _PermissionsUpdate, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    setting = db.query(Setting).filter(Setting.key == EMPLOYEE_EDIT_SETTING_KEY).first()
    value = "true" if payload.employee_edit_enabled else "false"
    if setting:
        setting.value = value
    else:
        setting = Setting(
            key=EMPLOYEE_EDIT_SETTING_KEY,
            value=value,
            description="When true, employees can edit their own attendance check-in/check-out times. Edited records reset to pending for admin review.",
        )
        db.add(setting)
    db.commit()
    return success_response(data={"employee_edit_enabled": _employee_edit_enabled(db)})


# ---------------------------------------------------------------------------
# CRUD routes (static paths first, then path-parameter routes)
# ---------------------------------------------------------------------------

@router.get("")
def list_attendances(
    skip: int = 0,
    limit: int = 100,
    employee_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    status: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    query = db.query(Attendance, Employee).outerjoin(Employee, Attendance.employee_id == Employee.id)

    # Employees can only ever see their own records, regardless of filters passed
    if _is_employee_role(db, current_user):
        emp = _get_current_employee(db, current_user)
        if not emp:
            return paginated_response(data=[], total=0, page=1, per_page=limit)
        query = query.filter(Attendance.employee_id == emp.id)
    elif employee_id and employee_id != "all":
        query = query.filter(Attendance.employee_id == employee_id)

    if date_from:
        date_from = _iso_date_or_400(date_from, "date_from")
    if date_to:
        date_to = _iso_date_or_400(date_to, "date_to")
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from must be on or before date_to")
    if date_from:
        query = query.filter(Attendance.date >= date_from)
    if date_to:
        query = query.filter(Attendance.date <= date_to)
    if status and status != "all":
        query = query.filter(Attendance.status == status)
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(
            Employee.first_name.ilike(term),
            Employee.last_name.ilike(term),
            Employee.employee_id.ilike(term),
        ))

    total = query.count()
    results = query.order_by(Attendance.date.desc()).offset(skip).limit(limit).all()

    data = [_att_to_dict(att, emp) for att, emp in results]

    page = skip // limit + 1 if limit else 1
    return paginated_response(data=data, total=total, page=page, per_page=limit)


@router.post("")
def create_attendance(data: AttendanceCreate, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    data_dict = data.model_dump(exclude_unset=False)

    ci = data_dict.get("clock_in") or _parse_hhmm(data_dict.get("check_in"))
    co = data_dict.get("clock_out") or _parse_hhmm(data_dict.get("check_out"))
    lunch_flag = bool(data_dict.get("lunch_included")) or bool(data_dict.get("lunch_taken")) or bool(data_dict.get("auto_lunch_counted"))

    employee_id = data_dict["employee_id"]
    att_date = data_dict["date"]
    if not employee_id or not att_date:
        raise HTTPException(status_code=400, detail="Employee and date are required")

    if _is_employee_role(db, current_user):
        raise HTTPException(
            status_code=403,
            detail="Employees cannot create manual attendance records. Use Check In / Check Out instead.",
        )

    existing = db.query(Attendance).filter(
        Attendance.employee_id == employee_id,
        Attendance.date == att_date,
    ).first()

    if existing:
        updates: dict[str, Any] = {}
        if ci and not existing.clock_in:
            updates["clock_in"] = ci
        if co and not existing.clock_out:
            updates["clock_out"] = co
        if lunch_flag:
            updates["auto_lunch_counted"] = True
        if data_dict.get("status") and data_dict["status"] and not existing.status:
            updates["status"] = data_dict["status"]
        if data_dict.get("notes"):
            updates["notes"] = data_dict["notes"]
        if updates:
            for k, v in updates.items():
                setattr(existing, k, v)
            db.commit()
            db.refresh(existing)
        emp = db.query(Employee).filter(Employee.id == existing.employee_id).first()
        return success_response(data=_att_to_dict(existing, emp))

    att = Attendance(
        employee_id=employee_id,
        date=att_date,
        clock_in=ci,
        clock_out=co,
        status=data_dict.get("status") or "present",
        auto_lunch_counted=lunch_flag,
        notes=data_dict.get("notes") or None,
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    emp = db.query(Employee).filter(Employee.id == att.employee_id).first()
    return success_response(data=_att_to_dict(att, emp))


# ---------------------------------------------------------------------------
# Path-parameter routes (MUST come after /actions/* and static paths)
# ---------------------------------------------------------------------------

@router.get("/{attendance_id}")
def get_attendance(attendance_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    att = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    if _is_employee_role(db, current_user):
        emp = _get_current_employee(db, current_user)
        if emp and att.employee_id != emp.id:
            raise HTTPException(status_code=403, detail="Access denied")
    emp = db.query(Employee).filter(Employee.id == att.employee_id).first()
    return success_response(data=_att_to_dict(att, emp))


# Fields employees are allowed to modify on their OWN records while the
# admin-controlled editing window is open.
_EMPLOYEE_EDITABLE_FIELDS = {
    "check_in", "check_out", "clock_in", "clock_out",
    "lunch_taken", "lunch_included", "auto_lunch_counted", "notes",
}


@router.put("/{attendance_id}")
def update_attendance(attendance_id: str, data: AttendanceUpdate, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    is_employee = _is_employee_role(db, current_user)
    if is_employee and not _employee_edit_enabled(db):
        raise HTTPException(status_code=403, detail="Employees cannot modify attendance records")

    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    att = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    if is_employee:
        my_emp = _get_current_employee(db, current_user)
        if not my_emp or att.employee_id != my_emp.id:
            raise HTTPException(status_code=403, detail="You can only edit your own attendance records")
        # Employees may only adjust times / lunch / notes (not date, employee or status)
        update_data = {k: v for k, v in update_data.items() if k in _EMPLOYEE_EDITABLE_FIELDS}
        if not update_data:
            raise HTTPException(status_code=403, detail="Employees can only edit check-in / check-out times, lunch and notes")

    if "clock_in" in update_data and update_data["clock_in"]:
        att.clock_in = update_data["clock_in"]
    elif "check_in" in update_data:
        parsed = _parse_hhmm(update_data.get("check_in"))
        if parsed:
            att.clock_in = parsed
    if "clock_out" in update_data and update_data["clock_out"]:
        att.clock_out = update_data["clock_out"]
    elif "check_out" in update_data:
        parsed = _parse_hhmm(update_data.get("check_out"))
        if parsed:
            att.clock_out = parsed
    lunch_value = None
    for lunch_key in ("lunch_taken", "lunch_included", "auto_lunch_counted"):
        if lunch_key in update_data and update_data[lunch_key] is not None:
            lunch_value = bool(update_data[lunch_key])
            break
    if lunch_value is not None:
        att.auto_lunch_counted = lunch_value
    if not is_employee and "status" in update_data and update_data["status"]:
        att.status = update_data["status"]
    if "notes" in update_data and update_data["notes"] is not None:
        att.notes = update_data["notes"]

    # Sanity check: check-out must be after check-in
    if att.clock_in and att.clock_out and _att_seconds(att) is None:
        raise HTTPException(status_code=400, detail="Check-out time must be after check-in time")

    if is_employee:
        # Employee edits go back to pending for admin review
        att.status = "pending"
        att.approved_by = None
        att.rejected_by = None

    db.commit()
    db.refresh(att)
    emp = db.query(Employee).filter(Employee.id == att.employee_id).first()
    return success_response(data=_att_to_dict(att, emp))


@router.delete("/{attendance_id}")
def delete_attendance(attendance_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        raise HTTPException(status_code=403, detail="Employees cannot delete attendance records")
    att = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if att:
        db.delete(att)
        db.commit()
    return success_response(data=None)


@router.post("/{attendance_id}/approve")
def approve_attendance(attendance_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        raise HTTPException(status_code=403, detail="Employees cannot approve attendance")
    service = AttendanceService(db)
    att = service.approve(attendance_id, current_user.id)
    return success_response(data={"id": att.id, "status": att.status})


@router.post("/{attendance_id}/reject")
def reject_attendance(attendance_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        raise HTTPException(status_code=403, detail="Employees cannot reject attendance")
    service = AttendanceService(db)
    att = service.reject(attendance_id, current_user.id)
    return success_response(data={"id": att.id, "status": att.status})