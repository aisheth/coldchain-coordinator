import uuid
from difflib import SequenceMatcher
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import ConfigDict, Field, StrictBool, StrictStr, ValidationError, create_model
from sqlalchemy import exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, require_roles
from ..errors import BadRequest, Conflict
from ..models import (
    Item, ItemCategory, ItemFieldDefinition, ItemVariant, ProcurementRequest,
    ProcurementRequestItem, SizeOption, Uom, User,
)
from ..serializers import variant_out
from ..schemas import (
    CategoryIn, CategoryOut, CategoryPatch, FieldDefIn, FieldDefOut, FieldDefPatch, ItemIn, ItemOut,
    ItemPatch, Page, SizeOptionIn, SizeOptionOut, SizeOptionPatch, UomIn, UomOut, VariantIn,
    VariantOut, VariantPatch,
)
from ..utils import apply_fields, get_scoped, paginate, slugify

router = APIRouter(tags=["catalogue"])
editor = require_roles("owner", "admin")  # who may edit master data


# ------------------------------------------------------------------ serializers
def item_out(item: Item, similar: list[str] | None = None) -> ItemOut:
    return ItemOut(
        id=item.id, name=item.name, category_id=item.category_id,
        category_name=item.category.name if item.category else None,
        description=item.description, is_active=item.is_active,
        variants=[variant_out(v) for v in item.variants], similar_items=similar or [],
    )


# ------------------------------------------------------------------ units of measure
@router.get("/uom", response_model=list[UomOut])
def list_uom(user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Uom).where(or_(Uom.org_id.is_(None), Uom.org_id == user.org_id)).order_by(Uom.name)
    return db.scalars(stmt).all()


@router.post("/uom", response_model=UomOut, status_code=201)
def create_uom(body: UomIn, user: User = Depends(editor), db: Session = Depends(get_db)):
    taken = db.scalar(select(Uom.id).where(
        func.lower(Uom.code) == body.code.lower(), or_(Uom.org_id.is_(None), Uom.org_id == user.org_id)))
    if taken:
        raise Conflict("A unit with this code already exists", "uom_exists")
    uom = Uom(org_id=user.org_id, **body.model_dump())
    db.add(uom)
    db.commit()
    return uom


def _get_uom(db: Session, uom_id: uuid.UUID, org_id) -> Uom:
    uom = db.get(Uom, uom_id)
    if uom is None or uom.org_id not in (None, org_id):
        raise BadRequest("Unknown unit of measure", "invalid_uom")
    return uom


# ------------------------------------------------------------------ categories
@router.get("/item-categories", response_model=list[CategoryOut])
def list_categories(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(ItemCategory).where(ItemCategory.org_id == user.org_id).order_by(ItemCategory.name)).all()


@router.post("/item-categories", response_model=CategoryOut, status_code=201)
def create_category(body: CategoryIn, user: User = Depends(editor), db: Session = Depends(get_db)):
    if db.scalar(select(ItemCategory.id).where(
            ItemCategory.org_id == user.org_id, func.lower(ItemCategory.name) == body.name.lower())):
        raise Conflict("Category already exists", "category_exists")
    cat = ItemCategory(org_id=user.org_id, name=body.name.strip())
    db.add(cat)
    db.commit()
    return cat


@router.patch("/item-categories/{category_id}", response_model=CategoryOut)
def update_category(category_id: uuid.UUID, body: CategoryPatch, user: User = Depends(editor), db: Session = Depends(get_db)):
    cat = get_scoped(db, ItemCategory, category_id, user.org_id, "Category")
    apply_fields(cat, body)
    db.commit()
    return cat


