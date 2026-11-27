from .conftest import Api, login, make_user


def test_login_with_username_or_email_and_me(client):
    by_user = login(client, "owner", "Owner#1234")
    by_mail = login(client, "OWNER@acme.test", "Owner#1234")  # case-insensitive
    assert by_user.get("/auth/me")["role"] == "owner"
    assert by_mail.get("/auth/me")["username"] == "owner"


def test_wrong_password_is_generic_and_locks_after_five(client):
    api = Api(client)
    for _ in range(5):
        assert api.code("POST", "/auth/login", 401, json={"identifier": "owner", "password": "nope"}) == "invalid_credentials"
    assert api.code("POST", "/auth/login", 401, json={"identifier": "owner", "password": "Owner#1234"}) == "account_locked"
    assert api.code("POST", "/auth/login", 401, json={"identifier": "ghost", "password": "x"}) == "invalid_credentials"


def test_new_users_must_change_password_first(client):
    owner = login(client, "owner", "Owner#1234")
    owner.post("/users", 201, json={"username": "newbie", "name": "N", "role": "worker", "password": "Temp#12345"})
    temp = login(client, "newbie", "Temp#12345")
    assert temp.code("GET", "/assignments", 403) == "password_change_required"
    assert temp.get("/auth/me")["must_change_password"] is True
    tokens = temp.post("/auth/change-password", json={"current_password": "Temp#12345", "new_password": "Better#9999"})
    assert tokens["must_change_password"] is False
    assert Api(client, tokens["access_token"]).get("/me/assignments")["total"] == 0


def test_refresh_rotation_and_reuse_detection(client):
    tokens = Api(client).post("/auth/login", json={"identifier": "owner", "password": "Owner#1234"})
    new = Api(client).post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert new["refresh_token"] != tokens["refresh_token"]
    # replaying the old token is treated as theft: every session for that user is revoked
    assert Api(client).code("POST", "/auth/refresh", 401, json={"refresh_token": tokens["refresh_token"]}) == "invalid_token"
    assert Api(client).code("POST", "/auth/refresh", 401, json={"refresh_token": new["refresh_token"]}) == "invalid_token"


def test_deactivated_user_is_blocked_immediately(client):
    owner = login(client, "owner", "Owner#1234")
    worker = make_user(owner, "worker", "temp1")
    uid = worker.get("/auth/me")["id"]
    owner.patch(f"/users/{uid}", json={"is_active": False})
    assert worker.code("GET", "/auth/me", 401) == "inactive_account"  # token still valid, account is not


def test_admin_cannot_touch_owners_and_last_owner_is_protected(client):
    owner = login(client, "owner", "Owner#1234")
    admin = make_user(owner, "admin", "adam")
    owner_id = owner.get("/auth/me")["id"]
    body = {"username": "evil", "name": "E", "role": "owner", "password": "Temp#12345"}
    assert admin.code("POST", "/users", 403, json=body) == "forbidden"
    assert admin.code("PATCH", f"/users/{owner_id}", 403, json={"name": "Hacked"}) == "forbidden"
    assert admin.code("POST", f"/users/{owner_id}/reset-password", 403) == "forbidden"
    assert owner.code("PATCH", f"/users/{owner_id}", 409, json={"is_active": False}) == "last_owner"
    # admins may create workers; duplicates are rejected
    admin.post("/users", 201, json={"username": "wk1", "name": "W", "role": "worker", "password": "Temp#12345"})
    assert admin.code("POST", "/users", 409, json={"username": "WK1", "name": "W", "role": "worker",
                                                    "password": "Temp#12345"}) == "username_taken"


def test_reset_password_flow(client):
    owner = login(client, "owner", "Owner#1234")
    worker = make_user(owner, "worker", "wally")
    uid = worker.get("/auth/me")["id"]
    temp = owner.post(f"/users/{uid}/reset-password")["temporary_password"]
    again = login(client, "wally", temp)
    assert again.get("/auth/me")["must_change_password"] is True
