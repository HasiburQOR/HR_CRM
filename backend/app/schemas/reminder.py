from datetime import datetime, date
from pydantic import BaseModel, field_validator


class ReminderBase(BaseModel):
    title: str
    description: str | None = None
    reminder_date: date | None = None
    reminder_time: str | None = None
    reminder_datetime: str | None = None
    message: str | None = None
    is_completed: bool = False


class ReminderCreate(BaseModel):
    title: str
    description: str | None = None
    reminder_date: date | None = None
    reminder_time: str | None = None
    reminder_datetime: str | None = None
    message: str | None = None
    is_completed: bool = False


class ReminderUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    reminder_date: date | None = None
    reminder_time: str | None = None
    reminder_datetime: str | None = None
    message: str | None = None
    is_completed: bool | None = None


class ReminderResponse(ReminderBase):
    id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True
