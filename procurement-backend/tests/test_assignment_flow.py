from .conftest import assign, build_request, upload_photo
from app.state_machine import TRANSITIONS


def move(api, aid, to, status=200, **kw):
    return api.post(f"/assignments/{aid}/transitions", status, json={"to_status": to, **kw})


def to_in_progress(w, aid):
    """Walk a fresh assignment to procurement_in_progress, marking all lines available."""
    move(w.worker, aid, "accepted")
    detail = w.worker.get(f"/assignments/{aid}")
    for item in detail["items"]:
        w.worker.patch(f"/assignments/{aid}/items/{item['id']}", json={"fulfilment_status": "available"})
    move(w.worker, aid, "availability_confirmed")
    return move(w.worker, aid, "procurement_in_progress")


def test_state_machine_table_is_consistent():
    assert all(roles <= {"worker", "owner"} for t in TRANSITIONS.values() for roles in t.values())
    reachable = {to for t in TRANSITIONS.values() for to in t}
    assert reachable | {"assigned"} >= set(TRANSITIONS)  # no orphan states


def test_happy_path_with_history_notifications_and_follow_up(world):
    w = world
    req = build_request(w)
    a = assign(w, req, due_date="2099-01-01", instructions="Ask for the 5 m coil")
    aid = a["id"]
    assert a["status"] == "assigned" and a["delivery_location"] == "Plot 7, MIDC, Pune"
    assert a["allowed_transitions"] == []  # owner has nothing to do yet
    assert w.worker.get(f"/assignments/{aid}")["allowed_transitions"] == ["accepted"]
    # worker may skip the optional travel steps, but cannot skip ahead past mandatory ones
    assert w.worker.code("POST", f"/assignments/{aid}/transitions", 409, json={"to_status": "dispatched"}) == "invalid_transition"
    move(w.worker, aid, "accepted")
    assert w.worker.get(f"/assignments/{aid}")["allowed_transitions"] == ["travelling", "reached_vendor", "availability_confirmed"]
    move(w.worker, aid, "travelling")
    move(w.worker, aid, "reached_vendor")
    # availability can only be confirmed after every line is assessed
    assert w.worker.code("POST", f"/assignments/{aid}/transitions", 409, json={"to_status": "availability_confirmed"}) == "lines_pending"
    items = w.worker.get(f"/assignments/{aid}")["items"]
    wire, valve = items
    w.worker.patch(f"/assignments/{aid}/items/{wire['id']}", json={"fulfilment_status": "available"})
    # vendor only has 2 of the 4 valves: partial purchase
    w.worker.patch(f"/assignments/{aid}/items/{valve['id']}", json={"qty_procured": 2})
    move(w.worker, aid, "availability_confirmed")
    move(w.worker, aid, "procurement_in_progress")
    w.worker.patch(f"/assignments/{aid}/items/{wire['id']}", json={"qty_procured": 10})
    # bounds are enforced
    assert w.worker.code("PATCH", f"/assignments/{aid}/items/{valve['id']}", 400, json={"qty_procured": 5}) == "qty_exceeds_allocation"
    assert w.worker.code("PATCH", f"/assignments/{aid}/items/{valve['id']}", 400, json={"qty_procured": 1.5}) == "fractional_quantity"
    move(w.worker, aid, "dispatched", remarks="On the 3pm tempo")
    # idempotent retry (flaky network) creates no extra history
    before = len(w.worker.get(f"/assignments/{aid}")["history"])
    move(w.worker, aid, "dispatched")
    assert len(w.worker.get(f"/assignments/{aid}")["history"]) == before
    # delivery needs a photo, and the generic endpoint points to the dedicated one
    assert w.worker.code("POST", f"/assignments/{aid}/transitions", 400, json={"to_status": "delivered"}) == "use_dedicated_endpoint"
    assert w.worker.code("POST", f"/assignments/{aid}/delivery", 400, json={"recipient_name": "Ravi"}) == "photo_required"
    photo = upload_photo(w.worker)
    done = w.worker.post(f"/assignments/{aid}/delivery", json={"recipient_name": "Ravi", "remarks": "Signed", "attachment_ids": [photo]})
    assert done["status"] == "delivered" and done["delivery"]["recipient_name"] == "Ravi"
    assert done["delivery"]["attachments"][0]["id"] == photo
    assert {i["qty_delivered"] for i in done["items"]} == {10, 2}  # defaulted to what was procured
    # the owner reviews: shortfall of 2 valves must be handled explicitly
    assert w.owner.get(f"/assignments/{aid}")["allowed_transitions"] == ["completed", "dispatched"]
    assert w.owner.code("POST", f"/assignments/{aid}/transitions", 400, json={"to_status": "completed"}) == "use_dedicated_endpoint"
    assert w.owner.code("POST", f"/assignments/{aid}/confirm-completion", 409, json={}) == "shortfall_action_required"
    result = w.owner.post(f"/assignments/{aid}/confirm-completion", json={"shortfall_action": "follow_up"})
    assert result["assignment"]["status"] == "completed"
    follow = w.owner.get(f"/requests/{result['follow_up_request_id']}")
    assert follow["status"] == "draft" and len(follow["lines"]) == 1 and follow["lines"][0]["required_qty"] == 2
    assert follow["lines"][0]["variant"]["item_name"] == "Solenoid Valve"
    # full audit trail, in order, with who did it
    history = w.owner.get(f"/assignments/{aid}")["history"]
    assert [h["to_status"] for h in history] == [
        "assigned", "accepted", "travelling", "reached_vendor", "availability_confirmed",
        "procurement_in_progress", "dispatched", "delivered", "completed"]
    assert history[6]["remarks"] == "On the 3pm tempo" and history[1]["changed_by_name"] == "Wally Worker"
    # the original request is done; the shortfall now lives on the follow-up request
    assert w.owner.get(f"/requests/{req['id']}")["progress"] == "completed"
    assert w.owner.get(f"/requests/{result['follow_up_request_id']}")["progress"] == "draft"
    # notifications: owner heard about the important steps only (no noise for travelling/reached_vendor)
    kinds = [n["type"] for n in w.owner.get("/notifications")["items"]]
    assert "status_accepted" in kinds and "status_dispatched" in kinds and "status_delivered" in kinds
    assert "status_travelling" not in kinds and "status_reached_vendor" not in kinds
    assert w.owner.get("/notifications/unread-count")["unread"] >= 4
    assert any(n["type"] == "assigned" for n in w.worker.get("/notifications")["items"])


