from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.attendance import AttendanceRepository


class AttendanceService:
    def __init__(self, db: Session):
        self.repo = AttendanceRepository(db)

    def get_all(self, skip: int = 0, limit: int = 100):
        return self.repo.get_all(skip=skip, limit=limit)

    def get_by_id(self, attendance_id: str):
        record = self.repo.get(attendance_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance record not found")
        return record

    def create(self, data: dict):
        return self.repo.create(data)

    def update(self, attendance_id: str, data: dict):
        record = self.repo.get(attendance_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance record not found")
        return self.repo.update(attendance_id, data)

    def delete(self, attendance_id: str):
        record = self.repo.get(attendance_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance record not found")
        return self.repo.hard_delete(attendance_id)

    def approve(self, attendance_id: str, approved_by: str):
        record = self.repo.get(attendance_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance record not found")
        if record.status == "approved":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already approved")
        if record.status == "rejected":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already rejected")
        return self.repo.update(attendance_id, {"status": "approved", "approved_by": approved_by})

    def reject(self, attendance_id: str, rejected_by: str):
        record = self.repo.get(attendance_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance record not found")
        if record.status == "approved":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already approved")
        if record.status == "rejected":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already rejected")
        return self.repo.update(attendance_id, {"status": "rejected", "rejected_by": rejected_by})
