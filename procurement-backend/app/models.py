"""All database tables. JSONB on Postgres, plain JSON elsewhere (SQLite is only used in quick tests)."""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

JSONType = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Idd:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


def fk(table: str, nullable: bool = False) -> Mapped:
    return mapped_column(Uuid, ForeignKey(f"{table}.id"), nullable=nullable, index=True)


def ts() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), default=utcnow)


# ---------------------------------------------------------------- tenancy & users
class Organization(Idd, Base):
    __tablename__ = "organization"
    name: Mapped[str] = mapped_column(String(200))
    settings: Mapped[dict] = mapped_column(
        JSONType, default=lambda: {"require_owner_approval": False, "require_delivery_photo": True}
    )
    request_counter: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = ts()


class User(Idd, Base):
    __tablename__ = "app_user"  # "user" is a reserved word in Postgres
    org_id: Mapped[uuid.UUID] = fk("organization")
    username: Mapped[str] = mapped_column(String(50), unique=True)  # stored lowercase
    email: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True)  # stored lowercase
    name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(30))
    password_hash: Mapped[str | None] = mapped_column(String(300), nullable=True)
    role: Mapped[str] = mapped_column(String(20))  # owner | admin | worker
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = ts()


class RefreshToken(Idd, Base):
    __tablename__ = "refresh_token"
    user_id: Mapped[uuid.UUID] = fk("app_user")
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = ts()


# ---------------------------------------------------------------- parties & projects
class Customer(Idd, Base):
    __tablename__ = "customer"
    org_id: Mapped[uuid.UUID] = fk("organization")
    name: Mapped[str] = mapped_column(String(200))
    contact_person: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = ts()


class Vendor(Idd, Base):
    __tablename__ = "vendor"
    org_id: Mapped[uuid.UUID] = fk("organization")
    name: Mapped[str] = mapped_column(String(200))
    contact_person: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(30))
    address: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = ts()


class Project(Idd, Base):
    __tablename__ = "project"
    org_id: Mapped[uuid.UUID] = fk("organization")
    customer_id: Mapped[uuid.UUID] = fk("customer")
    name: Mapped[str] = mapped_column(String(200))
    site_address: Mapped[str | None] = mapped_column(Text)
    contact_person: Mapped[str | None] = mapped_column(String(200))
    contact_phone: Mapped[str | None] = mapped_column(String(30))
    order_date: Mapped[date | None] = mapped_column(Date)
    expected_deployment_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | on_hold | closed
    created_at: Mapped[datetime] = ts()


# ---------------------------------------------------------------- catalogue
class Uom(Idd, Base):
    __tablename__ = "uom"
    org_id: Mapped[uuid.UUID | None] = fk("organization", nullable=True)  # NULL = system seed
    code: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(60))
    symbol: Mapped[str] = mapped_column(String(15))
    allows_decimal: Mapped[bool] = mapped_column(Boolean, default=False)


class ItemCategory(Idd, Base):
    __tablename__ = "item_category"
    org_id: Mapped[uuid.UUID] = fk("organization")
    name: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (UniqueConstraint("org_id", "name"),)


