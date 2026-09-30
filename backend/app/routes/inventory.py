from typing import Any
from datetime import date
import io
import re

from fastapi import APIRouter, Depends, Query, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import openpyxl
from openpyxl import load_workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

from app.database import get_db
from app.services.inventory import InventoryService
from app.schemas.inventory import InventoryCreate, InventoryUpdate, InventoryAssign, InventoryReturn
from app.utils.dependencies import require_admin
from app.utils.response import success_response, paginated_response
from app.models.inventory import InventoryItem, InventoryAssignment
from app.models.employee import Employee

router = APIRouter(prefix="/inventory", tags=["inventory"])


def _assignment_dict(a: InventoryAssignment, emp: Employee | None) -> dict:
    return {
        "id": a.id,
        "item_id": a.item_id,
        "employee_id": a.employee_id,
        "employee_name": f"{emp.first_name} {emp.last_name}" if emp else None,
        "employee_empid": emp.employee_id if emp else None,
        "quantity": int(a.quantity or 1),
        "condition": getattr(a, "condition", None),
        "assigned_at": str(a.assigned_at) if getattr(a, "assigned_at", None) else None,
        "returned_at": str(a.returned_at) if getattr(a, "returned_at", None) else None,
        "return_condition": getattr(a, "return_condition", None),
        "status": a.status,
        "notes": getattr(a, "notes", None),
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def _load_assignments_map(db: Session, item_ids: list[str], active_only: bool = True) -> dict[str, list[dict]]:
    """Active assignments per item id, with employee info joined in."""
    if not item_ids:
        return {}
    query = db.query(InventoryAssignment).filter(
        InventoryAssignment.item_id.in_(item_ids),
        InventoryAssignment.deleted_at.is_(None),
    )
    if active_only:
        query = query.filter(InventoryAssignment.status == "active")
    rows = query.order_by(InventoryAssignment.created_at.desc()).all()
    emp_ids = list({a.employee_id for a in rows})
    emps = {e.id: e for e in db.query(Employee).filter(Employee.id.in_(emp_ids)).all()} if emp_ids else {}
    result: dict[str, list[dict]] = {}
    for a in rows:
        result.setdefault(a.item_id, []).append(_assignment_dict(a, emps.get(a.employee_id)))
    return result


def _to_dict(item: InventoryItem, emp: Employee | None, assignments: list[dict] | None = None) -> dict:
    return {
        "id": item.id,
        "item_code": item.item_code,
        "name": item.name,
        "category": item.category,
        "sub_category": getattr(item, "sub_category", None),
        "description": item.description or "",
        "item_type": item.item_type or "equipment",
        "condition": getattr(item, "condition", None),
        "location": getattr(item, "location", None),
        "unit_of_measure": getattr(item, "unit_of_measure", "unit"),
        "quantity": int(item.quantity or 0),
        "minimum_stock": int(getattr(item, "minimum_stock", 0) or 0),
        "unit_cost": float(getattr(item, "unit_cost", 0) or 0),
        "total_cost": float((item.quantity or 0) * (getattr(item, "unit_cost", 0) or 0)),
        "serial_number": getattr(item, "serial_number", None),
        "model_number": getattr(item, "model_number", None),
        "manufacturer": getattr(item, "manufacturer", None),
        "purchase_date": str(item.purchase_date) if getattr(item, "purchase_date", None) else None,
        "warranty_end_date": str(item.warranty_end_date) if getattr(item, "warranty_end_date", None) else None,
        "employee_id": item.employee_id,
        "employee_name": f"{emp.first_name} {emp.last_name}" if emp else None,
        "employee_empid": emp.employee_id if emp else None,
        "employee_department": emp.department if emp else None,
        "assigned_at": str(item.assigned_at) if getattr(item, "assigned_at", None) else None,
        "assignment_notes": getattr(item, "assignment_notes", None),
        "status": item.status,
        "created_by": getattr(item, "created_by", None),
        "is_low_stock": (item.quantity or 0) <= int(getattr(item, "minimum_stock", 0) or 0),
        "assigned_count": sum(a["quantity"] for a in (assignments or [])),
        "assignments": assignments or [],
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


@router.get("")
def list_inventory(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
    search: str | None = Query(None),
    category: str | None = Query(None),
    item_type: str | None = Query(None),
    status: str | None = Query(None),
    employee_id: str | None = Query(None),
    assigned: bool | None = Query(None),
    low_stock: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_admin),
):
    service = InventoryService(db)
    skip = (page - 1) * per_page
    records, total = service.get_filtered(
        skip=skip, limit=per_page,
        search=search, category=category, item_type=item_type,
        status=status, employee_id=employee_id,
        assigned=assigned, low_stock=low_stock,
    )
    result = []
    assignments_map = _load_assignments_map(db, [it.id for it in records])
    for it in records:
        emp = db.query(Employee).filter(Employee.id == it.employee_id).first() if it.employee_id else None
        result.append(_to_dict(it, emp, assignments_map.get(it.id)))
    return paginated_response(data=result, total=total, page=page, per_page=per_page)


@router.get("/stats")
def inventory_stats(
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_admin),
):
    service = InventoryService(db)
    return success_response(data=service.get_stats())


