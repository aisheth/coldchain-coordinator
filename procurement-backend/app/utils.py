import re
from datetime import datetime, timezone

from sqlalchemy import func, select

from .errors import NotFound


def get_scoped(db, model, obj_id, org_id, label: str | None = None):
    """Fetch by id and make sure it belongs to the caller's organisation (tenancy guard)."""
    obj = db.get(model, obj_id)
    if obj is None or getattr(obj, "org_id", None) != org_id:
        raise NotFound(f"{label or model.__name__} not found")
    return obj


def aware(dt: datetime | None) -> datetime | None:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def paginate(db, stmt, limit: int, offset: int):
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    rows = db.scalars(stmt.limit(limit).offset(offset)).unique().all()
    return rows, total


def apply_fields(obj, data, fields: set[str] | None = None):
    """Copy only the fields the client actually sent (PATCH semantics)."""
    for key in data.model_fields_set:
        if fields is None or key in fields:
            setattr(obj, key, getattr(data, key))


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    if slug and slug[0].isdigit():
        slug = "f_" + slug
    return slug
