from app.repositories.base import BaseRepository
from app.models.employee import Employee


class EmployeeRepository(BaseRepository[Employee]):
    def __init__(self, db):
        super().__init__(Employee, db)

    def get_by_employee_id(self, employee_id: str) -> Employee | None:
        return self.db.query(Employee).filter(Employee.employee_id == employee_id, Employee.deleted_at.is_(None)).first()

    def get_by_user_id(self, user_id: str) -> Employee | None:
        return self.db.query(Employee).filter(Employee.user_id == user_id, Employee.deleted_at.is_(None)).first()

    def get_active(self) -> list[Employee]:
        return self.db.query(Employee).filter(Employee.status == "active", Employee.deleted_at.is_(None)).all()

    def search(self, query: str, skip: int = 0, limit: int = 100):
        q = f"%{query}%"
        return (
            self.db.query(Employee)
            .filter(
                Employee.deleted_at.is_(None),
                (
                    Employee.first_name.ilike(q)
                    | Employee.last_name.ilike(q)
                    | Employee.employee_id.ilike(q)
                    | Employee.email.ilike(q)
                ),
            )
            .offset(skip)
            .limit(limit)
            .all()
        )

    def count_search(self, query: str) -> int:
        q = f"%{query}%"
        return (
            self.db.query(Employee)
            .filter(
                Employee.deleted_at.is_(None),
                (
                    Employee.first_name.ilike(q)
                    | Employee.last_name.ilike(q)
                    | Employee.employee_id.ilike(q)
                    | Employee.email.ilike(q)
                ),
            )
            .count()
        )
