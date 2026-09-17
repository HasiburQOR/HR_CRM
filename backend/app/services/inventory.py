import re

from datetime import date
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.inventory import InventoryRepository
from app.models.inventory import InventoryItem
from app.models.employee import Employee

ITEM_TYPE_CODES = {
    "equipment": "EQ",
    "supplies": "SUP",
    "furniture": "FUR",
    "devices": "DEV",
    "consumable": "CON",
    "access_card": "ACC",
    "key": "KEY",
    "other": "OTH",
}


def _category_code(category: str) -> str:
    words = [w for w in re.split(r"[^A-Za-z0-9]+", (category or "").strip()) if w]
    if not words:
        return "GEN"
    if len(words) == 1:
        return words[0][:3].upper()
    return "".join(w[0] for w in words).upper()


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
        if data.get("quantity") is None or data["quantity"] < 0:
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

    # ----- stock in/out (assignments to employees) -----

    _AUTO_STATUSES = {"in_stock", "assigned", "low_stock", "out_of_stock"}

    @classmethod
    def _compute_status(cls, current: str | None, quantity: int, minimum_stock: int, has_active: bool) -> str:
        """Derive stock status. Manual statuses (damaged/reserved/retired) are kept."""
        if current not in cls._AUTO_STATUSES:
            return current or "in_stock"
        if quantity <= 0:
            return "assigned" if has_active else "out_of_stock"
        if quantity <= (minimum_stock or 0):
            return "low_stock"
        return "in_stock"

    def assign(self, item_id: str, employee_id: str, quantity: int = 1, condition: str | None = None,
               assigned_at=None, notes: str | None = None) -> InventoryItem:
        """Hand out `quantity` units to an employee — stock is decremented."""
        record = self.get_by_id(item_id)
        if not employee_id:
            raise HTTPException(status_code=400, detail="Employee is required")
        emp = (
            self.db.query(Employee)
                .filter(Employee.id == employee_id, Employee.deleted_at.is_(None))
                .first()
        )
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
        try:
            quantity = int(quantity or 1)
        except (TypeError, ValueError):
            quantity = 1
        if quantity < 1:
            raise HTTPException(status_code=400, detail="Quantity must be at least 1")
        if quantity > (record.quantity or 0):
            raise HTTPException(
                status_code=400,
                detail=f"Not enough stock: only {record.quantity or 0} unit(s) available",
            )

        self.repo.create_assignment({
            "item_id": item_id,
            "employee_id": employee_id,
            "quantity": quantity,
            "condition": condition,
            "assigned_at": assigned_at or date.today(),
            "status": "active",
            "notes": notes,
        })

        record.quantity = (record.quantity or 0) - quantity
        record.employee_id = employee_id
        if not record.assigned_at:
            record.assigned_at = assigned_at or date.today()
        if notes:
            record.assignment_notes = notes
        record.status = self._compute_status(record.status, record.quantity, record.minimum_stock or 0, True)
        self.db.commit()
        self.db.refresh(record)
        return record

    def return_assignment(self, assignment_id: str, return_condition: str | None = None,
                          notes: str | None = None) -> InventoryItem:
        """Take an assignment back — the units return to stock."""
        assignment = self.repo.get_assignment(assignment_id)
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")
        if assignment.status != "active":
            raise HTTPException(status_code=400, detail="This assignment was already returned")

        item = self.get_by_id(assignment.item_id)
        self.repo.update_assignment(assignment_id, {
            "status": "returned",
            "returned_at": date.today(),
            "return_condition": return_condition or assignment.condition,
            "notes": notes or assignment.notes,
        })

        item.quantity = (item.quantity or 0) + (assignment.quantity or 1)
        remaining = self.repo.get_active_assignments(item.id)
        if remaining:
            last = remaining[0]  # most recent still-active assignment
            item.employee_id = last.employee_id
            item.assigned_at = last.assigned_at
        else:
            item.employee_id = None
            item.assigned_at = None
            item.assignment_notes = None
        if return_condition:
            item.condition = return_condition  # product condition reflects the returned state
        item.status = self._compute_status(item.status, item.quantity, item.minimum_stock or 0, bool(remaining))
        self.db.commit()
        self.db.refresh(item)
        return item

    def unassign(self, item_id: str) -> InventoryItem:
        """Return every active assignment of this item back to stock."""
        self.get_by_id(item_id)
        for assignment in self.repo.get_active_assignments(item_id):
            self.return_assignment(assignment.id)
        return self.get_by_id(item_id)

    def get_stats(self) -> dict:
        return self.repo.get_stats()

    def get_categories(self) -> list[str]:
        return self.repo.get_categories()

    def get_next_item_code(self, category: str, item_type: str) -> str:
        category = (category or "").strip()
        item_type = (item_type or "").strip()
        if not category:
            raise HTTPException(status_code=400, detail="Category is required to generate an item code")
        prefix = f"{_category_code(category)}-{ITEM_TYPE_CODES.get(item_type, 'OTH')}-"
        pattern = re.compile(r"^" + re.escape(prefix) + r"(\d+)$")
        rows = (
            self.db.query(InventoryItem.item_code)
                .filter(InventoryItem.item_code.like(f"{prefix}%"),
                        InventoryItem.deleted_at.is_(None))
                .all()
        )
        max_seq = 0
        for (code,) in rows:
            m = pattern.match(code or "")
            if m:
                max_seq = max(max_seq, int(m.group(1)))
        return f"{prefix}{max_seq + 1:03d}"

    def get_by_employee(self, employee_id: str) -> list[InventoryItem]:
        return self.repo.get_by_employee(employee_id)
