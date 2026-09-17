from typing import Any
from datetime import date
import io

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import openpyxl

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
