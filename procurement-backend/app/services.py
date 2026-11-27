"""Small helpers shared by the request and assignment code."""
import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from .errors import BadRequest
from .models import (
    Assignment, AssignmentItem, Attachment, ItemVariant, Notification, Organization, ProcurementRequest, User,
)


def notify(db: Session, org_id, user_ids, type_: str, message: str, entity_type: str | None = None,
           entity_id=None, extra: dict | None = None) -> None:
    """Notifications are plain rows written in the caller's transaction (delivery/push comes later)."""
    payload = {"message": message, **(extra or {})}
    for uid in set(user_ids):
        db.add(Notification(org_id=org_id, user_id=uid, type=type_, payload=payload,
                            entity_type=entity_type, entity_id=entity_id))


def owner_ids(db: Session, org_id) -> list[uuid.UUID]:
    return list(db.scalars(select(User.id).where(
        User.org_id == org_id, User.role == "owner", User.is_active.is_(True))))


def check_qty(variant: ItemVariant, qty: Decimal, field: str = "quantity") -> None:
    """Whole-number units (e.g. Nos) must not receive fractional quantities."""
    if not variant.uom.allows_decimal and qty != qty.to_integral_value():
        raise BadRequest(f"{field} must be a whole number for unit '{variant.uom.code}'", "fractional_quantity")


def covered_quantities(db: Session, request_id) -> dict[uuid.UUID, Decimal]:
    """Per request line: quantity already allocated to non-cancelled assignments, plus what cancelled
    assignments already delivered. Used to stop double allocation and to derive request progress."""
    covered: dict = defaultdict(lambda: Decimal(0))
    rows = db.execute(
        select(AssignmentItem, Assignment.status)
        .join(Assignment, Assignment.id == AssignmentItem.assignment_id)
        .where(Assignment.request_id == request_id)
    ).all()
    for item, status in rows:
        covered[item.request_item_id] += item.qty_delivered if status == "cancelled" else item.allocated_qty
    return covered


def request_progress(db: Session, req: ProcurementRequest) -> str:
    if req.status != "finalized":
        return req.status
    assignments = db.scalars(select(Assignment).where(
        Assignment.request_id == req.id, Assignment.status != "cancelled")).all()
    if not assignments:
        return "finalized"
    covered = covered_quantities(db, req.id)
    fully_covered = all(covered[line.id] >= line.required_qty for line in req.lines)
    if fully_covered and all(a.status == "completed" for a in assignments):
        return "completed"
    return "in_progress"


def link_attachments(db: Session, user: User, ids: list[uuid.UUID], owner_type: str, owner_id) -> list[Attachment]:
    """Attach previously uploaded files to a history entry / issue / delivery."""
    found = []
    for att_id in dict.fromkeys(ids):
        att = db.get(Attachment, att_id)
        if att is None or att.org_id != user.org_id or att.uploaded_by != user.id or att.owner_id is not None:
            raise BadRequest("Attachment not found or already used", "invalid_attachment", {"id": str(att_id)})
        att.owner_type, att.owner_id = owner_type, owner_id
        found.append(att)
    return found


def next_request_code(db: Session, org_id) -> str:
    """The row lock on the organisation makes concurrent creations receive distinct numbers."""
    org = db.scalar(select(Organization).where(Organization.id == org_id).with_for_update())
    org.request_counter += 1
    return f"PR-{org.request_counter:04d}"
