import mimetypes
import os
import uuid
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.leave import LeaveRequestService
from app.schemas.leave import LeaveRequestCreate, LeaveRequestUpdate
from app.utils.dependencies import get_current_user, get_user_role_name
from app.utils.response import success_response, paginated_response
from app.models.leave import LeaveRequest, LeaveAttachment
from app.models.employee import Employee

router = APIRouter(prefix="/leaves", tags=["leaves"])

# Leave documents are often medical records, so they live outside /app/uploads
# (which is served publicly) and are only readable through the endpoints below.
LEAVE_DOCS_DIR = os.getenv("LEAVE_DOCS_DIR", "/app/private_uploads/leave_documents")
ALLOWED_ATTACHMENT_EXTS = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx"}
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
MAX_ATTACHMENTS_PER_LEAVE = 5


def _attachment_to_dict(att: LeaveAttachment) -> dict:
    return {
        "id": att.id,
        "original_name": att.original_name,
        "size": att.size or 0,
        "content_type": mimetypes.guess_type(att.stored_name)[0] or "application/octet-stream",
        "created_at": att.created_at.isoformat() if att.created_at else None,
    }


def _remove_attachment_file(att: LeaveAttachment) -> None:
    try:
        os.remove(os.path.join(LEAVE_DOCS_DIR, att.stored_name))
    except OSError:
        pass


def _enrich_leave(leave, db):
    emp = db.query(Employee).filter(Employee.id == leave.employee_id).first()
    attachments = (
        db.query(LeaveAttachment)
        .filter(LeaveAttachment.leave_request_id == leave.id)
        .order_by(LeaveAttachment.created_at)
        .all()
    )
    return {
        "attachments": [_attachment_to_dict(a) for a in attachments],
        "id": leave.id,
        "employee_id": leave.employee_id,
        "employee_name": f"{emp.first_name} {emp.last_name}" if emp else "Unknown",
        "leave_type": leave.leave_type,
        "start_date": str(leave.start_date) if leave.start_date else "",
        "end_date": str(leave.end_date) if leave.end_date else "",
        "reason": leave.reason or "",
        "status": leave.status,
        "approved_by": leave.approved_by,
        "created_at": leave.created_at.isoformat() if leave.created_at else None,
        "updated_at": leave.updated_at.isoformat() if leave.updated_at else None,
    }


def _is_employee_role(db: Session, current_user: Any) -> bool:
    return get_user_role_name(current_user, db) == "employee"


def _get_current_employee(db: Session, current_user: Any) -> Employee | None:
    return db.query(Employee).filter(Employee.user_id == current_user.id, Employee.deleted_at.is_(None)).first()


