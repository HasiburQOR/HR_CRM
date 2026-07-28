from sqlalchemy import Column, String, Text, DateTime, ForeignKey

from app.database import BaseModel


class ActivityLog(BaseModel):
    __tablename__ = "activity_logs"

    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    action = Column(String(100), nullable=False)
    resource_type = Column(String(100), nullable=True)
    resource_id = Column(String(36), nullable=True)
    details = Column(Text, nullable=True)
    ip_address = Column(String(50), nullable=True)
