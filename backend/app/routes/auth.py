from typing import Optional
from pydantic import BaseModel, model_validator

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.auth import AuthService
from app.schemas.user import UserCreate
from app.utils.response import success_response

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    employee_id: Optional[str] = None
    password: str

    @model_validator(mode="after")
    def require_identifier(self):
        if not self.email and not self.username and not self.employee_id:
            raise ValueError("Either email, username, or employee_id must be provided")
        return self


@router.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    service = AuthService(db)
    if data.employee_id:
        return service.login_by_employee_id(data.employee_id, data.password)
    identifier = data.email or data.username
    return service.login(identifier, data.password)


@router.post("/register")
def register(data: UserCreate, db: Session = Depends(get_db)):
    service = AuthService(db)
    result = service.register(data.username, data.email, data.password, data.full_name)
    return success_response(data=result)
