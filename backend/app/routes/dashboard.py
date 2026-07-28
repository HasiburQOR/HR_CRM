from typing import Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.dashboard import DashboardService
from app.utils.dependencies import get_current_user
from app.utils.response import success_response

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def get_summary(db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    service = DashboardService(db)
    stats = service.get_stats(current_user)
    return success_response(data=stats)
