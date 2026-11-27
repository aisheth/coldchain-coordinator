from datetime import timedelta

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..deps import get_current_user
from ..errors import Unauthorized
from ..models import RefreshToken, User, utcnow
from ..schemas import ChangePasswordIn, LoginIn, RefreshIn, TokenOut, UserOut
from ..security import (
    create_access_token, hash_password, hash_refresh, new_refresh_token, verify_password,
)
from ..utils import aware

router = APIRouter(prefix="/auth", tags=["auth"])

MAX_FAILED_ATTEMPTS = 5
LOCK_MINUTES = 10


def issue_tokens(db: Session, user: User) -> TokenOut:
    raw, hashed = new_refresh_token()
    db.add(RefreshToken(
        user_id=user.id, token_hash=hashed,
        expires_at=utcnow() + timedelta(days=settings.refresh_token_days),
    ))
    db.commit()
    return TokenOut(
        access_token=create_access_token(user.id, user.org_id, user.role),
        refresh_token=raw,
        must_change_password=user.must_change_password,
    )


def revoke_all_refresh_tokens(db: Session, user_id) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    ident = body.identifier.strip().lower()
    column = User.email if "@" in ident else User.username
    user = db.scalar(select(User).where(column == ident))
    if user is None or not user.is_active or not user.password_hash:
        raise Unauthorized("Invalid username/email or password", "invalid_credentials")
    if user.locked_until and aware(user.locked_until) > utcnow():
        raise Unauthorized("Too many failed attempts. Try again later.", "account_locked")
    if not verify_password(body.password, user.password_hash):
        user.failed_attempts += 1
        if user.failed_attempts >= MAX_FAILED_ATTEMPTS:
            user.locked_until = utcnow() + timedelta(minutes=LOCK_MINUTES)
            user.failed_attempts = 0
        db.commit()
        raise Unauthorized("Invalid username/email or password", "invalid_credentials")
    user.failed_attempts = 0
    user.locked_until = None
    user.last_login_at = utcnow()
    return issue_tokens(db, user)


@router.post("/refresh", response_model=TokenOut)
def refresh(body: RefreshIn, db: Session = Depends(get_db)):
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_refresh(body.refresh_token)))
    if token is None:
        raise Unauthorized("Invalid refresh token", "invalid_token")
    if token.revoked_at is not None:
        # A rotated token being replayed suggests theft: kill every session for this user.
        revoke_all_refresh_tokens(db, token.user_id)
        db.commit()
        raise Unauthorized("Refresh token already used", "invalid_token")
    if aware(token.expires_at) < utcnow():
        raise Unauthorized("Refresh token expired", "invalid_token")
    user = db.get(User, token.user_id)
    if user is None or not user.is_active:
        raise Unauthorized("Account is inactive", "inactive_account")
    token.revoked_at = utcnow()  # rotation
    return issue_tokens(db, user)


@router.post("/logout", status_code=204)
def logout(body: RefreshIn, db: Session = Depends(get_db)):
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_refresh(body.refresh_token)))
    if token and token.revoked_at is None:
        token.revoked_at = utcnow()
        db.commit()
    return Response(status_code=204)


@router.post("/change-password", response_model=TokenOut)
def change_password(body: ChangePasswordIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.password_hash or not verify_password(body.current_password, user.password_hash):
        raise Unauthorized("Current password is incorrect", "invalid_credentials")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    revoke_all_refresh_tokens(db, user.id)
    return issue_tokens(db, user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
