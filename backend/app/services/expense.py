from datetime import date

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.expense import ExpenseRepository


class ExpenseService:
    def __init__(self, db: Session):
        self.repo = ExpenseRepository(db)

    def get_all(self, skip: int = 0, limit: int = 100, **filters):
        return self.repo.get_all(skip=skip, limit=limit, **filters)

    def get_filtered(
        self, skip: int = 0, limit: int = 100, category: str = None,
        employee_id: str = None, start_date: date = None, end_date: date = None,
        sort_by: str = "expense_date", sort_order: str = "desc",
    ):
        return self.repo.get_filtered(
            skip, limit, category, employee_id, start_date, end_date, sort_by, sort_order
        )

    def bulk_delete(self, ids: list[str]) -> int:
        return self.repo.bulk_delete(ids)

    def get_by_id(self, expense_id: str):
        record = self.repo.get(expense_id)
        if not record or record.deleted_at:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
        return record

    def create(self, data: dict):
        return self.repo.create(data)

    def update(self, expense_id: str, data: dict):
        record = self.repo.get(expense_id)
        if not record or record.deleted_at:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
        return self.repo.update(expense_id, data)

    def delete(self, expense_id: str):
        record = self.repo.get(expense_id)
        if not record or record.deleted_at:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
        return self.repo.delete(expense_id)

    def approve(self, expense_id: str, approved_by: str):
        record = self.repo.get(expense_id)
        if not record or record.deleted_at:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
        if record.status != "pending":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending expenses can be approved")
        return self.repo.update(expense_id, {"status": "approved", "approved_by": approved_by})

    def reject(self, expense_id: str, rejected_by: str):
        record = self.repo.get(expense_id)
        if not record or record.deleted_at:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
        if record.status != "pending":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending expenses can be rejected")
        return self.repo.update(expense_id, {"status": "rejected", "rejected_by": rejected_by})

    def get_by_employee(self, employee_id: str):
        return self.repo.get_by_employee(employee_id)

    def get_by_date_range(self, start_date: date, end_date: date):
        return self.repo.get_by_date_range(start_date, end_date)

    def get_summary(self, start_date: date, end_date: date):
        return self.repo.get_summary_by_category(start_date, end_date)
