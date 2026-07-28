from sqlalchemy import Column, String, Date, Time, Boolean, Text, ForeignKey

from app.database import BaseModel


class Attendance(BaseModel):
    __tablename__ = "attendances"

    employee_id = Column(String(36), ForeignKey("employees.id"), nullable=False)
    date = Column(Date, nullable=False)
    clock_in = Column(Time, nullable=True)
    clock_out = Column(Time, nullable=True)
    status = Column(String(50), default="pending")
    approved_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    rejected_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    lunch_break_start = Column(Time, nullable=True)
    lunch_break_end = Column(Time, nullable=True)
    auto_lunch_counted = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)
