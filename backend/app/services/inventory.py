import re

from datetime import date, datetime
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


class _RowError(Exception):
    """A single bad row in an uploaded spreadsheet (message is user-facing)."""


def _clean_str(val) -> str | None:
    """Trim a cell; None / empty / whitespace-only become None."""
    if val is None:
        return None
    s = str(val).strip()
    return s or None


def _parse_date_cell(val) -> date | None:
    """Accept native Excel dates/datetimes plus several common string formats."""
    if val is None or (isinstance(val, str) and not val.strip()):
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    s = str(val).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%d.%m.%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise _RowError(f"'{s}' is not a valid date (use YYYY-MM-DD)")


def _parse_int_cell(val, field: str, default: int | None = None) -> int | None:
    blank = val is None or (isinstance(val, str) and not val.strip())
    if blank:
        return default
    if isinstance(val, bool):
        raise _RowError(f"{field} must be a whole number")
    try:
        num = float(val)
    except (TypeError, ValueError):
        raise _RowError(f"{field} must be a whole number, got '{val}'")
    if not num.is_integer():
        raise _RowError(f"{field} must be a whole number, got '{val}'")
    return int(num)


def _parse_float_cell(val, field: str, default: float | None = None) -> float | None:
    blank = val is None or (isinstance(val, str) and not val.strip())
    if blank:
        return default
    if isinstance(val, bool):
        raise _RowError(f"{field} must be a number")
    try:
        return float(val)
    except (TypeError, ValueError):
        s = str(val).replace(",", "").strip()  # allow currency strings like 1,450.00
        try:
            return float(s)
        except ValueError:
            raise _RowError(f"{field} must be a number, got '{val}'")


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

    # ----- bulk import (Excel upload) -----

    _CONDITIONS = ["New", "Like New", "Good", "Fair", "Damaged", "Needs Repair"]

    _ITEM_TYPE_ALIASES = {
        "equipment": "equipment",
        "supplies": "supplies", "office supplies": "supplies", "supply": "supplies",
        "furniture": "furniture",
        "devices": "devices", "device": "devices", "laptop": "devices", "laptop/phone": "devices",
        "consumable": "consumable", "consumables": "consumable",
        "access_card": "access_card", "access card": "access_card", "accesscard": "access_card",
        "key": "key", "key / fob": "key", "key/fob": "key", "fob": "key",
        "other": "other",
    }

    _STATUS_ALIASES = {
        "in_stock": "in_stock", "instock": "in_stock",
        "assigned": "assigned",
        "low_stock": "low_stock",
        "out_of_stock": "out_of_stock", "outofstock": "out_of_stock",
        "damaged": "damaged", "retired": "retired", "reserved": "reserved",
    }

    def import_rows(self, rows: list[dict], created_by: str | None = None, max_errors: int = 100) -> dict:
        """Upsert inventory items parsed from an uploaded spreadsheet.

        Rows are keyed on item_code: an existing (non-deleted) item with the
        same code is UPDATED — only the cells the user filled in are applied,
        blank cells never erase existing data.  Rows with a blank code are
        created with an auto-generated code.  Bad rows are skipped and
        reported; everything else is committed in a single transaction.
        """
        # Employee-ID (e.g. EMP-001) → employees.id lookup, built once.
        emp_map = {
            (e.employee_id or "").strip().upper(): e.id
            for e in self.db.query(Employee).filter(Employee.deleted_at.is_(None)).all()
            if e.employee_id
        }

        created = updated = 0
        errors: list[dict] = []
        touched: dict[str, InventoryItem] = {}  # item codes seen/added in this import

        for rec in rows:
            row_no = rec.get("_row")
            try:
                item, is_new = self._upsert_row(rec, emp_map, touched, created_by)
            except _RowError as exc:
                errors.append({"row": row_no, "message": str(exc)})
                continue
            if item is None:
                continue  # completely blank row
            touched[item.item_code] = item
            if is_new:
                created += 1
            else:
                updated += 1

        if created or updated:
            try:
                self.db.commit()
            except Exception as exc:
                self.db.rollback()
                raise HTTPException(status_code=500, detail=f"Failed to save inventory items: {exc}")

        parts = [f"{created} item(s) created", f"{updated} item(s) updated"]
        if errors:
            parts.append(f"{len(errors)} row(s) skipped")
        return {
            "created": created,
            "updated": updated,
            "failed": len(errors),
            "errors": errors[:max_errors],
            "message": ", ".join(parts) + ".",
        }

    def _upsert_row(self, rec: dict, emp_map: dict, touched: dict,
                    created_by: str | None) -> tuple[InventoryItem | None, bool]:
        """Validate one parsed sheet row and create-or-update its item.

        Raises _RowError with a user-facing message when the row is invalid.
        Returns (item, is_new); (None, False) for a completely blank row.
        """
        # -- required text fields ------------------------------------------
        name = _clean_str(rec.get("name"))
        category = _clean_str(rec.get("category"))
        item_code = _clean_str(rec.get("item_code"))
        if not name and not category and not item_code:
            return None, False  # nothing identifying this row — skip silently
        if not item_code:
            # no code means this row must create an item → name + category required
            if not name:
                raise _RowError("Name is required")
            if not category:
                raise _RowError("Category is required")

        # -- normalised enums ------------------------------------------------
        item_type = None
        item_type_raw = _clean_str(rec.get("item_type"))
        if item_type_raw:
            item_type = self._ITEM_TYPE_ALIASES.get(re.sub(r"\s+", " ", item_type_raw.lower()))
            if not item_type:
                raise _RowError(
                    f"Item Type '{item_type_raw}' is invalid "
                    "(use: equipment, supplies, furniture, devices, consumable, access_card, key, other)"
                )

        condition = None
        condition_raw = _clean_str(rec.get("condition"))
        if condition_raw:
            condition = next((c for c in self._CONDITIONS if c.lower() == condition_raw.lower()), None)
            if not condition:
                raise _RowError(f"Condition '{condition_raw}' is invalid (use: {', '.join(self._CONDITIONS)})")

        status = None
        status_raw = _clean_str(rec.get("status"))
        if status_raw:
            status = self._STATUS_ALIASES.get(re.sub(r"[\s_-]+", "_", status_raw.lower()))
            if not status:
                raise _RowError(
                    f"Status '{status_raw}' is invalid "
                    "(use: in_stock, assigned, low_stock, out_of_stock, damaged, retired, reserved)"
                )

        # -- numbers ----------------------------------------------------------
        quantity = _parse_int_cell(rec.get("quantity"), "Quantity")
        minimum_stock = _parse_int_cell(rec.get("minimum_stock"), "Min Stock")
        unit_cost = _parse_float_cell(rec.get("unit_cost"), "Unit Cost")
        if quantity is not None and quantity < 0:
            raise _RowError("Quantity must be 0 or more")
        if minimum_stock is not None and minimum_stock < 0:
            raise _RowError("Min Stock must be 0 or more")
        if unit_cost is not None and unit_cost < 0:
            raise _RowError("Unit Cost must be 0 or more")

        # -- dates -------------------------------------------------------------
        purchase_date = _parse_date_cell(rec.get("purchase_date"))
        warranty_end_date = _parse_date_cell(rec.get("warranty_end_date"))
        assigned_at = _parse_date_cell(rec.get("assigned_at"))

        # -- employee reference (EMP-001 → employees.id) ------------------------
        employee_id = None
        employee_ref = _clean_str(rec.get("employee_ref"))
        if employee_ref:
            employee_id = emp_map.get(employee_ref.upper())
            if not employee_id:
                raise _RowError(f"Employee ID '{employee_ref}' was not found")

        # -- assemble only the provided (non-blank) fields ------------------------
        provided: dict = {}
        if name is not None:
            provided["name"] = name
        if category is not None:
            provided["category"] = category
        if item_type is not None:
            provided["item_type"] = item_type
        for key in ("sub_category", "description", "condition", "location",
                    "serial_number", "model_number", "manufacturer", "assignment_notes"):
            val = _clean_str(rec.get(key))
            if val is not None:
                provided[key] = val
        unit = _clean_str(rec.get("unit_of_measure"))
        if unit:
            provided["unit_of_measure"] = unit
        if quantity is not None:
            provided["quantity"] = quantity
        if minimum_stock is not None:
            provided["minimum_stock"] = minimum_stock
        if unit_cost is not None:
            provided["unit_cost"] = unit_cost
        if purchase_date is not None:
            provided["purchase_date"] = purchase_date
        if warranty_end_date is not None:
            provided["warranty_end_date"] = warranty_end_date
        if assigned_at is not None:
            provided["assigned_at"] = assigned_at
        if employee_id is not None:
            provided["employee_id"] = employee_id
        if status is not None:
            provided["status"] = status

        return self._apply_row(item_code=item_code, provided=provided,
                               employee_id=employee_id, status=status, touched=touched,
                               created_by=created_by)

    def _apply_row(self, item_code: str | None, provided: dict, employee_id: str | None,
                   status: str | None, touched: dict, created_by: str | None) -> tuple[InventoryItem, bool]:
        """Create or update the item a validated sheet row refers to."""
        existing: InventoryItem | None = None
        if item_code:
            existing = touched.get(item_code) or (
                self.db.query(InventoryItem)
                    .filter(InventoryItem.item_code == item_code,
                            InventoryItem.deleted_at.is_(None))
                    .first()
            )
        if existing is not None:
            fields = dict(provided)  # the code itself is the match key, never changed here
            if employee_id is not None and not existing.employee_id and fields.get("assigned_at") is None:
                fields["assigned_at"] = date.today()
            if status is None and (employee_id is not None or "quantity" in fields or "minimum_stock" in fields):
                eff_qty = fields.get("quantity", existing.quantity or 0)
                eff_min = fields.get("minimum_stock", existing.minimum_stock or 0)
                fields["status"] = "assigned" if employee_id is not None else self._compute_status(
                    existing.status, eff_qty, eff_min, False)
            for field, value in fields.items():
                setattr(existing, field, value)
            return existing, False

        # -- create ------------------------------------------------------------
        if not provided.get("name") or not provided.get("category"):
            raise _RowError(
                f"Item Code '{item_code}' was not found — Name and Category are required to create it"
                if item_code else "Name and Category are required"
            )
        if not item_code:
            item_code = self.get_next_item_code(provided["category"], provided.get("item_type") or "equipment")
            # The DB query can't see rows added earlier in this same import
            # (autoflush is off), so bump past any code we already handed out.
            while item_code in touched:
                m = re.match(r"^(.*?)(\d+)$", item_code)
                item_code = f"{m.group(1)}{int(m.group(2)) + 1:0{len(m.group(2))}d}" if m else f"{item_code}-2"
        payload = {
            "item_code": item_code,
            "quantity": provided.get("quantity", 1),
            "minimum_stock": provided.get("minimum_stock", 0),
            "unit_cost": provided.get("unit_cost", 0.0),
            "unit_of_measure": provided.get("unit_of_measure", "unit"),
            "status": status or (
                "assigned" if employee_id is not None else self._compute_status(
                    "in_stock", provided.get("quantity", 1), provided.get("minimum_stock", 0), False)
            ),
            "created_by": created_by,
        }
        payload.update({k: v for k, v in provided.items() if k not in payload})
        if employee_id is not None and "assigned_at" not in payload:
            payload["assigned_at"] = date.today()  # same default as the create route
        item = InventoryItem(**payload)
        self.db.add(item)
        return item, True

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
