from app.repositories.base import BaseRepository
from app.models.role import Role


class RoleRepository(BaseRepository[Role]):
    def __init__(self, db):
        super().__init__(Role, db)

    def get_by_name(self, name: str) -> Role | None:
        return self.db.query(Role).filter(Role.name == name, Role.deleted_at.is_(None)).first()
