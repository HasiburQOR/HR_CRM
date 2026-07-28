from datetime import date, datetime
from pydantic import BaseModel, field_validator


def _parse_date(v):
    if v is None or v == "":
        return None
    if isinstance(v, date):
        return v
    if isinstance(v, str):
        try:
            return date.fromisoformat(v[:10])
        except Exception:
            return None
    return v


class EmployeeBase(BaseModel):
    employee_id: str | None = None
    first_name: str
    last_name: str
    email: str
    phone: str | None = None
    nid: str | None = None
    national_id: str | None = None
    designation: str | None = None
    job_title: str | None = None
    department: str | None = None
    date_of_joining: date | None = None
    hire_date: date | None = None
    date_of_birth: date | None = None
    birthday: date | None = None
    address: str | None = None
    salary: float = 0.0
    status: str = "active"
    user_id: str | None = None

    @field_validator("date_of_joining", "hire_date", "date_of_birth", "birthday", mode="before")
    @classmethod
    def _d(cls, v):
        return _parse_date(v)


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(BaseModel):
    employee_id: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    nid: str | None = None
    national_id: str | None = None
    designation: str | None = None
    job_title: str | None = None
    department: str | None = None
    date_of_joining: date | None = None
    hire_date: date | None = None
    date_of_birth: date | None = None
    birthday: date | None = None
    address: str | None = None
    salary: float | None = None
    status: str | None = None
    user_id: str | None = None

    @field_validator("date_of_joining", "hire_date", "date_of_birth", "birthday", mode="before")
    @classmethod
    def _d(cls, v):
        return _parse_date(v)


class EmployeeResponse(EmployeeBase):
    id: str
    full_name: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True
