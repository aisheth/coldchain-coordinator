import secrets
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import require_roles
from ..errors import Conflict, Forbidden
from ..models import User
from ..schemas import Page, ResetPasswordOut, UserCreate, UserOut, UserPatch
from ..security import hash_password
from ..utils import get_scoped, paginate
from .auth import revoke_all_refresh_tokens

router = APIRouter(prefix="/users", tags=["users"])
manager = require_roles("owner", "admin")


def _assert_can_manage(actor: User, target_role: str, target: User | None = None):
    """Owners manage everyone. Admins manage workers/admins but never touch owners."""
    if actor.role == "owner":
        return
    if target_role == "owner" or (target is not None and target.role == "owner"):
        raise Forbidden("Only an owner can manage owner accounts")


def _active_owner_count(db: Session, org_id, excluding: uuid.UUID | None = None) -> int:
    stmt = select(func.count()).select_from(User).where(
        User.org_id == org_id, User.role == "owner", User.is_active.is_(True)
    )
    if excluding:
        stmt = stmt.where(User.id != excluding)
    return db.scalar(stmt)


@router.post("", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, actor: User = Depends(manager), db: Session = Depends(get_db)):
    _assert_can_manage(actor, body.role)
    username = body.username.lower()
    email = body.email.lower() if body.email else None
    if db.scalar(select(User.id).where(User.username == username)):
        raise Conflict("Username already taken", "username_taken")
    if email and db.scalar(select(User.id).where(User.email == email)):
        raise Conflict("Email already in use", "email_taken")
    user = User(
        org_id=actor.org_id, username=username, email=email, name=body.name, phone=body.phone,
        role=body.role, password_hash=hash_password(body.password), must_change_password=True,
    )
    db.add(user)
    db.commit()
    return user


@router.get("", response_model=Page[UserOut])
def list_users(
    role: str | None = None, active: bool | None = None,
    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
    actor: User = Depends(manager), db: Session = Depends(get_db),
):
    stmt = select(User).where(User.org_id == actor.org_id).order_by(User.name)
    if role:
        stmt = stmt.where(User.role == role)
    if active is not None:
        stmt = stmt.where(User.is_active.is_(active))
    rows, total = paginate(db, stmt, limit, offset)
    return Page(items=rows, total=total, limit=limit, offset=offset)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: uuid.UUID, body: UserPatch, actor: User = Depends(manager), db: Session = Depends(get_db)):
    target = get_scoped(db, User, user_id, actor.org_id, "User")
    _assert_can_manage(actor, body.role or target.role, target)
    losing_owner = target.role == "owner" and (
        body.is_active is False or (body.role is not None and body.role != "owner")
    )
    if losing_owner and target.is_active and _active_owner_count(db, actor.org_id, excluding=target.id) == 0:
        raise Conflict("An organisation must keep at least one active owner", "last_owner")
    if body.email and body.email.lower() != target.email:
        if db.scalar(select(User.id).where(User.email == body.email.lower())):
            raise Conflict("Email already in use", "email_taken")
    for key in body.model_fields_set:
        value = getattr(body, key)
        setattr(target, key, value.lower() if key == "email" and value else value)
    if body.is_active is False:
        revoke_all_refresh_tokens(db, target.id)
    db.commit()
    return target


@router.post("/{user_id}/reset-password", response_model=ResetPasswordOut)
def reset_password(user_id: uuid.UUID, actor: User = Depends(manager), db: Session = Depends(get_db)):
    target = get_scoped(db, User, user_id, actor.org_id, "User")
    _assert_can_manage(actor, target.role, target)
    temp = secrets.token_urlsafe(9)
    target.password_hash = hash_password(temp)
    target.must_change_password = True
    target.failed_attempts = 0
    target.locked_until = None
    revoke_all_refresh_tokens(db, target.id)
    db.commit()
    return ResetPasswordOut(temporary_password=temp)
