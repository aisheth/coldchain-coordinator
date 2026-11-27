import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Test signing key only; deployments must provide their own secret.
os.environ.setdefault("SECRET_KEY", "test-only-signing-key-with-at-least-32-characters")

from app import db as dbmod
from app.config import settings
from app.main import create_app
from app.models import Base
from app.seed import create_owner, seed_uoms

TEST_DB = os.environ.get("TEST_DATABASE_URL", "sqlite://")
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32


class Api:
    """Tiny HTTP helper: .call() asserts the expected status and returns parsed JSON."""

    def __init__(self, client: TestClient, token: str | None = None):
        self.client, self.token = client, token

    def raw(self, method, path, **kw):
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        return self.client.request(method, "/api/v1" + path, headers=headers, **kw)

    def call(self, method, path, status=200, **kw):
        r = self.raw(method, path, **kw)
        assert r.status_code == status, f"{method} {path} -> {r.status_code} (wanted {status}): {r.text}"
        return r.json() if r.content else None

    def code(self, method, path, status, **kw) -> str:
        """Expect an error response and return its machine-readable code."""
        r = self.raw(method, path, **kw)
        assert r.status_code == status, f"{method} {path} -> {r.status_code} (wanted {status}): {r.text}"
        return r.json()["error"]["code"]

    def get(self, path, status=200, **kw): return self.call("GET", path, status, **kw)
    def post(self, path, status=200, **kw): return self.call("POST", path, status, **kw)
    def patch(self, path, status=200, **kw): return self.call("PATCH", path, status, **kw)
    def delete(self, path, status=200, **kw): return self.call("DELETE", path, status, **kw)


class World:
    """An organisation with an owner, admin, two workers and a small catalogue, ready to use."""


@pytest.fixture()
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))
    kwargs = {"connect_args": {"check_same_thread": False}, "poolclass": StaticPool} if TEST_DB.startswith("sqlite") else {}
    engine = create_engine(TEST_DB, **kwargs)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    Session = sessionmaker(engine, expire_on_commit=False)
    with Session() as s:
        seed_uoms(s)
        create_owner(s, "Acme Cold Storage", "owner", "Owner#1234", "Olivia Owner", "owner@acme.test")
        s.commit()
    app = create_app(init_db=False)

    def override():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[dbmod.get_db] = override
    yield TestClient(app)
    engine.dispose()


@pytest.fixture()
def client(env):
    return env


def login(client, identifier, password) -> Api:
    tokens = Api(client).post("/auth/login", json={"identifier": identifier, "password": password})
    return Api(client, tokens["access_token"])


def make_user(owner: Api, role: str, username: str, name: str | None = None) -> Api:
    owner.post("/users", 201, json={"username": username, "name": name or username.title(), "role": role,
                                    "password": "Temp#12345", "email": f"{username}@acme.test"})
    api = login(owner.client, username, "Temp#12345")
    tokens = api.post("/auth/change-password", json={"current_password": "Temp#12345", "new_password": "Final#12345"})
    return Api(owner.client, tokens["access_token"])


@pytest.fixture()
def world(client):
    w = World()
    w.client = client
    w.owner = login(client, "owner", "Owner#1234")
    w.admin = make_user(w.owner, "admin", "adam")
    w.worker = make_user(w.owner, "worker", "wally", "Wally Worker")
    w.worker2 = make_user(w.owner, "worker", "willa", "Willa Worker")
    w.worker_id = w.worker.get("/auth/me")["id"]
    w.worker2_id = w.worker2.get("/auth/me")["id"]
    uoms = {u["code"]: u for u in w.owner.get("/uom")}
    w.uom = uoms
    # catalogue: Copper Wire in 1 m / 2 m / 5 m, plus a whole-number item
    cat = w.admin.post("/item-categories", 201, json={"name": "Electrical"})
    sizes = {}
    for v in (1, 2, 5):
        sizes[v] = w.admin.post("/size-options", 201, json={"value": v, "uom_id": uoms["M"]["id"]})
    w.sizes = sizes
    wire = w.admin.post("/items", 201, json={"name": "Copper Wire", "category_id": cat["id"]})
    w.wire_variants = {
        v: w.admin.post(f"/items/{wire['id']}/variants", 201,
                        json={"size_option_id": sizes[v]["id"], "uom_id": uoms["M"]["id"], "sku": f"CW-{v}"})
        for v in (1, 2, 5)
    }
    valve = w.admin.post("/items", 201, json={"name": "Solenoid Valve", "category_id": cat["id"]})
    w.valve_variant = w.admin.post(f"/items/{valve['id']}/variants", 201, json={"uom_id": uoms["NOS"]["id"]})
    customer = w.admin.post("/customers", 201, json={"name": "Frosty Foods", "phone": "999"})
    w.project = w.owner.post("/projects", 201, json={
        "customer_id": customer["id"], "name": "Frosty Foods cold room", "site_address": "Plot 7, MIDC, Pune"})
    w.vendor = w.admin.post("/vendors", 201, json={"name": "Shree Electricals", "phone": "888"})
    return w


def build_request(w, lines=None, finalize=True):
    """Request with Copper Wire 5 m x 10 and Solenoid Valve x 4 by default."""
    lines = lines or [(w.wire_variants[5]["id"], 10), (w.valve_variant["id"], 4)]
    req = w.owner.post("/requests", 201, json={"project_id": w.project["id"]})
    for variant_id, qty in lines:
        req = w.owner.post(f"/requests/{req['id']}/items", 201, json={"variant_id": variant_id, "required_qty": qty})
    if finalize:
        req = w.owner.post(f"/requests/{req['id']}/finalize")
    return req


def assign(w, req, worker_id=None, **extra):
    body = {"worker_id": worker_id or w.worker_id, "vendor_id": w.vendor["id"], **extra}
    return w.owner.post(f"/requests/{req['id']}/assignments", 201, json=body)


def upload_photo(api: Api) -> str:
    r = api.raw("POST", "/attachments", files={"file": ("proof.png", PNG, "image/png")})
    assert r.status_code == 201, r.text
    return r.json()["id"]
