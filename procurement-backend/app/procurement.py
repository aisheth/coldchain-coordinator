"""Assignment workflow. Every public function runs in the caller's session and commits once at the end,
so a status change, its history row and its notifications are all-or-nothing."""
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import exists, select

from .errors import BadRequest, Conflict, NotFound
from .models import (
    Assignment, AssignmentItem, Attachment, DeliveryConfirmation, Issue, ItemVariant, Organization,
    ProcurementRequest, ProcurementRequestItem, Project, StatusHistory, User, Vendor, utcnow,
)
from .schemas import (
    AssignmentDetailOut, AssignmentItemOut, AssignmentSummaryOut, AttachmentOut, DeliveryOut,
    HistoryOut, IssueOut,
)
from .serializers import variant_out
from .services import (
    check_qty, covered_quantities, link_attachments, next_request_code, notify, owner_ids,
)
from .state_machine import CANCELLABLE, DEDICATED_ENDPOINT, LABELS, NOTIFY_OWNER, TRANSITIONS

ITEM_EDITABLE = {"accepted", "travelling", "reached_vendor", "availability_confirmed",
                 "procurement_in_progress", "dispatched"}
OPEN_STATES = ("completed", "cancelled")


# ------------------------------------------------------------------ lookups & rules
def get_assignment(db, user: User, assignment_id, lock: bool = False) -> Assignment:
    stmt = select(Assignment).where(Assignment.id == assignment_id, Assignment.org_id == user.org_id)
    if lock:
        stmt = stmt.with_for_update()  # serialises concurrent changes to the same assignment
    a = db.scalar(stmt)
    # Workers get 404 (not 403) for other people's tasks so ids do not leak existence.
    if a is None or (user.role == "worker" and a.worker_id != user.id):
        raise NotFound("Assignment not found")
    return a


def is_blocked(db, a: Assignment) -> bool:
    """On hold == there is an open issue that blocks progress (derived, never stored)."""
    return bool(db.scalar(select(exists().where(
        Issue.assignment_id == a.id, Issue.status == "open", Issue.blocks_progress.is_(True)))))


def allowed_transitions(a: Assignment, user: User, blocked: bool) -> list[str]:
    if user.role == "worker" and (a.worker_id != user.id or blocked):
        return []
    result = []
    for to, roles in TRANSITIONS.get(a.status, {}).items():
        if user.role not in roles:
            continue
        if to == "pending_approval" and not a.requires_approval:
            continue
        if to == "dispatched" and a.status == "procurement_in_progress" and a.requires_approval:
            continue
        result.append(to)
    return result


def _display(item: AssignmentItem) -> str:
    return variant_out(item.request_item.variant).display_name


def _add_history(db, a: Assignment, from_status, to_status, user: User, remarks=None) -> StatusHistory:
    h = StatusHistory(assignment_id=a.id, from_status=from_status, to_status=to_status,
                      changed_by=user.id, remarks=remarks)
    db.add(h)
    db.flush()
    return h


def _request_code(db, a: Assignment) -> str:
    return db.get(ProcurementRequest, a.request_id).code


def _tell_owners(db, a, type_, message):
    notify(db, a.org_id, owner_ids(db, a.org_id), type_, message, "assignment", a.id,
           {"request_code": _request_code(db, a)})


def _tell_worker(db, a, type_, message):
    notify(db, a.org_id, [a.worker_id], type_, message, "assignment", a.id,
           {"request_code": _request_code(db, a)})


# ------------------------------------------------------------------ read models
def _attachments(db, owner_type: str, ids: list) -> dict:
    out: dict = {i: [] for i in ids}
    if ids:
        for att in db.scalars(select(Attachment).where(
                Attachment.owner_type == owner_type, Attachment.owner_id.in_(ids))):
            out[att.owner_id].append(AttachmentOut.model_validate(att))
    return out


