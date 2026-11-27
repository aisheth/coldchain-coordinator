import uuid

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db import get_db
from .errors import Forbidden, Unauthorized
from .models import User
from .security import decode_access_token

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> User:
    """Token -> user. Role/active flag are read from the DB, so changes apply immediately."""
    if creds is None:
        raise Unauthorized("Not authenticated")
    try:
        payload = decode_access_token(creds.credentials)
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise Unauthorized("Invalid or expired token", "invalid_token")
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise Unauthorized("Account is inactive", "inactive_account")
    return user


def current_user(user: User = Depends(get_current_user)) -> User:
    if user.must_change_password:
        raise Forbidden("You must change your password first", "password_change_required")
    return user


def require_roles(*roles: str):
    def dependency(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise Forbidden("You do not have permission for this action")
        return user

    return dependency
