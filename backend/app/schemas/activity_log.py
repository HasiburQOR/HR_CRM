from datetime import datetime
from pydantic import BaseModel


class ActivityLogBase(BaseModel):
    user_id: str | None = None
    action: str
    resource_type: str | None = None
    resource_id: str | None = None
    details: str | None = None
    ip_address: str | None = None


class ActivityLogCreate(ActivityLogBase):
    pass


class ActivityLogResponse(ActivityLogBase):
    id: str
    created_at: datetime | None = None

    class Config:
        from_attributes = True
