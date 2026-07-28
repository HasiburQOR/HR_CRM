from typing import Any
from datetime import date as dt_date, time as dt_time, datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.attendance import Attendance
from app.models.employee import Employee
from app.models.user import User
from app.schemas.attendance import AttendanceCreate, AttendanceUpdate
from app.utils.dependencies import get_current_user, get_user_role_name
from app.utils.response import success_response, paginated_response
from app.services.attendance import AttendanceService

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


def _att_to_dict(att: Attendance, emp: Employee | None) -> dict:
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
        "notes": att.notes or "",
        "created_at": att.created_at.isoformat() if att.created_at else None,
        "updated_at": att.updated_at.isoformat() if att.updated_at else None,
    }


def _get_current_employee(db: Session, current_user: Any) -> Employee | None:
    return db.query(Employee).filter(Employee.user_id == current_user.id, Employee.deleted_at.is_(None)).first()


def _is_employee_role(db: Session, current_user: Any) -> bool:
    return get_user_role_name(current_user, db) == "employee"


@router.get("")
def list_attendances(
    skip: int = 0,
    limit: int = 100,
    employee_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    query = db.query(Attendance, Employee).outerjoin(Employee, Attendance.employee_id == Employee.id)

    if _is_employee_role(db, current_user):
        emp = _get_current_employee(db, current_user)
        if emp:
            query = query.filter(Attendance.employee_id == emp.id)

    if employee_id and employee_id != "all":
        query = query.filter(Attendance.employee_id == employee_id)
    if date_from:
        query = query.filter(Attendance.date >= date_from)
    if date_to:
        query = query.filter(Attendance.date <= date_to)
    if status and status != "all":
        query = query.filter(Attendance.status == status)

    total = query.count()
    results = query.order_by(Attendance.date.desc()).offset(skip).limit(limit).all()

    data = [_att_to_dict(att, emp) for att, emp in results]

    page = skip // limit + 1 if limit else 1
    return paginated_response(data=data, total=total, page=page, per_page=limit)


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
        emp = _get_current_employee(db, current_user)
        if emp and str(emp.id) != str(employee_id):
            raise HTTPException(status_code=403, detail="Cannot record attendance for another employee")

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


@router.put("/{attendance_id}")
def update_attendance(attendance_id: str, data: AttendanceUpdate, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        raise HTTPException(status_code=403, detail="Employees cannot modify attendance records")
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    att = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attendance record not found")
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
    for lunch_key in ("lunch_taken", "lunch_included", "auto_lunch_counted"):
        if lunch_key in update_data and update_data[lunch_key] is not None:
            if bool(update_data[lunch_key]):
                att.auto_lunch_counted = True
            break
    if "status" in update_data and update_data["status"]:
        att.status = update_data["status"]
    if "notes" in update_data and update_data["notes"] is not None:
        att.notes = update_data["notes"]
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
    if _is_employee_role(db, current_user):
        my_emp = _get_current_employee(db, current_user)
        if my_emp and my_emp.id != emp.id:
            raise HTTPException(status_code=403, detail="Cannot check in for another employee")
    today = dt_date.today()
    if payload.date:
        today = dt_date.fromisoformat(payload.date[:10])
    ci = _parse_hhmm(payload.check_in) or datetime.now().time().replace(microsecond=0)
    att = db.query(Attendance).filter(Attendance.employee_id == emp.id, Attendance.date == today).first()
    if att and att.clock_in and att.clock_out:
        att = Attendance(
            employee_id=emp.id,
            date=today,
            clock_in=ci,
            status="present",
            auto_lunch_counted=bool(payload.lunch_included),
            notes=payload.notes,
        )
        db.add(att)
    elif att:
        att.clock_in = ci
        if payload.lunch_included:
            att.auto_lunch_counted = True
        if payload.notes:
            att.notes = payload.notes
        if not att.status:
            att.status = "present"
    else:
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
    if _is_employee_role(db, current_user):
        my_emp = _get_current_employee(db, current_user)
        if my_emp and my_emp.id != emp.id:
            raise HTTPException(status_code=403, detail="Cannot check out for another employee")
    today = dt_date.today()
    if payload.date:
        today = dt_date.fromisoformat(payload.date[:10])
    co = _parse_hhmm(payload.check_out) or datetime.now().time().replace(microsecond=0)
    att = db.query(Attendance).filter(Attendance.employee_id == emp.id, Attendance.date == today).order_by(Attendance.created_at.desc()).first()
    if not att or not att.clock_in:
        raise HTTPException(status_code=400, detail="Must check in before checking out")
    if att.clock_out:
        att = Attendance(
            employee_id=emp.id,
            date=today,
            clock_in=datetime.now().time().replace(microsecond=0),
            clock_out=co,
            status="present",
            notes=payload.notes,
        )
        db.add(att)
    else:
        att.clock_out = co
        if payload.notes:
            att.notes = (att.notes or "") + ("; " if att.notes else "") + payload.notes
    db.commit()
    db.refresh(att)
    return success_response(data=_att_to_dict(att, emp))