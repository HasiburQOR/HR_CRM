import json
import re
import time
from datetime import date, datetime, time as dt_time, timezone
from decimal import Decimal
from typing import Any

from fastapi import Request
from starlette.concurrency import run_in_threadpool
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.utils.audit import log_activity
from app.utils.timezone import get_bd_now
from app.models.attendance import Attendance
from app.models.backup import Backup
from app.models.employee import Employee
from app.models.expense import Expense
from app.models.inventory import InventoryAssignment, InventoryItem
from app.models.leave import LeaveAttachment, LeaveRequest
from app.models.reminder import Reminder
from app.models.requisition import Requisition, RequisitionExpense
from app.models.role import Role
from app.models.salary import Salary
from app.models.setting import Setting
from app.models.task import Task
from app.models.user import User


ACTION_MAP = {
    "POST": {
        "/auth/login": "Logged into the system",
        "/auth/register": "Registered a new account",
        "/employees": "Added a new Employee record",
        "/attendances": "Created an Attendance entry",
        "/salaries": "Generated a Salary record",
        "/leaves": "Submitted a Leave request",
        "/tasks": "Created a Task",
        "/reminders": "Created a Reminder",
        "/backups": "Created a Database Backup",
        "/expenses": "Submitted an Expense record",
        "/settings": "Created a System Setting",
        "/roles": "Created a Role",
        "/users": "Created a User Account",
    },
    "PUT": {
        "/employees": "Updated Employee details",
        "/attendances": "Updated Attendance entry",
        "/salaries": "Updated Salary record",
        "/leaves": "Updated Leave request status/details",
        "/tasks": "Updated Task details",
        "/reminders": "Updated Reminder",
        "/expenses": "Updated Expense details",
        "/settings": "Updated System Setting",
        "/roles": "Updated Role permissions",
        "/users": "Updated User Account",
    },
    "DELETE": {
        "/employees": "Deleted an Employee record",
        "/attendances": "Deleted an Attendance entry",
        "/salaries": "Deleted a Salary record",
        "/leaves": "Deleted a Leave request",
        "/tasks": "Deleted a Task",
        "/reminders": "Deleted a Reminder",
        "/backups": "Deleted a Database Backup",
        "/expenses": "Deleted an Expense record",
        "/users": "Deleted a User Account",
    },
}

# Matched against the path with record ids replaced by "{id}".
SUB_ACTION_MAP = {
    "/attendances/actions/check-in": "Checked in",
    "/attendances/actions/check-out": "Checked out",
    "/attendances/unlock/{id}": "Unlocked an employee's attendance access",
    "/attendances/permissions": "Changed employee attendance edit permission",
    "/attendances/{id}/approve": "Approved Attendance Request",
    "/attendances/{id}/reject": "Rejected Attendance Request",
    "/expenses/{id}/approve": "Approved Expense Request",
    "/expenses/{id}/reject": "Rejected Expense Request",
    "/expenses/bulk-delete": "Deleted Expense records (bulk)",
    "/expenses/import-excel": "Imported Expenses from Excel",
    "/leaves/{id}/approve": "Approved Leave Request",
    "/leaves/{id}/reject": "Rejected Leave Request",
    "/leaves/{id}/attachments": "Uploaded a Leave attachment",
    "/leaves/{id}/attachments/{id}": "Deleted a Leave attachment",
    "/backups/{id}/restore": "Restored Database from Backup",
    "/backups/import": "Imported and Restored Database Backup",
    "/salaries/{id}/approve": "Approved Salary record",
    "/salaries/{id}/pay": "Marked Salary as paid",
    "/salaries/import-excel": "Imported Salaries from Excel",
    "/reminders/{id}/toggle": "Toggled a Reminder",
    "/inventory/{id}/assign": "Assigned an Inventory item",
    "/inventory/{id}/unassign": "Unassigned an Inventory item",
    "/inventory/assignments/{id}/return": "Returned an Inventory item",
    "/inventory/import-excel": "Imported Inventory from Excel",
    "/requisitions/{id}/close": "Closed a Requisition",
    "/requisitions/{id}/reopen": "Reopened a Requisition",
    "/requisitions/{id}/expenses": "Added a Requisition expense",
    "/requisitions/{id}/expenses/{id}/approve": "Approved a Requisition expense",
    "/requisitions/{id}/expenses/{id}/reject": "Rejected a Requisition expense",
    "/requisitions/import-excel": "Imported Requisitions from Excel",
}