@router.get("")
def list_leaves(skip: int = 0, limit: int = 100, status: str | None = None, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    query = db.query(LeaveRequest)

    if _is_employee_role(db, current_user):
        emp = _get_current_employee(db, current_user)
        if emp:
            query = query.filter(LeaveRequest.employee_id == emp.id)

    if status and status != "all":
        query = query.filter(LeaveRequest.status == status)
    total = query.count()
    leaves = query.offset(skip).limit(limit).all()
    data = [_enrich_leave(lv, db) for lv in leaves]
    page = skip // limit + 1 if limit else 1
    return paginated_response(data=data, total=total, page=page, per_page=limit)


@router.get("/pending")
def list_pending_leaves(db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        emp = _get_current_employee(db, current_user)
        if emp:
            leaves = db.query(LeaveRequest).filter(LeaveRequest.employee_id == emp.id, LeaveRequest.status == "pending").all()
        else:
            leaves = []
    else:
        leaves = db.query(LeaveRequest).filter(LeaveRequest.status == "pending").all()
    data = [_enrich_leave(lv, db) for lv in leaves]
    return success_response(data=data)


@router.get("/{leave_id}")
def get_leave(leave_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    service = LeaveRequestService(db)
    leave = service.get_by_id(leave_id)
    if _is_employee_role(db, current_user):
        emp = _get_current_employee(db, current_user)
        if emp and leave.employee_id != emp.id:
            raise HTTPException(status_code=403, detail="Access denied")
    return success_response(data=_enrich_leave(leave, db))


@router.post("")
def create_leave(data: LeaveRequestCreate, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        emp = _get_current_employee(db, current_user)
        if emp:
            data_dict = data.model_dump()
            data_dict["employee_id"] = emp.id
        else:
            raise HTTPException(status_code=403, detail="No employee record linked")
    else:
        data_dict = data.model_dump()
        if not data_dict.get("employee_id"):
            raise HTTPException(status_code=400, detail="employee_id is required for admin leave requests")
    service = LeaveRequestService(db)
    leave = service.create(data_dict)
    return success_response(data=_enrich_leave(leave, db))


@router.put("/{leave_id}")
def update_leave(leave_id: str, data: LeaveRequestUpdate, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    service = LeaveRequestService(db)
    leave = service.get_by_id(leave_id)
    if _is_employee_role(db, current_user) and leave.employee_id != (_get_current_employee(db, current_user).id if _get_current_employee(db, current_user) else None):
        raise HTTPException(status_code=403, detail="Access denied")
    updated = service.update(leave_id, data.model_dump(exclude_unset=True))
    return success_response(data=_enrich_leave(updated, db))


@router.post("/{leave_id}/approve")
def approve_leave(leave_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        raise HTTPException(status_code=403, detail="Employees cannot approve leave requests")
    leave = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).first()
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")
    # Prevent self-approval: check if the approver is the same employee who requested the leave
    approver_emp = _get_current_employee(db, current_user)
    if approver_emp and leave.employee_id == approver_emp.id:
        raise HTTPException(status_code=403, detail="You cannot approve your own leave request")
    leave.status = "approved"
    leave.approved_by = str(current_user.id)
    db.commit()
    db.refresh(leave)
    return success_response(data=_enrich_leave(leave, db))


@router.post("/{leave_id}/reject")
def reject_leave(leave_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if _is_employee_role(db, current_user):
        raise HTTPException(status_code=403, detail="Employees cannot reject leave requests")
    leave = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).first()
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")
    # Prevent self-rejection: check if the rejecter is the same employee who requested the leave
    rejecter_emp = _get_current_employee(db, current_user)
    if rejecter_emp and leave.employee_id == rejecter_emp.id:
        raise HTTPException(status_code=403, detail="You cannot reject your own leave request")
    leave.status = "rejected"
    leave.approved_by = str(current_user.id)
    db.commit()
    db.refresh(leave)
    return success_response(data=_enrich_leave(leave, db))


@router.delete("/{leave_id}")
def delete_leave(leave_id: str, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    leave = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).first()
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if _is_employee_role(db, current_user):
        emp = _get_current_employee(db, current_user)
        if not emp or leave.employee_id != emp.id:
            raise HTTPException(status_code=403, detail="Access denied")
        if leave.status != "pending":
            raise HTTPException(status_code=400, detail="Can only delete pending leave requests")
    attachments = db.query(LeaveAttachment).filter(LeaveAttachment.leave_request_id == leave_id).all()
    for att in attachments:
        db.delete(att)
    db.flush()
    service = LeaveRequestService(db)
    service.delete(leave_id)
    for att in attachments:
        _remove_attachment_file(att)
    return success_response(data=None)


# ─── Supporting documents ────────────────────────────────────────

def _get_leave_for_user(leave_id: str, db: Session, current_user: Any) -> LeaveRequest:
    """Load a leave request, letting employees reach only their own."""
    leave = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).first()
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if _is_employee_role(db, current_user):
        emp = _get_current_employee(db, current_user)
        if not emp or leave.employee_id != emp.id:
            raise HTTPException(status_code=403, detail="Access denied")
    return leave


def _get_attachment(leave_id: str, attachment_id: str, db: Session) -> LeaveAttachment:
    att = (
        db.query(LeaveAttachment)
        .filter(LeaveAttachment.id == attachment_id, LeaveAttachment.leave_request_id == leave_id)
        .first()
    )
    if not att:
        raise HTTPException(status_code=404, detail="Document not found")
    return att


@router.post("/{leave_id}/attachments")
async def upload_leave_attachment(
    leave_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    leave = _get_leave_for_user(leave_id, db, current_user)

    original_name = os.path.basename((file.filename or "").replace("\\", "/")) or "document"
    ext = os.path.splitext(original_name)[1].lower()
    if ext not in ALLOWED_ATTACHMENT_EXTS:
        raise HTTPException(status_code=400, detail="Only PDF, image (JPG, PNG, WEBP) and Word files are allowed")

    existing = db.query(LeaveAttachment).filter(LeaveAttachment.leave_request_id == leave.id).count()
    if existing >= MAX_ATTACHMENTS_PER_LEAVE:
        raise HTTPException(status_code=400, detail=f"A leave request can have at most {MAX_ATTACHMENTS_PER_LEAVE} documents")

    content = await file.read(MAX_ATTACHMENT_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if len(content) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=413, detail="Each document must be 10 MB or smaller")

    stored_name = f"{uuid.uuid4()}{ext}"
    os.makedirs(LEAVE_DOCS_DIR, exist_ok=True)
    with open(os.path.join(LEAVE_DOCS_DIR, stored_name), "wb") as f:
        f.write(content)

    att = LeaveAttachment(
        leave_request_id=leave.id,
        original_name=original_name[:255],
        stored_name=stored_name,
        size=len(content),
        uploaded_by=str(current_user.id),
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    return success_response(data=_attachment_to_dict(att))


@router.get("/{leave_id}/attachments/{attachment_id}")
def download_leave_attachment(
    leave_id: str,
    attachment_id: str,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    _get_leave_for_user(leave_id, db, current_user)
    att = _get_attachment(leave_id, attachment_id, db)
    filepath = os.path.join(LEAVE_DOCS_DIR, att.stored_name)
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Document file is missing")
    return FileResponse(
        filepath,
        media_type=mimetypes.guess_type(att.stored_name)[0] or "application/octet-stream",
        filename=att.original_name,
        headers={"X-Content-Type-Options": "nosniff"},
    )


@router.delete("/{leave_id}/attachments/{attachment_id}")
def delete_leave_attachment(
    leave_id: str,
    attachment_id: str,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    leave = _get_leave_for_user(leave_id, db, current_user)
    if _is_employee_role(db, current_user) and leave.status != "pending":
        raise HTTPException(status_code=400, detail="Documents can only be removed while the request is pending")
    att = _get_attachment(leave_id, attachment_id, db)
    db.delete(att)
    db.commit()
    _remove_attachment_file(att)
    return success_response(data=None)