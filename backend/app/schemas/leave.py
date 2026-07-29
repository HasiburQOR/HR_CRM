from datetime import date, datetime
from pydantic import BaseModel


class LeaveRequestBase(BaseModel):
    employee_id: str
    leave_type: str
    start_date: date
    end_date: date
    reason: str | None = None
    status: str = "pending"
    approved_by: str | None = None


class LeaveRequestCreate(BaseModel):
    employee_id: str | None = None
    leave_type: str
    start_date: date
    end_date: date
    reason: str | None = None


class LeaveRequestUpdate(BaseModel):
    status: str | None = None
    approved_by: str | None = None
    reason: str | None = None


class LeaveRequestResponse(LeaveRequestBase):
    id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True
