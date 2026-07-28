from typing import Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.role import RoleService
from app.schemas.role import RoleCreate, RoleUpdate
from app.utils.dependencies import require_admin
from app.utils.response import success_response, paginated_response
from app.models.role import Role

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("")
def list_roles(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    service = RoleService(db)
    data = service.get_all(skip=skip, limit=limit)
    total = db.query(Role).filter(Role.deleted_at.is_(None)).count()
    page = skip // limit + 1 if limit else 1
    return paginated_response(data=data, total=total, page=page, per_page=limit)


@router.get("/{role_id}")
def get_role(role_id: str, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    service = RoleService(db)
    return success_response(data=service.get_by_id(role_id))


@router.post("")
def create_role(data: RoleCreate, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    service = RoleService(db)
    return success_response(data=service.create(data.model_dump()))


@router.put("/{role_id}")
def update_role(role_id: str, data: RoleUpdate, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    service = RoleService(db)
    return success_response(data=service.update(role_id, data.model_dump(exclude_unset=True)))


@router.delete("/{role_id}")
def delete_role(role_id: str, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    service = RoleService(db)
    service.delete(role_id)
    return success_response(data=None)
