from sqlalchemy import Column, String, Text, DateTime

from app.database import BaseModel


class Role(BaseModel):
    __tablename__ = "roles"

    name = Column(String(100), nullable=False, unique=True)
    permissions = Column(Text, default="{}")
    deleted_at = Column(DateTime(timezone=True), nullable=True)
