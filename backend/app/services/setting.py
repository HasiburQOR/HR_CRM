from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.setting import SettingRepository


class SettingService:
    def __init__(self, db: Session):
        self.repo = SettingRepository(db)

    def get_all(self, skip: int = 0, limit: int = 100):
        return self.repo.get_all(skip=skip, limit=limit)

    def get_by_id(self, setting_id: str):
        setting = self.repo.get(setting_id)
        if not setting:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setting not found")
        return setting

    def get_by_key(self, key: str | None):
        setting = self.repo.get_by_key(key)
        if not setting:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setting not found")
        return setting

    def create(self, data: dict):
        existing = self.repo.get_by_key(data.get("key"))
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Setting key already exists")
        return self.repo.create(data)

    def update(self, setting_id: str, data: dict):
        setting = self.repo.get(setting_id)
        if not setting:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setting not found")
        return self.repo.update(setting_id, data)

    def delete(self, setting_id: str):
        setting = self.repo.get(setting_id)
        if not setting:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setting not found")
        return self.repo.hard_delete(setting_id)
