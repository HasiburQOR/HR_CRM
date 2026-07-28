from app.repositories.base import BaseRepository
from app.models.salary import Salary


class SalaryRepository(BaseRepository[Salary]):
    def __init__(self, db):
        super().__init__(Salary, db)

    def get_by_employee(self, employee_id: str) -> list[Salary]:
        return self.db.query(Salary).filter(Salary.employee_id == employee_id).all()

    def get_latest_by_employee(self, employee_id: str) -> Salary | None:
        return self.db.query(Salary).filter(Salary.employee_id == employee_id).order_by(Salary.payment_date.desc()).first()