def build_summary(db, a: Assignment, blocked: bool | None = None) -> AssignmentSummaryOut:
    blocked = is_blocked(db, a) if blocked is None else blocked
    project, worker, vendor = db.get(Project, a.project_id), db.get(User, a.worker_id), db.get(Vendor, a.vendor_id)
    overdue = bool(a.due_date and a.due_date < date.today() and a.status not in ("delivered", *OPEN_STATES))
    return AssignmentSummaryOut(
        id=a.id, request_id=a.request_id, request_code=_request_code(db, a), project_id=a.project_id,
        project_name=project.name, worker_id=a.worker_id, worker_name=worker.name, vendor_id=a.vendor_id,
        vendor_name=vendor.name, status=a.status, is_on_hold=blocked, is_overdue=overdue,
        due_date=a.due_date, assigned_at=a.assigned_at,
    )


def build_detail(db, a: Assignment, user: User) -> AssignmentDetailOut:
    blocked = is_blocked(db, a)
    names = {}

    def name_of(uid):
        if uid not in names:
            names[uid] = db.get(User, uid).name
        return names[uid]

    history = db.scalars(select(StatusHistory).where(StatusHistory.assignment_id == a.id)
                         .order_by(StatusHistory.changed_at, StatusHistory.id)).all()
    h_att = _attachments(db, "status_history", [h.id for h in history])
    issues = db.scalars(select(Issue).where(Issue.assignment_id == a.id).order_by(Issue.raised_at)).all()
    i_att = _attachments(db, "issue", [i.id for i in issues])
    delivery = db.scalar(select(DeliveryConfirmation).where(DeliveryConfirmation.assignment_id == a.id)
                         .order_by(DeliveryConfirmation.delivered_at.desc()))
    d_att = _attachments(db, "delivery", [delivery.id]) if delivery else {}
    can_manage = user.role == "owner" and a.status in CANCELLABLE
    summary = build_summary(db, a, blocked).model_dump()
    return AssignmentDetailOut(
        **summary,
        delivery_location=a.delivery_location, instructions=a.instructions,
        requires_approval=a.requires_approval, replaced_by_id=a.replaced_by_id, cancel_reason=a.cancel_reason,
        items=[AssignmentItemOut(
            id=i.id, request_item_id=i.request_item_id, variant=variant_out(i.request_item.variant),
            allocated_qty=i.allocated_qty, fulfilment_status=i.fulfilment_status, qty_procured=i.qty_procured,
            qty_delivered=i.qty_delivered, remarks=i.remarks,
            substitute_variant=variant_out(i.substitute_variant) if i.substitute_variant else None,
        ) for i in a.items],
        history=[HistoryOut(id=h.id, from_status=h.from_status, to_status=h.to_status, changed_by=h.changed_by,
                            changed_by_name=name_of(h.changed_by), changed_at=h.changed_at, remarks=h.remarks,
                            attachments=h_att.get(h.id, [])) for h in history],
        issues=[IssueOut(id=i.id, assignment_id=i.assignment_id, assignment_item_id=i.assignment_item_id,
                         type=i.type, description=i.description, blocks_progress=i.blocks_progress, status=i.status,
                         raised_by=i.raised_by, raised_by_name=name_of(i.raised_by), raised_at=i.raised_at,
                         resolved_at=i.resolved_at, resolution=i.resolution, attachments=i_att.get(i.id, []))
                for i in issues],
        delivery=DeliveryOut(delivered_at=delivery.delivered_at, recipient_name=delivery.recipient_name,
                             remarks=delivery.remarks, confirmed_at=delivery.confirmed_at,
                             attachments=d_att.get(delivery.id, [])) if delivery else None,
        allowed_transitions=allowed_transitions(a, user, blocked),
        can_cancel=can_manage, can_reassign=can_manage,
    )


# ------------------------------------------------------------------ owner actions
def _check_worker(db, user: User, worker_id) -> User:
    worker = db.get(User, worker_id)
    if worker is None or worker.org_id != user.org_id or worker.role != "worker" or not worker.is_active:
        raise BadRequest("Pick an active worker from your organisation", "invalid_worker")
    return worker


