from typing import Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.utils.dependencies import require_admin
from app.utils.response import success_response, paginated_response
from app.models.activity_log import ActivityLog
from app.models.user import User
from app.models.employee import Employee

router = APIRouter(prefix="/activity-logs", tags=["activity-logs"])


@router.get("")
def list_logs(
    skip: int = 0,
    limit: int = 100,
    date_from: str | None = None,
    date_to: str | None = None,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_admin),
):
    query = db.query(ActivityLog, User).outerjoin(User, ActivityLog.user_id == User.id)

    if date_from:
        query = query.filter(ActivityLog.created_at >= date_from)
    if date_to:
        query = query.filter(ActivityLog.created_at <= date_to)

    total = query.count()
    results = query.order_by(ActivityLog.created_at.desc()).offset(skip).limit(limit).all()

    data = []
    for log, usr in results:
        emp_name = ""
        emp_id = ""
        if usr:
            emp = db.query(Employee).filter(Employee.user_id == usr.id).first()
            if emp:
                emp_name = f"{emp.first_name} {emp.last_name}"
                emp_id = emp.employee_id

        data.append({
            "id": log.id,
            "username": usr.username if usr else "System",
            "full_name": usr.full_name if usr else "System",
            "account_id": usr.id if usr else "-",
            "employee_name": emp_name or "-",
            "employee_id": emp_id or "-",
            "action": log.action,
            "resource_type": log.resource_type or "system",
            "details": log.details or f"Action performed by {usr.username if usr else 'System'}",
            "ip_address": log.ip_address or "127.0.0.1",
            "created_at": log.created_at.strftime("%Y-%m-%d %H:%M:%S") if log.created_at else "-",
        })

    page = skip // limit + 1 if limit else 1
    return paginated_response(data=data, total=total, page=page, per_page=limit)


@router.get("/{log_id}")
def get_log(log_id: str, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    log = db.query(ActivityLog).filter(ActivityLog.id == log_id).first()
    return success_response(data=log)
