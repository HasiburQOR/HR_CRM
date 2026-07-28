from typing import Any
from datetime import date
import io

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import openpyxl

from app.database import get_db
from app.services.inventory import InventoryService
from app.schemas.inventory import InventoryCreate, InventoryUpdate, InventoryAssign
from app.utils.dependencies import get_current_user
from app.utils.response import success_response, paginated_response
from app.models.inventory import InventoryItem
from app.models.employee import Employee

router = APIRouter(prefix="/inventory", tags=["inventory"])


def _to_dict(item: InventoryItem, emp: Employee | None) -> dict:
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
    current_user: Any = Depends(get_current_user),
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
    for it in records:
        emp = db.query(Employee).filter(Employee.id == it.employee_id).first() if it.employee_id else None
        result.append(_to_dict(it, emp))
    return paginated_response(data=result, total=total, page=page, per_page=per_page)


@router.get("/stats")
def inventory_stats(
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    service = InventoryService(db)
    return success_response(data=service.get_stats())


@router.get("/categories")
def inventory_categories(
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
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
    current_user: Any = Depends(get_current_user),
):
    service = InventoryService(db)
    records, _ = service.get_filtered(
        skip=0, limit=10000,
        search=search, category=category, item_type=item_type,
        status=status, employee_id=employee_id,
        assigned=assigned, low_stock=low_stock,
    )
    rows = []
    for it in records:
        emp = db.query(Employee).filter(Employee.id == it.employee_id).first() if it.employee_id else None
        emp_name = f"{emp.first_name} {emp.last_name}" if emp else ""
        rows.append({
            "Item Code": it.item_code,
            "Name": it.name,
            "Category": it.category or "",
            "Sub-category": getattr(it, "sub_category", "") or "",
            "Type": it.item_type or "",
            "Condition": getattr(it, "condition", "") or "",
            "Location": getattr(it, "location", "") or "",
            "Qty": int(it.quantity or 0),
            "UoM": getattr(it, "unit_of_measure", "unit"),
            "Min Stock": int(getattr(it, "minimum_stock", 0) or 0),
            "Low Stock": "Yes" if (it.quantity or 0) <= int(getattr(it, "minimum_stock", 0) or 0) else "No",
            "Unit Cost": float(getattr(it, "unit_cost", 0) or 0),
            "Total Value": float((it.quantity or 0) * (getattr(it, "unit_cost", 0) or 0)),
            "Serial #": getattr(it, "serial_number", "") or "",
            "Model #": getattr(it, "model_number", "") or "",
            "Manufacturer": getattr(it, "manufacturer", "") or "",
            "Purchase Date": str(it.purchase_date) if getattr(it, "purchase_date", None) else "",
            "Warranty Until": str(it.warranty_end_date) if getattr(it, "warranty_end_date", None) else "",
            "Assigned Employee ID": emp.employee_id if emp else "",
            "Assigned Employee": emp_name,
            "Department": emp.department if emp else "",
            "Assigned On": str(it.assigned_at) if getattr(it, "assigned_at", None) else "",
            "Assignment Notes": getattr(it, "assignment_notes", "") or "",
            "Status": it.status or "",
            "Description": it.description or "",
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
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=inventory_report.xlsx"}
    )


@router.get("/{item_id}")
def get_inventory(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    service = InventoryService(db)
    it = service.get_by_id(item_id)
    emp = db.query(Employee).filter(Employee.id == it.employee_id).first() if it.employee_id else None
    return success_response(data=_to_dict(it, emp))


@router.post("")
def create_inventory(
    data: InventoryCreate,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
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
    current_user: Any = Depends(get_current_user),
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
    return success_response(data=_to_dict(it, emp))


@router.delete("/{item_id}")
def delete_inventory(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    service = InventoryService(db)
    service.delete(item_id)
    return success_response(data=None)


@router.post("/{item_id}/assign")
def assign_inventory(
    item_id: str,
    payload: InventoryAssign,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    service = InventoryService(db)
    assigned_at = payload.assigned_at or date.today()
    it = service.assign(item_id, payload.employee_id, assigned_at=assigned_at,
                        assignment_notes=payload.assignment_notes)
    emp = db.query(Employee).filter(Employee.id == it.employee_id).first() if it.employee_id else None
    return success_response(data=_to_dict(it, emp))


@router.post("/{item_id}/unassign")
def unassign_inventory(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    service = InventoryService(db)
    it = service.unassign(item_id)
    return success_response(data=_to_dict(it, None))
