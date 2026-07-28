from datetime import datetime
from pydantic import BaseModel


class RoleBase(BaseModel):
    name: str
    permissions: str = "{}"


class RoleCreate(RoleBase):
    pass


class RoleUpdate(BaseModel):
    name: str | None = None
    permissions: str | None = None


class RoleResponse(RoleBase):
    id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True
