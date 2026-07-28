from datetime import date, datetime
from pydantic import BaseModel


class TaskBase(BaseModel):
    title: str
    description: str | None = None
    assigned_to: str | None = None
    assigned_by: str | None = None
    due_date: date | None = None
    priority: str = "medium"
    status: str = "pending"


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    assigned_to: str | None = None
    due_date: date | None = None
    priority: str | None = None
    status: str | None = None


class TaskResponse(TaskBase):
    id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True
