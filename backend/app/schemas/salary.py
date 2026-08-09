from datetime import datetime
from pydantic import BaseModel


class SalaryBase(BaseModel):
    employee_id: str
    month: str = ""
    year: int = 2026
    gross_salary: float = 0.0
    basic_salary: float = 0.0
    allowances: float = 0.0
    deductions: float = 0.0
    working_days: int = 0
    days_attended: int = 0
    net_salary: float = 0.0
    payment_date: str | None = None
    status: str = "pending"
    approved_by: str | None = None
    notes: str | None = None


class SalaryCreate(SalaryBase):
    pass


class SalaryUpdate(BaseModel):
    employee_id: str | None = None
    month: str | None = None
    year: int | None = None
    gross_salary: float | None = None
    basic_salary: float | None = None
    allowances: float | None = None
    deductions: float | None = None
    working_days: int | None = None
    days_attended: int | None = None
    net_salary: float | None = None
    payment_date: str | None = None
    status: str | None = None
    approved_by: str | None = None
    notes: str | None = None


class SalaryResponse(SalaryBase):
    id: str
    employee_name: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True
