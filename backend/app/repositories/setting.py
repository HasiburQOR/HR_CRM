from app.repositories.base import BaseRepository
from app.models.setting import Setting


class SettingRepository(BaseRepository[Setting]):
    def __init__(self, db):
        super().__init__(Setting, db)

    def get_by_key(self, key: str) -> Setting | None:
        return self.db.query(Setting).filter(Setting.key == key).first()
