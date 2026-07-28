from sqlalchemy import Column, String, Text

from app.database import BaseModel


class Setting(BaseModel):
    __tablename__ = "settings"

    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
