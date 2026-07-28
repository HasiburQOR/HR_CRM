from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.task import TaskRepository


class TaskService:
    def __init__(self, db: Session):
        self.repo = TaskRepository(db)

    def get_all(self, skip: int = 0, limit: int = 100):
        return self.repo.get_all(skip=skip, limit=limit)

    def get_by_id(self, task_id: str):
        task = self.repo.get(task_id)
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
        return task

    def create(self, data: dict):
        return self.repo.create(data)

    def update(self, task_id: str, data: dict):
        task = self.repo.get(task_id)
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
        return self.repo.update(task_id, data)

    def delete(self, task_id: str):
        task = self.repo.get(task_id)
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
        return self.repo.delete(task_id)
