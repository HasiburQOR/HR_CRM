from sqlalchemy import Column, String, Date, Float, Boolean, DateTime, ForeignKey, Text

from app.database import BaseModel


class Employee(BaseModel):
    __tablename__ = "employees"

    user_id = Column(String(36), ForeignKey("users.id"), unique=True, nullable=True)
    employee_id = Column(String(50), unique=True, nullable=False, index=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=True)
    nid = Column(String(50), nullable=True)
    designation = Column(String(100), nullable=True)
    department = Column(String(100), nullable=True)
    date_of_joining = Column(Date, nullable=True)
    date_of_birth = Column(Date, nullable=True)
    address = Column(Text, nullable=True)
    salary = Column(Float, default=0.0)
    status = Column(String(50), default="active")
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    # Attendance CRM lock — set automatically when the employee misses the
    # daily check-in/check-out deadline; cleared only by an admin unlock.
    crm_locked = Column(Boolean, default=False)
    crm_lock_reason = Column(Text, nullable=True)
    crm_locked_at = Column(DateTime(timezone=True), nullable=True)
    # Date (BD time) an admin last unlocked this employee. Prevents the
    # missed-deadline check from immediately re-locking them for the same
    # day they were just unlocked on.
    crm_unlocked_date = Column(Date, nullable=True)
