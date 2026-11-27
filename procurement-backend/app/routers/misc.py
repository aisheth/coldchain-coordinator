import uuid
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..deps import current_user, require_roles
from ..errors import BadRequest, Forbidden, NotFound
from ..models import Assignment, Attachment, Issue, Notification, Organization, Project, ProcurementRequest, User, utcnow
from ..schemas import AttachmentOut, NotificationOut, OrgSettingsOut, OrgSettingsPatch, Page
from ..utils import paginate

router = APIRouter(tags=["attachments, notifications, dashboard"])

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"}


# ------------------------------------------------------------------ attachments
# Prototype: files go to local disk. Swap the two storage calls for presigned S3/MinIO uploads later;
# the API contract (upload -> id -> attach_ids on status/issue/delivery) stays the same.
@router.post("/attachments", response_model=AttachmentOut, status_code=201)
async def upload(file: UploadFile = File(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    if file.content_type not in ALLOWED_MIME:
        raise BadRequest("Only JPEG, PNG, WebP, HEIC images and PDFs are allowed", "unsupported_file_type")
    data = await file.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise BadRequest(f"File is larger than {settings.max_upload_mb} MB", "file_too_large")
    att_id = uuid.uuid4()
    key = f"{user.org_id}/{att_id}"
    path = Path(settings.upload_dir) / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    att = Attachment(id=att_id, org_id=user.org_id, storage_key=key, filename=(file.filename or "file")[:255],
                     mime=file.content_type, size=len(data), uploaded_by=user.id)
    db.add(att)
    db.commit()
    return att


@router.get("/attachments/{attachment_id}/download")
def download(attachment_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    att = db.get(Attachment, attachment_id)
    if att is None or att.org_id != user.org_id:
        raise NotFound("Attachment not found")
    if user.role == "admin":
        raise Forbidden("You do not have permission for this action")
    if user.role == "worker" and att.uploaded_by != user.id:
        raise NotFound("Attachment not found")
    return FileResponse(Path(settings.upload_dir) / att.storage_key, media_type=att.mime, filename=att.filename)


# ------------------------------------------------------------------ notifications
@router.get("/notifications", response_model=Page[NotificationOut])
def list_notifications(unread: bool = False, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                       user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc())
    if unread:
        stmt = stmt.where(Notification.read_at.is_(None))
    rows, total = paginate(db, stmt, limit, offset)
    return Page(items=rows, total=total, limit=limit, offset=offset)


@router.get("/notifications/unread-count")
def unread_count(user: User = Depends(current_user), db: Session = Depends(get_db)):
    count = db.scalar(select(func.count()).select_from(Notification)
                      .where(Notification.user_id == user.id, Notification.read_at.is_(None)))
    return {"unread": count}


@router.post("/notifications/{notification_id}/read", status_code=204)
def mark_read(notification_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise NotFound("Notification not found")
    n.read_at = n.read_at or utcnow()
    db.commit()


@router.post("/notifications/read-all", status_code=204)
def mark_all_read(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
               .values(read_at=utcnow()))
    db.commit()


# ------------------------------------------------------------------ dashboard
@router.get("/dashboard/summary")
def dashboard(user: User = Depends(require_roles("owner")), db: Session = Depends(get_db)):
    org = user.org_id
    by_status = dict(db.execute(select(Assignment.status, func.count()).where(Assignment.org_id == org)
                                .group_by(Assignment.status)).all())
    requests_by_status = dict(db.execute(select(ProcurementRequest.status, func.count())
                                         .where(ProcurementRequest.org_id == org)
                                         .group_by(ProcurementRequest.status)).all())
    open_issues = db.scalar(select(func.count()).select_from(Issue).join(Assignment, Assignment.id == Issue.assignment_id)
                            .where(Assignment.org_id == org, Issue.status == "open"))
    on_hold = db.scalar(select(func.count(func.distinct(Issue.assignment_id))).select_from(Issue)
                        .join(Assignment, Assignment.id == Issue.assignment_id)
                        .where(Assignment.org_id == org, Issue.status == "open", Issue.blocks_progress.is_(True),
                               Assignment.status.notin_(("completed", "cancelled"))))
    overdue = db.scalar(select(func.count()).select_from(Assignment).where(
        Assignment.org_id == org, Assignment.due_date < date.today(),
        Assignment.status.notin_(("delivered", "completed", "cancelled"))))
    active_projects = db.scalar(select(func.count()).select_from(Project)
                                .where(Project.org_id == org, Project.status == "active"))
    active = sum(c for s, c in by_status.items() if s not in ("completed", "cancelled"))
    return {
        "assignments_by_status": by_status, "active_assignments": active, "awaiting_review": by_status.get("delivered", 0),
        "overdue_assignments": overdue, "on_hold_assignments": on_hold, "open_issues": open_issues,
        "requests_by_status": requests_by_status, "active_projects": active_projects,
    }


# ------------------------------------------------------------------ organisation settings
def _settings_out(org: Organization) -> OrgSettingsOut:
    s = org.settings or {}
    return OrgSettingsOut(organization_name=org.name,
                          require_owner_approval=bool(s.get("require_owner_approval", False)),
                          require_delivery_photo=bool(s.get("require_delivery_photo", True)))


@router.get("/organization/settings", response_model=OrgSettingsOut)
def get_settings(user: User = Depends(require_roles("owner", "admin")), db: Session = Depends(get_db)):
    return _settings_out(db.get(Organization, user.org_id))


@router.patch("/organization/settings", response_model=OrgSettingsOut)
def update_settings(body: OrgSettingsPatch, user: User = Depends(require_roles("owner")), db: Session = Depends(get_db)):
    org = db.get(Organization, user.org_id)
    org.settings = {**(org.settings or {}), **body.model_dump(exclude_none=True)}  # reassign so the JSON change is saved
    db.commit()
    return _settings_out(org)
