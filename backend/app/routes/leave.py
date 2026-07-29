from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.leave import LeaveRequestService
from app.schemas.leave import LeaveRequestCreate, LeaveRequestUpdate
from app.utils.dependencies import get_current_user, get_user_role_name
from app.utils.response import success_response, paginated_response
from app.models.leave import LeaveRequest
from app.models.employee import Employee

router = APIRouter(prefix="/leaves", tags=["leaves"])


def _enrich_leave(leave, db):
    emp = db.query(Employee).filter(Employee.id == leave.employee_id).first()
    return {
        "id": leave.id,
        "employee_id": leave.employee_id,
        "employee_name": f"{emp.first_name} {emp.last_name}" if emp else "Unknown",
        "leave_type": leave.leave_type,
        "start_date": str(leave.start_date) if leave.start_date else "",
        "end_date": str(leave.end_date) if leave.end_date else "",
        "reason": leave.reason or "",
        "status": leave.status,
        "approved_by": leave.approved_by,
        "created_at": leave.created_at.isoformat() if leave.created_at else None,
        "updated_at": leave.updated_at.isoformat() if leave.updated_at else None,
    }


def _is_employee_role(db: Session, current_user: Any) -> bool:
    return get_user_role_name(current_user, db) == "employee"


def _get_current_employee(db: Session, current_user: Any) -> Employee | None:
    return db.query(Employee).filter(Employee.user_id == current_user.id, Employee.deleted_at.is_(None)).first()


@router.get("")
def list_leaves(skip: int = 0, limit: int = 100, status: str | None = None, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    query = db.query(LeaveRequest)

    if _is_employee_role(db, current_user):
        emp = _get_current_employee(db, current_user)
        if emp:
            query = query.filter(LeaveRequest.employee_id == emp.id)

    if status and status != "all":
        query = query.filter(LeaveRequest.status == status)
    total = query.count()
    leaves = query.offset(skip).limit(limit).all()
    data = [_enrich_leave(lv, db) for lv in leaves]
    page = skip // limit + 1 if limit else 1
    return paginated_response(data=data, total=total, page=page, per_page=limit)


@router.get("/pending")
def list_pending_leaves(db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        emp = _get_current_employee(db, current_user)
        if emp:
            leaves = db.query(LeaveRequest).filter(LeaveRequest.employee_id == emp.id, LeaveRequest.status == "pending").all()
        else:
            leaves = []
    else:
        leaves = db.query(LeaveRequest).filter(LeaveRequest.status == "pending").all()
    data = [_enrich_leave(lv, db) for lv in leaves]
    return success_response(data=data)


@router.get("/{leave_id}")
def get_leave(leave_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    service = LeaveRequestService(db)
    leave = service.get_by_id(leave_id)
    if _is_employee_role(db, current_user):
        emp = _get_current_employee(db, current_user)
        if emp and leave.employee_id != emp.id:
            raise HTTPException(status_code=403, detail="Access denied")
    return success_response(data=_enrich_leave(leave, db))


@router.post("")
def create_leave(data: LeaveRequestCreate, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        emp = _get_current_employee(db, current_user)
        if emp:
            data_dict = data.model_dump()
            data_dict["employee_id"] = emp.id
        else:
            raise HTTPException(status_code=403, detail="No employee record linked")
    else:
        data_dict = data.model_dump()
        if not data_dict.get("employee_id"):
            raise HTTPException(status_code=400, detail="employee_id is required for admin leave requests")
    service = LeaveRequestService(db)
    leave = service.create(data_dict)
    return success_response(data=_enrich_leave(leave, db))


@router.put("/{leave_id}")
def update_leave(leave_id: str, data: LeaveRequestUpdate, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    service = LeaveRequestService(db)
    leave = service.get_by_id(leave_id)
    if _is_employee_role(db, current_user) and leave.employee_id != (_get_current_employee(db, current_user).id if _get_current_employee(db, current_user) else None):
        raise HTTPException(status_code=403, detail="Access denied")
    updated = service.update(leave_id, data.model_dump(exclude_unset=True))
    return success_response(data=_enrich_leave(updated, db))


@router.post("/{leave_id}/approve")
def approve_leave(leave_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        raise HTTPException(status_code=403, detail="Employees cannot approve leave requests")
    leave = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).first()
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")
    leave.status = "approved"
    leave.approved_by = str(current_user.id)
    db.commit()
    db.refresh(leave)
    return success_response(data=_enrich_leave(leave, db))


@router.post("/{leave_id}/reject")
def reject_leave(leave_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        raise HTTPException(status_code=403, detail="Employees cannot reject leave requests")
    leave = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).first()
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")
    leave.status = "rejected"
    leave.approved_by = str(current_user.id)
    db.commit()
    db.refresh(leave)
    return success_response(data=_enrich_leave(leave, db))


@router.delete("/{leave_id}")
def delete_leave(leave_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        raise HTTPException(status_code=403, detail="Employees cannot delete leave requests")
    service = LeaveRequestService(db)
    service.delete(leave_id)
    return success_response(data=None)