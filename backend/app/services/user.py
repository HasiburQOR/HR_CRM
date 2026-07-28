from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.user import UserRepository
from app.utils.security import hash_password


class UserService:
    def __init__(self, db: Session):
        self.repo = UserRepository(db)

    def get_all(self, skip: int = 0, limit: int = 100):
        return self.repo.get_all(skip=skip, limit=limit)

    def get_by_id(self, user_id: str):
        user = self.repo.get(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return user

    def create(self, data: dict):
        existing = self.repo.get_by_username(data.get("username"))
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists")
        existing_email = self.repo.get_by_email(data.get("email"))
        if existing_email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")
        data["hashed_password"] = hash_password(data.pop("password"))
        return self.repo.create(data)

    def update(self, user_id: str, data: dict):
        user = self.repo.get(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        if "password" in data and data["password"]:
            data["hashed_password"] = hash_password(data.pop("password"))
        return self.repo.update(user_id, data)

    def delete(self, user_id: str):
        user = self.repo.get(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return self.repo.delete(user_id)
