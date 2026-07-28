from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.reminder import ReminderRepository


class ReminderService:
    def __init__(self, db: Session):
        self.repo = ReminderRepository(db)

    def get_all(self, skip: int = 0, limit: int = 100):
        return self.repo.get_all(skip=skip, limit=limit)

    def get_by_id(self, reminder_id: str):
        reminder = self.repo.get(reminder_id)
        if not reminder:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reminder not found")
        return reminder

    def create(self, data: dict):
        return self.repo.create(data)

    def update(self, reminder_id: str, data: dict):
        reminder = self.repo.get(reminder_id)
        if not reminder:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reminder not found")
        return self.repo.update(reminder_id, data)

    def delete(self, reminder_id: str):
        reminder = self.repo.get(reminder_id)
        if not reminder:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reminder not found")
        return self.repo.hard_delete(reminder_id)
