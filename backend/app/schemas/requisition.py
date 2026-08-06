from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class RequisitionCreate(BaseModel):
    title: str


class RequisitionResponse(BaseModel):
    id: str
    title: str
    status: str
    created_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    duration_days: Optional[int] = None

    class Config:
        from_attributes = True


class ExpenseCreate(BaseModel):
    notes: Optional[str] = None
    amount: float
    receipt: Optional[str] = None  # filename hint


class ExpenseResponse(BaseModel):
    id: str
    requisition_id: str
    notes: Optional[str] = None
    amount: float
    receipt_url: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RequisitionWithExpenses(RequisitionResponse):
    expenses: list[ExpenseResponse] = []