from sqlalchemy import Column, String, Date, Float, DateTime, ForeignKey, Text

from app.database import BaseModel


class Employee(BaseModel):
    __tablename__ = "employees"

    user_id = Column(String(36), ForeignKey("users.id"), unique=True, nullable=True)
    employee_id = Column(String(50), unique=True, nullable=False, index=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=True)
    nid = Column(String(50), nullable=True)
    designation = Column(String(100), nullable=True)
    department = Column(String(100), nullable=True)
    date_of_joining = Column(Date, nullable=True)
    date_of_birth = Column(Date, nullable=True)
    address = Column(Text, nullable=True)
    salary = Column(Float, default=0.0)
    status = Column(String(50), default="active")
    deleted_at = Column(DateTime(timezone=True), nullable=True)
