from typing import Any
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db, engine
from app.services.backup import BackupService
from app.utils.dependencies import require_admin
from app.utils.response import success_response, paginated_response
from app.models.backup import Backup

router = APIRouter(prefix="/backups", tags=["backups"])


@router.get("")
def list_backups(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    service = BackupService(db)
    data = service.get_all(skip=skip, limit=limit)
    total = db.query(Backup).count()
    page = skip // limit + 1 if limit else 1
    return paginated_response(data=data, total=total, page=page, per_page=limit)


@router.get("/{backup_id}")
def get_backup(backup_id: str, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    service = BackupService(db)
    return success_response(data=service.get_by_id(backup_id))


@router.get("/{backup_id}/download")
def download_backup(backup_id: str, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    service = BackupService(db)
    backup = service.get_by_id(backup_id)
    filepath = Path(backup.filepath)
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Backup file not found on disk")

    return FileResponse(
        path=str(filepath),
        filename=backup.filename,
        media_type="application/x-sqlite3"
    )

@router.post("")
def create_backup(db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    service = BackupService(db)
    backup = service.create()
    return success_response(data=backup)


@router.post("/import")
async def import_and_restore_backup(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_admin)
):
    if not file.filename.endswith((".db", ".sqlite", ".sqlite3", ".sql")):
        raise HTTPException(status_code=400, detail="Only .db / .sqlite / .sql files can be imported")

    service = BackupService(db)
    content = await file.read()
    backup = service.import_and_restore(file.filename, content)
    return success_response(data=backup, message="Backup imported and database restored successfully!")


@router.post("/{backup_id}/restore")
def restore_backup(backup_id: str, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    service = BackupService(db)
    service.restore(backup_id)
    return success_response(data=None, message="Database successfully restored from backup!")


@router.delete("/{backup_id}")
def delete_backup(backup_id: str, db: Session = Depends(get_db), current_user: Any = Depends(require_admin)):
    service = BackupService(db)
    service.delete(backup_id)
    return success_response(data=None)
