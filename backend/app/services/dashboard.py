from sqlalchemy import func
from sqlalchemy.orm import Session
from datetime import date, timedelta

from app.models.user import User
from app.models.employee import Employee
from app.models.attendance import Attendance
from app.models.leave import LeaveRequest
from app.models.task import Task
from app.models.activity_log import ActivityLog
from app.models.expense import Expense
from app.models.salary import Salary
from app.models.inventory import InventoryItem
from app.utils.dependencies import get_user_role_name


class DashboardService:
    def __init__(self, db: Session):
        self.db = db

    def _is_employee(self, current_user) -> bool:
        return get_user_role_name(current_user, self.db) == "employee"

    def _get_current_employee(self, current_user) -> Employee | None:
        return self.db.query(Employee).filter(Employee.user_id == current_user.id, Employee.deleted_at.is_(None)).first()

    def get_stats(self, current_user):
        today = date.today()
        is_employee = self._is_employee(current_user)
        emp = self._get_current_employee(current_user) if is_employee else None

        total_users = self.db.query(User).filter(User.deleted_at.is_(None)).count()
        total_employees = self.db.query(Employee).filter(Employee.deleted_at.is_(None)).count()
        active_employees = self.db.query(Employee).filter(
            Employee.deleted_at.is_(None), Employee.status == "active"
        ).count()

        if is_employee and emp:
            present_today = self.db.query(Attendance).filter(
                Attendance.date == today,
                Attendance.employee_id == emp.id,
                Attendance.status.in_(["present", "approved"]),
            ).count()
        else:
            present_today = self.db.query(Attendance).filter(
                Attendance.date == today,
                Attendance.status.in_(["present", "approved"]),
            ).count()

        if is_employee and emp:
            pending_leaves = self.db.query(LeaveRequest).filter(
                LeaveRequest.status == "pending",
                LeaveRequest.employee_id == emp.id,
            ).count()
        else:
            pending_leaves = self.db.query(LeaveRequest).filter(
                LeaveRequest.status == "pending"
            ).count()

        if is_employee and emp:
            pending_tasks = self.db.query(Task).filter(
                Task.status == "pending",
                Task.deleted_at.is_(None),
                Task.assigned_to == emp.id,
            ).count()
        else:
            pending_tasks = self.db.query(Task).filter(
                Task.status == "pending", Task.deleted_at.is_(None)
            ).count()

        if is_employee and emp:
            pending_expenses = self.db.query(Expense).filter(
                Expense.status == "pending",
                Expense.deleted_at.is_(None),
                Expense.employee_id == emp.id,
            ).count()
        else:
            pending_expenses = self.db.query(Expense).filter(
                Expense.status == "pending", Expense.deleted_at.is_(None)
            ).count()

        if is_employee and emp:
            pending_salaries = self.db.query(Salary).filter(
                Salary.status == "pending",
                Salary.employee_id == emp.id,
            ).count()
        else:
            pending_salaries = self.db.query(Salary).filter(Salary.status == "pending").count()

        active_reminders = 0
        try:
            from app.models.reminder import Reminder
            if is_employee and emp:
                active_reminders = self.db.query(Reminder).filter(
                    Reminder.is_completed == False,
                    Reminder.employee_id == emp.id,
                ).count()
            else:
                active_reminders = self.db.query(Reminder).filter(
                    Reminder.is_completed == False,
                    Reminder.user_id == current_user.id,
                ).count()
        except Exception:
            pass

        if is_employee and emp:
            inventory_total_items = self.db.query(InventoryItem).filter(
                InventoryItem.deleted_at.is_(None),
                InventoryItem.employee_id == emp.id,
            ).count()
            inventory_assigned = inventory_total_items
            inventory_low_stock = self.db.query(InventoryItem).filter(
                InventoryItem.deleted_at.is_(None),
                InventoryItem.employee_id == emp.id,
                InventoryItem.quantity <= InventoryItem.minimum_stock,
            ).count()
            inventory_value = float(self.db.query(
                func.coalesce(func.sum(InventoryItem.quantity * InventoryItem.unit_cost), 0)
            ).filter(
                InventoryItem.deleted_at.is_(None),
                InventoryItem.employee_id == emp.id,
            ).scalar() or 0)
        else:
            inventory_total_items = self.db.query(InventoryItem).filter(
                InventoryItem.deleted_at.is_(None),
            ).count()
            inventory_assigned = self.db.query(InventoryItem).filter(
                InventoryItem.deleted_at.is_(None),
                InventoryItem.employee_id.isnot(None),
            ).count()
            inventory_low_stock = self.db.query(InventoryItem).filter(
                InventoryItem.deleted_at.is_(None),
                InventoryItem.quantity <= InventoryItem.minimum_stock,
            ).count()
            inventory_value = float(self.db.query(
                func.coalesce(func.sum(InventoryItem.quantity * InventoryItem.unit_cost), 0)
            ).filter(InventoryItem.deleted_at.is_(None)).scalar() or 0)

        if is_employee and emp:
            monthly_payroll_q = self.db.query(
                func.coalesce(func.sum(Salary.net_salary), 0)
            ).filter(
                Salary.employee_id == emp.id,
                Salary.year == today.year,
                Salary.month == today.strftime("%b").lower()
            ).scalar()
        else:
            monthly_payroll_q = self.db.query(
                func.coalesce(func.sum(Salary.net_salary), 0)
            ).filter(
                Salary.year == today.year,
                Salary.month == today.strftime("%b").lower()
            ).scalar()
        monthly_payroll = float(monthly_payroll_q or 0)

        if is_employee and emp:
            department_distribution = []
        else:
            department_distribution = self.db.query(
                Employee.department,
                func.count(Employee.id)
            ).filter(
                Employee.deleted_at.is_(None),
                Employee.department.isnot(None)
            ).group_by(Employee.department).all()

        if is_employee and emp:
            attendance_trend = []
            for i in range(7):
                trend_date = today - timedelta(days=i)
                records = self.db.query(Attendance).filter(
                    Attendance.date == trend_date,
                    Attendance.employee_id == emp.id,
                ).all()
                present = sum(1 for r in records if r.status == "present" or r.status == "approved")
                absent = sum(1 for r in records if r.status == "absent")
                late = sum(1 for r in records if r.status == "late")
                attendance_trend.append({
                    "date": trend_date.strftime("%Y-%m-%d"),
                    "present": present,
                    "absent": absent,
                    "late": late,
                })
        else:
            attendance_trend = []
            for i in range(7):
                trend_date = today - timedelta(days=i)
                records = self.db.query(Attendance).filter(Attendance.date == trend_date).all()
                present = sum(1 for r in records if r.status == "present" or r.status == "approved")
                absent = sum(1 for r in records if r.status == "absent")
                late = sum(1 for r in records if r.status == "late")
                attendance_trend.append({
                    "date": trend_date.strftime("%Y-%m-%d"),
                    "present": present,
                    "absent": absent,
                    "late": late,
                })

        if is_employee and emp:
            recent_activities = []
        else:
            recent_activities = self.db.query(
                ActivityLog,
                User
            ).filter(
                User.deleted_at.is_(None),
                ActivityLog.user_id == User.id,
            ).order_by(ActivityLog.created_at.desc()).limit(10).all()

        activities_data = []
        if not is_employee or not emp:
            for activity, user in recent_activities:
                activities_data.append({
                    "id": activity.id,
                    "action": activity.action,
                    "resource": activity.resource_type,
                    "username": user.username,
                    "full_name": user.full_name,
                    "created_at": activity.created_at.isoformat() if activity.created_at else None,
                })

        if is_employee and emp:
            pending_leaves_list = []
            for lr in self.db.query(LeaveRequest).filter(
                LeaveRequest.status == "pending",
                LeaveRequest.employee_id == emp.id,
            ).order_by(LeaveRequest.created_at.desc()).limit(10).all():
                pending_leaves_list.append({
                    "id": lr.id,
                    "employee_id": lr.employee_id,
                    "employee_name": f"{emp.first_name} {emp.last_name}",
                    "employee_empid": emp.employee_id,
                    "leave_type": lr.leave_type,
                    "start_date": str(lr.start_date) if lr.start_date else None,
                    "end_date": str(lr.end_date) if lr.end_date else None,
                    "reason": lr.reason,
                    "status": lr.status,
                    "created_at": lr.created_at.isoformat() if lr.created_at else None,
                })
        else:
            pending_leaves_list = []
            for lr, emp_row in (
                self.db.query(LeaveRequest, Employee)
                    .outerjoin(Employee, LeaveRequest.employee_id == Employee.id)
                    .filter(LeaveRequest.status == "pending")
                    .order_by(LeaveRequest.created_at.desc())
                    .limit(10).all()
            ):
                pending_leaves_list.append({
                    "id": lr.id,
                    "employee_id": lr.employee_id,
                    "employee_name": f"{emp_row.first_name} {emp_row.last_name}" if emp_row else (lr.employee_id or ""),
                    "employee_empid": emp_row.employee_id if emp_row else "",
                    "leave_type": lr.leave_type,
                    "start_date": str(lr.start_date) if lr.start_date else None,
                    "end_date": str(lr.end_date) if lr.end_date else None,
                    "reason": lr.reason,
                    "status": lr.status,
                    "created_at": lr.created_at.isoformat() if lr.created_at else None,
                })

        if is_employee and emp:
            pending_expenses_list = []
            for ex in self.db.query(Expense).filter(
                Expense.status == "pending",
                Expense.deleted_at.is_(None),
                Expense.employee_id == emp.id,
            ).order_by(Expense.created_at.desc()).limit(10).all():
                pending_expenses_list.append({
                    "id": ex.id,
                    "employee_id": ex.employee_id,
                    "employee_name": f"{emp.first_name} {emp.last_name}",
                    "employee_empid": emp.employee_id,
                    "category": ex.category,
                    "amount": float(ex.amount or 0),
                    "description": ex.description,
                    "expense_date": str(ex.expense_date) if ex.expense_date else None,
                    "status": ex.status,
                    "created_at": ex.created_at.isoformat() if ex.created_at else None,
                })
        else:
            pending_expenses_list = []
            for ex, emp_row in (
                self.db.query(Expense, Employee)
                    .outerjoin(Employee, Expense.employee_id == Employee.id)
                    .filter(Expense.status == "pending", Expense.deleted_at.is_(None))
                    .order_by(Expense.created_at.desc())
                    .limit(10).all()
            ):
                pending_expenses_list.append({
                    "id": ex.id,
                    "employee_id": ex.employee_id,
                    "employee_name": f"{emp_row.first_name} {emp_row.last_name}" if emp_row else (ex.employee_id or ""),
                    "employee_empid": emp_row.employee_id if emp_row else "",
                    "category": ex.category,
                    "amount": float(ex.amount or 0),
                    "description": ex.description,
                    "expense_date": str(ex.expense_date) if ex.expense_date else None,
                    "status": ex.status,
                    "created_at": ex.created_at.isoformat() if ex.created_at else None,
                })

        if is_employee and emp:
            pending_salaries_list = []
            for s in self.db.query(Salary).filter(
                Salary.status == "pending",
                Salary.employee_id == emp.id,
            ).order_by(Salary.created_at.desc()).limit(10).all():
                pending_salaries_list.append({
                    "id": s.id,
                    "employee_id": s.employee_id,
                    "employee_name": f"{emp.first_name} {emp.last_name}",
                    "employee_empid": emp.employee_id,
                    "month": s.month,
                    "year": s.year,
                    "net_salary": float(s.net_salary or 0),
                    "status": s.status,
                    "created_at": s.created_at.isoformat() if s.created_at else None,
                })
        else:
            pending_salaries_list = []
            for s, emp_row in (
                self.db.query(Salary, Employee)
                    .outerjoin(Employee, Salary.employee_id == Employee.id)
                    .filter(Salary.status == "pending")
                    .order_by(Salary.created_at.desc())
                    .limit(10).all()
            ):
                pending_salaries_list.append({
                    "id": s.id,
                    "employee_id": s.employee_id,
                    "employee_name": f"{emp_row.first_name} {emp_row.last_name}" if emp_row else (s.employee_id or ""),
                    "employee_empid": emp_row.employee_id if emp_row else "",
                    "month": s.month,
                    "year": s.year,
                    "net_salary": float(s.net_salary or 0),
                    "status": s.status,
                    "created_at": s.created_at.isoformat() if s.created_at else None,
                })

        if is_employee and emp:
            pending_tasks_list = []
            rows = self.db.query(Task).filter(
                Task.status == "pending",
                Task.deleted_at.is_(None),
                Task.assigned_to == emp.id,
            ).order_by(Task.created_at.desc()).limit(20).all()
            for t in rows:
                to_name = ""
                from_user = self.db.query(User).filter(User.id == t.assigned_to, User.deleted_at.is_(None)).first()
                if from_user:
                    to_name = from_user.full_name or from_user.username or ""
                pending_tasks_list.append({
                    "id": t.id,
                    "title": t.title,
                    "description": t.description or "",
                    "assigned_to": t.assigned_to,
                    "assigned_to_name": to_name,
                    "assigned_to_employee_id": emp.employee_id,
                    "assigned_by": t.assigned_by,
                    "assigned_by_name": "",
                    "assigned_by_employee_id": "",
                    "due_date": str(t.due_date) if t.due_date else None,
                    "priority": t.priority,
                    "status": t.status,
                    "created_at": t.created_at.isoformat() if t.created_at else None,
                })
        else:
            pending_tasks_list = []
            assigned_by_uids = {}
            assigned_to_uids = {}
            rows = self.db.query(Task).filter(
                Task.status == "pending", Task.deleted_at.is_(None)
            ).order_by(Task.created_at.desc()).limit(20).all()
            uids = set()
            for t in rows:
                if t.assigned_to:
                    uids.add(t.assigned_to)
                if t.assigned_by:
                    uids.add(t.assigned_by)
            if uids:
                for u in self.db.query(User).filter(User.id.in_(uids), User.deleted_at.is_(None)).all():
                    assigned_by_uids[u.id] = u
                    assigned_to_uids[u.id] = u
            emp_by_uid = {}
            for uid in uids:
                e = self.db.query(Employee).filter(Employee.user_id == uid, Employee.deleted_at.is_(None)).first()
                if e:
                    emp_by_uid[uid] = e
            for t in rows:
                to_u = assigned_to_uids.get(t.assigned_to)
                by_u = assigned_by_uids.get(t.assigned_by)
                to_emp = emp_by_uid.get(t.assigned_to)
                by_emp = emp_by_uid.get(t.assigned_by)
                to_name = ""
                if to_u:
                    to_name = getattr(to_u, "full_name", None) or getattr(to_u, "username", "") or ""
                by_name = ""
                if by_u:
                    by_name = getattr(by_u, "full_name", None) or getattr(by_u, "username", "") or ""
                pending_tasks_list.append({
                    "id": t.id,
                    "title": t.title,
                    "description": t.description or "",
                    "assigned_to": t.assigned_to,
                    "assigned_to_name": to_name,
                    "assigned_to_employee_id": to_emp.employee_id if to_emp else "",
                    "assigned_by": t.assigned_by,
                    "assigned_by_name": by_name,
                    "assigned_by_employee_id": by_emp.employee_id if by_emp else "",
                    "due_date": str(t.due_date) if t.due_date else None,
                    "priority": t.priority,
                    "status": t.status,
                    "created_at": t.created_at.isoformat() if t.created_at else None,
                })

        return {
            "total_users": total_users,
            "total_employees": total_employees,
            "active_employees": active_employees,
            "present_today": present_today,
            "attendance_today": present_today,
            "pending_leaves": pending_leaves,
            "pending_tasks": pending_tasks,
            "pending_expenses": pending_expenses,
            "pending_salaries": pending_salaries,
            "active_reminders": active_reminders,
            "monthly_payroll": monthly_payroll,
            "inventory_total_items": inventory_total_items,
            "inventory_assigned": inventory_assigned,
            "inventory_low_stock": inventory_low_stock,
            "inventory_value": inventory_value,
            "department_distribution": [
                {"department": d, "count": c} for d, c in department_distribution
            ],
            "attendance_trend": attendance_trend,
            "recent_activities": activities_data,
            "pending_leaves_list": pending_leaves_list,
            "pending_expenses_list": pending_expenses_list,
            "pending_salaries_list": pending_salaries_list,
            "pending_tasks_list": pending_tasks_list,
        }