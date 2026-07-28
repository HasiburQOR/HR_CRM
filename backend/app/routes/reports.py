from typing import Any
from datetime import date, datetime
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import extract
import io
import openpyxl

from app.database import get_db
from app.models.employee import Employee
from app.models.attendance import Attendance
from app.models.salary import Salary
from app.models.expense import Expense
from app.models.leave import LeaveRequest
from app.models.inventory import InventoryItem
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/reports", tags=["reports"])

MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def _to_excel_multi(sheets: list[tuple[str, list[dict]]]) -> io.BytesIO:
    wb = openpyxl.Workbook()
    first = True
    for sheet_name, rows in sheets:
        ws = wb.active if first else wb.create_sheet(sheet_name)
        if first:
            ws.title = sheet_name
            first = False
        if rows and len(rows) > 0:
            headers = list(rows[0].keys())
            ws.append(headers)
            for row in rows:
                ws.append([row.get(h) for h in headers])
        else:
            ws.append(["No records found"])
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output


def _to_excel(rows: list[dict], sheet_name: str) -> io.BytesIO:
    return _to_excel_multi([(sheet_name, rows)])


def _apply_period_filters(q, col_date, *, period, period_value, year, month, day, start_date, end_date, specific_date):
    """Apply date filters based on period selection or explicit date ranges."""
    if specific_date:
        q = q.filter(col_date == str(specific_date))
        return q
    if start_date and end_date:
        q = q.filter(col_date >= str(start_date), col_date <= str(end_date))
        return q
    if period == "day" and period_value:
        q = q.filter(col_date == str(period_value))
    elif period == "month":
        if period_value and period_value.lower() in MONTH_MAP:
            m_num = MONTH_MAP[period_value.lower()]
            q = q.filter(extract("month", col_date) == m_num)
        if year:
            q = q.filter(extract("year", col_date) == year)
    elif period == "year":
        y = period_value or year
        if y:
            try:
                q = q.filter(extract("year", col_date) == int(y))
            except Exception:
                pass
    else:
        if month and month.lower() in MONTH_MAP:
            m_num = MONTH_MAP[month.lower()]
            q = q.filter(extract("month", col_date) == m_num)
        if year:
            q = q.filter(extract("year", col_date) == year)
        if day:
            pass
    return q


@router.get("/employees")
def report_employees(
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
    employee_id: str | None = Query(None),
):
    q = db.query(Employee).filter(Employee.deleted_at.is_(None))
    if employee_id and employee_id != "all":
        q = q.filter(Employee.id == employee_id)
    data = [
        {
            "Employee ID": e.employee_id,
            "First Name": e.first_name,
            "Last Name": e.last_name,
            "Full Name": f"{e.first_name} {e.last_name}",
            "Email": e.email,
            "Phone": e.phone or "",
            "National ID (NID)": getattr(e, "nid", "") or "",
            "Date of Birth": str(getattr(e, "date_of_birth", "")) if getattr(e, "date_of_birth", None) else "",
            "Designation": e.designation or "",
            "Department": e.department or "",
            "Date of Joining": str(e.date_of_joining) if e.date_of_joining else "",
            "Address": getattr(e, "address", "") or "",
            "Basic Salary (BDT)": e.salary or 0,
            "Status": e.status,
        }
        for e in q.all()
    ]
    output = _to_excel(data, "Employees")
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=employees_report.xlsx"}
    )


@router.get("/attendance")
def report_attendance(
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
    month: str | None = Query(None),
    year: int | None = Query(None),
    date: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    employee_id: str | None = Query(None),
    period: str | None = Query(None),
    period_value: str | None = Query(None),
):
    q = db.query(Attendance, Employee).outerjoin(Employee, Attendance.employee_id == Employee.id)

    if date:
        q = q.filter(Attendance.date == date)
    elif start_date and end_date:
        q = q.filter(Attendance.date >= start_date, Attendance.date <= end_date)
    elif period:
        # Use month value if period=month uses period_value (full month name or short), year via period_value_2
        q = _apply_period_filters(q, Attendance.date,
                                  period=period,
                                  period_value=period_value,
                                  year=year,
                                  month=month,
                                  day=None,
                                  start_date=start_date,
                                  end_date=end_date,
                                  specific_date=date)
    elif month and month.lower() in MONTH_MAP:
        m_num = MONTH_MAP[month.lower()]
        q = q.filter(extract('month', Attendance.date) == m_num)
        if year:
            q = q.filter(extract('year', Attendance.date) == year)
    if employee_id and employee_id != "all":
        q = q.filter(Attendance.employee_id == employee_id)

    records = q.order_by(Attendance.date.desc()).all()
    data = [
        {
            "Employee ID": e.employee_id if e else "",
            "Employee": f"{e.first_name} {e.last_name}" if e else a.employee_id,
            "Date": str(a.date),
            "Clock In": str(a.clock_in) if a.clock_in else "-",
            "Clock Out": str(a.clock_out) if a.clock_out else "-",
            "Status": a.status,
            "Notes": a.notes or "",
        }
        for a, e in records
    ]
    output = _to_excel(data, "Attendance")
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=attendance_report.xlsx"}
    )