class SizeOption(Idd, Base):
    __tablename__ = "size_option"
    org_id: Mapped[uuid.UUID] = fk("organization")
    label: Mapped[str] = mapped_column(String(60))
    value: Mapped[Decimal | None] = mapped_column(Numeric(12, 3), nullable=True)
    uom_id: Mapped[uuid.UUID | None] = fk("uom", nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (UniqueConstraint("org_id", "label"),)


class ItemFieldDefinition(Idd, Base):
    __tablename__ = "item_field_definition"
    org_id: Mapped[uuid.UUID] = fk("organization")
    key: Mapped[str] = mapped_column(String(60))
    label: Mapped[str] = mapped_column(String(100))
    field_type: Mapped[str] = mapped_column(String(20))  # text | number | select | bool
    options: Mapped[list | None] = mapped_column(JSONType, nullable=True)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    applies_to: Mapped[str] = mapped_column(String(20), default="variant")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (UniqueConstraint("org_id", "key"),)


class Item(Idd, Base):
    __tablename__ = "item"
    org_id: Mapped[uuid.UUID] = fk("organization")
    category_id: Mapped[uuid.UUID | None] = fk("item_category", nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = ts()
    category: Mapped["ItemCategory | None"] = relationship(lazy="joined")
    variants: Mapped[list["ItemVariant"]] = relationship(
        back_populates="item", lazy="selectin", order_by="ItemVariant.created_at"
    )


class ItemVariant(Idd, Base):
    __tablename__ = "item_variant"
    org_id: Mapped[uuid.UUID] = fk("organization")
    item_id: Mapped[uuid.UUID] = fk("item")
    size_option_id: Mapped[uuid.UUID | None] = fk("size_option", nullable=True)
    uom_id: Mapped[uuid.UUID] = fk("uom")
    sku: Mapped[str | None] = mapped_column(String(60), nullable=True)
    description: Mapped[str | None] = mapped_column(Text)
    attributes: Mapped[dict] = mapped_column(JSONType, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = ts()
    item: Mapped["Item"] = relationship(back_populates="variants", lazy="joined")
    size_option: Mapped["SizeOption | None"] = relationship(lazy="joined")
    uom: Mapped["Uom"] = relationship(lazy="joined")
    __table_args__ = (UniqueConstraint("org_id", "sku"),)  # NULL skus never collide


# ---------------------------------------------------------------- procurement requests
class ProcurementRequest(Idd, Base):
    __tablename__ = "procurement_request"
    org_id: Mapped[uuid.UUID] = fk("organization")
    project_id: Mapped[uuid.UUID] = fk("project")
    code: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | finalized | cancelled
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = fk("app_user")
    created_at: Mapped[datetime] = ts()
    lines: Mapped[list["ProcurementRequestItem"]] = relationship(
        back_populates="request", cascade="all, delete-orphan", lazy="selectin",
        order_by="ProcurementRequestItem.created_at",
    )
    __table_args__ = (UniqueConstraint("org_id", "code"),)


class ProcurementRequestItem(Idd, Base):
    __tablename__ = "procurement_request_item"
    request_id: Mapped[uuid.UUID] = fk("procurement_request")
    variant_id: Mapped[uuid.UUID] = fk("item_variant")
    required_qty: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    remarks: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = ts()
    request: Mapped["ProcurementRequest"] = relationship(back_populates="lines")
    variant: Mapped["ItemVariant"] = relationship(lazy="joined")
    __table_args__ = (
        UniqueConstraint("request_id", "variant_id", name="uq_request_variant"),  # the dropdown rule
        CheckConstraint("required_qty > 0", name="ck_required_qty_positive"),
    )


class RequestItemChange(Idd, Base):
    __tablename__ = "request_item_change"
    request_id: Mapped[uuid.UUID] = fk("procurement_request")
    request_item_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)  # survives line deletion
    action: Mapped[str] = mapped_column(String(10))  # add | update | remove
    before: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    changed_by: Mapped[uuid.UUID] = fk("app_user")
    changed_at: Mapped[datetime] = ts()


# ---------------------------------------------------------------- assignments
class Assignment(Idd, Base):
    __tablename__ = "procurement_assignment"
    org_id: Mapped[uuid.UUID] = fk("organization")
    request_id: Mapped[uuid.UUID] = fk("procurement_request")
    project_id: Mapped[uuid.UUID] = fk("project")
    worker_id: Mapped[uuid.UUID] = fk("app_user")
    vendor_id: Mapped[uuid.UUID] = fk("vendor")
    delivery_location: Mapped[str | None] = mapped_column(Text)
    instructions: Mapped[str | None] = mapped_column(Text)
    assigned_at: Mapped[datetime] = ts()
    due_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(30), default="assigned")
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=False)
    replaced_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = fk("app_user")
    items: Mapped[list["AssignmentItem"]] = relationship(
        back_populates="assignment", cascade="all, delete-orphan", lazy="selectin",
        order_by="AssignmentItem.created_at",
    )