def test_unavailable_line_raises_issue_and_blocking_issue_holds_the_task(world):
    w = world
    req = build_request(w)
    aid = assign(w, req)["id"]
    move(w.worker, aid, "accepted")
    wire, valve = w.worker.get(f"/assignments/{aid}")["items"]
    d = w.worker.patch(f"/assignments/{aid}/items/{valve['id']}", json={"fulfilment_status": "unavailable", "remarks": "Out of stock"})
    assert d["issues"][0]["type"] == "material_unavailable" and d["is_on_hold"] is False  # non-blocking
    assert any(n["type"] == "line_unavailable" for n in w.owner.get("/notifications")["items"])
    assert w.worker.code("PATCH", f"/assignments/{aid}/items/{valve['id']}", 400,
                         json={"qty_procured": 1}) == "unavailable_with_qty"
    # a blocking issue freezes the worker's progress until the owner resolves it
    held = w.worker.post(f"/assignments/{aid}/issues", 201, json={"type": "vendor_delay", "description": "Vendor shop closed"})
    assert held["is_on_hold"] is True and held["allowed_transitions"] == []
    assert w.worker.code("POST", f"/assignments/{aid}/transitions", 409, json={"to_status": "reached_vendor"}) == "assignment_on_hold"
    blocking = next(i for i in held["issues"] if i["blocks_progress"])
    assert len(w.owner.get("/issues")) == 2  # the auto-raised unavailability + the blocking one
    resolved = w.owner.post(f"/issues/{blocking['id']}/resolve", json={"resolution": "Try tomorrow"})
    assert resolved["is_on_hold"] is False
    assert w.owner.code("POST", f"/issues/{blocking['id']}/resolve", 409, json={"resolution": "x"}) == "already_resolved"
    move(w.worker, aid, "reached_vendor")
    # the owner can also hold a task manually
    w.owner.post(f"/assignments/{aid}/hold", json={"reason": "Customer changed the site"})
    assert w.worker.get(f"/assignments/{aid}")["is_on_hold"] is True
    assert w.owner.get("/dashboard/summary")["on_hold_assignments"] == 1


