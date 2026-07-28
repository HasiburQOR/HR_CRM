from sqlalchemy.orm import Session

from app.repositories.activity_log import ActivityLogRepository


class ActivityLogService:
    def __init__(self, db: Session):
        self.repo = ActivityLogRepository(db)

    def get_all(self, skip: int = 0, limit: int = 100):
        return self.repo.get_all(skip=skip, limit=limit)

    def get_by_id(self, log_id: str):
        return self.repo.get(log_id)
