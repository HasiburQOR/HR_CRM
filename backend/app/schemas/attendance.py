from datetime import date, time, datetime
from pydantic import BaseModel


class AttendanceBase(BaseModel):
    employee_id: str
    date: date
    clock_in: time | None = None
    clock_out: time | None = None
    status: str = "pending"
    approved_by: str | None = None
    rejected_by: str | None = None
    lunch_break_start: time | None = None
    lunch_break_end: time | None = None
    auto_lunch_counted: bool = False
    notes: str | None = None


class AttendanceCreate(BaseModel):
    employee_id: str
    date: date
    check_in: str | None = None
    check_out: str | None = None
    clock_in: time | None = None
    clock_out: time | None = None
    status: str = "present"
    lunch_taken: bool = False
    lunch_included: bool = False
    lunch_break_start: time | None = None
    lunch_break_end: time | None = None
    auto_lunch_counted: bool = False
    notes: str | None = None


class AttendanceUpdate(BaseModel):
    check_in: str | None = None
    check_out: str | None = None
    clock_in: time | None = None
    clock_out: time | None = None
    status: str | None = None
    lunch_taken: bool | None = None
    lunch_included: bool | None = None
    lunch_break_start: time | None = None
    lunch_break_end: time | None = None
    auto_lunch_counted: bool | None = None
    notes: str | None = None


class AttendanceResponse(AttendanceBase):
    id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True