# Which model a path's record id refers to. Paths not listed here use the
# model of their first segment and their first id.
_PREFIX_MODELS = {
    "attendances": Attendance,
    "employees": Employee,
    "leaves": LeaveRequest,
    "users": User,
    "expenses": Expense,
    "salaries": Salary,
    "tasks": Task,
    "reminders": Reminder,
    "roles": Role,
    "settings": Setting,
    "backups": Backup,
    "inventory": InventoryItem,
    "requisitions": Requisition,
}
_SUBPATH_MODELS = {
    "/attendances/unlock/{id}": (Employee, 0),
    "/inventory/assignments/{id}/return": (InventoryAssignment, 0),
    "/leaves/{id}/attachments/{id}": (LeaveAttachment, 1),
    "/requisitions/{id}/expenses/{id}/approve": (RequisitionExpense, 1),
    "/requisitions/{id}/expenses/{id}/reject": (RequisitionExpense, 1),
}

_ID_SEGMENT = re.compile(r"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|\d+)$")
_SECRET_KEYS = ("password", "token", "secret", "hashed", "api_key", "apikey")
_SKIP_FIELDS = {"created_at", "updated_at", "hashed_password"}
_MAX_BODY_BYTES = 64 * 1024
_MAX_META_CHARS = 20000


def _split_path(path: str) -> tuple[str, list[str]]:
    """Return the path with ids replaced by "{id}", and the ids in order."""
    ids: list[str] = []
    parts = []
    for seg in path.rstrip("/").split("/"):
        if _ID_SEGMENT.match(seg):
            ids.append(seg)
            parts.append("{id}")
        else:
            parts.append(seg)
    return "/".join(parts), ids


def _get_action(method: str, path: str) -> str:
    path_clean = path.rstrip("/")
    normalized, _ = _split_path(path_clean)
    if normalized in SUB_ACTION_MAP:
        return SUB_ACTION_MAP[normalized]
    method_map = ACTION_MAP.get("PUT" if method == "PATCH" else method, {})
    if path_clean in method_map:
        return method_map[path_clean]
    for prefix, desc in method_map.items():
        if path_clean.startswith(prefix):
            return desc
    return f"{method} {path_clean}"


