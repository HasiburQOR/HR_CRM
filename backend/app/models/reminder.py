from sqlalchemy import Column, String, Text, DateTime, Boolean, ForeignKey, Date

from app.database import BaseModel
from app.utils.timezone import get_bd_now


class Reminder(BaseModel):
    __tablename__ = "reminders"

    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    reminder_date = Column(Date, nullable=True)
    reminder_time = Column(String(10), nullable=True)
    is_completed = Column(Boolean, default=False)
    remind_at = Column(DateTime(timezone=True), nullable=True)
    is_sent = Column(Boolean, default=False)
