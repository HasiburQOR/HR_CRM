from datetime import datetime
from pydantic import BaseModel


class BackupBase(BaseModel):
    filename: str
    filepath: str
    size_bytes: int = 0
    status: str = "pending"
    backup_type: str = "full"


class BackupCreate(BackupBase):
    pass


class BackupUpdate(BaseModel):
    status: str | None = None
    size_bytes: int | None = None


class BackupResponse(BackupBase):
    id: str
    created_at: datetime | None = None

    class Config:
        from_attributes = True
