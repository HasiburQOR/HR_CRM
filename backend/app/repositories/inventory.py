from typing import Any
from sqlalchemy import or_

from app.repositories.base import BaseRepository
from app.models.inventory import InventoryItem
from app.models.employee import Employee


class InventoryRepository(BaseRepository[InventoryItem]):
    def __init__(self, db):
        super().__init__(InventoryItem, db)

    def get_filtered(
        self,
        skip: int = 0,
        limit: int = 100,
        search: str | None = None,
        category: str | None = None,
        item_type: str | None = None,
        status: str | None = None,
        employee_id: str | None = None,
        assigned: bool | None = None,
        low_stock: bool = False,
    ) -> tuple[list[InventoryItem], int]:
        query = self.db.query(InventoryItem).filter(InventoryItem.deleted_at.is_(None))
        if search:
            term = f"%{search}%"
            query = query.filter(
                or_(
                    InventoryItem.name.ilike(term),
                    InventoryItem.item_code.ilike(term),
                    InventoryItem.serial_number.ilike(term),
                    InventoryItem.description.ilike(term),
                )
            )
        if category and category != "all":
            query = query.filter(InventoryItem.category == category)
        if item_type and item_type != "all":
            query = query.filter(InventoryItem.item_type == item_type)
        if status and status != "all":
            query = query.filter(InventoryItem.status == status)
        if employee_id and employee_id != "all":
            query = query.filter(InventoryItem.employee_id == employee_id)
        if assigned is True:
            query = query.filter(InventoryItem.employee_id.isnot(None))
        elif assigned is False:
            query = query.filter(InventoryItem.employee_id.is_(None))
        if low_stock:
            query = query.filter(InventoryItem.quantity <= InventoryItem.minimum_stock)
        total = query.count()
        records = query.order_by(InventoryItem.updated_at.desc(), InventoryItem.created_at.desc()).offset(skip).limit(limit).all()
        return records, total

    def get_categories(self) -> list[str]:
        rows = (
            self.db.query(InventoryItem.category)
                .filter(InventoryItem.deleted_at.is_(None), InventoryItem.category.isnot(None))
                .distinct()
                .order_by(InventoryItem.category.asc())
                .all()
        )
        return [r[0] for r in rows if r[0]]

    def get_stats(self) -> dict[str, Any]:
        from sqlalchemy import func
        q = self.db.query(InventoryItem).filter(InventoryItem.deleted_at.is_(None))
        total_items = q.count()
        total_value = self.db.query(func.coalesce(func.sum(InventoryItem.quantity * InventoryItem.unit_cost), 0)).filter(
            InventoryItem.deleted_at.is_(None)
        ).scalar() or 0
        assigned_count = q.filter(InventoryItem.employee_id.isnot(None)).count()
        in_stock_count = q.filter(InventoryItem.status == "in_stock").count()
        low_stock_count = q.filter(InventoryItem.quantity <= InventoryItem.minimum_stock).count()
        by_category = (
            self.db.query(InventoryItem.category, func.count(InventoryItem.id))
                .filter(InventoryItem.deleted_at.is_(None))
                .group_by(InventoryItem.category)
                .all()
        )
        return {
            "total_items": total_items,
            "total_units": int(
                self.db.query(func.coalesce(func.sum(InventoryItem.quantity), 0))
                    .filter(InventoryItem.deleted_at.is_(None))
                    .scalar() or 0
            ),
            "total_value": float(total_value or 0),
            "assigned_count": assigned_count,
            "in_stock_count": in_stock_count,
            "low_stock_count": low_stock_count,
            "by_category": [{"category": c or "Uncategorized", "count": n} for c, n in by_category],
        }

    def get_by_employee(self, employee_id: str) -> list[InventoryItem]:
        return (
            self.db.query(InventoryItem)
                .filter(InventoryItem.employee_id == employee_id, InventoryItem.deleted_at.is_(None))
                .order_by(InventoryItem.updated_at.desc())
                .all()
        )
