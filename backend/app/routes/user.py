from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.employee import Employee
from app.models.role import Role
from app.schemas.user import UserCreate, UserUpdate
from app.utils.dependencies import get_current_user, require_admin
from app.utils.security import hash_password
from app.utils.response import success_response, paginated_response

router = APIRouter(prefix="/users", tags=["users"])


@router.get("")
def list_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    query = db.query(User).filter(User.deleted_at.is_(None))
    total = query.count()
    users = query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()

    data = []
    for u in users:
        role_name = "admin" if u.is_superuser else "employee"
        if u.role_id:
            r = db.query(Role).filter(Role.id == u.role_id).first()
            if r:
                role_name = r.name.lower()

        emp = db.query(Employee).filter(Employee.user_id == u.id).first()

        data.append({
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "full_name": u.full_name or "",
            "role": role_name,
            "role_id": u.role_id,
            "employee_id": emp.id if emp else None,
            "employee_name": f"{emp.first_name} {emp.last_name}" if emp else None,
            "is_active": u.is_active,
            "is_superuser": u.is_superuser,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        })

    page = skip // limit + 1 if limit else 1
    return paginated_response(data=data, total=total, page=page, per_page=limit)


@router.get("/{user_id}")
def get_user(user_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    role_name = "admin" if u.is_superuser else "employee"
    if u.role_id:
        r = db.query(Role).filter(Role.id == u.role_id).first()
        if r:
            role_name = r.name.lower()
    emp = db.query(Employee).filter(Employee.user_id == u.id).first()
    result = {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "full_name": u.full_name or "",
        "role": role_name,
        "role_id": u.role_id,
        "employee_id": emp.id if emp else None,
        "employee_name": f"{emp.first_name} {emp.last_name}" if emp else None,
        "is_active": u.is_active,
        "is_superuser": u.is_superuser,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "updated_at": u.updated_at.isoformat() if u.updated_at else None,
    }
    return success_response(data=result)


@router.post("")
def create_user(data: UserCreate, employee_id: str | None = None, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    existing = db.query(User).filter(User.username == data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    role_id = None
    is_super = False
    if hasattr(data, 'role') and data.role:
        if data.role == 'admin':
            is_super = True
        else:
            r = db.query(Role).filter(Role.name == data.role).first()
            if r:
                role_id = r.id

    new_user = User(
        username=data.username,
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name or data.username,
        is_active=True,
        is_superuser=is_super,
        role_id=role_id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    if employee_id:
        emp = db.query(Employee).filter(Employee.id == employee_id).first()
        if emp:
            emp.user_id = new_user.id
            db.commit()

    return success_response(data=new_user)


@router.put("/{user_id}")
def update_user(user_id: str, data: UserUpdate, employee_id: str | None = None, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    u = db.query(User).filter(User.id == user_id).first()
    if u:
        if data.username:
            u.username = data.username
        if data.email:
            u.email = data.email
        if hasattr(data, 'password') and data.password:
            u.hashed_password = hash_password(data.password)
        db.commit()
        db.refresh(u)

        if employee_id:
            emp = db.query(Employee).filter(Employee.id == employee_id).first()
            if emp:
                emp.user_id = u.id
                db.commit()

    return success_response(data=u)


@router.delete("/{user_id}")
def delete_user(user_id: str, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    u = db.query(User).filter(User.id == user_id).first()
    if u:
        u.deleted_at = u.updated_at
        db.commit()
    return success_response(data=None)
