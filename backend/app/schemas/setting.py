from datetime import datetime
from pydantic import BaseModel


class SettingBase(BaseModel):
    key: str
    value: str | None = None
    description: str | None = None


class SettingCreate(SettingBase):
    pass


class SettingUpdate(BaseModel):
    value: str | None = None
    description: str | None = None


class SettingResponse(SettingBase):
    id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True
