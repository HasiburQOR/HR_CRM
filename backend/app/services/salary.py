from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.salary import SalaryRepository


class SalaryService:
    def __init__(self, db: Session):
        self.repo = SalaryRepository(db)

    def get_all(self, skip: int = 0, limit: int = 100):
        return self.repo.get_all(skip=skip, limit=limit)

    def get_by_id(self, salary_id: str):
        record = self.repo.get(salary_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary record not found")
        return record

    def create(self, data: dict):
        return self.repo.create(data)

    def update(self, salary_id: str, data: dict):
        record = self.repo.get(salary_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary record not found")
        return self.repo.update(salary_id, data)

    def delete(self, salary_id: str):
        record = self.repo.get(salary_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary record not found")
        return self.repo.hard_delete(salary_id)
