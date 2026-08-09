import io
import os
import uuid
from datetime import datetime, timezone, date as date_type

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from PIL import Image as PILImage
from openpyxl import Workbook
from openpyxl.drawing.image import Image as XlImage
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
from openpyxl.utils import get_column_letter

from app.database import get_db
from app.models.requisition import Requisition, RequisitionExpense
from app.utils.dependencies import get_current_user, require_admin

router = APIRouter(prefix="/requisitions", tags=["Requisitions"])

UPLOAD_DIR = "/app/uploads/receipts"
os.makedirs(UPLOAD_DIR, exist_ok=True)

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"}


def _req_to_dict(r: Requisition) -> dict:
    return {
        "id": r.id,
        "title": r.title,
        "status": r.status,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "closed_at": r.closed_at.isoformat() if r.closed_at else None,
        "duration_days": r.duration_days,
    }


def _exp_to_dict(e: RequisitionExpense) -> dict:
    return {
        "id": e.id,
        "requisition_id": e.requisition_id,
        "expense_date": e.expense_date.isoformat() if e.expense_date else None,
        "notes": e.notes,
        "amount": e.amount,
        "receipt_url": e.receipt_url,
        "status": getattr(e, "status", None) or "pending",
        "approved_by": getattr(e, "approved_by", None),
        "rejected_by": getattr(e, "rejected_by", None),
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "updated_at": (getattr(e, "updated_at", None).isoformat() if getattr(e, "updated_at", None) else None),
    }


# ─── CRUD ────────────────────────────────────────────────────────

