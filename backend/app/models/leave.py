from sqlalchemy import Column, String, Date, Text, ForeignKey

from app.database import BaseModel


class LeaveRequest(BaseModel):
    __tablename__ = "leave_requests"

    employee_id = Column(String(36), ForeignKey("employees.id"), nullable=False)
    leave_type = Column(String(50), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    reason = Column(Text, nullable=True)
    status = Column(String(50), default="pending")
    approved_by = Column(String(36), ForeignKey("users.id"), nullable=True)