def _check_vendor(db, user: User, vendor_id) -> Vendor:
    vendor = db.get(Vendor, vendor_id)
    if vendor is None or vendor.org_id != user.org_id or not vendor.is_active:
        raise BadRequest("Pick an active vendor from your organisation", "invalid_vendor")
    return vendor


def create_assignment(db, user: User, request_id, body) -> Assignment:
    req = db.scalar(select(ProcurementRequest).where(
        ProcurementRequest.id == request_id, ProcurementRequest.org_id == user.org_id).with_for_update())
    if req is None:
        raise NotFound("Request not found")
    if req.status != "finalized":
        raise Conflict("Finalize the request before assigning it", "not_finalized")
    _check_worker(db, user, body.worker_id)
    _check_vendor(db, user, body.vendor_id)
    project = db.get(Project, req.project_id)
    covered = covered_quantities(db, req.id)
    remaining = [(line, line.required_qty - covered[line.id]) for line in req.lines]
    remaining = [(line, qty) for line, qty in remaining if qty > 0]
    if not remaining:
        raise Conflict("Everything in this request is already assigned", "fully_assigned")
    org = db.get(Organization, user.org_id)
    approval = body.requires_approval if body.requires_approval is not None else bool(
        (org.settings or {}).get("require_owner_approval", False))
    a = Assignment(
        org_id=user.org_id, request_id=req.id, project_id=req.project_id, worker_id=body.worker_id,
        vendor_id=body.vendor_id, delivery_location=body.delivery_location or project.site_address,
        instructions=body.instructions, due_date=body.due_date, requires_approval=approval, created_by=user.id,
    )
    a.items = [AssignmentItem(request_item_id=line.id, allocated_qty=qty) for line, qty in remaining]
    db.add(a)
    db.flush()
    _add_history(db, a, None, "assigned", user)
    _tell_worker(db, a, "assigned", f"New procurement task {req.code} for {project.name}")
    db.commit()
    return a


def update_assignment(db, user: User, assignment_id, body) -> Assignment:
    a = get_assignment(db, user, assignment_id, lock=True)
    if a.status in OPEN_STATES:
        raise Conflict("This assignment is closed", "assignment_closed")
    sent = body.model_fields_set
    if "vendor_id" in sent and body.vendor_id:
        _check_vendor(db, user, body.vendor_id)
        a.vendor_id = body.vendor_id
    if "requires_approval" in sent and body.requires_approval is not None:
        if a.status in ("dispatched", "delivered"):
            raise Conflict("Too late to change the approval requirement", "too_late")
        a.requires_approval = body.requires_approval
    for key in ("delivery_location", "instructions", "due_date"):
        if key in sent:
            setattr(a, key, getattr(body, key))
    _tell_worker(db, a, "assignment_updated", "Task details were updated")
    db.commit()
    return a


def cancel_assignment(db, user: User, assignment_id, reason: str) -> Assignment:
    a = get_assignment(db, user, assignment_id, lock=True)
    if a.status not in CANCELLABLE:
        raise Conflict("This assignment can no longer be cancelled", "cannot_cancel")
    previous = a.status
    a.status, a.cancelled_at, a.cancel_reason = "cancelled", utcnow(), reason
    _add_history(db, a, previous, "cancelled", user, reason)
    _tell_worker(db, a, "assignment_cancelled", f"Task was cancelled: {reason}")
    db.commit()
    return a


