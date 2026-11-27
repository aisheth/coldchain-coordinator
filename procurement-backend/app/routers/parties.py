import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import require_roles
from ..errors import BadRequest
from ..models import Customer, Project, User, Vendor
from ..schemas import (
    CustomerIn, CustomerOut, CustomerPatch, Page, ProjectIn, ProjectOut, ProjectPatch,
    VendorIn, VendorOut, VendorPatch,
)
from ..utils import apply_fields, get_scoped, paginate

router = APIRouter(tags=["customers, vendors, projects"])
master_editor = require_roles("owner", "admin")  # customers and vendors are master data
owner_only = require_roles("owner")  # projects are operational


@router.get("/customers", response_model=Page[CustomerOut])
def list_customers(q: str | None = None, active: bool | None = True,
                   limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                   user: User = Depends(master_editor), db: Session = Depends(get_db)):
    stmt = select(Customer).where(Customer.org_id == user.org_id).order_by(Customer.name)
    if q:
        stmt = stmt.where(Customer.name.ilike(f"%{q}%"))
    if active is not None:
        stmt = stmt.where(Customer.is_active.is_(active))
    rows, total = paginate(db, stmt, limit, offset)
    return Page(items=rows, total=total, limit=limit, offset=offset)


@router.post("/customers", response_model=CustomerOut, status_code=201)
def create_customer(body: CustomerIn, user: User = Depends(master_editor), db: Session = Depends(get_db)):
    customer = Customer(org_id=user.org_id, **body.model_dump())
    db.add(customer)
    db.commit()
    return customer


@router.patch("/customers/{customer_id}", response_model=CustomerOut)
def update_customer(customer_id: uuid.UUID, body: CustomerPatch, user: User = Depends(master_editor),
                    db: Session = Depends(get_db)):
    customer = get_scoped(db, Customer, customer_id, user.org_id, "Customer")
    apply_fields(customer, body)
    db.commit()
    return customer


@router.get("/vendors", response_model=Page[VendorOut])
def list_vendors(q: str | None = None, active: bool | None = True,
                 limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                 user: User = Depends(require_roles("owner", "admin")), db: Session = Depends(get_db)):
    stmt = select(Vendor).where(Vendor.org_id == user.org_id).order_by(Vendor.name)
    if q:
        stmt = stmt.where(Vendor.name.ilike(f"%{q}%"))
    if active is not None:
        stmt = stmt.where(Vendor.is_active.is_(active))
    rows, total = paginate(db, stmt, limit, offset)
    return Page(items=rows, total=total, limit=limit, offset=offset)


@router.post("/vendors", response_model=VendorOut, status_code=201)
def create_vendor(body: VendorIn, user: User = Depends(master_editor), db: Session = Depends(get_db)):
    vendor = Vendor(org_id=user.org_id, **body.model_dump())
    db.add(vendor)
    db.commit()
    return vendor


@router.patch("/vendors/{vendor_id}", response_model=VendorOut)
def update_vendor(vendor_id: uuid.UUID, body: VendorPatch, user: User = Depends(master_editor),
                  db: Session = Depends(get_db)):
    vendor = get_scoped(db, Vendor, vendor_id, user.org_id, "Vendor")
    apply_fields(vendor, body)
    db.commit()
    return vendor


@router.get("/projects", response_model=Page[ProjectOut])
def list_projects(customer_id: uuid.UUID | None = None, status: str | None = None,
                  limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                  user: User = Depends(owner_only), db: Session = Depends(get_db)):
    stmt = select(Project).where(Project.org_id == user.org_id).order_by(Project.created_at.desc())
    if customer_id:
        stmt = stmt.where(Project.customer_id == customer_id)
    if status:
        stmt = stmt.where(Project.status == status)
    rows, total = paginate(db, stmt, limit, offset)
    return Page(items=rows, total=total, limit=limit, offset=offset)


@router.post("/projects", response_model=ProjectOut, status_code=201)
def create_project(body: ProjectIn, user: User = Depends(owner_only), db: Session = Depends(get_db)):
    customer = get_scoped(db, Customer, body.customer_id, user.org_id, "Customer")
    if not customer.is_active:
        raise BadRequest("Customer is inactive", "customer_inactive")
    project = Project(org_id=user.org_id, **body.model_dump())
    db.add(project)
    db.commit()
    return project


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: uuid.UUID, user: User = Depends(owner_only), db: Session = Depends(get_db)):
    return get_scoped(db, Project, project_id, user.org_id, "Project")


@router.patch("/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: uuid.UUID, body: ProjectPatch, user: User = Depends(owner_only),
                   db: Session = Depends(get_db)):
    project = get_scoped(db, Project, project_id, user.org_id, "Project")
    apply_fields(project, body)
    db.commit()
    return project
