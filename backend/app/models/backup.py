from sqlalchemy import Column, String, Integer, DateTime

from app.database import BaseModel


class Backup(BaseModel):
    __tablename__ = "backups"

    filename = Column(String(255), nullable=False)
    filepath = Column(String(512), nullable=False)
    size_bytes = Column(Integer, default=0)
    status = Column(String(50), default="pending")
    backup_type = Column(String(50), default="full")