def reassign(db, user: User, assignment_id, body) -> Assignment:
    old = get_assignment(db, user, assignment_id, lock=True)
    if old.status not in CANCELLABLE:
        raise Conflict("This assignment can no longer be reassigned", "cannot_reassign")
    if body.worker_id == old.worker_id:
        raise BadRequest("Choose a different worker", "same_worker")
    _check_worker(db, user, body.worker_id)
    remaining = [(i, i.allocated_qty - i.qty_delivered) for i in old.items]
    remaining = [(i, qty) for i, qty in remaining if qty > 0]
    if not remaining:
        raise Conflict("Nothing left to reassign", "nothing_to_reassign")
    new = Assignment(
        org_id=old.org_id, request_id=old.request_id, project_id=old.project_id, worker_id=body.worker_id,
        vendor_id=old.vendor_id, delivery_location=old.delivery_location, instructions=old.instructions,
        due_date=old.due_date, requires_approval=old.requires_approval, created_by=user.id,
    )
    new.items = [AssignmentItem(request_item_id=i.request_item_id, allocated_qty=qty) for i, qty in remaining]
    db.add(new)
    db.flush()
    previous = old.status
    old.status, old.cancelled_at, old.replaced_by_id = "cancelled", utcnow(), new.id
    old.cancel_reason = f"Reassigned: {body.reason}"
    _add_history(db, old, previous, "cancelled", user, old.cancel_reason)
    _add_history(db, new, None, "assigned", user, f"Reassigned from previous worker: {body.reason}")
    code = _request_code(db, new)
    _tell_worker(db, old, "assignment_cancelled", f"Task {code} was reassigned to someone else")
    _tell_worker(db, new, "assigned", f"New procurement task {code}")
    db.commit()
    return new


def hold(db, user: User, assignment_id, reason: str) -> Assignment:
    a = get_assignment(db, user, assignment_id, lock=True)
    if a.status in OPEN_STATES:
        raise Conflict("This assignment is closed", "assignment_closed")
    db.add(Issue(assignment_id=a.id, type="owner_hold", description=reason, blocks_progress=True, raised_by=user.id))
    _tell_worker(db, a, "on_hold", f"Task put on hold: {reason}")
    db.commit()
    return a


def resolve_issue(db, user: User, issue_id, resolution: str) -> Assignment:
    issue = db.get(Issue, issue_id)
    a = db.get(Assignment, issue.assignment_id) if issue else None
    if issue is None or a.org_id != user.org_id:
        raise NotFound("Issue not found")
    if issue.status == "resolved":
        raise Conflict("Issue is already resolved", "already_resolved")
    issue.status, issue.resolution = "resolved", resolution
    issue.resolved_by, issue.resolved_at = user.id, utcnow()
    _tell_worker(db, a, "issue_resolved", f"Issue resolved: {resolution}")
    db.commit()
    return a


# ------------------------------------------------------------------ worker actions
def _apply_status(db, a: Assignment, to_status: str, user: User, remarks, attachment_ids=()) -> None:
    previous = a.status
    a.status = to_status
    h = _add_history(db, a, previous, to_status, user, remarks)
    if attachment_ids:
        link_attachments(db, user, list(attachment_ids), "status_history", h.id)
    code = _request_code(db, a)
    if user.role == "worker" and to_status in NOTIFY_OWNER:
        _tell_owners(db, a, f"status_{to_status}", f"{code}: {LABELS[to_status]} (by {user.name})")
    elif user.role == "owner" and previous == "delivered" and to_status == "dispatched":
        _tell_worker(db, a, "delivery_rejected", f"{code}: delivery was rejected. {remarks or ''}".strip())
    elif user.role == "owner" and previous == "pending_approval":
        _tell_worker(db, a, "approved", f"{code}: approved, you can dispatch")


def transition(db, user: User, assignment_id, body) -> Assignment:
    a = get_assignment(db, user, assignment_id, lock=True)
    to = body.to_status
    if to in DEDICATED_ENDPOINT:
        raise BadRequest(f"Use {DEDICATED_ENDPOINT[to]} for this step", "use_dedicated_endpoint",
                         {"endpoint": DEDICATED_ENDPOINT[to]})
    if a.status == to:
        return a  # idempotent: a retried request on a flaky network is harmless
    blocked = is_blocked(db, a)
    if to not in allowed_transitions(a, user, blocked and user.role == "worker"):
        if blocked and user.role == "worker":
            raise Conflict("This task is on hold. Wait for the owner to resolve the issue.", "assignment_on_hold")
        if to == "pending_approval" and not a.requires_approval:
            raise Conflict("This task does not need approval", "approval_not_required")
        if to == "dispatched" and a.status == "procurement_in_progress" and a.requires_approval:
            raise Conflict("Submit for approval first", "approval_required")
        raise Conflict(f"Cannot move from {a.status} to {to}", "invalid_transition",
                       {"from": a.status, "to": to, "allowed": allowed_transitions(a, user, False)})
    if to == "availability_confirmed" and any(i.fulfilment_status == "pending" for i in a.items):
        raise Conflict("Mark every line as available, unavailable or substituted first", "lines_pending")
    if a.status == "procurement_in_progress" and to in ("pending_approval", "dispatched") \
            and not any(i.qty_procured > 0 for i in a.items):
        raise Conflict("Record at least one procured quantity first", "nothing_procured")
    if a.status == "delivered" and to == "dispatched" and not (body.remarks or "").strip():
        raise BadRequest("Give a reason when rejecting a delivery", "remarks_required")
    _apply_status(db, a, to, user, body.remarks, body.attachment_ids)
    db.commit()
    return a