# ------------------------------------------------------------------ size options (controlled vocabulary)
@router.get("/size-options", response_model=list[SizeOptionOut])
def list_size_options(active: bool | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(SizeOption).where(SizeOption.org_id == user.org_id).order_by(SizeOption.label)
    if active is not None:
        stmt = stmt.where(SizeOption.is_active.is_(active))
    return db.scalars(stmt).all()


@router.post("/size-options", response_model=SizeOptionOut, status_code=201)
def create_size_option(body: SizeOptionIn, user: User = Depends(editor), db: Session = Depends(get_db)):
    if body.value is not None:
        if body.uom_id is None:
            raise BadRequest("A numeric size needs a unit", "size_unit_required")
        uom = _get_uom(db, body.uom_id, user.org_id)
        label = f"{body.value.normalize():f} {uom.symbol}"  # generated, so it can't be misspelled
    elif body.label and body.label.strip():
        label = " ".join(body.label.split())
    else:
        raise BadRequest("Provide either a value with a unit, or a label", "size_required")
    existing = db.scalar(select(SizeOption).where(
        SizeOption.org_id == user.org_id, func.lower(SizeOption.label) == label.lower()))
    if existing:
        raise Conflict(f"Size '{label}' already exists", "size_exists", {"id": str(existing.id)})
    size = SizeOption(org_id=user.org_id, label=label, value=body.value, uom_id=body.uom_id)
    db.add(size)
    db.commit()
    return size


@router.patch("/size-options/{size_id}", response_model=SizeOptionOut)
def update_size_option(size_id: uuid.UUID, body: SizeOptionPatch, user: User = Depends(editor), db: Session = Depends(get_db)):
    size = get_scoped(db, SizeOption, size_id, user.org_id, "Size option")
    size.is_active = body.is_active
    db.commit()
    return size


# ------------------------------------------------------------------ custom field definitions
@router.get("/item-field-definitions", response_model=list[FieldDefOut])
def list_field_defs(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(ItemFieldDefinition).where(ItemFieldDefinition.org_id == user.org_id)
                      .order_by(ItemFieldDefinition.sort_order, ItemFieldDefinition.label)).all()


@router.post("/item-field-definitions", response_model=FieldDefOut, status_code=201)
def create_field_def(body: FieldDefIn, user: User = Depends(editor), db: Session = Depends(get_db)):
    key = slugify(body.label)
    if not key:
        raise BadRequest("Label must contain letters or digits", "invalid_label")
    if body.field_type == "select" and not body.options:
        raise BadRequest("Select fields need at least one option", "options_required")
    if db.scalar(select(ItemFieldDefinition.id).where(
            ItemFieldDefinition.org_id == user.org_id, ItemFieldDefinition.key == key)):
        raise Conflict(f"A field with key '{key}' already exists", "field_exists")
    definition = ItemFieldDefinition(
        org_id=user.org_id, key=key, label=body.label, field_type=body.field_type,
        options=[o.strip() for o in body.options] if body.options else None,
        is_required=body.is_required, sort_order=body.sort_order,
    )
    db.add(definition)
    db.commit()
    return definition


@router.patch("/item-field-definitions/{field_id}", response_model=FieldDefOut)
def update_field_def(field_id: uuid.UUID, body: FieldDefPatch, user: User = Depends(editor), db: Session = Depends(get_db)):
    definition = get_scoped(db, ItemFieldDefinition, field_id, user.org_id, "Field definition")
    if body.options is not None:
        if definition.field_type != "select":
            raise BadRequest("Only select fields have options", "invalid_options")
        missing = set(definition.options or []) - set(body.options)
        if missing:  # removing an option could orphan stored values: add-only
            raise Conflict("Options can be added but not removed", "options_add_only", {"missing": sorted(missing)})
    apply_fields(definition, body, {"label", "options", "is_required", "sort_order", "is_active"})
    db.commit()
    return definition


# ------------------------------------------------------------------ dynamic attribute validation
_TYPES = {"text": StrictStr, "number": float, "bool": StrictBool}


def validate_attributes(db: Session, org_id, attributes: dict) -> dict:
    """Build a Pydantic model from this org's active field definitions and validate against it."""
    definitions = db.scalars(select(ItemFieldDefinition).where(
        ItemFieldDefinition.org_id == org_id, ItemFieldDefinition.is_active.is_(True),
        ItemFieldDefinition.applies_to == "variant")).all()
    fields = {}
    for i, d in enumerate(definitions):
        py_type = Literal[tuple(d.options)] if d.field_type == "select" else _TYPES[d.field_type]
        if d.is_required:
            fields[f"f{i}"] = (py_type, Field(..., alias=d.key))
        else:
            fields[f"f{i}"] = (Optional[py_type], Field(None, alias=d.key))
    model = create_model("VariantAttributes", __config__=ConfigDict(extra="forbid"), **fields)
    try:
        return model.model_validate(attributes).model_dump(by_alias=True, exclude_none=True)
    except ValidationError as exc:
        problems = [{"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"]} for e in exc.errors()]
        raise BadRequest("Invalid item attributes", "invalid_attributes", problems)


# ------------------------------------------------------------------ items
def _similar_names(db: Session, org_id, name: str, exclude_id=None) -> list[str]:
    names = db.scalars(select(Item.name).where(Item.org_id == org_id, Item.is_active.is_(True))).all()
    target = name.lower().strip()
    return [n for n in names if n.lower() != target and SequenceMatcher(None, n.lower(), target).ratio() >= 0.85]


@router.get("/items", response_model=Page[ItemOut])
def list_items(
    q: str | None = None, category_id: uuid.UUID | None = None, active: bool | None = True,
    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
    user: User = Depends(require_roles("owner", "admin")), db: Session = Depends(get_db),
):
    stmt = select(Item).where(Item.org_id == user.org_id).order_by(Item.name)
    if q:
        stmt = stmt.where(Item.name.ilike(f"%{q}%"))
    if category_id:
        stmt = stmt.where(Item.category_id == category_id)
    if active is not None:
        stmt = stmt.where(Item.is_active.is_(active))
    rows, total = paginate(db, stmt, limit, offset)
    return Page(items=[item_out(i) for i in rows], total=total, limit=limit, offset=offset)


