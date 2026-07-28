from typing import Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.task import TaskService
from app.schemas.task import TaskCreate, TaskUpdate
from app.utils.dependencies import get_current_user, get_user_role_name
from app.utils.response import success_response, paginated_response
from app.models.task import Task
from app.models.employee import Employee
from app.models.user import User

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _enrich_task(task, db):
    assigned_to_user = None
    assigned_by_user = None
    assigned_to_name = ""
    assigned_by_name = ""
    assigned_to_employee_id = None

    if task.assigned_to:
        assigned_to_user = db.query(User).filter(User.id == task.assigned_to).first()
        if assigned_to_user:
            emp = db.query(Employee).filter(Employee.user_id == assigned_to_user.id).first()
            if emp:
                assigned_to_name = f"{emp.first_name} {emp.last_name}"
                assigned_to_employee_id = emp.id
            else:
                assigned_to_name = assigned_to_user.full_name or assigned_to_user.username
    if task.assigned_by:
        assigned_by_user = db.query(User).filter(User.id == task.assigned_by).first()
        if assigned_by_user:
            emp = db.query(Employee).filter(Employee.user_id == assigned_by_user.id).first()
            if emp:
                assigned_by_name = f"{emp.first_name} {emp.last_name}"
            else:
                assigned_by_name = assigned_by_user.full_name or assigned_by_user.username

    return {
        "id": task.id,
        "title": task.title,
        "description": task.description or "",
        "assigned_to": task.assigned_to,
        "assigned_to_name": assigned_to_name,
        "assigned_to_employee_id": assigned_to_employee_id,
        "assigned_by": task.assigned_by,
        "assigned_by_name": assigned_by_name,
        "due_date": str(task.due_date) if task.due_date else "",
        "priority": task.priority,
        "status": task.status,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
    }


def _is_employee_role(db: Session, current_user: Any) -> bool:
    return get_user_role_name(current_user, db) == "employee"


def _get_current_employee(db: Session, current_user: Any) -> Employee | None:
    return db.query(Employee).filter(Employee.user_id == current_user.id, Employee.deleted_at.is_(None)).first()


@router.get("")
def list_tasks(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    service = TaskService(db)
    if _is_employee_role(db, current_user):
        emp = _get_current_employee(db, current_user)
        if emp:
            tasks = db.query(Task).filter(Task.assigned_to == emp.id, Task.deleted_at.is_(None)).offset(skip).limit(limit).all()
        else:
            tasks = []
    else:
        tasks = service.get_all(skip=skip, limit=limit)
    total = db.query(Task).filter(Task.deleted_at.is_(None)).count()
    data = [_enrich_task(t, db) for t in tasks]
    page = skip // limit + 1 if limit else 1
    return paginated_response(data=data, total=total, page=page, per_page=limit)


@router.get("/{task_id}")
def get_task(task_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    service = TaskService(db)
    task = service.get_by_id(task_id)
    if _is_employee_role(db, current_user) and task.assigned_to:
        emp = _get_current_employee(db, current_user)
        if emp and task.assigned_to != emp.id:
            raise HTTPException(status_code=403, detail="Access denied")
    return success_response(data=_enrich_task(task, db))


@router.post("")
def create_task(data: TaskCreate, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    service = TaskService(db)
    payload = data.model_dump()
    if not payload.get("assigned_by"):
        payload["assigned_by"] = current_user.id
    task = service.create(payload)
    return success_response(data=_enrich_task(task, db))


@router.put("/{task_id}")
def update_task(task_id: str, data: TaskUpdate, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    service = TaskService(db)
    task = service.get_by_id(task_id)

    update_data = data.model_dump(exclude_unset=True)

    if _is_employee_role(db, current_user):
        if task.assigned_to:
            emp = _get_current_employee(db, current_user)
            if emp and task.assigned_to != emp.id:
                raise HTTPException(status_code=403, detail="Access denied")
        restricted_fields = {"assigned_to", "assigned_by", "priority"}
        for field in restricted_fields:
            update_data.pop(field, None)

    updated = service.update(task_id, update_data)
    return success_response(data=_enrich_task(updated, db))


@router.delete("/{task_id}")
def delete_task(task_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        raise HTTPException(status_code=403, detail="Employees cannot delete tasks")
    service = TaskService(db)
    service.delete(task_id)
    return success_response(data=None)