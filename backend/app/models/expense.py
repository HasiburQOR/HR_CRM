from datetime import datetime, timezone

from sqlalchemy import Column, String, Float, Text, Date, DateTime, ForeignKey

from app.database import BaseModel


class Expense(BaseModel):
    __tablename__ = "expenses"

    employee_id = Column(String(36), ForeignKey("employees.id"), nullable=True)
    product_name = Column(String(200), nullable=True)
    category = Column(String(100), nullable=False)
    custom_category = Column(String(200), nullable=True)
    amount = Column(Float, nullable=False)
    description = Column(Text, nullable=True)
    expense_date = Column(Date, nullable=False)
    receipt_url = Column(String(500), nullable=True)
    status = Column(String(50), default="pending")
    approved_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    rejected_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