@router.get("/categories")
def inventory_categories(
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_admin),
):
    service = InventoryService(db)
    return success_response(data=service.get_categories())


@router.get("/export")
def export_inventory(
    search: str | None = Query(None),
    category: str | None = Query(None),
    item_type: str | None = Query(None),
    status: str | None = Query(None),
    employee_id: str | None = Query(None),
    assigned: bool | None = Query(None),
    low_stock: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_admin),
):
    service = InventoryService(db)
    records, _ = service.get_filtered(
        skip=0, limit=10000,
        search=search, category=category, item_type=item_type,
        status=status,
        employee_id=None,  # employee filtering is applied below via active assignments
        assigned=assigned, low_stock=low_stock,
    )
    # Active assignments + full history for the fetched records
    item_ids = [it.id for it in records]
    history = []
    if item_ids:
        history = (
            db.query(InventoryAssignment, Employee)
              .outerjoin(Employee, Employee.id == InventoryAssignment.employee_id)
              .filter(InventoryAssignment.item_id.in_(item_ids),
                      InventoryAssignment.deleted_at.is_(None))
              .order_by(InventoryAssignment.assigned_at.desc())
              .all()
        )

    active_by_item: dict = {}
    for a, e in history:
        if a.status == "active":
            active_by_item.setdefault(a.item_id, []).append((a, e))

    filter_emp = employee_id if employee_id else None
    if filter_emp:
        records = [
            it for it in records
            if any(a.employee_id == filter_emp for a, _ in active_by_item.get(it.id, []))
        ]

    rows = []
    for it in records:
        acts = active_by_item.get(it.id, [])
        assigned_units = sum(int(a.quantity or 1) for a, _ in acts)
        in_stock = int(it.quantity or 0)
        cost = float(getattr(it, "unit_cost", 0) or 0)
        assigned_to = "; ".join(
            f"{(f'{e.first_name} {e.last_name}'.strip() if e else 'Unknown')} ({int(a.quantity or 1)})"
            for a, e in acts
        )
        rows.append({
            "Item Code": it.item_code,
            "Name": it.name,
            "Category": it.category or "",
            "Sub-category": getattr(it, "sub_category", "") or "",
            "Type": it.item_type or "",
            "Condition": getattr(it, "condition", "") or "",
            "Location": getattr(it, "location", "") or "",
            "Qty In Stock": in_stock,
            "Assigned Units": assigned_units,
            "Total Units": in_stock + assigned_units,
            "UoM": getattr(it, "unit_of_measure", "unit"),
            "Min Stock": int(getattr(it, "minimum_stock", 0) or 0),
            "Low Stock": "Yes" if in_stock <= int(getattr(it, "minimum_stock", 0) or 0) else "No",
            "Unit Cost": cost,
            "Stock Value": round(in_stock * cost, 2),
            "Assigned Value": round(assigned_units * cost, 2),
            "Total Value": round((in_stock + assigned_units) * cost, 2),
            "Serial #": getattr(it, "serial_number", "") or "",
            "Model #": getattr(it, "model_number", "") or "",
            "Manufacturer": getattr(it, "manufacturer", "") or "",
            "Purchase Date": str(it.purchase_date) if getattr(it, "purchase_date", None) else "",
            "Warranty Until": str(it.warranty_end_date) if getattr(it, "warranty_end_date", None) else "",
            "Assigned To": assigned_to,
            "Status": it.status or "",
            "Description": it.description or "",
        })

    # Full assignment history sheet (hand-outs AND returns)
    item_by_id = {it.id: it for it in records}
    assignment_rows = []
    for a, e in history:
        if filter_emp and a.employee_id != filter_emp:
            continue
        it = item_by_id.get(a.item_id)
        if it is None:
            continue
        assignment_rows.append({
            "Item Code": it.item_code,
            "Item Name": it.name,
            "Category": it.category or "",
            "Type": it.item_type or "",
            "Employee ID": e.employee_id if e else "",
            "Employee": f"{e.first_name} {e.last_name}" if e else "",
            "Department": e.department if e else "",
            "Qty": int(a.quantity or 1),
            "Condition at Handover": a.condition or "",
            "Assigned On": str(a.assigned_at) if getattr(a, "assigned_at", None) else "",
            "Assignment Status": (a.status or "").capitalize(),
            "Return Condition": getattr(a, "return_condition", "") or "",
            "Returned On": str(a.returned_at) if getattr(a, "returned_at", None) else "",
            "Notes": getattr(a, "notes", "") or "",
        })

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Inventory"
    if rows:
        headers = list(rows[0].keys())
        ws.append(headers)
        for row in rows:
            ws.append([row.get(h) for h in headers])
    else:
        ws.append(["No inventory records found"])
    ws2 = wb.create_sheet("Assignments")
    if assignment_rows:
        headers2 = list(assignment_rows[0].keys())
        ws2.append(headers2)
        for row in assignment_rows:
            ws2.append([row.get(h) for h in headers2])
    else:
        ws2.append(["No assignment records found"])
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=inventory_report.xlsx"}
    )


