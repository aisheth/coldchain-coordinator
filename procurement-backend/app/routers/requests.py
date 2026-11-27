import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import exists, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import require_roles
from ..errors import BadRequest, Conflict, NotFound
from ..models import (
    Assignment, AssignmentItem, Issue, ItemVariant, Organization, Project, ProcurementRequest,
    ProcurementRequestItem, RequestItemChange, User, utcnow,
)
from ..schemas import (
    BulkLinesIn, LineIn, LineOut, LinePatch, Page, RequestIn, RequestOut, RequestPatch,
    RequestSummaryOut, VariantOut,
)
from ..services import check_qty, next_request_code, notify, request_progress
from ..utils import get_scoped, paginate
from ..serializers import variant_out
from .catalogue import _variant_query

router = APIRouter(prefix="/requests", tags=["procurement requests"])
owner = require_roles("owner")

PRE_PROCUREMENT = ("assigned", "accepted", "travelling", "reached_vendor", "availability_confirmed")
IN_PROCUREMENT = ("procurement_in_progress", "pending_approval", "dispatched")


# ------------------------------------------------------------------ helpers
def request_out(db: Session, req: ProcurementRequest) -> RequestOut:
    return RequestOut(
        id=req.id, code=req.code, project_id=req.project_id, status=req.status,
        progress=request_progress(db, req), notes=req.notes, created_at=req.created_at,
        lines=[LineOut(id=l.id, variant=variant_out(l.variant), required_qty=l.required_qty, remarks=l.remarks)
               for l in req.lines],
    )


def _get_request(db: Session, request_id, user: User) -> ProcurementRequest:
    return get_scoped(db, ProcurementRequest, request_id, user.org_id, "Request")


def _active_assignment(db: Session, req: ProcurementRequest) -> Assignment | None:
    """MVP: a request is assigned as a whole, so there is at most one live assignment."""
    return db.scalar(select(Assignment).where(
        Assignment.request_id == req.id, Assignment.status.notin_(("cancelled", "completed"))))


def _snapshot(line: ProcurementRequestItem) -> dict:
    return {"item": variant_out(line.variant).display_name, "required_qty": float(line.required_qty),
            "remarks": line.remarks}


def _log(db: Session, req, user, action, line_id, before, after):
    db.add(RequestItemChange(request_id=req.id, request_item_id=line_id, action=action,
                             before=before, after=after, changed_by=user.id))


def _tell_worker(db: Session, req, assignment: Assignment | None, message: str):
    if assignment is not None:
        notify(db, req.org_id, [assignment.worker_id], "list_edited", f"{req.code}: {message}",
               "assignment", assignment.id, {"request_code": req.code})


def _assert_editable(db: Session, req: ProcurementRequest) -> Assignment | None:
    if req.status == "cancelled":
        raise Conflict("This request is cancelled", "request_cancelled")
    assignment = _active_assignment(db, req)
    if assignment is not None and assignment.status == "delivered":
        raise Conflict("Materials were delivered. Reject the delivery or create a new request.", "already_delivered")
    return assignment


def _add_line(db: Session, req: ProcurementRequest, user: User, body: LineIn, assignment: Assignment | None):
    variant = get_scoped(db, ItemVariant, body.variant_id, user.org_id, "Variant")
    if not variant.is_active or not variant.item.is_active:
        raise BadRequest("This item is no longer active", "variant_inactive")
    check_qty(variant, body.required_qty, "required_qty")
    existing = next((l for l in req.lines if l.variant_id == variant.id), None)
    if existing:
        raise Conflict("This variant is already in the request. Edit its quantity instead.", "duplicate_line",
                       {"existing_line_id": str(existing.id)})
    line = ProcurementRequestItem(request_id=req.id, variant_id=variant.id,
                                  required_qty=body.required_qty, remarks=body.remarks)
    line.variant = variant
    req.lines.append(line)
    db.flush()
    if req.status == "finalized":
        _log(db, req, user, "add", line.id, None, _snapshot(line))
        if assignment is not None:
            db.add(AssignmentItem(assignment_id=assignment.id, request_item_id=line.id,
                                  allocated_qty=line.required_qty))
            _tell_worker(db, req, assignment, f"added {variant_out(variant).display_name} x {body.required_qty:g}")
    return line