class AssignmentItem(Idd, Base):
    __tablename__ = "assignment_item"
    assignment_id: Mapped[uuid.UUID] = fk("procurement_assignment")
    request_item_id: Mapped[uuid.UUID] = fk("procurement_request_item")
    allocated_qty: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    fulfilment_status: Mapped[str] = mapped_column(String(20), default="pending")
    qty_procured: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=0)
    qty_delivered: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=0)
    unit_cost: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)  # reserved, unused in v1
    substitute_variant_id: Mapped[uuid.UUID | None] = fk("item_variant", nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = ts()
    assignment: Mapped["Assignment"] = relationship(back_populates="items")
    request_item: Mapped["ProcurementRequestItem"] = relationship(lazy="joined")
    substitute_variant: Mapped["ItemVariant | None"] = relationship(
        foreign_keys=[substitute_variant_id], lazy="selectin"
    )
    __table_args__ = (
        CheckConstraint("allocated_qty > 0", name="ck_alloc_positive"),
        CheckConstraint("qty_procured >= 0 AND qty_procured <= allocated_qty", name="ck_procured_bounds"),
        CheckConstraint("qty_delivered >= 0 AND qty_delivered <= qty_procured", name="ck_delivered_bounds"),
    )


class StatusHistory(Idd, Base):
    __tablename__ = "status_history"
    assignment_id: Mapped[uuid.UUID] = fk("procurement_assignment")
    from_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    to_status: Mapped[str] = mapped_column(String(30))
    changed_by: Mapped[uuid.UUID] = fk("app_user")
    changed_at: Mapped[datetime] = ts()
    remarks: Mapped[str | None] = mapped_column(Text)


class Issue(Idd, Base):
    __tablename__ = "issue"
    assignment_id: Mapped[uuid.UUID] = fk("procurement_assignment")
    assignment_item_id: Mapped[uuid.UUID | None] = fk("assignment_item", nullable=True)
    type: Mapped[str] = mapped_column(String(30))
    description: Mapped[str] = mapped_column(Text)
    blocks_progress: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(10), default="open")  # open | resolved
    raised_by: Mapped[uuid.UUID] = fk("app_user")
    raised_at: Mapped[datetime] = ts()
    resolved_by: Mapped[uuid.UUID | None] = fk("app_user", nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution: Mapped[str | None] = mapped_column(Text)


class DeliveryConfirmation(Idd, Base):
    __tablename__ = "delivery_confirmation"
    assignment_id: Mapped[uuid.UUID] = fk("procurement_assignment")
    delivered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    recipient_name: Mapped[str | None] = mapped_column(String(200))
    remarks: Mapped[str | None] = mapped_column(Text)
    delivered_by: Mapped[uuid.UUID] = fk("app_user")
    confirmed_by: Mapped[uuid.UUID | None] = fk("app_user", nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Attachment(Idd, Base):
    __tablename__ = "attachment"
    org_id: Mapped[uuid.UUID] = fk("organization")
    storage_key: Mapped[str] = mapped_column(String(300))
    filename: Mapped[str] = mapped_column(String(255))
    mime: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer)
    uploaded_by: Mapped[uuid.UUID] = fk("app_user")
    owner_type: Mapped[str | None] = mapped_column(String(30), nullable=True)  # status_history | issue | delivery
    owner_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = ts()


class Notification(Idd, Base):
    __tablename__ = "notification"
    org_id: Mapped[uuid.UUID] = fk("organization")
    user_id: Mapped[uuid.UUID] = fk("app_user")
    type: Mapped[str] = mapped_column(String(40))
    payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    entity_type: Mapped[str | None] = mapped_column(String(30))
    entity_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = ts()
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