@router.post("")
def create_requisition(
    title: str = Form(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    req = Requisition(id=str(uuid.uuid4()), title=title, status="open")
    db.add(req)
    db.commit()
    db.refresh(req)
    return {"success": True, "data": _req_to_dict(req), "message": "Requisition created"}


@router.get("")
def list_requisitions(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    rows = db.query(Requisition).order_by(Requisition.created_at.desc()).all()
    return {"success": True, "data": [_req_to_dict(r) for r in rows]}


@router.get("/{req_id}")
def get_requisition(req_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    req = db.query(Requisition).filter(Requisition.id == req_id).first()
    if not req:
        raise HTTPException(404, "Requisition not found")
    data = _req_to_dict(req)
    data["expenses"] = [_exp_to_dict(e) for e in req.expenses]
    return {"success": True, "data": data}


# ─── Edit ────────────────────────────────────────────────────────

@router.put("/{req_id}")
def edit_requisition(
    req_id: str,
    title: str = Form(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    req = db.query(Requisition).filter(Requisition.id == req_id).first()
    if not req:
        raise HTTPException(404, "Requisition not found")
    title = (title or "").strip()
    if not title:
        raise HTTPException(400, "Title is required")
    req.title = title
    db.commit()
    db.refresh(req)
    data = _req_to_dict(req)
    data["expenses"] = [_exp_to_dict(e) for e in req.expenses]
    return {"success": True, "data": data, "message": "Requisition updated"}


# ─── Close ───────────────────────────────────────────────────────

@router.put("/{req_id}/close")
def close_requisition(req_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    req = db.query(Requisition).filter(Requisition.id == req_id).first()
    if not req:
        raise HTTPException(404, "Requisition not found")
    if req.status == "closed":
        raise HTTPException(400, "Requisition is already closed")
    now = datetime.now(timezone.utc)
    req.closed_at = now
    req.status = "closed"
    if req.created_at:
        delta = now - req.created_at
        req.duration_days = max(1, delta.days)
    db.commit()
    db.refresh(req)
    data = _req_to_dict(req)
    data["expenses"] = [_exp_to_dict(e) for e in req.expenses]
    return {"success": True, "data": data, "message": "Requisition closed"}


# ─── Reopen ──────────────────────────────────────────────────────

@router.put("/{req_id}/reopen")
def reopen_requisition(req_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    req = db.query(Requisition).filter(Requisition.id == req_id).first()
    if not req:
        raise HTTPException(404, "Requisition not found")
    if req.status == "open":
        raise HTTPException(400, "Requisition is already open")
    req.status = "open"
    req.closed_at = None
    req.duration_days = None
    db.commit()
    db.refresh(req)
    data = _req_to_dict(req)
    data["expenses"] = [_exp_to_dict(e) for e in req.expenses]
    return {"success": True, "data": data, "message": "Requisition reopened"}


# ─── Expenses (multipart) ────────────────────────────────────────

@router.post("/{req_id}/expenses")
async def add_expense(
    req_id: str,
    note: str = Form(None),
    amount: float = Form(...),
    expense_date: date_type = Form(None),
    receipt: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    req = db.query(Requisition).filter(Requisition.id == req_id).first()
    if not req:
        raise HTTPException(404, "Requisition not found")
    if req.status == "closed":
        raise HTTPException(400, "Cannot add expenses to a closed requisition")

    receipt_url = None
    if receipt:
        ext = os.path.splitext(receipt.filename or "file")[1] or ".bin"
        filename = f"{uuid.uuid4()}{ext}"
        filepath = os.path.join(UPLOAD_DIR, filename)
        content = await receipt.read()
        with open(filepath, "wb") as f:
            f.write(content)
        receipt_url = f"/uploads/receipts/{filename}"

    exp = RequisitionExpense(
        id=str(uuid.uuid4()),
        requisition_id=req_id,
        expense_date=expense_date or date_type.today(),
        notes=note,
        amount=amount,
        receipt_url=receipt_url,
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return {"success": True, "data": _exp_to_dict(exp), "message": "Expense added"}


# ─── Expense Approval (admin only) ───────────────────────────────

@router.post("/{req_id}/expenses/{exp_id}/approve")
def approve_expense(
    req_id: str,
    exp_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    exp = (
        db.query(RequisitionExpense)
        .filter(RequisitionExpense.id == exp_id, RequisitionExpense.requisition_id == req_id)
        .first()
    )
    if not exp:
        raise HTTPException(404, "Expense not found")
    exp.status = "approved"
    exp.approved_by = str(current_user.id)
    exp.rejected_by = None
    db.commit()
    db.refresh(exp)
    return {"success": True, "data": _exp_to_dict(exp), "message": "Expense approved"}


@router.post("/{req_id}/expenses/{exp_id}/reject")
def reject_expense(
    req_id: str,
    exp_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    exp = (
        db.query(RequisitionExpense)
        .filter(RequisitionExpense.id == exp_id, RequisitionExpense.requisition_id == req_id)
        .first()
    )
    if not exp:
        raise HTTPException(404, "Expense not found")
    exp.status = "rejected"
    exp.rejected_by = str(current_user.id)
    exp.approved_by = None
    db.commit()
    db.refresh(exp)
    return {"success": True, "data": _exp_to_dict(exp), "message": "Expense rejected"}


# ─── Serve Receipt Files ─────────────────────────────────────────

@router.get("/receipts/{filename}")
def serve_receipt(filename: str, current_user=Depends(get_current_user)):
    filepath = os.path.join(UPLOAD_DIR, filename)
    if not os.path.isfile(filepath):
        raise HTTPException(404, "Receipt not found")
    return FileResponse(filepath)


# ─── Download Reports (Excel with Receipts) ──────────────────────

def _add_image_to_sheet(ws, row, col, filepath, max_w_px=200, max_h_px=130):
    """Embed a receipt image into the worksheet, scaling to fit and adjusting row/col size."""
    try:
        pil_img = PILImage.open(filepath)
        orig_w, orig_h = pil_img.size

        # Scale down if larger than max, preserving aspect ratio
        ratio = min(max_w_px / orig_w, max_h_px / orig_h, 1.0)
        target_w = int(orig_w * ratio)
        target_h = int(orig_h * ratio)

        # Fallback to small defaults if image is tiny
        if target_w < 10:
            target_w = 80
        if target_h < 10:
            target_h = 60

        img = XlImage(filepath)
        img.width = target_w
        img.height = target_h

        # Adjust row height (Excel row height is in points; 1 point ≈ 1.33 px)
        ws.row_dimensions[row].height = max(ws.row_dimensions[row].height or 15, target_h * 0.75 + 6)

        # Adjust column width (Excel col width is in char units; ~7 px per unit)
        col_letter = get_column_letter(col)
        needed_char_w = target_w / 7
        ws.column_dimensions[col_letter].width = max(ws.column_dimensions[col_letter].width or 8, needed_char_w)

        cell_ref = f"{col_letter}{row}"
        ws.add_image(img, cell_ref)
    except Exception:
        ws.cell(row=row, column=col, value="(image error)")


def _build_excel(requisitions: list, db: Session) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Requisitions"

    # Styles
    hdr_font = Font(bold=True, color="FFFFFF", size=11)
    hdr_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    hdr_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin_border = Border(
        left=Side(style="thin"),
        right=Side(style="thin"),
        top=Side(style="thin"),
        bottom=Side(style="thin"),
    )
    money_fmt = '#,##0.00'

    # Headers
    headers = [
        "Requisition Title", "Status", "Created At", "Closed At",
        "Duration (days)", "Expense Date", "Note", "Amount (৳)", "Receipt",
        "Approval Status",
    ]
    for c, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=c, value=h)
        cell.font = hdr_font
        cell.fill = hdr_fill
        cell.alignment = hdr_align
        cell.border = thin_border

    # Column widths
    widths = [28, 10, 20, 20, 12, 14, 30, 14, 22, 14]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    row = 2
    for req in requisitions:
        exps = (
            db.query(RequisitionExpense)
            .filter(RequisitionExpense.requisition_id == req.id)
            .order_by(RequisitionExpense.created_at)
            .all()
        )
        if not exps:
            for c, val in enumerate([
                req.title, req.status,
                req.created_at.strftime("%Y-%m-%d %H:%M") if req.created_at else "",
                req.closed_at.strftime("%Y-%m-%d %H:%M") if req.closed_at else "",
                req.duration_days or "", "", "", "", "", "",
            ], 1):
                cell = ws.cell(row=row, column=c, value=val)
                cell.border = thin_border
            row += 1
        else:
            for idx, e in enumerate(exps):
                vals = [
                    req.title if idx == 0 else "",
                    req.status if idx == 0 else "",
                    req.created_at.strftime("%Y-%m-%d %H:%M") if idx == 0 and req.created_at else "",
                    req.closed_at.strftime("%Y-%m-%d %H:%M") if idx == 0 and req.closed_at else "",
                    req.duration_days if idx == 0 else "",
                    e.expense_date.isoformat() if e.expense_date else "",
                    e.notes or "",
                    e.amount,
                    "",
                    (getattr(e, "status", None) or "pending"),
                ]
                for c, val in enumerate(vals, 1):
                    cell = ws.cell(row=row, column=c, value=val)
                    cell.border = thin_border
                    if c == 8 and isinstance(val, (int, float)):
                        cell.number_format = money_fmt

                # Embed receipt image if available
                if e.receipt_url:
                    fname = os.path.basename(e.receipt_url)
                    fpath = os.path.join(UPLOAD_DIR, fname)
                    if os.path.isfile(fpath) and os.path.splitext(fpath)[1].lower() in IMAGE_EXTS:
                        _add_image_to_sheet(ws, row, 9, fpath)
                    else:
                        ws.cell(row=row, column=9, value="(non-image receipt)")

                row += 1

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@router.get("/{req_id}/download")
def download_single(req_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    req = db.query(Requisition).filter(Requisition.id == req_id).first()
    if not req:
        raise HTTPException(404, "Requisition not found")
    xls_bytes = _build_excel([req], db)
    safe_title = req.title.replace(" ", "_").replace("/", "-")[:50]
    return StreamingResponse(
        io.BytesIO(xls_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={safe_title}_{date_type.today().isoformat()}.xlsx"},
    )


class BulkDownloadRequest(BaseModel):
    ids: list[str]


@router.post("/download-bulk")
def download_bulk(
    payload: BulkDownloadRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    reqs = db.query(Requisition).filter(Requisition.id.in_(payload.ids)).all()
    if not reqs:
        raise HTTPException(404, "No requisitions found")
    xls_bytes = _build_excel(reqs, db)
    return StreamingResponse(
        io.BytesIO(xls_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=bulk_requisitions_{date_type.today().isoformat()}.xlsx"},
    )


@router.delete("/{req_id}")
def delete_requisition(
    req_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    req = db.query(Requisition).filter(Requisition.id == req_id).first()
    if not req:
        raise HTTPException(404, "Requisition not found")
    db.delete(req)
    db.commit()
    return {"success": True, "message": "Requisition deleted"}