@router.get("/salary")
def report_salary(
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
    month: str | None = Query(None),
    year: int | None = Query(None),
    date: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    employee_id: str | None = Query(None),
    period: str | None = Query(None),
    period_value: str | None = Query(None),
):
    q = db.query(Salary, Employee).outerjoin(Employee, Salary.employee_id == Employee.id)

    if period == "month":
        if period_value and period_value.lower() in MONTH_MAP:
            m_num = MONTH_MAP[period_value.lower()]
            q = q.filter(Salary.month == datetime(2000, m_num, 1).strftime("%b").lower())
        if year:
            q = q.filter(Salary.year == year)
    elif period == "year":
        y = period_value or year
        if y:
            try:
                q = q.filter(Salary.year == int(y))
            except Exception:
                pass
    else:
        if month and month != "all":
            q = q.filter(Salary.month == month.lower())
        if year:
            q = q.filter(Salary.year == year)
        if date:
            q = q.filter(Salary.payment_date == str(date))
        elif start_date and end_date:
            q = q.filter(Salary.payment_date >= str(start_date), Salary.payment_date <= str(end_date))
    if employee_id and employee_id != "all":
        q = q.filter(Salary.employee_id == employee_id)

    records = q.order_by(Salary.year.desc(), Salary.id.desc()).all()
    data = [
        {
            "Employee ID": e.employee_id if e else "",
            "Employee": f"{e.first_name} {e.last_name}" if e else s.employee_id,
            "Month": s.month,
            "Year": s.year,
            "Basic Salary (BDT)": s.basic_salary,
            "Allowances (BDT)": s.allowances,
            "Deductions (BDT)": s.deductions,
            "Net Salary (BDT)": s.net_salary,
            "Payment Date": s.payment_date or "",
            "Status": s.status,
        }
        for s, e in records
    ]
    output = _to_excel(data, "Salary")
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=salary_report.xlsx"}
    )


@router.get("/expenses")
def report_expenses(
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
    date: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    employee_id: str | None = Query(None),
    period: str | None = Query(None),
    period_value: str | None = Query(None),
    year: int | None = Query(None),
    month: str | None = Query(None),
):
    q = db.query(Expense, Employee).outerjoin(Employee, Expense.employee_id == Employee.id).filter(Expense.deleted_at.is_(None))
    q = _apply_period_filters(q, Expense.expense_date,
                              period=period,
                              period_value=period_value,
                              year=year,
                              month=month,
                              day=None,
                              start_date=start_date,
                              end_date=end_date,
                              specific_date=date)
    if employee_id and employee_id != "all":
        q = q.filter(Expense.employee_id == employee_id)

    records = q.order_by(Expense.expense_date.desc()).all()
    data = [
        {
            "Employee ID": e.employee_id if e else "",
            "Employee": f"{e.first_name} {e.last_name}" if e else ex.employee_id,
            "Category": ex.category,
            "Amount (BDT)": ex.amount,
            "Description": ex.description or "",
            "Expense Date": str(ex.expense_date),
            "Status": ex.status,
        }
        for ex, e in records
    ]
    output = _to_excel(data, "Expenses")
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=expenses_report.xlsx"}
    )


@router.get("/inventory")
def report_inventory(
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
    category: str | None = Query(None),
    item_type: str | None = Query(None),
    status: str | None = Query(None),
    employee_id: str | None = Query(None),
    assigned: bool | None = Query(None),
    low_stock: bool = Query(False),
):
    q = (
        db.query(InventoryItem, Employee)
          .outerjoin(Employee, InventoryItem.employee_id == Employee.id)
          .filter(InventoryItem.deleted_at.is_(None))
    )
    if category and category != "all":
        q = q.filter(InventoryItem.category == category)
    if item_type and item_type != "all":
        q = q.filter(InventoryItem.item_type == item_type)
    if status and status != "all":
        q = q.filter(InventoryItem.status == status)
    if employee_id and employee_id != "all":
        q = q.filter(InventoryItem.employee_id == employee_id)
    if assigned is True:
        q = q.filter(InventoryItem.employee_id.isnot(None))
    elif assigned is False:
        q = q.filter(InventoryItem.employee_id.is_(None))
    if low_stock:
        q = q.filter(InventoryItem.quantity <= InventoryItem.minimum_stock)
    records = q.order_by(InventoryItem.updated_at.desc()).all()
    data = [
        {
            "Item Code": it.item_code,
            "Name": it.name,
            "Category": it.category or "",
            "Sub-category": getattr(it, "sub_category", "") or "",
            "Type": it.item_type or "",
            "Condition": getattr(it, "condition", "") or "",
            "Location": getattr(it, "location", "") or "",
            "Qty": int(it.quantity or 0),
            "UoM": getattr(it, "unit_of_measure", "unit"),
            "Min Stock": int(getattr(it, "minimum_stock", 0) or 0),
            "Low Stock": "Yes" if (it.quantity or 0) <= int(getattr(it, "minimum_stock", 0) or 0) else "No",
            "Unit Cost": float(getattr(it, "unit_cost", 0) or 0),
            "Total Value": float((it.quantity or 0) * (getattr(it, "unit_cost", 0) or 0)),
            "Serial #": getattr(it, "serial_number", "") or "",
            "Model #": getattr(it, "model_number", "") or "",
            "Manufacturer": getattr(it, "manufacturer", "") or "",
            "Purchase Date": str(it.purchase_date) if getattr(it, "purchase_date", None) else "",
            "Warranty Until": str(it.warranty_end_date) if getattr(it, "warranty_end_date", None) else "",
            "Employee ID": e.employee_id if e else "",
            "Employee": f"{e.first_name} {e.last_name}" if e else "",
            "Department": e.department if e else "",
            "Assigned On": str(it.assigned_at) if getattr(it, "assigned_at", None) else "",
            "Assignment Notes": getattr(it, "assignment_notes", "") or "",
            "Status": it.status or "",
            "Description": it.description or "",
        }
        for it, e in records
    ]
    output = _to_excel(data, "Inventory")
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=inventory_report.xlsx"}
    )