@router.post("/items", response_model=ItemOut, status_code=201)
def create_item(body: ItemIn, user: User = Depends(editor), db: Session = Depends(get_db)):
    name = " ".join(body.name.split())
    if db.scalar(select(Item.id).where(Item.org_id == user.org_id, func.lower(Item.name) == name.lower())):
        raise Conflict("An item with this name already exists", "item_exists")
    similar = _similar_names(db, user.org_id, name)
    if similar and not body.force:  # typo guard: "Copper Wier" vs "Copper Wire"
        raise Conflict("Similar item names exist. Resend with force=true to create anyway.",
                       "similar_item_exists", {"similar": similar})
    if body.category_id:
        get_scoped(db, ItemCategory, body.category_id, user.org_id, "Category")
    item = Item(org_id=user.org_id, name=name, category_id=body.category_id, description=body.description)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item_out(item)


@router.get("/items/{item_id}", response_model=ItemOut)
def get_item(item_id: uuid.UUID, user: User = Depends(editor), db: Session = Depends(get_db)):
    return item_out(get_scoped(db, Item, item_id, user.org_id, "Item"))


@router.patch("/items/{item_id}", response_model=ItemOut)
def update_item(item_id: uuid.UUID, body: ItemPatch, user: User = Depends(editor), db: Session = Depends(get_db)):
    item = get_scoped(db, Item, item_id, user.org_id, "Item")
    if body.category_id:
        get_scoped(db, ItemCategory, body.category_id, user.org_id, "Category")
    apply_fields(item, body)
    db.commit()
    db.refresh(item)
    return item_out(item)


# ------------------------------------------------------------------ variants
def _check_size(db: Session, size_id, org_id):
    if size_id:
        size = get_scoped(db, SizeOption, size_id, org_id, "Size option")
        if not size.is_active:
            raise BadRequest("This size option is inactive", "size_inactive")


def _variant_in_finalized_request(db: Session, variant_id) -> bool:
    return bool(db.scalar(select(exists().where(
        ProcurementRequestItem.variant_id == variant_id,
        ProcurementRequestItem.request_id == ProcurementRequest.id,
        ProcurementRequest.status != "draft"))))


@router.post("/items/{item_id}/variants", response_model=VariantOut, status_code=201)
def create_variant(item_id: uuid.UUID, body: VariantIn, user: User = Depends(editor), db: Session = Depends(get_db)):
    item = get_scoped(db, Item, item_id, user.org_id, "Item")
    _get_uom(db, body.uom_id, user.org_id)
    _check_size(db, body.size_option_id, user.org_id)
    attrs = validate_attributes(db, user.org_id, body.attributes)
    sku = body.sku.strip() if body.sku and body.sku.strip() else None
    variant = ItemVariant(org_id=user.org_id, item_id=item.id, size_option_id=body.size_option_id,
                          uom_id=body.uom_id, sku=sku, description=body.description, attributes=attrs)
    db.add(variant)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict("SKU already in use", "sku_exists")
    db.refresh(variant)
    return variant_out(variant)


@router.patch("/variants/{variant_id}", response_model=VariantOut)
def update_variant(variant_id: uuid.UUID, body: VariantPatch, user: User = Depends(editor), db: Session = Depends(get_db)):
    variant = get_scoped(db, ItemVariant, variant_id, user.org_id, "Variant")
    sent = body.model_fields_set
    changing_identity = ("size_option_id" in sent and body.size_option_id != variant.size_option_id) or (
        "uom_id" in sent and body.uom_id != variant.uom_id)
    if changing_identity and _variant_in_finalized_request(db, variant.id):
        raise Conflict("This variant is used in a finalized request; its size and unit can no longer change. "
                       "Deactivate it and create a new variant instead.", "variant_identity_locked")
    if "uom_id" in sent and body.uom_id:
        _get_uom(db, body.uom_id, user.org_id)
    if "size_option_id" in sent:
        _check_size(db, body.size_option_id, user.org_id)
    if "attributes" in sent and body.attributes is not None:
        variant.attributes = validate_attributes(db, user.org_id, body.attributes)
    for key in sent - {"attributes"}:
        setattr(variant, key, getattr(body, key))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict("SKU already in use", "sku_exists")
    db.refresh(variant)
    return variant_out(variant)


@router.get("/variants", response_model=Page[VariantOut])
def search_variants(
    q: str | None = None, category_id: uuid.UUID | None = None, active: bool | None = True,
    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
    user: User = Depends(editor), db: Session = Depends(get_db),
):
    stmt = _variant_query(user.org_id, q, category_id, active)
    rows, total = paginate(db, stmt, limit, offset)
    return Page(items=[variant_out(v) for v in rows], total=total, limit=limit, offset=offset)


def _variant_query(org_id, q=None, category_id=None, active=True):
    stmt = (select(ItemVariant).join(Item, Item.id == ItemVariant.item_id)
            .outerjoin(SizeOption, SizeOption.id == ItemVariant.size_option_id)
            .where(ItemVariant.org_id == org_id).order_by(Item.name, SizeOption.label))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Item.name.ilike(like), ItemVariant.sku.ilike(like), SizeOption.label.ilike(like)))
    if category_id:
        stmt = stmt.where(Item.category_id == category_id)
    if active is not None:
        stmt = stmt.where(ItemVariant.is_active.is_(active), Item.is_active.is_(active))
    return stmt
