import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer

# Decimals are stored exactly but sent to the frontend as plain JSON numbers.
Qty = Annotated[Decimal, PlainSerializer(lambda v: float(v), return_type=float, when_used="json")]
PositiveQty = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=3)]
NonNegQty = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=3)]

T = TypeVar("T")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


# ------------------------------------------------------------------ auth & users
Role = Literal["owner", "admin", "worker"]


class LoginIn(BaseModel):
    identifier: str  # username or email
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    must_change_password: bool = False


class UserOut(ORM):
    id: uuid.UUID
    org_id: uuid.UUID
    username: str
    email: str | None
    name: str
    phone: str | None
    role: Role
    is_active: bool
    must_change_password: bool


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9._-]+$")
    name: str = Field(min_length=1, max_length=200)
    role: Role
    password: str = Field(min_length=8, max_length=128)
    email: str | None = Field(default=None, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    phone: str | None = None


class UserPatch(BaseModel):
    name: str | None = None
    phone: str | None = None
    email: str | None = Field(default=None, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    role: Role | None = None
    is_active: bool | None = None


class ResetPasswordOut(BaseModel):
    temporary_password: str


# ------------------------------------------------------------------ parties & projects
class CustomerIn(BaseModel):
    name: str = Field(min_length=1)
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None


class CustomerPatch(BaseModel):
    name: str | None = None
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    is_active: bool | None = None


class CustomerOut(ORM, CustomerIn):
    id: uuid.UUID
    is_active: bool


class VendorIn(BaseModel):
    name: str = Field(min_length=1)
    contact_person: str | None = None
    phone: str | None = None
    address: str | None = None


class VendorPatch(BaseModel):
    name: str | None = None
    contact_person: str | None = None
    phone: str | None = None
    address: str | None = None
    is_active: bool | None = None


class VendorOut(ORM, VendorIn):
    id: uuid.UUID
    is_active: bool


class ProjectIn(BaseModel):
    customer_id: uuid.UUID
    name: str = Field(min_length=1)
    site_address: str | None = None
    contact_person: str | None = None
    contact_phone: str | None = None
    order_date: date | None = None
    expected_deployment_date: date | None = None


class ProjectPatch(BaseModel):
    name: str | None = None
    site_address: str | None = None
    contact_person: str | None = None
    contact_phone: str | None = None
    order_date: date | None = None
    expected_deployment_date: date | None = None
    status: Literal["active", "on_hold", "closed"] | None = None


class ProjectOut(ORM, ProjectIn):
    id: uuid.UUID
    status: str


# ------------------------------------------------------------------ catalogue
class UomIn(BaseModel):
    code: str = Field(min_length=1, max_length=30)
    name: str
    symbol: str = Field(max_length=15)
    allows_decimal: bool = False


class UomOut(ORM, UomIn):
    id: uuid.UUID


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class CategoryPatch(BaseModel):
    name: str | None = None
    is_active: bool | None = None


class CategoryOut(ORM, CategoryIn):
    id: uuid.UUID
    is_active: bool


class SizeOptionIn(BaseModel):
    """Either (value + uom_id) -> label is generated, or a plain label for non-numeric sizes."""
    label: str | None = Field(default=None, max_length=60)
    value: PositiveQty | None = None
    uom_id: uuid.UUID | None = None


class SizeOptionPatch(BaseModel):
    is_active: bool


class SizeOptionOut(ORM):
    id: uuid.UUID
    label: str
    value: Qty | None
    uom_id: uuid.UUID | None
    is_active: bool


FieldType = Literal["text", "number", "select", "bool"]


class FieldDefIn(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    field_type: FieldType
    options: list[str] | None = None
    is_required: bool = False
    sort_order: int = 0


class FieldDefPatch(BaseModel):
    label: str | None = None
    options: list[str] | None = None
    is_required: bool | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class FieldDefOut(ORM):
    id: uuid.UUID
    key: str
    label: str
    field_type: FieldType
    options: list[str] | None
    is_required: bool
    sort_order: int
    is_active: bool


class ItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    category_id: uuid.UUID | None = None
    description: str | None = None
    force: bool = False  # create even if a similar name exists


class ItemPatch(BaseModel):
    name: str | None = None
    category_id: uuid.UUID | None = None
    description: str | None = None
    is_active: bool | None = None


class VariantIn(BaseModel):
    size_option_id: uuid.UUID | None = None
    uom_id: uuid.UUID
    sku: str | None = Field(default=None, max_length=60)
    description: str | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)


class VariantPatch(BaseModel):
    size_option_id: uuid.UUID | None = None
    uom_id: uuid.UUID | None = None
    sku: str | None = None
    description: str | None = None
    attributes: dict[str, Any] | None = None
    is_active: bool | None = None


class VariantOut(BaseModel):
    id: uuid.UUID
    item_id: uuid.UUID
    item_name: str
    category_name: str | None
    display_name: str  # e.g. "Copper Wire - 5 m"
    sku: str | None
    description: str | None
    size_option_id: uuid.UUID | None
    size_label: str | None
    uom_id: uuid.UUID
    uom_code: str
    uom_symbol: str
    allows_decimal: bool
    attributes: dict[str, Any]
    is_active: bool


class ItemOut(BaseModel):
    id: uuid.UUID
    name: str
    category_id: uuid.UUID | None
    category_name: str | None
    description: str | None
    is_active: bool
    variants: list[VariantOut]
    similar_items: list[str] = []  # populated only on create when names look alike


# ------------------------------------------------------------------ procurement requests
class RequestIn(BaseModel):
    project_id: uuid.UUID
    notes: str | None = None


class RequestPatch(BaseModel):
    notes: str | None = None


class LineIn(BaseModel):
    variant_id: uuid.UUID
    required_qty: PositiveQty
    remarks: str | None = None


class BulkLinesIn(BaseModel):
    lines: list[LineIn] = Field(min_length=1)


class LinePatch(BaseModel):
    required_qty: PositiveQty | None = None
    remarks: str | None = None


class LineOut(BaseModel):
    id: uuid.UUID
    variant: VariantOut
    required_qty: Qty
    remarks: str | None


class RequestOut(BaseModel):
    id: uuid.UUID
    code: str
    project_id: uuid.UUID
    status: str
    progress: str  # draft | finalized | in_progress | completed | cancelled
    notes: str | None
    created_at: datetime
    lines: list[LineOut]


class RequestSummaryOut(BaseModel):
    id: uuid.UUID
    code: str
    project_id: uuid.UUID
    status: str
    progress: str
    line_count: int
    created_at: datetime


# ------------------------------------------------------------------ assignments
class AssignmentIn(BaseModel):
    worker_id: uuid.UUID
    vendor_id: uuid.UUID
    delivery_location: str | None = None  # defaults to the project's site address
    instructions: str | None = None
    due_date: date | None = None
    requires_approval: bool | None = None  # defaults to the organisation setting


class AssignmentPatch(BaseModel):
    vendor_id: uuid.UUID | None = None
    delivery_location: str | None = None
    instructions: str | None = None
    due_date: date | None = None
    requires_approval: bool | None = None


class TransitionIn(BaseModel):
    to_status: str
    remarks: str | None = None
    attachment_ids: list[uuid.UUID] = Field(default_factory=list)


FulfilmentStatus = Literal["pending", "available", "unavailable", "substituted"]


class ItemUpdateIn(BaseModel):
    fulfilment_status: FulfilmentStatus | None = None
    qty_procured: NonNegQty | None = None
    qty_delivered: NonNegQty | None = None
    remarks: str | None = None
    substitute_variant_id: uuid.UUID | None = None


IssueType = Literal[
    "material_unavailable", "price_issue", "vendor_delay", "vehicle_issue",
    "quality_issue", "cannot_take_task", "other",
]


class IssueIn(BaseModel):
    type: IssueType
    description: str = Field(min_length=1)
    item_id: uuid.UUID | None = None
    blocks_progress: bool = True
    attachment_ids: list[uuid.UUID] = Field(default_factory=list)


class ResolveIn(BaseModel):
    resolution: str = Field(min_length=1)


class ReasonIn(BaseModel):
    reason: str = Field(min_length=1)


class ReassignIn(BaseModel):
    worker_id: uuid.UUID
    reason: str = Field(min_length=1)


class DeliveredItemIn(BaseModel):
    item_id: uuid.UUID
    qty_delivered: NonNegQty


class DeliveryIn(BaseModel):
    delivered_at: datetime | None = None
    recipient_name: str | None = None
    remarks: str | None = None
    attachment_ids: list[uuid.UUID] = Field(default_factory=list)
    items: list[DeliveredItemIn] = Field(default_factory=list)  # omitted lines default to qty_procured


class CompleteIn(BaseModel):
    shortfall_action: Literal["close", "follow_up"] | None = None


class AttachmentOut(ORM):
    id: uuid.UUID
    filename: str
    mime: str
    size: int


class AssignmentItemOut(BaseModel):
    id: uuid.UUID
    request_item_id: uuid.UUID
    variant: VariantOut
    allocated_qty: Qty
    fulfilment_status: str
    qty_procured: Qty
    qty_delivered: Qty
    remarks: str | None
    substitute_variant: VariantOut | None


class HistoryOut(BaseModel):
    id: uuid.UUID
    from_status: str | None
    to_status: str
    changed_by: uuid.UUID
    changed_by_name: str
    changed_at: datetime
    remarks: str | None
    attachments: list[AttachmentOut]


class IssueOut(BaseModel):
    id: uuid.UUID
    assignment_id: uuid.UUID
    assignment_item_id: uuid.UUID | None
    type: str
    description: str
    blocks_progress: bool
    status: str
    raised_by: uuid.UUID
    raised_by_name: str
    raised_at: datetime
    resolved_at: datetime | None
    resolution: str | None
    attachments: list[AttachmentOut]


class DeliveryOut(BaseModel):
    delivered_at: datetime
    recipient_name: str | None
    remarks: str | None
    confirmed_at: datetime | None
    attachments: list[AttachmentOut]


class AssignmentSummaryOut(BaseModel):
    id: uuid.UUID
    request_id: uuid.UUID
    request_code: str
    project_id: uuid.UUID
    project_name: str
    worker_id: uuid.UUID
    worker_name: str
    vendor_id: uuid.UUID
    vendor_name: str
    status: str
    is_on_hold: bool
    is_overdue: bool
    due_date: date | None
    assigned_at: datetime


class AssignmentDetailOut(AssignmentSummaryOut):
    delivery_location: str | None
    instructions: str | None
    requires_approval: bool
    replaced_by_id: uuid.UUID | None
    cancel_reason: str | None
    items: list[AssignmentItemOut]
    history: list[HistoryOut]
    issues: list[IssueOut]
    delivery: DeliveryOut | None
    allowed_transitions: list[str]
    can_cancel: bool
    can_reassign: bool


class CompletionOut(BaseModel):
    assignment: AssignmentDetailOut
    follow_up_request_id: uuid.UUID | None = None
    follow_up_request_code: str | None = None


class NotificationOut(ORM):
    id: uuid.UUID
    type: str
    payload: dict[str, Any]
    entity_type: str | None
    entity_id: uuid.UUID | None
    created_at: datetime
    read_at: datetime | None


class OrgSettingsOut(BaseModel):
    organization_name: str
    require_owner_approval: bool
    require_delivery_photo: bool


class OrgSettingsPatch(BaseModel):
    require_owner_approval: bool | None = None
    require_delivery_photo: bool | None = None
