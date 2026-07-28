from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.inventory import InventoryRepository
from app.models.inventory import InventoryItem


class InventoryService:
    def __init__(self, db: Session):
        self.repo = InventoryRepository(db)
        self.db = db

    def get_filtered(self, **kwargs):
        return self.repo.get_filtered(**kwargs)

    def get_by_id(self, item_id: str) -> InventoryItem:
        record = self.repo.get(item_id)
        if not record or record.deleted_at:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
        return record

    def create(self, data: dict) -> InventoryItem:
        existing = (
            self.db.query(InventoryItem)
                .filter(InventoryItem.item_code == data.get("item_code"),
                        InventoryItem.deleted_at.is_(None))
                .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Item code already exists")
        if not data.get("quantity") or data["quantity"] < 0:
            raise HTTPException(status_code=400, detail="Quantity must be >= 0")
        return self.repo.create(data)

    def update(self, item_id: str, data: dict) -> InventoryItem:
        record = self.get_by_id(item_id)
        if "item_code" in data and data["item_code"] != record.item_code:
            conflict = (
                self.db.query(InventoryItem)
                    .filter(InventoryItem.item_code == data["item_code"],
                            InventoryItem.deleted_at.is_(None),
                            InventoryItem.id != record.id)
                    .first()
            )
            if conflict:
                raise HTTPException(status_code=400, detail="Item code already exists")
        if "quantity" in data and (data["quantity"] is None or data["quantity"] < 0):
            raise HTTPException(status_code=400, detail="Quantity must be >= 0")
        return self.repo.update(item_id, data)

    def delete(self, item_id: str):
        record = self.get_by_id(item_id)
        return self.repo.delete(item_id)

    def assign(self, item_id: str, employee_id: str, assigned_at=None, assignment_notes: str | None = None):
        record = self.get_by_id(item_id)
        if not employee_id:
            raise HTTPException(status_code=400, detail="Employee is required")
        return self.repo.update(item_id, {
            "employee_id": employee_id,
            "assigned_at": assigned_at,
            "assignment_notes": assignment_notes,
            "status": "assigned",
        })

    def unassign(self, item_id: str):
        record = self.get_by_id(item_id)
        return self.repo.update(item_id, {
            "employee_id": None,
            "assigned_at": None,
            "assignment_notes": None,
            "status": "in_stock",
        })

    def get_stats(self) -> dict:
        return self.repo.get_stats()

    def get_categories(self) -> list[str]:
        return self.repo.get_categories()

    def get_by_employee(self, employee_id: str) -> list[InventoryItem]:
        return self.repo.get_by_employee(employee_id)
