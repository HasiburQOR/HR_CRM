from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.role import RoleRepository


class RoleService:
    def __init__(self, db: Session):
        self.repo = RoleRepository(db)

    def get_all(self, skip: int = 0, limit: int = 100):
        return self.repo.get_all(skip=skip, limit=limit)

    def get_by_id(self, role_id: str):
        role = self.repo.get(role_id)
        if not role:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
        return role

    def create(self, data: dict):
        existing = self.repo.get_by_name(data.get("name"))
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role name already exists")
        return self.repo.create(data)

    def update(self, role_id: str, data: dict):
        role = self.repo.get(role_id)
        if not role:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
        return self.repo.update(role_id, data)

    def delete(self, role_id: str):
        role = self.repo.get(role_id)
        if not role:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
        return self.repo.delete(role_id)
