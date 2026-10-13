from sqlalchemy import Column, String, Date, Text, Integer, ForeignKey

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


class LeaveAttachment(BaseModel):
    """A supporting document (medical certificate, etc.) attached to a leave request."""
    __tablename__ = "leave_attachments"

    leave_request_id = Column(String(36), ForeignKey("leave_requests.id"), nullable=False, index=True)
    original_name = Column(String(255), nullable=False)
    stored_name = Column(String(100), nullable=False)
    size = Column(Integer, default=0)
    uploaded_by = Column(String(36), ForeignKey("users.id"), nullable=True)
