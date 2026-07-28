from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.employee import EmployeeService, _employee_to_dict
from app.schemas.employee import EmployeeCreate, EmployeeUpdate
from app.utils.dependencies import get_current_user, get_user_role_name
from app.utils.response import success_response, paginated_response
from app.models.employee import Employee

router = APIRouter(prefix="/employees", tags=["employees"])


def _is_employee_role(db: Session, current_user: Any) -> bool:
    return get_user_role_name(current_user, db) == "employee"


def _get_current_employee(db: Session, current_user: Any) -> Employee | None:
    return db.query(Employee).filter(Employee.user_id == current_user.id, Employee.deleted_at.is_(None)).first()


@router.get("")
def list_employees(search: str | None = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        emp = _get_current_employee(db, current_user)
        if emp:
            return success_response(data=[_employee_to_dict(emp)])
        return success_response(data=[])
    service = EmployeeService(db)
    data = service.get_all(skip=skip, limit=limit, search=search)
    if search:
        total = service.repo.count_search(search)
    else:
        total = db.query(Employee).filter(Employee.deleted_at.is_(None)).count()
    page = skip // limit + 1 if limit else 1
    return paginated_response(data=data, total=total, page=page, per_page=limit)


@router.get("/next/employee_id")
def next_employee_id(db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        raise HTTPException(status_code=403, detail="Employees cannot generate employee IDs")
    service = EmployeeService(db)
    return success_response(data={"employee_id": service.next_employee_id()})


@router.get("/active")
def list_active_employees(db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        emp = _get_current_employee(db, current_user)
        if emp:
            return success_response(data=[emp])
        return success_response(data=[])
    service = EmployeeService(db)
    return success_response(data=service.get_active())


@router.get("/{employee_id}")
def get_employee(employee_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    service = EmployeeService(db)
    employee = service.get_by_id(employee_id)
    if _is_employee_role(db, current_user):
        emp = _get_current_employee(db, current_user)
        if emp and emp.employee_id != employee.get("employee_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    return success_response(data=employee)


@router.post("")
def create_employee(data: EmployeeCreate, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        raise HTTPException(status_code=403, detail="Employees cannot create employee records")
    service = EmployeeService(db)
    return success_response(data=service.create(data.model_dump(exclude_unset=True)))


@router.put("/{employee_id}")
def update_employee(employee_id: str, data: EmployeeUpdate, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        raise HTTPException(status_code=403, detail="Employees cannot update employee records")
    service = EmployeeService(db)
    return success_response(data=service.update(employee_id, data.model_dump(exclude_unset=True)))


@router.delete("/{employee_id}")
def delete_employee(employee_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        raise HTTPException(status_code=403, detail="Employees cannot delete employee records")
    service = EmployeeService(db)
    service.delete(employee_id)
    return success_response(data=None)