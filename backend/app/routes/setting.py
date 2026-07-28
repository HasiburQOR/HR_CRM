from typing import Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.setting import SettingService
from app.schemas.setting import SettingCreate, SettingUpdate
from app.utils.dependencies import require_admin
from app.utils.response import success_response, paginated_response
from app.models.setting import Setting

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
def list_settings(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    service = SettingService(db)
    data = service.get_all(skip=skip, limit=limit)
    total = db.query(Setting).count()
    page = skip // limit + 1 if limit else 1
    return paginated_response(data=data, total=total, page=page, per_page=limit)


@router.get("/by-key/{key}")
def get_setting_by_key(key: str, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    service = SettingService(db)
    return success_response(data=service.get_by_key(key))


@router.get("/{setting_id}")
def get_setting(setting_id: str, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    service = SettingService(db)
    return success_response(data=service.get_by_id(setting_id))


@router.post("")
def create_setting(data: SettingCreate, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    service = SettingService(db)
    return success_response(data=service.create(data.model_dump()))


@router.put("/{setting_id}")
def update_setting(setting_id: str, data: SettingUpdate, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    service = SettingService(db)
    return success_response(data=service.update(setting_id, data.model_dump(exclude_unset=True)))


@router.delete("/{setting_id}")
def delete_setting(setting_id: str, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    service = SettingService(db)
    service.delete(setting_id)
    return success_response(data=None)
