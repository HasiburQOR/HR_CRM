from datetime import datetime, timezone
from typing import Any
from sqlalchemy import or_

from app.repositories.base import BaseRepository
from app.models.inventory import InventoryItem, InventoryAssignment
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
        assigned_count = self.count_assigned_units()
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
        rows = self.get_active_assignments_by_employee(employee_id)
        return [it for _, it in rows]

    # ----- assignments (stock in/out per employee) -----

    def create_assignment(self, data: dict) -> InventoryAssignment:
        allowed = {c.key for c in InventoryAssignment.__table__.columns}
        assignment = InventoryAssignment(**{k: v for k, v in data.items() if k in allowed})
        self.db.add(assignment)
        self.db.commit()
        self.db.refresh(assignment)
        return assignment

    def get_assignment(self, assignment_id: str) -> InventoryAssignment | None:
        return (
            self.db.query(InventoryAssignment)
                .filter(InventoryAssignment.id == assignment_id,
                        InventoryAssignment.deleted_at.is_(None))
                .first()
        )

    def update_assignment(self, assignment_id: str, data: dict) -> InventoryAssignment | None:
        assignment = self.get_assignment(assignment_id)
        if not assignment:
            return None
        allowed = {c.key for c in InventoryAssignment.__table__.columns}
        for field, value in data.items():
            if field in allowed:
                setattr(assignment, field, value)
        assignment.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(assignment)
        return assignment

    def get_active_assignments(self, item_id: str) -> list[InventoryAssignment]:
        return (
            self.db.query(InventoryAssignment)
                .filter(InventoryAssignment.item_id == item_id,
                        InventoryAssignment.status == "active",
                        InventoryAssignment.deleted_at.is_(None))
                .order_by(InventoryAssignment.assigned_at.desc(),
                          InventoryAssignment.created_at.desc())
                .all()
        )

    def get_active_assignments_for_items(self, item_ids: list[str]) -> list[InventoryAssignment]:
        if not item_ids:
            return []
        return (
            self.db.query(InventoryAssignment)
                .filter(InventoryAssignment.item_id.in_(item_ids),
                        InventoryAssignment.status == "active",
                        InventoryAssignment.deleted_at.is_(None))
                .order_by(InventoryAssignment.created_at.desc())
                .all()
        )

    def get_item_assignments(self, item_id: str) -> list[InventoryAssignment]:
        return (
            self.db.query(InventoryAssignment)
                .filter(InventoryAssignment.item_id == item_id,
                        InventoryAssignment.deleted_at.is_(None))
                .order_by(InventoryAssignment.created_at.desc())
                .all()
        )

    def get_active_assignments_by_employee(self, employee_id: str) -> list[tuple[InventoryAssignment, InventoryItem]]:
        return (
            self.db.query(InventoryAssignment, InventoryItem)
                .join(InventoryItem, InventoryItem.id == InventoryAssignment.item_id)
                .filter(InventoryAssignment.employee_id == employee_id,
                        InventoryAssignment.status == "active",
                        InventoryAssignment.deleted_at.is_(None),
                        InventoryItem.deleted_at.is_(None))
                .order_by(InventoryAssignment.assigned_at.desc())
                .all()
        )

    def count_assigned_units(self) -> int:
        from sqlalchemy import func
        value = (
            self.db.query(func.coalesce(func.sum(InventoryAssignment.quantity), 0))
                .filter(InventoryAssignment.status == "active",
                        InventoryAssignment.deleted_at.is_(None))
                .scalar()
        )
        return int(value or 0)
