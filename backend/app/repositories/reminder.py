from datetime import datetime
from app.repositories.base import BaseRepository
from app.models.reminder import Reminder


class ReminderRepository(BaseRepository[Reminder]):
    def __init__(self, db):
        super().__init__(Reminder, db)

    def get_by_user(self, user_id: str) -> list[Reminder]:
        return self.db.query(Reminder).filter(Reminder.user_id == user_id).all()

    def get_pending_reminders(self) -> list[Reminder]:
        now = datetime.utcnow()
        return self.db.query(Reminder).filter(Reminder.remind_at <= now, Reminder.is_sent == False).all()
