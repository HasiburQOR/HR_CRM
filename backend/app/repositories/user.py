from app.repositories.base import BaseRepository
from app.models.user import User


class UserRepository(BaseRepository[User]):
    def __init__(self, db):
        super().__init__(User, db)

    def get_by_username(self, username: str) -> User | None:
        return self.db.query(User).filter(User.username == username, User.deleted_at.is_(None)).first()

    def get_by_email(self, email: str) -> User | None:
        return self.db.query(User).filter(User.email == email, User.deleted_at.is_(None)).first()