def test_approval_gate_and_delivery_rejection(world):
    w = world
    req = build_request(w)
    aid = assign(w, req, requires_approval=True)["id"]
    to_in_progress(w, aid)
    wire, valve = w.worker.get(f"/assignments/{aid}")["items"]
    assert w.worker.code("POST", f"/assignments/{aid}/transitions", 409, json={"to_status": "pending_approval"}) == "nothing_procured"
    w.worker.patch(f"/assignments/{aid}/items/{wire['id']}", json={"qty_procured": 10})
    w.worker.patch(f"/assignments/{aid}/items/{valve['id']}", json={"qty_procured": 4})
    assert w.worker.code("POST", f"/assignments/{aid}/transitions", 409, json={"to_status": "dispatched"}) == "approval_required"
    assert move(w.worker, aid, "pending_approval")["allowed_transitions"] == []
    assert w.worker.code("POST", f"/assignments/{aid}/transitions", 409, json={"to_status": "dispatched"}) == "invalid_transition"
    assert move(w.owner, aid, "dispatched")["status"] == "dispatched"  # owner approves
    w.worker.post(f"/assignments/{aid}/delivery", json={"attachment_ids": [upload_photo(w.worker)]})
    assert w.owner.code("POST", f"/assignments/{aid}/transitions", 400, json={"to_status": "dispatched"}) == "remarks_required"
    back = move(w.owner, aid, "dispatched", remarks="Wrong coil size")
    assert back["status"] == "dispatched"
    assert any(n["type"] == "delivery_rejected" for n in w.worker.get("/notifications")["items"])
    # a full delivery completes without any shortfall question
    w.worker.post(f"/assignments/{aid}/delivery", json={"attachment_ids": [upload_photo(w.worker)]})
    done = w.owner.post(f"/assignments/{aid}/confirm-completion", json={})
    assert done["assignment"]["status"] == "completed" and done["follow_up_request_id"] is None
    assert w.owner.get(f"/requests/{req['id']}")["progress"] == "completed"


def test_reassign_and_cancel_keep_history_and_quantities_consistent(world):
    w = world
    req = build_request(w)
    first = assign(w, req)
    # the same lines cannot be assigned twice
    assert w.owner.code("POST", f"/requests/{req['id']}/assignments", 409,
                        json={"worker_id": w.worker2_id, "vendor_id": w.vendor["id"]}) == "fully_assigned"
    to_in_progress(w, first["id"])
    wire, _ = w.worker.get(f"/assignments/{first['id']}")["items"]
    w.worker.patch(f"/assignments/{first['id']}/items/{wire['id']}", json={"qty_procured": 6})
    new = w.owner.post(f"/assignments/{first['id']}/reassign", 201, json={"worker_id": w.worker2_id, "reason": "Wally is sick"})
    assert new["status"] == "assigned" and new["worker_name"] == "Willa Worker"
    old = w.owner.get(f"/assignments/{first['id']}")
    assert old["status"] == "cancelled" and old["replaced_by_id"] == new["id"] and "Wally is sick" in old["cancel_reason"]
    assert [i["allocated_qty"] for i in new["items"]] == [10, 4]  # nothing had been delivered yet
    # the old worker can still read their cancelled task but can no longer act on it
    assert w.worker.get(f"/assignments/{first['id']}")["allowed_transitions"] == []
    assert w.worker.code("POST", f"/assignments/{first['id']}/transitions", 409, json={"to_status": "dispatched"}) == "invalid_transition"
    # workers never see each other's tasks
    assert w.worker.code("GET", f"/assignments/{new['id']}", 404) == "not_found"
    assert [x["id"] for x in w.worker2.get("/me/assignments")["items"]] == [new["id"]]
    assert w.worker.get("/me/assignments")["total"] == 0 and w.worker.get("/me/assignments?active=false")["total"] == 1
    # cancel the replacement: request can be assigned again
    w.owner.post(f"/assignments/{new['id']}/cancel", json={"reason": "Customer postponed"})
    assert w.owner.code("POST", f"/assignments/{new['id']}/cancel", 409, json={"reason": "again"}) == "cannot_cancel"
    again = assign(w, req, worker_id=w.worker2_id)
    assert [i["allocated_qty"] for i in again["items"]] == [10, 4]