def update_item(db, user: User, assignment_id, item_id, body) -> Assignment:
    a = get_assignment(db, user, assignment_id, lock=True)
    if a.status not in ITEM_EDITABLE:
        raise Conflict("Lines can only be updated while the task is in progress", "not_editable")
    ai = next((i for i in a.items if i.id == item_id), None)
    if ai is None:
        raise NotFound("Line not found")
    variant: ItemVariant = ai.request_item.variant
    sent = body.model_fields_set
    status = body.fulfilment_status or ai.fulfilment_status
    procured = body.qty_procured if "qty_procured" in sent and body.qty_procured is not None else ai.qty_procured
    delivered = body.qty_delivered if "qty_delivered" in sent and body.qty_delivered is not None else ai.qty_delivered
    for label, qty in (("qty_procured", procured), ("qty_delivered", delivered)):
        check_qty(variant, qty, label)
    if procured > ai.allocated_qty:
        raise BadRequest(f"Cannot procure more than the requested {ai.allocated_qty:g}", "qty_exceeds_allocation")
    if delivered > procured:
        raise BadRequest("Delivered quantity cannot exceed what was procured", "delivered_exceeds_procured")
    if status == "pending" and procured > 0:
        status = "available"
    if status == "unavailable" and procured > 0:
        raise BadRequest("An unavailable line cannot have a procured quantity", "unavailable_with_qty")
    substitute_id = body.substitute_variant_id if "substitute_variant_id" in sent else ai.substitute_variant_id
    remarks = body.remarks if "remarks" in sent else ai.remarks
    if status == "substituted":
        if not substitute_id or not (remarks or "").strip():
            raise BadRequest("A substitution needs the substitute item and a remark", "substitution_details_required")
        substitute = db.get(ItemVariant, substitute_id)
        if substitute is None or substitute.org_id != user.org_id or not substitute.is_active \
                or substitute.id == variant.id:
            raise BadRequest("Choose a different, active item as the substitute", "invalid_substitute")
        check_qty(substitute, procured, "qty_procured")
    else:
        substitute_id = None
    previous_status = ai.fulfilment_status
    ai.fulfilment_status, ai.qty_procured, ai.qty_delivered = status, procured, delivered
    ai.substitute_variant_id, ai.remarks = substitute_id, remarks
    if status != previous_status:
        if status == "unavailable":
            db.add(Issue(assignment_id=a.id, assignment_item_id=ai.id, type="material_unavailable",
                         blocks_progress=False, raised_by=user.id,
                         description=f"{_display(ai)} is not available at the vendor. {remarks or ''}".strip()))
            _tell_owners(db, a, "line_unavailable", f"{_request_code(db, a)}: {_display(ai)} is unavailable")
        elif status == "substituted":
            _tell_owners(db, a, "line_substituted", f"{_request_code(db, a)}: {_display(ai)} will be substituted")
    db.commit()
    db.refresh(a)
    return a


