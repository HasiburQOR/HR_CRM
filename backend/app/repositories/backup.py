from app.repositories.base import BaseRepository
from app.models.backup import Backup


class BackupRepository(BaseRepository[Backup]):
    def __init__(self, db):
        super().__init__(Backup, db)

    def get_by_status(self, status: str) -> list[Backup]:
        return self.db.query(Backup).filter(Backup.status == status).all()

    def get_latest(self) -> Backup | None:
        return self.db.query(Backup).order_by(Backup.created_at.desc()).first()