def test_substitution_and_permissions_and_dashboard(world):
    w = world
    req = build_request(w)
    aid = assign(w, req)["id"]
    move(w.worker, aid, "accepted")
    wire, valve = w.worker.get(f"/assignments/{aid}")["items"]
    sub = w.wire_variants[2]["id"]
    assert w.worker.code("PATCH", f"/assignments/{aid}/items/{wire['id']}", 400,
                         json={"fulfilment_status": "substituted"}) == "substitution_details_required"
    d = w.worker.patch(f"/assignments/{aid}/items/{wire['id']}", json={
        "fulfilment_status": "substituted", "substitute_variant_id": sub, "remarks": "Only 2 m coils in stock"})
    assert d["items"][0]["substitute_variant"]["size_label"] == "2 m"
    assert any(n["type"] == "line_substituted" for n in w.owner.get("/notifications")["items"])
    # permissions: admin has no operational access; worker cannot act as owner
    assert w.admin.code("GET", f"/assignments/{aid}", 403) == "forbidden"
    assert w.worker.code("POST", f"/assignments/{aid}/cancel", 403, json={"reason": "x"}) == "forbidden"
    assert w.worker.code("POST", "/requests", 403, json={"project_id": w.project["id"]}) == "forbidden"
    assert w.owner.code("PATCH", f"/assignments/{aid}/items/{wire['id']}", 403, json={"qty_procured": 1}) == "forbidden"
    dash = w.owner.get("/dashboard/summary")
    assert dash["assignments_by_status"] == {"accepted": 1} and dash["active_projects"] == 1
    assert w.owner.get("/assignments?status=accepted")["total"] == 1
    assert w.owner.get("/assignments?overdue=true")["total"] == 0
    w.owner.patch(f"/assignments/{aid}", json={"due_date": "2000-01-01"})
    assert w.owner.get("/assignments?overdue=true")["items"][0]["is_overdue"] is True


def test_org_settings_drive_the_approval_default_and_photo_rule(world):
    w = world
    assert w.owner.get("/organization/settings")["require_delivery_photo"] is True
    assert w.admin.code("PATCH", "/organization/settings", 403, json={"require_owner_approval": True}) == "forbidden"
    w.owner.patch("/organization/settings", json={"require_owner_approval": True, "require_delivery_photo": False})
    req = build_request(w)
    a = assign(w, req)  # requires_approval defaults from the organisation setting
    assert a["requires_approval"] is True
    aid = a["id"]
    to_in_progress(w, aid)
    for item in w.worker.get(f"/assignments/{aid}")["items"]:
        w.worker.patch(f"/assignments/{aid}/items/{item['id']}", json={"qty_procured": item["allocated_qty"]})
    move(w.worker, aid, "pending_approval")
    move(w.owner, aid, "dispatched")
    done = w.worker.post(f"/assignments/{aid}/delivery", json={"remarks": "no photo needed now"})  # photo rule is off
    assert done["status"] == "delivered"
