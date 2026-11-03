import json
from datetime import date as dt_date, datetime, time as dt_time, timedelta, timezone
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.utils.dependencies import require_admin
from app.utils.response import success_response, paginated_response
from app.utils.timezone import BD_TZ
from app.models.activity_log import ActivityLog
from app.models.user import User
from app.models.employee import Employee

router = APIRouter(prefix="/activity-logs", tags=["activity-logs"])


def _to_bd_iso(value: datetime | None) -> str | None:
    """Timestamps are stored in UTC; send them as Asia/Dhaka with the offset
    included so the browser never has to guess the timezone."""
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(BD_TZ).isoformat()


def _bd_day_start_utc(value: str, param: str) -> datetime:
    try:
        day = dt_date.fromisoformat(value[:10])
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{param} must be a valid ISO date (YYYY-MM-DD)")
    return datetime.combine(day, dt_time.min, tzinfo=BD_TZ).astimezone(timezone.utc)


def _parse_meta(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        meta = json.loads(raw)
        return meta if isinstance(meta, dict) else None
    except ValueError:
        return None


def _log_to_dict(log: ActivityLog, usr: User | None, emp: Employee | None, include_meta: bool) -> dict:
    meta = _parse_meta(log.meta)
    data = {
        "id": log.id,
        "user_id": usr.id if usr else None,
        "username": usr.username if usr else None,
        "full_name": usr.full_name if usr else None,
        "employee_name": f"{emp.first_name} {emp.last_name}" if emp else None,
        "employee_id": emp.employee_id if emp else None,
        "action": log.action,
        "resource_type": log.resource_type or "system",
        "resource_id": log.resource_id,
        "target": (meta or {}).get("target"),
        "method": (meta or {}).get("method"),
        "change_type": (meta or {}).get("change_type"),
        "change_count": len((meta or {}).get("changes") or {}),
        "details": log.details or f"Action performed by {usr.username if usr else 'System'}",
        "ip_address": log.ip_address,
        "created_at": _to_bd_iso(log.created_at),
    }
    if include_meta:
        data["meta"] = meta
    return data


@router.get("")
def list_logs(
    skip: int = 0,
    limit: int = 100,
    date_from: str | None = None,
    date_to: str | None = None,
    search: str | None = None,
    user_id: str | None = None,
    resource_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_admin),
):
    limit = max(1, min(limit, 500))
    query = (
        db.query(ActivityLog, User, Employee)
        .outerjoin(User, ActivityLog.user_id == User.id)
        .outerjoin(Employee, Employee.user_id == User.id)
    )

    # Dates are Bangladesh calendar days; created_at is stored in UTC.
    if date_from:
        query = query.filter(ActivityLog.created_at >= _bd_day_start_utc(date_from, "date_from"))
    if date_to:
        query = query.filter(ActivityLog.created_at < _bd_day_start_utc(date_to, "date_to") + timedelta(days=1))
    if user_id:
        query = query.filter(ActivityLog.user_id == user_id)
    if resource_type:
        query = query.filter(ActivityLog.resource_type == resource_type)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(or_(
            ActivityLog.action.ilike(term),
            ActivityLog.details.ilike(term),
            ActivityLog.ip_address.ilike(term),
            User.username.ilike(term),
            User.full_name.ilike(term),
            Employee.employee_id.ilike(term),
            Employee.first_name.ilike(term),
            Employee.last_name.ilike(term),
        ))

    total = query.count()
    results = query.order_by(ActivityLog.created_at.desc()).offset(skip).limit(limit).all()
    data = [_log_to_dict(log, usr, emp, include_meta=False) for log, usr, emp in results]

    page = skip // limit + 1
    return paginated_response(data=data, total=total, page=page, per_page=limit)


@router.get("/{log_id}")
def get_log(log_id: str, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    row = (
        db.query(ActivityLog, User, Employee)
        .outerjoin(User, ActivityLog.user_id == User.id)
        .outerjoin(Employee, Employee.user_id == User.id)
        .filter(ActivityLog.id == log_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Activity log not found")
    log, usr, emp = row
    return success_response(data=_log_to_dict(log, usr, emp, include_meta=True))
