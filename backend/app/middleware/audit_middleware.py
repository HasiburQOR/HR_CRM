from datetime import datetime
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.utils.audit import log_activity
from app.models.employee import Employee


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

SUB_ACTION_MAP = {
    "/expenses/approve": "Approved Expense Request",
    "/expenses/reject": "Rejected Expense Request",
    "/attendances/approve": "Approved Attendance Request",
    "/attendances/reject": "Rejected Attendance Request",
    "/leaves/approve": "Approved Leave Request",
    "/leaves/reject": "Rejected Leave Request",
    "/backups/restore": "Restored Database from Backup",
    "/backups/import": "Imported and Restored Database Backup",
}


def _get_action(method: str, path: str) -> str:
    path_clean = path.rstrip("/")
    for sub, desc in SUB_ACTION_MAP.items():
        if sub in path_clean:
            return desc
    method_map = ACTION_MAP.get(method, {})
    if path_clean in method_map:
        return method_map[path_clean]
    for prefix, desc in method_map.items():
        if path_clean.startswith(prefix):
            return desc
    return f"{method} {path_clean}"


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        if request.method in ("POST", "PUT", "PATCH", "DELETE") and response.status_code < 400:
            db: Session = SessionLocal()
            try:
                user = getattr(request.state, "user", None)
                user_id = user.id if user else None
                action_text = _get_action(request.method, request.url.path)

                account_str = f"{user.full_name or user.username} (@{user.username})" if user else "Anonymous / System"
                timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                emp_info = ""
                if user:
                    emp = db.query(Employee).filter(Employee.user_id == user.id).first()
                    if emp:
                        emp_info = f" | Employee: {emp.first_name} {emp.last_name} (ID: {emp.employee_id})"

                details_text = f"Account: {account_str}{emp_info} | Time: {timestamp_str} | Path: {request.url.path}"

                log_activity(
                    db=db,
                    user_id=user_id,
                    action=action_text,
                    resource_type=request.url.path.split("/")[1] if len(request.url.path.split("/")) > 1 else "system",
                    details=details_text,
                    ip_address=request.client.host if request.client else "127.0.0.1",
                )
            except Exception:
                pass
            finally:
                db.close()
        return response
