from typing import Any
from datetime import date

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.expense import ExpenseService
from app.schemas.expense import ExpenseCreate, ExpenseUpdate
from app.utils.dependencies import get_current_user, require_admin
from app.utils.response import success_response, paginated_response
from app.models.expense import Expense
from app.models.employee import Employee

router = APIRouter(prefix="/expenses", tags=["expenses"])


def _ex_to_dict(ex, emp: Employee | None) -> dict:
    if isinstance(ex, dict):
        d = ex.copy()
    else:
        d = {
            "id": ex.id,
            "employee_id": ex.employee_id,
            "product_name": getattr(ex, "product_name", None),
            "category": ex.category,
            "custom_category": getattr(ex, "custom_category", None),
            "amount": ex.amount,
            "description": ex.description or "",
            "expense_date": str(ex.expense_date) if ex.expense_date else "",
            "receipt_url": ex.receipt_url or "",
            "status": ex.status,
            "approved_by": ex.approved_by,
            "rejected_by": ex.rejected_by,
            "created_at": ex.created_at.isoformat() if ex.created_at else None,
            "updated_at": ex.updated_at.isoformat() if ex.updated_at else None,
        }
    d["employee_name"] = f"{emp.first_name} {emp.last_name}" if emp else "Unknown"
    if "custom_category" not in d or d.get("custom_category") is None:
        try:
            if not isinstance(ex, dict):
                d["custom_category"] = getattr(ex, "custom_category", None)
        except Exception:
            d["custom_category"] = None
    # Category display name: if "other" and has custom_category, expose a display label
    d["category_display"] = (
        d.get("custom_category")
        if d.get("category") == "other" and d.get("custom_category")
        else (d.get("category") or "")
    )
    return d


@router.get("")
def list_expenses(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    category: str = Query(None),
    employee_id: str = Query(None),
    start_date: date = Query(None),
    end_date: date = Query(None),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    service = ExpenseService(db)
    skip = (page - 1) * per_page
    records, total = service.get_filtered(skip, per_page, category, employee_id, start_date, end_date)
    result = []
    for ex in records:
        eid = ex["employee_id"] if isinstance(ex, dict) else ex.employee_id
        emp = db.query(Employee).filter(Employee.id == eid).first()
        result.append(_ex_to_dict(ex, emp))
    return paginated_response(data=result, total=total, page=page, per_page=per_page)


@router.get("/summary")
def get_expense_summary(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    service = ExpenseService(db)
    return success_response(data=service.get_summary(start_date, end_date))


@router.get("/{expense_id}")
def get_expense(
    expense_id: str,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    service = ExpenseService(db)
    ex = service.get_by_id(expense_id)
    emp = db.query(Employee).filter(Employee.id == (ex.employee_id if not isinstance(ex, dict) else ex["employee_id"])).first()
    return success_response(data=_ex_to_dict(ex, emp))


@router.post("")
def create_expense(
    data: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    service = ExpenseService(db)
    payload = data.model_dump(exclude_unset=False)
    if payload.get("category") == "other" and payload.get("custom_category"):
        pass
    if not payload.get("amount") or payload["amount"] <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")
    if not payload.get("expense_date"):
        raise HTTPException(status_code=400, detail="Expense date is required")
    ex = service.create(payload)
    emp = db.query(Employee).filter(Employee.id == (ex.employee_id if not isinstance(ex, dict) else ex["employee_id"])).first() if (ex.employee_id if not isinstance(ex, dict) else ex.get("employee_id")) else None
    return success_response(data=_ex_to_dict(ex, emp))


@router.put("/{expense_id}")
def update_expense(
    expense_id: str,
    data: ExpenseUpdate,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    service = ExpenseService(db)
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    ex = service.update(expense_id, update_data)
    emp = db.query(Employee).filter(Employee.id == (ex.employee_id if not isinstance(ex, dict) else ex["employee_id"])).first() if (ex.employee_id if not isinstance(ex, dict) else ex.get("employee_id")) else None
    return success_response(data=_ex_to_dict(ex, emp))


@router.delete("/{expense_id}")
def delete_expense(
    expense_id: str,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    service = ExpenseService(db)
    service.delete(expense_id)
    return success_response(data=None)


@router.post("/{expense_id}/approve")
def approve_expense(
    expense_id: str,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_admin),
):
    service = ExpenseService(db)
    ex = service.approve(expense_id, current_user.id)
    emp = db.query(Employee).filter(Employee.id == (ex.employee_id if not isinstance(ex, dict) else ex["employee_id"])).first()
    return success_response(data=_ex_to_dict(ex, emp))


@router.post("/{expense_id}/reject")
def reject_expense(
    expense_id: str,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_admin),
):
    service = ExpenseService(db)
    ex = service.reject(expense_id, current_user.id)
    emp = db.query(Employee).filter(Employee.id == (ex.employee_id if not isinstance(ex, dict) else ex["employee_id"])).first()
    return success_response(data=_ex_to_dict(ex, emp))
