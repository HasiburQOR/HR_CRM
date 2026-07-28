from datetime import date

from sqlalchemy import func

from app.repositories.base import BaseRepository
from app.models.expense import Expense


class ExpenseRepository(BaseRepository[Expense]):
    def __init__(self, db):
        super().__init__(Expense, db)

    def get_filtered(
        self, skip: int = 0, limit: int = 100, category: str = None,
        employee_id: str = None, start_date: date = None, end_date: date = None,
    ) -> tuple[list[Expense], int]:
        query = self.db.query(Expense).filter(Expense.deleted_at.is_(None))
        if category:
            query = query.filter(Expense.category == category)
        if employee_id:
            query = query.filter(Expense.employee_id == employee_id)
        if start_date:
            query = query.filter(Expense.expense_date >= start_date)
        if end_date:
            query = query.filter(Expense.expense_date <= end_date)
        total = query.count()
        records = query.order_by(Expense.expense_date.desc()).offset(skip).limit(limit).all()
        return records, total

    def get_by_employee(self, employee_id: str) -> list[Expense]:
        return self.db.query(Expense).filter(
            Expense.employee_id == employee_id,
            Expense.deleted_at.is_(None),
        ).all()

    def get_by_category(self, category: str) -> list[Expense]:
        return self.db.query(Expense).filter(
            Expense.category == category,
            Expense.deleted_at.is_(None),
        ).all()

    def get_by_date_range(self, start_date: date, end_date: date) -> list[Expense]:
        return self.db.query(Expense).filter(
            Expense.expense_date >= start_date,
            Expense.expense_date <= end_date,
            Expense.deleted_at.is_(None),
        ).all()

    def get_pending(self) -> list[Expense]:
        return self.db.query(Expense).filter(
            Expense.status == "pending",
            Expense.deleted_at.is_(None),
        ).all()

    def get_summary_by_category(self, start_date: date, end_date: date) -> list[dict]:
        return self.db.query(
            Expense.category,
            func.sum(Expense.amount).label("total"),
            func.count(Expense.id).label("count"),
        ).filter(
            Expense.expense_date >= start_date,
            Expense.expense_date <= end_date,
            Expense.deleted_at.is_(None),
        ).group_by(Expense.category).all()
