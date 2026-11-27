from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Organization, Uom, User
from .security import hash_password

# (code, name, symbol, allows_decimal)
DEFAULT_UOMS = [
    ("NOS", "Numbers", "Nos", False), ("SET", "Set", "Set", False), ("PAIR", "Pair", "Pair", False),
    ("BOX", "Box", "Box", False), ("ROLL", "Roll", "Roll", False), ("BUNDLE", "Bundle", "Bundle", False),
    ("PKT", "Packet", "Pkt", False),
    ("M", "Metre", "m", True), ("MM", "Millimetre", "mm", True), ("CM", "Centimetre", "cm", True),
    ("FT", "Foot", "ft", True), ("IN", "Inch", "in", True), ("KG", "Kilogram", "kg", True),
    ("G", "Gram", "g", True), ("L", "Litre", "L", True), ("SQM", "Square metre", "sq m", True),
]


def seed_uoms(db: Session) -> None:
    """System-wide units (org_id NULL). Safe to run repeatedly."""
    existing = set(db.scalars(select(Uom.code).where(Uom.org_id.is_(None))))
    for code, name, symbol, decimal in DEFAULT_UOMS:
        if code not in existing:
            db.add(Uom(org_id=None, code=code, name=name, symbol=symbol, allows_decimal=decimal))
    db.flush()


def create_owner(db: Session, org_name: str, username: str, password: str, name: str,
                 email: str | None = None) -> User:
    org = Organization(name=org_name)
    db.add(org)
    db.flush()
    user = User(org_id=org.id, username=username.lower(), email=email.lower() if email else None, name=name,
                role="owner", password_hash=hash_password(password), must_change_password=False)
    db.add(user)
    db.flush()
    return user
