from sqlalchemy import Column, String, Float, Integer, ForeignKey
from sqlalchemy.orm import relationship

from app.database import BaseModel


class Salary(BaseModel):
    __tablename__ = "salaries"

    employee_id = Column(String(36), ForeignKey("employees.id"), nullable=False)
    month = Column(String(20), nullable=False, default="")
    year = Column(Integer, nullable=False, default=2026)
    gross_salary = Column(Float, default=0.0)
    basic_salary = Column(Float, default=0.0)
    allowances = Column(Float, default=0.0)
    deductions = Column(Float, default=0.0)
    net_salary = Column(Float, default=0.0)
    payment_date = Column(String(50), nullable=True)
    status = Column(String(20), default="pending")
    approved_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    notes = Column(String(500), nullable=True)

    employee = relationship("Employee", backref="salaries", lazy="joined")
