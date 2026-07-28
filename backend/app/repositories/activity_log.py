from app.repositories.base import BaseRepository
from app.models.activity_log import ActivityLog


class ActivityLogRepository(BaseRepository[ActivityLog]):
    def __init__(self, db):
        super().__init__(ActivityLog, db)

    def get_by_user(self, user_id: str) -> list[ActivityLog]:
        return self.db.query(ActivityLog).filter(ActivityLog.user_id == user_id).order_by(ActivityLog.created_at.desc()).all()
