from app.repositories.base import BaseRepository
from app.models.task import Task


class TaskRepository(BaseRepository[Task]):
    def __init__(self, db):
        super().__init__(Task, db)

    def get_by_assignee(self, user_id: str) -> list[Task]:
        return self.db.query(Task).filter(Task.assigned_to == user_id, Task.deleted_at.is_(None)).all()

    def get_by_status(self, status: str) -> list[Task]:
        return self.db.query(Task).filter(Task.status == status, Task.deleted_at.is_(None)).all()