# ------------------------------------------------------------------ endpoints
@router.post("", response_model=RequestOut, status_code=201)
def create_request(body: RequestIn, user: User = Depends(owner), db: Session = Depends(get_db)):
    project = get_scoped(db, Project, body.project_id, user.org_id, "Project")
    if project.status == "closed":
        raise Conflict("Project is closed", "project_closed")
    req = ProcurementRequest(org_id=user.org_id, project_id=project.id, code=next_request_code(db, user.org_id),
                             notes=body.notes, created_by=user.id)
    db.add(req)
    db.commit()
    db.refresh(req)
    return request_out(db, req)


@router.get("", response_model=Page[RequestSummaryOut])
def list_requests(project_id: uuid.UUID | None = None, status: str | None = None,
                  limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                  user: User = Depends(owner), db: Session = Depends(get_db)):
    stmt = select(ProcurementRequest).where(ProcurementRequest.org_id == user.org_id) \
        .order_by(ProcurementRequest.created_at.desc())
    if project_id:
        stmt = stmt.where(ProcurementRequest.project_id == project_id)
    if status:
        stmt = stmt.where(ProcurementRequest.status == status)
    rows, total = paginate(db, stmt, limit, offset)
    items = [RequestSummaryOut(id=r.id, code=r.code, project_id=r.project_id, status=r.status,
                               progress=request_progress(db, r), line_count=len(r.lines), created_at=r.created_at)
             for r in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/{request_id}", response_model=RequestOut)
def get_request(request_id: uuid.UUID, user: User = Depends(owner), db: Session = Depends(get_db)):
    return request_out(db, _get_request(db, request_id, user))


@router.patch("/{request_id}", response_model=RequestOut)
def update_request(request_id: uuid.UUID, body: RequestPatch, user: User = Depends(owner), db: Session = Depends(get_db)):
    req = _get_request(db, request_id, user)
    if "notes" in body.model_fields_set:
        req.notes = body.notes
    db.commit()
    return request_out(db, req)


@router.get("/{request_id}/available-variants", response_model=Page[VariantOut])
def available_variants(request_id: uuid.UUID, q: str | None = None, category_id: uuid.UUID | None = None,
                       limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                       user: User = Depends(owner), db: Session = Depends(get_db)):
    """Request-level filtering: variants already on THIS request are hidden; the catalogue is untouched."""
    req = _get_request(db, request_id, user)
    stmt = _variant_query(user.org_id, q, category_id, True).where(~exists().where(
        ProcurementRequestItem.request_id == req.id, ProcurementRequestItem.variant_id == ItemVariant.id))
    rows, total = paginate(db, stmt, limit, offset)
    return Page(items=[variant_out(v) for v in rows], total=total, limit=limit, offset=offset)


@router.post("/{request_id}/items", response_model=RequestOut, status_code=201)
def add_line(request_id: uuid.UUID, body: LineIn, user: User = Depends(owner), db: Session = Depends(get_db)):
    req = _get_request(db, request_id, user)
    assignment = _assert_editable(db, req)
    try:
        _add_line(db, req, user, body, assignment)
        db.commit()
    except IntegrityError:  # two tabs racing: the unique constraint is the real guard
        db.rollback()
        raise Conflict("This variant is already in the request", "duplicate_line")
    db.refresh(req)
    return request_out(db, req)


@router.post("/{request_id}/items:bulk", response_model=RequestOut, status_code=201)
def add_lines_bulk(request_id: uuid.UUID, body: BulkLinesIn, user: User = Depends(owner), db: Session = Depends(get_db)):
    req = _get_request(db, request_id, user)
    assignment = _assert_editable(db, req)
    try:
        for line in body.lines:
            _add_line(db, req, user, line, assignment)  # any failure rolls back every line
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict("A variant appears more than once", "duplicate_line")
    except Exception:
        db.rollback()
        raise
    db.refresh(req)
    return request_out(db, req)


@router.patch("/{request_id}/items/{line_id}", response_model=RequestOut)
def update_line(request_id: uuid.UUID, line_id: uuid.UUID, body: LinePatch, user: User = Depends(owner),
                db: Session = Depends(get_db)):
    req = _get_request(db, request_id, user)
    assignment = _assert_editable(db, req)
    line = next((l for l in req.lines if l.id == line_id), None)
    if line is None:
        raise NotFound("Line not found")
    before = _snapshot(line)
    if body.required_qty is not None and body.required_qty != line.required_qty:
        check_qty(line.variant, body.required_qty, "required_qty")
        delta = body.required_qty - line.required_qty
        ai = None
        if req.status == "finalized" and assignment is not None:
            ai = db.scalar(select(AssignmentItem).where(
                AssignmentItem.assignment_id == assignment.id, AssignmentItem.request_item_id == line.id))
        if ai is not None:
            if assignment.status in IN_PROCUREMENT and delta < 0:
                raise Conflict("Once procurement has started, quantities can only be increased", "increase_only")
            if ai.allocated_qty + delta < max(ai.qty_procured, Decimal("0.001")):
                raise Conflict(f"Worker has already procured {ai.qty_procured:g}; quantity cannot go below that",
                               "below_procured")
            ai.allocated_qty += delta
        line.required_qty = body.required_qty
    if "remarks" in body.model_fields_set:
        line.remarks = body.remarks
    if req.status == "finalized":
        _log(db, req, user, "update", line.id, before, _snapshot(line))
        _tell_worker(db, req, assignment, f"changed {before['item']} to {line.required_qty:g}")
    db.commit()
    db.refresh(req)
    return request_out(db, req)


@router.delete("/{request_id}/items/{line_id}", response_model=RequestOut)
def delete_line(request_id: uuid.UUID, line_id: uuid.UUID, user: User = Depends(owner), db: Session = Depends(get_db)):
    req = _get_request(db, request_id, user)
    assignment = _assert_editable(db, req)
    line = next((l for l in req.lines if l.id == line_id), None)
    if line is None:
        raise NotFound("Line not found")
    if req.status == "finalized":
        if len(req.lines) == 1:
            raise Conflict("A finalized request needs at least one line. Cancel the request instead.", "last_line")
        items = db.scalars(select(AssignmentItem).where(AssignmentItem.request_item_id == line.id)).all()
        if any(i.qty_procured > 0 for i in items):
            raise Conflict("Materials for this line were already procured", "line_procured")
        live = next((i for i in items if assignment is not None and i.assignment_id == assignment.id), None)
        if live is not None and assignment.status in PRE_PROCUREMENT and live.fulfilment_status != "pending":
            raise Conflict("The worker has already updated this line", "line_in_progress")
        for i in items:
            db.execute(update(Issue).where(Issue.assignment_item_id == i.id).values(assignment_item_id=None))
            db.delete(i)
        _log(db, req, user, "remove", line.id, _snapshot(line), None)
        _tell_worker(db, req, assignment, f"removed {_snapshot(line)['item']}")
    req.lines.remove(line)  # delete-orphan: the line disappears and the variant becomes selectable again
    db.commit()
    db.refresh(req)
    return request_out(db, req)


@router.post("/{request_id}/finalize", response_model=RequestOut)
def finalize(request_id: uuid.UUID, user: User = Depends(owner), db: Session = Depends(get_db)):
    req = _get_request(db, request_id, user)
    if req.status != "draft":
        raise Conflict("Only draft requests can be finalized", "not_draft")
    if not req.lines:
        raise BadRequest("Add at least one item first", "empty_request")
    if get_scoped(db, Project, req.project_id, user.org_id).status == "closed":
        raise Conflict("Project is closed", "project_closed")
    req.status = "finalized"
    db.commit()
    return request_out(db, req)


@router.post("/{request_id}/cancel", response_model=RequestOut)
def cancel(request_id: uuid.UUID, user: User = Depends(owner), db: Session = Depends(get_db)):
    req = _get_request(db, request_id, user)
    if req.status == "cancelled":
        return request_out(db, req)
    live = db.scalar(select(exists().where(Assignment.request_id == req.id, Assignment.status != "cancelled")))
    if live:
        raise Conflict("Cancel its assignments first", "has_assignments")
    req.status = "cancelled"
    db.commit()
    return request_out(db, req)