TEMPLATE_HEADERS = [
    "Item Code", "Name *", "Category *", "Sub Category", "Description", "Item Type",
    "Condition", "Location", "Unit", "Quantity", "Min Stock", "Unit Cost",
    "Serial Number", "Model Number", "Manufacturer", "Purchase Date",
    "Warranty End Date", "Employee ID", "Assigned Date", "Assignment Notes", "Status",
]


@router.get("/template")
def download_inventory_template(current_user: Any = Depends(require_admin)):
    """Excel template users fill in before uploading via Import Excel."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Items"

    hdr_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    hdr_font = Font(bold=True, color="FFFFFF")
    thin = Border(left=Side(style="thin"), right=Side(style="thin"),
                  top=Side(style="thin"), bottom=Side(style="thin"))

    for c, header in enumerate(TEMPLATE_HEADERS, 1):
        cell = ws.cell(row=1, column=c, value=header)
        cell.font = hdr_font
        cell.fill = hdr_fill
        cell.border = thin
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[1].height = 28

    for i, width in enumerate(
            [16, 26, 16, 14, 28, 14, 12, 16, 8, 9, 10, 11, 16, 14, 13, 13, 15, 12, 13, 22, 12], 1):
        ws.column_dimensions[get_column_letter(i)].width = width

    # Two example rows — safe to overwrite or delete before uploading.
    examples = [
        ["", "Dell Latitude 5540 Laptop", "IT Equipment", "Laptops", "14-inch i7 business laptop",
         "devices", "New", "HQ - Floor 2", "unit", 1, 0, 1450.00,
         "DL5540-9F2K1", "Latitude 5540", "Dell", "2025-01-15", "2028-01-15",
         "EMP-001", "2025-01-20", "Issued at onboarding", None],
        ["", "A4 Paper Ream", "Stationery", "Paper", "80gsm printing paper",
         "supplies", None, "Store Room", "ream", 40, 10, 3.75,
         None, None, "Navigator", "2025-02-01", None, None, None, None],
    ]
    for r, row in enumerate(examples, start=2):
        for c, val in enumerate(row, 1):
            cell = ws.cell(row=r, column=c, value=val)
            cell.border = thin
    ws.freeze_panes = "A2"

    info = wb.create_sheet("Instructions")
    info.column_dimensions["A"].width = 110
    lines = [
        ("HOW TO USE THIS TEMPLATE", True),
        ("1. Fill one item per row in the 'Items' sheet (the two example rows are safe to overwrite or delete).", False),
        ("2. Download the filled file and upload it via Inventory → 'Import Excel'.", False),
        ("3. Item Code: leave blank to auto-generate (CATEGORY-TYPE-001 style). If a code already exists, that item is UPDATED — blank cells are ignored and existing data is kept.", False),
        ("", False),
        ("REQUIRED COLUMNS", True),
        ("Name and Category are required to create NEW items. For rows that update an existing Item Code, blank cells are ignored.", False),
        ("", False),
        ("VALID VALUES", True),
        ("Item Type: equipment, supplies, furniture, devices, consumable, access_card, key, other", False),
        ("Condition: New, Like New, Good, Fair, Damaged, Needs Repair", False),
        ("Status: in_stock, assigned, low_stock, out_of_stock, damaged, retired, reserved — leave blank to auto-derive from Quantity / Min Stock", False),
        ("", False),
        ("DATES & OTHER FORMATS", True),
        ("Dates: YYYY-MM-DD (e.g. 2025-01-31). Excel date cells also work.", False),
        ("Employee ID: the company employee ID shown in the Employees module (e.g. EMP-001).", False),
        ("Numbers: Quantity / Min Stock must be whole numbers >= 0; Unit Cost is a number >= 0.", False),
        ("", False),
        ("IMPORT RESULT", True),
        ("Rows with errors are skipped and reported — fix them and re-upload the file; correct rows will simply be updated.", False),
    ]
    for r, (text, bold) in enumerate(lines, start=1):
        cell = info.cell(row=r, column=1, value=text)
        if bold:
            cell.font = Font(bold=True, size=12)

    buf = io.BytesIO()
    wb.save(buf)
    return StreamingResponse(
        io.BytesIO(buf.getvalue()),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=inventory_template.xlsx"},
    )


# Header text (lower-cased / trimmed) → canonical row field.
_HEADER_ALIASES: dict[str, str] = {
    "item code": "item_code", "code": "item_code", "itemcode": "item_code",
    "name": "name", "item name": "name",
    "category": "category",
    "sub category": "sub_category", "subcategory": "sub_category",
    "description": "description",
    "item type": "item_type", "type": "item_type",
    "condition": "condition",
    "location": "location",
    "unit": "unit_of_measure", "unit of measure": "unit_of_measure", "uom": "unit_of_measure",
    "quantity": "quantity", "qty": "quantity",
    "min stock": "minimum_stock", "minimum stock": "minimum_stock",
    "unit cost": "unit_cost", "cost": "unit_cost",
    "serial number": "serial_number", "serial no": "serial_number", "serial": "serial_number",
    "model number": "model_number", "model": "model_number",
    "manufacturer": "manufacturer", "brand": "manufacturer",
    "purchase date": "purchase_date",
    "warranty end date": "warranty_end_date", "warranty date": "warranty_end_date", "warranty": "warranty_end_date",
    "employee id": "employee_ref", "assigned employee id": "employee_ref", "employee": "employee_ref",
    "assigned date": "assigned_at", "assignment date": "assigned_at",
    "assignment notes": "assignment_notes",
    "status": "status",
}


def _norm_header(val) -> str:
    return re.sub(r"\s+", " ", str(val or "").strip().lower()).strip(" *_")


def _parse_inventory_workbook(wb) -> list[dict]:
    """Locate the header row on the Items sheet and read the data rows.

    Returns a list of dicts keyed by canonical field name, each carrying the
    1-based sheet row number in "_row".  Blank rows are dropped.
    """
    ws = wb["Items"] if "Items" in wb.sheetnames else wb.active
    col_map: dict[int, str] = {}
    header_row = None
    for r in range(1, min(ws.max_row or 1, 10) + 1):
        candidate: dict[int, str] = {}
        for c in range(1, (ws.max_column or 0) + 1):
            field = _HEADER_ALIASES.get(_norm_header(ws.cell(row=r, column=c).value))
            if field and field not in candidate.values():
                candidate[c] = field
        if "name" in candidate.values() and "category" in candidate.values():
            col_map = candidate
            header_row = r
            break
    if header_row is None:
        raise HTTPException(
            status_code=400,
            detail="Could not find a header row — the sheet must include at least 'Name' and 'Category' columns "
                   "(download the Template for the exact layout)",
        )

    rows: list[dict] = []
    for r in range(header_row + 1, (ws.max_row or header_row) + 1):
        rec: dict = {"_row": r}
        has_value = False
        for c, field in col_map.items():
            val = ws.cell(row=r, column=c).value
            if isinstance(val, str):
                val = val.strip()
            if val is not None and val != "":
                has_value = True
            rec[field] = val
        if has_value:
            rows.append(rec)
    return rows


@router.post("/import-excel")
async def import_inventory_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_admin),
):
    """Upload the filled inventory template (.xlsx) to bulk-create and update items."""
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Please upload a .xlsx Excel file")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")

    try:
        wb = load_workbook(io.BytesIO(content), data_only=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read the Excel file: {exc}")

    try:
        rows = _parse_inventory_workbook(wb)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse the Excel layout: {exc}")

    if not rows:
        raise HTTPException(
            status_code=400,
            detail="No data rows found — fill in the 'Items' sheet and upload again",
        )

    result = InventoryService(db).import_rows(rows, created_by=current_user.id)
    result["success"] = True
    if result["failed"] and not (result["created"] or result["updated"]):
        first = "; ".join(f"row {e['row']}: {e['message']}" for e in result["errors"][:5])
        raise HTTPException(status_code=400, detail=f"No rows were imported. {first}")
    return result


@router.get("/next-code")
def get_next_item_code(
    category: str = Query(...),
    item_type: str = Query("equipment"),
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_admin),
):
    service = InventoryService(db)
    return success_response(data=service.get_next_item_code(category, item_type))


@router.get("/{item_id}")
def get_inventory(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_admin),
):
    service = InventoryService(db)
    it = service.get_by_id(item_id)
    emp = db.query(Employee).filter(Employee.id == it.employee_id).first() if it.employee_id else None
    assignments = _load_assignments_map(db, [it.id]).get(it.id)
    return success_response(data=_to_dict(it, emp, assignments))


@router.post("")
def create_inventory(
    data: InventoryCreate,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_admin),
):
    service = InventoryService(db)
    payload = data.model_dump(exclude_unset=False)
    payload["created_by"] = current_user.id
    if payload.get("assigned_at") is None and payload.get("employee_id"):
        payload["assigned_at"] = date.today()
    if payload.get("employee_id") and (payload.get("status") or "in_stock") == "in_stock":
        payload["status"] = "assigned"
    it = service.create(payload)
    emp = db.query(Employee).filter(Employee.id == it.employee_id).first() if it.employee_id else None
    return success_response(data=_to_dict(it, emp))


@router.put("/{item_id}")
def update_inventory(
    item_id: str,
    data: InventoryUpdate,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_admin),
):
    service = InventoryService(db)
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    if update_data.get("employee_id") and not update_data.get("assigned_at"):
        existing = service.repo.get(item_id)
        if existing and not existing.assigned_at:
            update_data["assigned_at"] = date.today()
        if update_data.get("status") is None and (existing and not existing.employee_id):
            update_data["status"] = "assigned"
    if update_data.get("employee_id") is None and "employee_id" in update_data:
        update_data["assigned_at"] = None
        update_data["assignment_notes"] = None
        update_data["status"] = "in_stock"
    it = service.update(item_id, update_data)
    emp = db.query(Employee).filter(Employee.id == it.employee_id).first() if it.employee_id else None
    assignments = _load_assignments_map(db, [it.id]).get(it.id)
    return success_response(data=_to_dict(it, emp, assignments))


@router.delete("/{item_id}")
def delete_inventory(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_admin),
):
    service = InventoryService(db)
    service.delete(item_id)
    return success_response(data=None)


@router.post("/{item_id}/assign")
def assign_inventory(
    item_id: str,
    payload: InventoryAssign,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_admin),
):
    service = InventoryService(db)
    it = service.assign(
        item_id,
        payload.employee_id,
        quantity=payload.quantity,
        condition=payload.condition,
        assigned_at=payload.assigned_at,
        notes=payload.assignment_notes,
    )
    emp = db.query(Employee).filter(Employee.id == it.employee_id).first() if it.employee_id else None
    assignments = _load_assignments_map(db, [it.id]).get(it.id)
    return success_response(data=_to_dict(it, emp, assignments))


@router.get("/{item_id}/assignments")
def list_item_assignments(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_admin),
):
    """Assignment history for an item (active and returned)."""
    service = InventoryService(db)
    service.get_by_id(item_id)
    rows = (
        db.query(InventoryAssignment)
            .filter(InventoryAssignment.item_id == item_id,
                    InventoryAssignment.deleted_at.is_(None))
            .order_by(InventoryAssignment.created_at.desc())
            .all()
    )
    emp_ids = list({a.employee_id for a in rows})
    emps = {e.id: e for e in db.query(Employee).filter(Employee.id.in_(emp_ids)).all()} if emp_ids else {}
    return success_response(data=[_assignment_dict(a, emps.get(a.employee_id)) for a in rows])


@router.post("/assignments/{assignment_id}/return")
def return_inventory_assignment(
    assignment_id: str,
    payload: InventoryReturn,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_admin),
):
    """Take an assignment back — its units return to stock."""
    service = InventoryService(db)
    it = service.return_assignment(
        assignment_id,
        return_condition=payload.return_condition,
        notes=payload.notes,
    )
    emp = db.query(Employee).filter(Employee.id == it.employee_id).first() if it.employee_id else None
    assignments = _load_assignments_map(db, [it.id]).get(it.id)
    return success_response(data=_to_dict(it, emp, assignments))


@router.post("/{item_id}/unassign")
def unassign_inventory(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_admin),
):
    """Return every active assignment of this item back to stock."""
    service = InventoryService(db)
    it = service.unassign(item_id)
    assignments = _load_assignments_map(db, [it.id]).get(it.id)
    return success_response(data=_to_dict(it, None, assignments))