@router.get("/employee/{employee_id}")
def report_employee_individual(
    employee_id: str,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    emp = db.query(Employee).filter(
        (Employee.id == employee_id) | (Employee.employee_id == employee_id),
        Employee.deleted_at.is_(None),
    ).first()
    if not emp:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Employee not found")

    profile_row = [{
        "Employee ID": emp.employee_id,
        "First Name": emp.first_name,
        "Last Name": emp.last_name,
        "Full Name": f"{emp.first_name} {emp.last_name}",
        "Email": emp.email,
        "Phone": emp.phone or "",
        "National ID (NID)": getattr(emp, "nid", "") or "",
        "Date of Birth": str(getattr(emp, "date_of_birth", "")) if getattr(emp, "date_of_birth", None) else "",
        "Designation": emp.designation or "",
        "Department": emp.department or "",
        "Date of Joining": str(emp.date_of_joining) if emp.date_of_joining else "",
        "Address": getattr(emp, "address", "") or "",
        "Basic Salary (BDT)": emp.salary or 0,
        "Status": emp.status,
    }]

    attendance_rows = []
    for a in db.query(Attendance).filter(Attendance.employee_id == emp.id).order_by(Attendance.date.desc()).limit(500).all():
        attendance_rows.append({
            "Date": str(a.date),
            "Clock In": str(a.clock_in) if a.clock_in else "-",
            "Clock Out": str(a.clock_out) if a.clock_out else "-",
            "Status": a.status,
            "Notes": a.notes or "",
        })

    salary_rows = []
    for s, in db.query(Salary).filter(Salary.employee_id == emp.id).order_by(Salary.year.desc(), Salary.id.desc()).limit(200).all():
        salary_rows.append({
            "Month": s.month,
            "Year": s.year,
            "Basic (BDT)": s.basic_salary,
            "Allowances (BDT)": s.allowances,
            "Deductions (BDT)": s.deductions,
            "Net Salary (BDT)": s.net_salary,
            "Payment Date": s.payment_date or "",
            "Status": s.status,
        })

    leave_rows = []
    for lr in db.query(LeaveRequest).filter(LeaveRequest.employee_id == emp.id).order_by(LeaveRequest.created_at.desc()).limit(200).all():
        leave_rows.append({
            "Type": lr.leave_type,
            "Start Date": str(lr.start_date) if lr.start_date else "",
            "End Date": str(lr.end_date) if lr.end_date else "",
            "Reason": lr.reason or "",
            "Status": lr.status,
            "Approved By": lr.approved_by or "",
            "Rejection Reason": getattr(lr, "rejection_reason", "") or "",
        })

    expense_rows = []
    for ex in db.query(Expense).filter(Expense.employee_id == emp.id, Expense.deleted_at.is_(None)).order_by(Expense.expense_date.desc()).limit(200).all():
        expense_rows.append({
            "Category": ex.category,
            "Amount (BDT)": ex.amount,
            "Description": ex.description or "",
            "Expense Date": str(ex.expense_date) if ex.expense_date else "",
            "Status": ex.status,
        })

    inventory_rows = []
    for it in db.query(InventoryItem).filter(InventoryItem.employee_id == emp.id, InventoryItem.deleted_at.is_(None)).order_by(InventoryItem.updated_at.desc()).limit(200).all():
        inventory_rows.append({
            "Item Code": it.item_code,
            "Name": it.name,
            "Category": it.category or "",
            "Type": it.item_type or "",
            "Serial #": getattr(it, "serial_number", "") or "",
            "Qty": int(it.quantity or 0),
            "Condition": getattr(it, "condition", "") or "",
            "Assigned On": str(it.assigned_at) if getattr(it, "assigned_at", None) else "",
            "Assignment Notes": getattr(it, "assignment_notes", "") or "",
            "Status": it.status or "",
        })

    output = _to_excel_multi([
        ("Profile", profile_row),
        ("Attendance", attendance_rows),
        ("Salary", salary_rows),
        ("Leave", leave_rows),
        ("Expenses", expense_rows),
        ("Inventory", inventory_rows),
    ])
    filename = f"employee-{emp.employee_id}-report.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
