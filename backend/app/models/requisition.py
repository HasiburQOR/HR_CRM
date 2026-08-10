import uuid
from datetime import datetime, date, timezone

from sqlalchemy import Column, String, Text, Float, Integer, DateTime, Date, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class Requisition(Base):
    __tablename__ = "requisitions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), nullable=False)
    status = Column(String(20), nullable=False, default="open")  # "open" or "closed"
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    closed_at = Column(DateTime, nullable=True)
    duration_days = Column(Integer, nullable=True)
    # Header / address / period info (from Excel ledger layout)
    address = Column(Text, nullable=True)
    period = Column(String(255), nullable=True)
    # Single ledger date shown in the header (Excel row 3, e.g. 2026-07-26)
    ledger_date = Column(Date, nullable=True)

    expenses = relationship("RequisitionExpense", back_populates="requisition", cascade="all, delete-orphan")


class RequisitionExpense(Base):
    __tablename__ = "requisition_expenses"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    requisition_id = Column(String, ForeignKey("requisitions.id", ondelete="CASCADE"), nullable=False)
    expense_date = Column(Date, nullable=False, default=lambda: date.today())
    notes = Column(Text, nullable=True)
    amount = Column(Float, nullable=False)
    receipt_url = Column(String(500), nullable=True)
    # Ledger-style detail columns (from Excel: Item / Qty / Value)
    # qty is TEXT to preserve values like "1 Pc", "6 Set", "200 gm"
    vendor = Column(String(255), nullable=True)
    department = Column(String(100), nullable=True)
    qty = Column(String(50), nullable=True)
    # Approval workflow: each expense must be manually approved/rejected by an admin
    status = Column(String(20), nullable=False, default="pending")  # "pending" | "approved" | "rejected"
    approved_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    rejected_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    requisition = relationship("Requisition", back_populates="expenses")