def _is_secret(key: str) -> bool:
    k = key.lower()
    return any(s in k for s in _SECRET_KEYS)


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: ("***" if _is_secret(str(k)) else _redact(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact(v) for v in value]
    return value


def _plain(value: Any) -> Any:
    if isinstance(value, (datetime, date, dt_time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _snapshot(obj: Any) -> dict[str, Any]:
    return {
        col.name: _plain(getattr(obj, col.name, None))
        for col in obj.__table__.columns
        if col.name not in _SKIP_FIELDS and not _is_secret(col.name)
    }


def _diff(before: dict | None, after: dict | None) -> dict[str, dict[str, Any]]:
    before = before or {}
    after = after or {}
    changes = {}
    for key in sorted(set(before) | set(after)):
        if key == "id":
            continue
        old, new = before.get(key), after.get(key)
        if old != new:
            changes[key] = {"from": old, "to": new}
    return changes


def _employee_label(emp: Employee | None) -> str:
    if not emp:
        return "Unknown employee"
    return f"{emp.first_name} {emp.last_name} ({emp.employee_id})"


def _label(db: Session, obj: Any) -> str:
    if isinstance(obj, Employee):
        return _employee_label(obj)
    if isinstance(obj, User):
        return f"{obj.full_name or obj.username} (@{obj.username})"
    if isinstance(obj, Attendance):
        emp = db.query(Employee).filter(Employee.id == obj.employee_id).first()
        return f"{_employee_label(emp)} · attendance {obj.date}"
    if isinstance(obj, LeaveRequest):
        emp = db.query(Employee).filter(Employee.id == obj.employee_id).first()
        return f"{_employee_label(emp)} · {obj.leave_type} leave {obj.start_date} → {obj.end_date}"
    if isinstance(obj, Salary):
        emp = db.query(Employee).filter(Employee.id == getattr(obj, "employee_id", None)).first()
        return f"{_employee_label(emp)} · salary {getattr(obj, 'month', '')} {getattr(obj, 'year', '')}".strip()
    for attr in ("name", "title", "item_name", "key", "filename"):
        val = getattr(obj, attr, None)
        if val:
            return str(val)
    return str(getattr(obj, "id", ""))


def _resolve_model(normalized: str, ids: list[str]) -> tuple[Any, str | None]:
    if normalized in _SUBPATH_MODELS:
        model, idx = _SUBPATH_MODELS[normalized]
        return model, ids[idx] if len(ids) > idx else None
    prefix = normalized.strip("/").split("/")[0]
    return _PREFIX_MODELS.get(prefix), ids[0] if ids else None


def _load(db: Session, model: Any, record_id: str | None) -> Any:
    if model is None or not record_id:
        return None
    obj = db.query(model).filter(model.id == record_id).first()
    if obj is None and model is Employee:
        # /attendances/unlock/{id} also accepts the employee code
        obj = db.query(Employee).filter(Employee.employee_id == record_id).first()
    return obj


def _take_before(model: Any, record_id: str | None) -> dict | None:
    if model is None or not record_id:
        return None
    db = SessionLocal()
    try:
        obj = _load(db, model, record_id)
        return _snapshot(obj) if obj else None
    except Exception:
        return None
    finally:
        db.close()


def _summarize_changes(changes: dict, created: bool) -> str:
    if not changes:
        return ""
    if created:
        return ""
    parts = [f"{k}: {v['from'] if v['from'] is not None else '—'} → {v['to'] if v['to'] is not None else '—'}" for k, v in list(changes.items())[:6]]
    more = f" (+{len(changes) - 6} more)" if len(changes) > 6 else ""
    return " | Changes: " + "; ".join(parts) + more


def _write_log(
    request: Request,
    status_code: int,
    duration_ms: int,
    request_data: Any,
    model: Any,
    record_id: str | None,
    response_id: str | None,
    before: dict | None,
    started_at: datetime,
) -> None:
    db: Session = SessionLocal()
    try:
        user = getattr(request.state, "user", None)
        path = request.url.path
        action_text = _get_action(request.method, path)

        if user:
            account_str = f"{user.full_name or user.username} (@{user.username})"
        elif isinstance(request_data, dict) and request_data.get("username"):
            account_str = f"Not signed in (username entered: {request_data['username']})"
        else:
            account_str = "Anonymous / System"
        timestamp_str = get_bd_now().strftime("%Y-%m-%d %H:%M:%S")

        emp_info = ""
        actor: dict[str, Any] | None = None
        if user:
            actor = {"user_id": user.id, "username": user.username, "full_name": user.full_name}
            emp = db.query(Employee).filter(Employee.user_id == user.id).first()
            if emp:
                emp_info = f" | Employee: {emp.first_name} {emp.last_name} (ID: {emp.employee_id})"
                actor["employee"] = _employee_label(emp)

        target_id = record_id or response_id
        obj = _load(db, model, target_id)
        after = _snapshot(obj) if obj else None
        created = before is None and obj is not None and _created_since(obj, started_at)
        # Without a "before" snapshot (e.g. check-out, which has no id in its
        # path) a diff would list every field, so only the final record is kept.
        changes = _diff(before, after) if before is not None else {}
        target = None
        if obj is not None:
            target = {"type": model.__tablename__, "id": obj.id, "label": _label(db, obj)}
        elif before is not None:
            target = {"type": model.__tablename__, "id": target_id, "label": f"{model.__tablename__} {target_id} (deleted)"}

        target_str = f" | Target: {target['label']}" if target else ""
        details_text = (
            f"Account: {account_str}{emp_info}{target_str} | Time: {timestamp_str} | Path: {path}"
            + _summarize_changes(changes, created)
        )

        meta: dict[str, Any] = {
            "method": request.method,
            "path": path,
            "query": dict(request.query_params) or None,
            "status_code": status_code,
            "duration_ms": duration_ms,
            "user_agent": request.headers.get("user-agent"),
            "actor": actor,
            "target": target,
            "request": request_data,
            "change_type": "created" if created else ("deleted" if before is not None and after is None else "updated"),
            "changes": changes or None,
            "record": after,
        }
        meta_json = json.dumps(meta, default=str, ensure_ascii=False)
        if len(meta_json) > _MAX_META_CHARS:
            meta["request"] = "(request body too large to store)"
            meta_json = json.dumps(meta, default=str, ensure_ascii=False)[:_MAX_META_CHARS]

        log_activity(
            db=db,
            user_id=user.id if user else None,
            action=action_text,
            resource_type=path.split("/")[1] if len(path.split("/")) > 1 else "system",
            resource_id=str(target["id"])[:36] if target and target.get("id") else None,
            details=details_text,
            ip_address=_client_ip(request),
            meta=meta_json,
        )
    except Exception:
        db.rollback()
    finally:
        db.close()


def _created_since(obj: Any, started_at: datetime) -> bool:
    created_at = getattr(obj, "created_at", None)
    if not isinstance(created_at, datetime):
        return False
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return created_at >= started_at


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "127.0.0.1"


async def _read_request_data(request: Request) -> Any:
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type:
        return "(file upload)"
    if "application/json" not in content_type:
        return None
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > _MAX_BODY_BYTES:
        return "(request body too large to store)"
    body = await request.body()
    if not body:
        return None
    try:
        return _redact(json.loads(body))
    except ValueError:
        return "(invalid JSON body)"


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method not in ("POST", "PUT", "PATCH", "DELETE"):
            return await call_next(request)

        started = time.monotonic()
        # A little slack for clock rounding between the app and the database.
        started_at = datetime.fromtimestamp(time.time() - 1, tz=timezone.utc)
        try:
            request_data = await _read_request_data(request)
        except Exception:
            request_data = None
        normalized, ids = _split_path(request.url.path)
        model, record_id = _resolve_model(normalized, ids)
        before = await run_in_threadpool(_take_before, model, record_id)

        response: Response = await call_next(request)
        if response.status_code >= 400:
            return response

        # Read a JSON response so a newly created record's id can be found.
        response_id = None
        if "application/json" in response.headers.get("content-type", ""):
            body = b""
            async for chunk in response.body_iterator:
                body += chunk if isinstance(chunk, bytes) else chunk.encode()
            new_response = Response(content=body, status_code=response.status_code, background=response.background)
            new_response.raw_headers = response.raw_headers
            response = new_response
            try:
                payload = json.loads(body)
                data = payload.get("data") if isinstance(payload, dict) else None
                if isinstance(data, dict) and isinstance(data.get("id"), str):
                    response_id = data["id"]
            except ValueError:
                pass

        duration_ms = int((time.monotonic() - started) * 1000)
        await run_in_threadpool(
            _write_log, request, response.status_code, duration_ms, request_data, model, record_id, response_id, before, started_at
        )
        return response
