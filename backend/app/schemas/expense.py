from datetime import date, datetime
from pydantic import BaseModel


class ExpenseBase(BaseModel):
    employee_id: str | None = None
    product_name: str | None = None
    category: str
    custom_category: str | None = None
    amount: float
    description: str | None = None
    expense_date: date
    status: str = "pending"
    approved_by: str | None = None
    rejected_by: str | None = None


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    employee_id: str | None = None
    product_name: str | None = None
    category: str | None = None
    custom_category: str | None = None
    amount: float | None = None
    description: str | None = None
    expense_date: date | None = None
    receipt_url: str | None = None
    status: str | None = None
    approved_by: str | None = None
    rejected_by: str | None = None


class ExpenseResponse(ExpenseBase):
    id: str
    receipt_url: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True
