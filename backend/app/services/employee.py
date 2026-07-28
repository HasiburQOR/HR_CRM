from fastapi import HTTPException, status
from sqlalchemy.orm import Session
import re

from app.repositories.employee import EmployeeRepository
from app.models.employee import Employee as EmployeeModel


_EMPLOYEE_COLUMNS = {c.name for c in EmployeeModel.__table__.columns}
_ALIAS_TO_COLUMN = {
    "national_id": "nid",
    "job_title": "designation",
    "hire_date": "date_of_joining",
    "birthday": "date_of_birth",
}


def _to_row_dict(data: dict) -> dict:
    """Translate aliases to canonical column names and drop unknown keys."""
    out: dict = {}
    for k, v in data.items():
        if k in _ALIAS_TO_COLUMN:
            col = _ALIAS_TO_COLUMN[k]
            out.setdefault(col, v)
            continue
        if k in _EMPLOYEE_COLUMNS:
            out[k] = v
    return out


def _employee_to_dict(e) -> dict:
    full_name = " ".join(p for p in [e.first_name, e.last_name] if p)
    return {
        "id": e.id,
        "user_id": e.user_id,
        "employee_id": e.employee_id,
        "first_name": e.first_name,
        "last_name": e.last_name,
        "full_name": full_name,
        "email": e.email,
        "phone": e.phone,
        "nid": getattr(e, "nid", None),
        "national_id": getattr(e, "nid", None),
        "designation": e.designation,
        "job_title": e.designation,
        "department": e.department,
        "date_of_joining": str(e.date_of_joining) if getattr(e, "date_of_joining", None) else None,
        "hire_date": str(e.date_of_joining) if getattr(e, "date_of_joining", None) else None,
        "date_of_birth": str(e.date_of_birth) if getattr(e, "date_of_birth", None) else None,
        "birthday": str(e.date_of_birth) if getattr(e, "date_of_birth", None) else None,
        "address": getattr(e, "address", None),
        "salary": e.salary,
        "status": e.status,
        "created_at": e.created_at.isoformat() if getattr(e, "created_at", None) else None,
        "updated_at": e.updated_at.isoformat() if getattr(e, "updated_at", None) else None,
        "deleted_at": e.deleted_at.isoformat() if getattr(e, "deleted_at", None) else None,
    }


class EmployeeService:
    def __init__(self, db: Session):
        self.repo = EmployeeRepository(db)

    def next_employee_id(self) -> str:
        last = (
            self.repo.db.query(self.repo.model)
            .order_by(self.repo.model.created_at.desc())
            .first()
        )
        max_num = 0
        all_records = self.repo.db.query(self.repo.model.employee_id).all()
        for (eid,) in all_records:
            if not eid:
                continue
            m = re.search(r"(\d+)", str(eid))
            if m:
                n = int(m.group(1))
                if n > max_num:
                    max_num = n
        next_num = max_num + 1
        return f"EMP{next_num:03d}"

    def get_all(self, skip: int = 0, limit: int = 100, search: str | None = None):
        if search:
            records = self.repo.search(search, skip=skip, limit=limit)
        else:
            records = self.repo.get_all(skip=skip, limit=limit)
        return [_employee_to_dict(e) for e in records]

    def get_by_id(self, employee_id: str | None):
        employee = self.repo.get(employee_id)
        if not employee:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
        return _employee_to_dict(employee)

    def create(self, data: dict):
        eid = (data.get("employee_id") or "").strip()
        if not eid:
            eid = self.next_employee_id()
            data["employee_id"] = eid
        existing = self.repo.get_by_employee_id(eid)
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee code already exists")
        if not data.get("date_of_joining") and data.get("hire_date"):
            data["date_of_joining"] = data["hire_date"]
        if not data.get("date_of_birth") and data.get("birthday"):
            data["date_of_birth"] = data["birthday"]
        if data.get("national_id") and not data.get("nid"):
            data["nid"] = data["national_id"]
        if data.get("salary") is None or data.get("salary") == "":
            data["salary"] = 0.0
        if not data.get("status"):
            data["status"] = "active"
        row_data = _to_row_dict(data)
        created = self.repo.create(row_data)
        return _employee_to_dict(created)

    def update(self, employee_id: str | None, data: dict):
        employee = self.repo.get(employee_id)
        if not employee:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
        if not data.get("date_of_joining") and data.get("hire_date"):
            data["date_of_joining"] = data["hire_date"]
        if not data.get("date_of_birth") and data.get("birthday"):
            data["date_of_birth"] = data["birthday"]
        if data.get("national_id") and not data.get("nid"):
            data["nid"] = data["national_id"]
        row_data = _to_row_dict(data)
        if not row_data:
            return _employee_to_dict(employee)
        updated = self.repo.update(employee_id, row_data)
        return _employee_to_dict(updated)

    def delete(self, employee_id: str | None):
        employee = self.repo.get(employee_id)
        if not employee:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
        return self.repo.delete(employee_id)

    def get_active(self):
        records = self.repo.get_active()
        return [_employee_to_dict(e) for e in records]
