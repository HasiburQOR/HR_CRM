from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.salary import Salary
from app.models.employee import Employee
from app.schemas.salary import SalaryCreate, SalaryUpdate
from app.utils.dependencies import get_current_user, require_admin
from app.utils.response import success_response, paginated_response
from app.services.salary import SalaryService

router = APIRouter(prefix="/salaries", tags=["salaries"])


def _calc_net(data_dict):
    gross = float(data_dict.get("gross_salary") or 0)
    basic = float(data_dict.get("basic_salary") or 0)
    allow = float(data_dict.get("allowances") or 0)
    deduct = float(data_dict.get("deductions") or 0)
    # If gross is set, use gross - deductions; otherwise basic + allow - deduct
    if gross > 0:
        return round(gross - deduct, 2)
    return round(basic + allow - deduct, 2)


def _salary_dict(sal, emp):
    return {
        "id": sal.id,
        "employee_id": sal.employee_id,
        "employee_name": f"{emp.first_name} {emp.last_name}" if emp else "Unknown",
        "month": sal.month,
        "year": sal.year,
        "gross_salary": getattr(sal, "gross_salary", 0) or 0,
        "basic_salary": sal.basic_salary,
        "allowances": sal.allowances,
        "deductions": sal.deductions,
        "net_salary": sal.net_salary or _calc_net({
            "gross_salary": getattr(sal, "gross_salary", 0),
            "basic_salary": sal.basic_salary,
            "allowances": sal.allowances,
            "deductions": sal.deductions,
        }),
        "payment_date": sal.payment_date or "",
        "status": sal.status,
        "approved_by": sal.approved_by,
        "notes": getattr(sal, "notes", "") or "",
        "created_at": sal.created_at.isoformat() if sal.created_at else None,
        "updated_at": sal.updated_at.isoformat() if sal.updated_at else None,
    }


@router.get("")
def list_salaries(
    skip: int = 0,
    limit: int = 100,
    month: str | None = None,
    year: int | None = None,
    employee_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    query = db.query(Salary, Employee).outerjoin(Employee, Salary.employee_id == Employee.id)

    if month:
        query = query.filter(Salary.month == month)
    if year:
        query = query.filter(Salary.year == year)
    if employee_id:
        query = query.filter(Salary.employee_id == employee_id)

    total = query.count()
    results = query.order_by(Salary.created_at.desc()).offset(skip).limit(limit).all()

    data = []
    for sal, emp in results:
        data.append(_salary_dict(sal, emp))

    page = skip // limit + 1 if limit else 1
    return paginated_response(data=data, total=total, page=page, per_page=limit)


@router.get("/{salary_id}")
def get_salary(salary_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    sal = db.query(Salary).filter(Salary.id == salary_id).first()
    if not sal:
        raise HTTPException(status_code=404, detail="Salary record not found")
    emp = db.query(Employee).filter(Employee.id == sal.employee_id).first()
    return success_response(data=_salary_dict(sal, emp))


@router.post("")
def create_salary(data: SalaryCreate, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    payload = data.model_dump()
    if not payload.get("net_salary"):
        payload["net_salary"] = _calc_net(payload)
    sal = Salary(**payload)
    db.add(sal)
    db.commit()
    db.refresh(sal)
    return success_response(data=_salary_dict(sal, db.query(Employee).filter(Employee.id == sal.employee_id).first()))


@router.put("/{salary_id}")
def update_salary(salary_id: str, data: SalaryUpdate, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    sal = db.query(Salary).filter(Salary.id == salary_id).first()
    if not sal:
        raise HTTPException(status_code=404, detail="Salary record not found")
    for k, v in update_data.items():
        setattr(sal, k, v)
    if "basic_salary" in update_data or "allowances" in update_data or "deductions" in update_data:
        sal.net_salary = _calc_net({
            "basic_salary": sal.basic_salary,
            "allowances": sal.allowances,
            "deductions": sal.deductions,
        })
    if "gross_salary" in update_data:
        sal.net_salary = _calc_net({
            "gross_salary": sal.gross_salary,
            "basic_salary": sal.basic_salary,
            "allowances": sal.allowances,
            "deductions": sal.deductions,
        })
    db.commit()
    db.refresh(sal)
    return success_response(data=_salary_dict(sal, db.query(Employee).filter(Employee.id == sal.employee_id).first()))


@router.post("/{salary_id}/approve")
def approve_salary(salary_id: str, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    service = SalaryService(db)
    sal = service.get_by_id(salary_id)
    if sal.status == "approved":
        raise HTTPException(status_code=400, detail="Salary already approved")
    if sal.status == "paid":
        raise HTTPException(status_code=400, detail="Salary already paid")
    sal.status = "approved"
    sal.approved_by = str(current_user.id)
    db.commit()
    db.refresh(sal)
    emp = db.query(Employee).filter(Employee.id == sal.employee_id).first()
    return success_response(data={
        "id": sal.id,
        "employee_id": sal.employee_id,
        "employee_name": f"{emp.first_name} {emp.last_name}" if emp else "Unknown",
        "status": sal.status,
        "approved_by": sal.approved_by,
    })


@router.post("/{salary_id}/pay")
def mark_salary_paid(salary_id: str, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    service = SalaryService(db)
    sal = service.get_by_id(salary_id)
    if sal.status == "paid":
        raise HTTPException(status_code=400, detail="Salary already paid")
    sal.status = "paid"
    if not sal.approved_by:
        sal.approved_by = str(current_user.id)
    from datetime import date
    if not sal.payment_date:
        sal.payment_date = str(date.today())
    db.commit()
    db.refresh(sal)
    emp = db.query(Employee).filter(Employee.id == sal.employee_id).first()
    return success_response(data={
        "id": sal.id,
        "employee_id": sal.employee_id,
        "employee_name": f"{emp.first_name} {emp.last_name}" if emp else "Unknown",
        "status": sal.status,
        "payment_date": sal.payment_date,
    })


@router.delete("/{salary_id}")
def delete_salary(salary_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    sal = db.query(Salary).filter(Salary.id == salary_id).first()
    if sal:
        db.delete(sal)
        db.commit()
    return success_response(data=None)