def raise_issue(db, user: User, assignment_id, body) -> Assignment:
    a = get_assignment(db, user, assignment_id, lock=True)
    if a.status in OPEN_STATES:
        raise Conflict("This assignment is closed", "assignment_closed")
    if body.item_id and not any(i.id == body.item_id for i in a.items):
        raise NotFound("Line not found")
    issue = Issue(assignment_id=a.id, assignment_item_id=body.item_id, type=body.type,
                  description=body.description, blocks_progress=body.blocks_progress, raised_by=user.id)
    db.add(issue)
    db.flush()
    if body.attachment_ids:
        link_attachments(db, user, body.attachment_ids, "issue", issue.id)
    _tell_owners(db, a, "issue_raised", f"{_request_code(db, a)}: {body.description[:120]}")
    db.commit()
    return a


def record_delivery(db, user: User, assignment_id, body) -> Assignment:
    a = get_assignment(db, user, assignment_id, lock=True)
    if a.status != "dispatched":
        raise Conflict("Only dispatched tasks can be marked delivered", "invalid_transition",
                       {"from": a.status, "to": "delivered"})
    by_item = {d.item_id: d.qty_delivered for d in body.items}
    unknown = set(by_item) - {i.id for i in a.items}
    if unknown:
        raise NotFound("Line not found")
    for ai in a.items:  # lines left out default to "everything procured was delivered"
        qty = by_item.get(ai.id, ai.qty_delivered if ai.qty_delivered > 0 else ai.qty_procured)
        check_qty(ai.request_item.variant, qty, "qty_delivered")
        if qty > ai.qty_procured:
            raise BadRequest("Delivered quantity cannot exceed what was procured", "delivered_exceeds_procured")
        ai.qty_delivered = qty
    org = db.get(Organization, a.org_id)
    delivery = DeliveryConfirmation(assignment_id=a.id, delivered_at=body.delivered_at or utcnow(),
                                    recipient_name=body.recipient_name, remarks=body.remarks, delivered_by=user.id)
    db.add(delivery)
    db.flush()
    files = link_attachments(db, user, body.attachment_ids, "delivery", delivery.id)
    if (org.settings or {}).get("require_delivery_photo", True) and not any(f.mime.startswith("image/") for f in files):
        raise BadRequest("Attach at least one photo as proof of delivery", "photo_required")
    _apply_status(db, a, "delivered", user, body.remarks)
    db.commit()
    return a


# ------------------------------------------------------------------ completion
def confirm_completion(db, user: User, assignment_id, body) -> tuple[Assignment, ProcurementRequest | None]:
    a = get_assignment(db, user, assignment_id, lock=True)
    if a.status != "delivered":
        raise Conflict("Only delivered tasks can be completed", "invalid_transition",
                       {"from": a.status, "to": "completed"})
    shortfall = [(i, i.allocated_qty - i.qty_delivered) for i in a.items if i.allocated_qty > i.qty_delivered]
    if shortfall and body.shortfall_action is None:
        raise Conflict("Some quantities were not delivered. Choose how to handle the shortfall.",
                       "shortfall_action_required",
                       {"shortfall": [{"item": _display(i), "missing": float(q)} for i, q in shortfall]})
    follow_up = None
    if shortfall and body.shortfall_action == "follow_up":
        original = db.get(ProcurementRequest, a.request_id)
        follow_up = ProcurementRequest(
            org_id=a.org_id, project_id=a.project_id, code=next_request_code(db, a.org_id),
            notes=f"Follow-up for shortfall on {original.code}", created_by=user.id)
        for i, qty in shortfall:
            follow_up.lines.append(ProcurementRequestItem(variant_id=i.request_item.variant_id, required_qty=qty))
        db.add(follow_up)
    delivery = db.scalar(select(DeliveryConfirmation).where(DeliveryConfirmation.assignment_id == a.id)
                         .order_by(DeliveryConfirmation.delivered_at.desc()))
    if delivery:
        delivery.confirmed_by, delivery.confirmed_at = user.id, utcnow()
    _apply_status(db, a, "completed", user, None)
    _tell_worker(db, a, "completed", f"{_request_code(db, a)}: completed")
    db.commit()
    return a, follow_up
