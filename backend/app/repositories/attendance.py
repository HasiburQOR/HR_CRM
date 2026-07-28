from datetime import date
from app.repositories.base import BaseRepository
from app.models.attendance import Attendance


class AttendanceRepository(BaseRepository[Attendance]):
    def __init__(self, db):
        super().__init__(Attendance, db)

    def get_by_employee_and_date(self, employee_id: str, attendance_date: date) -> Attendance | None:
        return self.db.query(Attendance).filter(
            Attendance.employee_id == employee_id,
            Attendance.date == attendance_date,
        ).first()

    def get_by_date_range(self, employee_id: str, start: date, end: date) -> list[Attendance]:
        return self.db.query(Attendance).filter(
            Attendance.employee_id == employee_id,
            Attendance.date >= start,
            Attendance.date <= end,
        ).all()
