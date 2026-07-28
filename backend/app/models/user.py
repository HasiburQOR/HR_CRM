from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey

from app.database import BaseModel


class User(BaseModel):
    __tablename__ = "users"

    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    role_id = Column(String(36), ForeignKey("roles.id"), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
