from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.utils.security import decode_access_token
from app.repositories.user import UserRepository


class AuthContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            payload = decode_access_token(token)
            if payload:
                user_id = payload.get("sub")
                if user_id:
                    db: Session = SessionLocal()
                    try:
                        user_repo = UserRepository(db)
                        user = user_repo.get(user_id)
                        if user and user.is_active:
                            request.state.user = user
                    finally:
                        db.close()
        response: Response = await call_next(request)
        return response
