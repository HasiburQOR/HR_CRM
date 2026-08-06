from typing import Any
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.reminder import Reminder
from app.schemas.reminder import ReminderCreate, ReminderUpdate
from app.utils.dependencies import get_current_user
from app.utils.response import success_response, paginated_response

router = APIRouter(prefix="/reminders", tags=["reminders"])


def _normalize_payload(raw: dict) -> dict:
    payload = dict(raw)
    # Map "note" to "description" for DB storage
    if payload.get("note") and not payload.get("description"):
        payload["description"] = payload["note"]
    raw_reminder_time = payload.get("reminder_time")
    dt_str = payload.get("reminder_datetime") or raw_reminder_time
    dt_date = None
    dt_time = None
    parsed_dt = None
    if isinstance(dt_str, str) and dt_str:
        try:
            if "T" in dt_str:
                parsed_dt = datetime.fromisoformat(dt_str)
            elif " " in dt_str and len(dt_str) >= 16:
                try:
                    parsed_dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
                except Exception:
                    parsed_dt = None
            else:
                parsed_dt = None
            if parsed_dt:
                dt_date = parsed_dt.date()
                dt_time = parsed_dt.strftime("%H:%M")
        except Exception:
            parsed_dt = None
    if dt_date and not payload.get("reminder_date"):
        payload["reminder_date"] = dt_date
    if isinstance(payload.get("reminder_date"), str):
        try:
            d = date.fromisoformat(payload["reminder_date"])
            payload["reminder_date"] = d
            if not dt_date:
                dt_date = d
        except Exception:
            payload["reminder_date"] = None
    if dt_time:
        payload["reminder_time"] = dt_time
    elif isinstance(raw_reminder_time, str) and raw_reminder_time and not parsed_dt:
        if "T" not in raw_reminder_time and 3 <= len(raw_reminder_time) <= 5:
            try:
                t = datetime.strptime(raw_reminder_time[:5], "%H:%M").time()
                payload["reminder_time"] = t.strftime("%H:%M")
                if not dt_time:
                    dt_time = t.strftime("%H:%M")
            except Exception:
                pass
    if isinstance(payload.get("reminder_time"), str) and payload.get("reminder_date") and not parsed_dt:
        try:
            t = datetime.strptime(payload["reminder_time"][:5], "%H:%M").time()
            combined = datetime.combine(payload["reminder_date"], t)
            parsed_dt = combined
        except Exception:
            pass
    if not payload.get("reminder_date") and parsed_dt:
        payload["reminder_date"] = parsed_dt.date()
    if not payload.get("reminder_time") and parsed_dt:
        payload["reminder_time"] = parsed_dt.strftime("%H:%M")
    if not payload.get("reminder_date"):
        payload["reminder_date"] = date.today()
    if parsed_dt and not payload.get("remind_at"):
        payload["remind_at"] = parsed_dt
    # Default status to "ongoing" if not provided
    if not payload.get("status"):
        payload["status"] = "ongoing"
    for extra in ("reminder_datetime", "note"):
        if extra in payload:
            del payload[extra]
    return payload


def _serialize(r: Reminder) -> dict:
    date_str = str(r.reminder_date) if r.reminder_date else ""
    time_str = r.reminder_time or ""
    dt_combined = None
    if date_str and time_str:
        dt_combined = f"{date_str}T{time_str}"
    elif date_str:
        dt_combined = date_str
    elif r.remind_at:
        try:
            dt_combined = r.remind_at.isoformat()
        except Exception:
            dt_combined = str(r.remind_at)
        if not date_str:
            try:
                date_str = str(r.remind_at.date())
            except Exception:
                date_str = ""
        if not time_str:
            try:
                time_str = r.remind_at.strftime("%H:%M")
            except Exception:
                time_str = ""
    return {
        "id": r.id,
        "user_id": r.user_id,
        "title": r.title,
        "description": r.description or "",
        "note": r.description or "",
        "reminder_date": date_str,
        "reminder_time": time_str,
        "reminder_datetime": dt_combined,
        "remind_at": r.remind_at.isoformat() if r.remind_at else None,
        "is_sent": bool(r.is_sent),
        "is_completed": bool(r.is_completed),
        "status": r.status or "ongoing",
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


@router.get("")
def list_reminders(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    query = db.query(Reminder).filter(Reminder.user_id == current_user.id)
    total = query.count()
    records = query.order_by(Reminder.created_at.desc()).offset(skip).limit(limit).all()
    data = [_serialize(r) for r in records]
    page = skip // limit + 1 if limit else 1
    return paginated_response(data=data, total=total, page=page, per_page=limit)


@router.get("/{reminder_id}")
def get_reminder(reminder_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    r = db.query(Reminder).filter(Reminder.id == reminder_id, Reminder.user_id == current_user.id).first()
    if not r:
        return success_response(data=None)
    return success_response(data=_serialize(r))


@router.post("")
def create_reminder(data: ReminderCreate, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    payload = _normalize_payload(data.model_dump(exclude_unset=True))
    payload["user_id"] = current_user.id
    r = Reminder(**payload)
    db.add(r)
    db.commit()
    db.refresh(r)
    return success_response(data=_serialize(r))


@router.put("/{reminder_id}")
def update_reminder(reminder_id: str, data: ReminderUpdate, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    r = db.query(Reminder).filter(Reminder.id == reminder_id, Reminder.user_id == current_user.id).first()
    if not r:
        return success_response(data=None)
    updates = _normalize_payload(data.model_dump(exclude_unset=True))
    for k, v in updates.items():
        setattr(r, k, v)
    db.commit()
    db.refresh(r)
    return success_response(data=_serialize(r))


@router.delete("/{reminder_id}")
def delete_reminder(reminder_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    r = db.query(Reminder).filter(Reminder.id == reminder_id, Reminder.user_id == current_user.id).first()
    if r:
        db.delete(r)
        db.commit()
    return success_response(data=None)


@router.post("/{reminder_id}/toggle")
def toggle_reminder(reminder_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    r = db.query(Reminder).filter(Reminder.id == reminder_id, Reminder.user_id == current_user.id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Reminder not found")
    r.is_completed = not r.is_completed
    db.commit()
    db.refresh(r)
    return success_response(data=_serialize(r))