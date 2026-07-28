from datetime import date
from app.repositories.base import BaseRepository
from app.models.leave import LeaveRequest


class LeaveRequestRepository(BaseRepository[LeaveRequest]):
    def __init__(self, db):
        super().__init__(LeaveRequest, db)

    def get_by_employee(self, employee_id: str) -> list[LeaveRequest]:
        return self.db.query(LeaveRequest).filter(LeaveRequest.employee_id == employee_id).all()

    def get_by_status(self, status: str) -> list[LeaveRequest]:
        return self.db.query(LeaveRequest).filter(LeaveRequest.status == status).all()

    def get_by_date_range(self, start: date, end: date) -> list[LeaveRequest]:
        return self.db.query(LeaveRequest).filter(
            LeaveRequest.start_date >= start,
            LeaveRequest.end_date <= end,
        ).all()
