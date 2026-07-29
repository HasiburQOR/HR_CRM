from sqlalchemy import Column, String, Text, Date, DateTime, ForeignKey

from app.database import BaseModel


class Task(BaseModel):
    __tablename__ = "tasks"

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    assigned_to = Column(String(36), ForeignKey("employees.id"), nullable=True)
    assigned_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    due_date = Column(Date, nullable=True)
    priority = Column(String(50), default="medium")
    status = Column(String(50), default="pending")
    deleted_at = Column(DateTime(timezone=True), nullable=True)
