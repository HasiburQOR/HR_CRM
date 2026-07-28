from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.user import UserRepository
from app.repositories.role import RoleRepository
from app.utils.security import hash_password, verify_password, create_access_token
from app.models.employee import Employee


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.user_repo = UserRepository(db)
        self.role_repo = RoleRepository(db)

    def _get_role_name(self, user) -> str:
        if user.is_superuser:
            return "admin"
        if not user.role_id:
            return "employee"
        role = self.role_repo.get(user.role_id)
        return role.name if role else "employee"

    def register(self, username: str, email: str, password: str, full_name: str | None = None) -> dict:
        existing_user = self.user_repo.get_by_username(username)
        if existing_user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")
        existing_email = self.user_repo.get_by_email(email)
        if existing_email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
        user_data = {
            "username": username,
            "email": email,
            "hashed_password": hash_password(password),
            "full_name": full_name,
        }
        user = self.user_repo.create(user_data)
        token = create_access_token({"sub": user.id})
        return {
            "token": token,
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "full_name": user.full_name,
                "role": self._get_role_name(user),
                "is_superuser": user.is_superuser,
            },
        }

    def login(self, email_or_username: str, password: str) -> dict:
        user = self.user_repo.get_by_email(email_or_username)
        if not user:
            user = self.user_repo.get_by_username(email_or_username)
        if not user or not verify_password(password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
        token = create_access_token({"sub": user.id})
        return {
            "success": True,
            "data": {
                "token": token,
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "full_name": user.full_name,
                    "role": self._get_role_name(user),
                    "role_id": user.role_id,
                    "is_superuser": user.is_superuser,
                },
            },
        }

    def login_by_employee_id(self, employee_id: str, password: str) -> dict:
        emp = self.db.query(Employee).filter(Employee.employee_id == employee_id, Employee.deleted_at.is_(None)).first()
        if not emp or not emp.user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        user = self.user_repo.get(emp.user_id)
        if not user or not verify_password(password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
        token = create_access_token({"sub": user.id})
        return {
            "success": True,
            "data": {
                "token": token,
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "full_name": user.full_name,
                    "role": self._get_role_name(user),
                    "role_id": user.role_id,
                    "is_superuser": user.is_superuser,
                    "employee_id": emp.employee_id,
                },
            },
        }
