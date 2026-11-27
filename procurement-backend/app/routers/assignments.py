import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import procurement as svc
from ..db import get_db
from ..deps import require_roles
from ..models import Assignment, Issue, User
from ..schemas import (
    AssignmentDetailOut, AssignmentIn, AssignmentPatch, AssignmentSummaryOut, CompleteIn, CompletionOut,
    DeliveryIn, IssueIn, IssueOut, ItemUpdateIn, Page, ReasonIn, ReassignIn, ResolveIn, TransitionIn,
)
from ..utils import paginate

router = APIRouter(tags=["assignments"])
owner = require_roles("owner")
worker = require_roles("worker")
owner_or_worker = require_roles("owner", "worker")  # admins have no access to procurement operations


def _detail(db: Session, a: Assignment, user: User) -> AssignmentDetailOut:
    return svc.build_detail(db, a, user)


# ------------------------------------------------------------------ owner
@router.post("/requests/{request_id}/assignments", response_model=AssignmentDetailOut, status_code=201)
def create_assignment(request_id: uuid.UUID, body: AssignmentIn, user: User = Depends(owner), db: Session = Depends(get_db)):
    return _detail(db, svc.create_assignment(db, user, request_id, body), user)


@router.patch("/assignments/{assignment_id}", response_model=AssignmentDetailOut)
def update_assignment(assignment_id: uuid.UUID, body: AssignmentPatch, user: User = Depends(owner), db: Session = Depends(get_db)):
    return _detail(db, svc.update_assignment(db, user, assignment_id, body), user)


@router.post("/assignments/{assignment_id}/cancel", response_model=AssignmentDetailOut)
def cancel_assignment(assignment_id: uuid.UUID, body: ReasonIn, user: User = Depends(owner), db: Session = Depends(get_db)):
    return _detail(db, svc.cancel_assignment(db, user, assignment_id, body.reason), user)


@router.post("/assignments/{assignment_id}/reassign", response_model=AssignmentDetailOut, status_code=201)
def reassign(assignment_id: uuid.UUID, body: ReassignIn, user: User = Depends(owner), db: Session = Depends(get_db)):
    """Returns the NEW assignment; the old one is cancelled and linked via replaced_by_id."""
    return _detail(db, svc.reassign(db, user, assignment_id, body), user)


@router.post("/assignments/{assignment_id}/hold", response_model=AssignmentDetailOut)
def hold(assignment_id: uuid.UUID, body: ReasonIn, user: User = Depends(owner), db: Session = Depends(get_db)):
    return _detail(db, svc.hold(db, user, assignment_id, body.reason), user)


@router.post("/assignments/{assignment_id}/confirm-completion", response_model=CompletionOut)
def confirm_completion(assignment_id: uuid.UUID, body: CompleteIn, user: User = Depends(owner), db: Session = Depends(get_db)):
    a, follow_up = svc.confirm_completion(db, user, assignment_id, body)
    return CompletionOut(assignment=_detail(db, a, user),
                         follow_up_request_id=follow_up.id if follow_up else None,
                         follow_up_request_code=follow_up.code if follow_up else None)


@router.post("/issues/{issue_id}/resolve", response_model=AssignmentDetailOut)
def resolve_issue(issue_id: uuid.UUID, body: ResolveIn, user: User = Depends(owner), db: Session = Depends(get_db)):
    return _detail(db, svc.resolve_issue(db, user, issue_id, body.resolution), user)


@router.get("/issues", response_model=list[IssueOut])
def list_issues(status: str = "open", user: User = Depends(owner), db: Session = Depends(get_db)):
    issues = db.scalars(select(Issue).join(Assignment, Assignment.id == Issue.assignment_id)
                        .where(Assignment.org_id == user.org_id, Issue.status == status)
                        .order_by(Issue.raised_at.desc())).all()
    return [IssueOut(id=i.id, assignment_id=i.assignment_id, assignment_item_id=i.assignment_item_id, type=i.type,
                     description=i.description, blocks_progress=i.blocks_progress, status=i.status,
                     raised_by=i.raised_by, raised_by_name=db.get(User, i.raised_by).name, raised_at=i.raised_at,
                     resolved_at=i.resolved_at, resolution=i.resolution, attachments=[]) for i in issues]


# ------------------------------------------------------------------ listing (owner sees all, worker sees own)
@router.get("/assignments", response_model=Page[AssignmentSummaryOut])
def list_assignments(status: str | None = None, worker_id: uuid.UUID | None = None,
                     project_id: uuid.UUID | None = None, overdue: bool | None = None,
                     limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                     user: User = Depends(owner_or_worker), db: Session = Depends(get_db)):
    stmt = select(Assignment).where(Assignment.org_id == user.org_id).order_by(Assignment.assigned_at.desc())
    if user.role == "worker":
        stmt = stmt.where(Assignment.worker_id == user.id)
    elif worker_id:
        stmt = stmt.where(Assignment.worker_id == worker_id)
    if status:
        stmt = stmt.where(Assignment.status == status)
    if project_id:
        stmt = stmt.where(Assignment.project_id == project_id)
    if overdue:
        stmt = stmt.where(Assignment.due_date < date.today(),
                          Assignment.status.notin_(("delivered", "completed", "cancelled")))
    rows, total = paginate(db, stmt, limit, offset)
    return Page(items=[svc.build_summary(db, a) for a in rows], total=total, limit=limit, offset=offset)


@router.get("/me/assignments", response_model=Page[AssignmentSummaryOut])
def my_assignments(active: bool = True, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                   user: User = Depends(worker), db: Session = Depends(get_db)):
    closed = ("completed", "cancelled")
    stmt = select(Assignment).where(Assignment.worker_id == user.id).order_by(Assignment.assigned_at.desc())
    stmt = stmt.where(Assignment.status.notin_(closed) if active else Assignment.status.in_(closed))
    rows, total = paginate(db, stmt, limit, offset)
    return Page(items=[svc.build_summary(db, a) for a in rows], total=total, limit=limit, offset=offset)


@router.get("/assignments/{assignment_id}", response_model=AssignmentDetailOut)
def get_assignment(assignment_id: uuid.UUID, user: User = Depends(owner_or_worker), db: Session = Depends(get_db)):
    return _detail(db, svc.get_assignment(db, user, assignment_id), user)


# ------------------------------------------------------------------ worker progress
@router.post("/assignments/{assignment_id}/transitions", response_model=AssignmentDetailOut)
def transition(assignment_id: uuid.UUID, body: TransitionIn, user: User = Depends(owner_or_worker), db: Session = Depends(get_db)):
    return _detail(db, svc.transition(db, user, assignment_id, body), user)


@router.patch("/assignments/{assignment_id}/items/{item_id}", response_model=AssignmentDetailOut)
def update_item(assignment_id: uuid.UUID, item_id: uuid.UUID, body: ItemUpdateIn,
                user: User = Depends(worker), db: Session = Depends(get_db)):
    return _detail(db, svc.update_item(db, user, assignment_id, item_id, body), user)


@router.post("/assignments/{assignment_id}/issues", response_model=AssignmentDetailOut, status_code=201)
def raise_issue(assignment_id: uuid.UUID, body: IssueIn, user: User = Depends(owner_or_worker), db: Session = Depends(get_db)):
    return _detail(db, svc.raise_issue(db, user, assignment_id, body), user)


@router.post("/assignments/{assignment_id}/delivery", response_model=AssignmentDetailOut)
def record_delivery(assignment_id: uuid.UUID, body: DeliveryIn, user: User = Depends(worker), db: Session = Depends(get_db)):
    return _detail(db, svc.record_delivery(db, user, assignment_id, body), user)
