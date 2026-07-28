from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.leave import LeaveRequestRepository


class LeaveRequestService:
    def __init__(self, db: Session):
        self.repo = LeaveRequestRepository(db)

    def get_all(self, skip: int = 0, limit: int = 100):
        return self.repo.get_all(skip=skip, limit=limit)

    def get_by_id(self, leave_id: str):
        record = self.repo.get(leave_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found")
        return record

    def create(self, data: dict):
        return self.repo.create(data)

    def update(self, leave_id: str, data: dict):
        record = self.repo.get(leave_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found")
        return self.repo.update(leave_id, data)

    def delete(self, leave_id: str):
        record = self.repo.get(leave_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found")
        return self.repo.hard_delete(leave_id)
