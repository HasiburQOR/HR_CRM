from typing import Any
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
import json

from app.database import get_db
from app.repositories.user import UserRepository
from app.repositories.role import RoleRepository
from app.utils.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Any:
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user_repo = UserRepository(db)
    user = user_repo.get(user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


def get_user_role_name(user: Any, db: Session) -> str:
    if user.is_superuser:
        return "admin"
    if not user.role_id:
        return "employee"
    role_repo = RoleRepository(db)
    role = role_repo.get(user.role_id)
    return role.name.lower() if role else "employee"


def require_admin(current_user: Any = Depends(get_current_user), db: Session = Depends(get_db)) -> Any:
    role_name = get_user_role_name(current_user, db)
    if not current_user.is_superuser and role_name not in ("admin", "ceo", "hr"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin/HR/CEO access required")
    return current_user


def require_hr_or_ceo(current_user: Any = Depends(get_current_user), db: Session = Depends(get_db)) -> Any:
    role_name = get_user_role_name(current_user, db)
    if not current_user.is_superuser and role_name not in ("admin", "ceo", "hr"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only HR or CEO can perform this action")
    return current_user


def require_employee(current_user: Any = Depends(get_current_user), db: Session = Depends(get_db)) -> Any:
    role_name = get_user_role_name(current_user, db)
    if not current_user.is_superuser and role_name != "employee":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Employee access only")
    return current_user


def require_permission(permission: str):
    def checker(current_user: Any = Depends(get_current_user), db: Session = Depends(get_db)) -> Any:
        if current_user.is_superuser:
            return current_user
        role_name = get_user_role_name(current_user, db)
        if role_name in ("admin", "ceo", "hr"):
            return current_user
        if not current_user.role_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No role assigned")
        role_repo = RoleRepository(db)
        role = role_repo.get(current_user.role_id)
        if not role:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Role not found")
        try:
            perms = json.loads(str(role.permissions))
        except (json.JSONDecodeError, TypeError):
            perms = {}
        if permission not in perms:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user
    return checker
