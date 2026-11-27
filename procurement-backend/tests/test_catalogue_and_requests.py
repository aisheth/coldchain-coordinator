from .conftest import assign, build_request


def test_size_option_label_is_generated_and_deduplicated(world):
    w = world
    assert w.sizes[5]["label"] == "5 m"
    assert w.admin.code("POST", "/size-options", 409, json={"value": 5, "uom_id": w.uom["M"]["id"]}) == "size_exists"
    assert w.admin.code("POST", "/size-options", 400, json={"value": 5}) == "size_unit_required"
    assert w.admin.code("POST", "/size-options", 400, json={}) == "size_required"
    large = w.admin.post("/size-options", 201, json={"label": "  Large "})
    assert large["label"] == "Large"
    assert w.admin.code("POST", "/size-options", 409, json={"label": "large"}) == "size_exists"


def test_custom_fields_are_validated_dynamically(world):
    w = world
    brand = w.admin.post("/item-field-definitions", 201, json={
        "label": "Brand", "field_type": "select", "options": ["Finolex", "Polycab"], "is_required": True})
    assert brand["key"] == "brand"
    w.admin.post("/item-field-definitions", 201, json={"label": "Gauge", "field_type": "number"})
    wire = w.admin.get("/items")["items"][0]
    path = f"/items/{wire['id']}/variants"
    uom = w.uom["M"]["id"]
    # required field missing / wrong option / unknown key / wrong type
    assert w.admin.code("POST", path, 400, json={"uom_id": uom, "attributes": {}}) == "invalid_attributes"
    assert w.admin.code("POST", path, 400, json={"uom_id": uom, "attributes": {"brand": "Nope"}}) == "invalid_attributes"
    assert w.admin.code("POST", path, 400, json={"uom_id": uom, "attributes": {"brand": "Finolex", "colour": "red"}}) == "invalid_attributes"
    assert w.admin.code("POST", path, 400, json={"uom_id": uom, "attributes": {"brand": "Finolex", "gauge": "thick"}}) == "invalid_attributes"
    ok = w.admin.post(path, 201, json={"uom_id": uom, "attributes": {"brand": "Finolex", "gauge": 1.5}})
    assert ok["attributes"] == {"brand": "Finolex", "gauge": 1.5}
    # select options are add-only
    assert w.admin.code("PATCH", f"/item-field-definitions/{brand['id']}", 409, json={"options": ["Finolex"]}) == "options_add_only"
    w.admin.patch(f"/item-field-definitions/{brand['id']}", json={"options": ["Finolex", "Polycab", "RR Kabel"]})


def test_similar_item_names_need_confirmation(world):
    w = world
    assert w.admin.code("POST", "/items", 409, json={"name": "Copper Wier"}) == "similar_item_exists"
    assert w.admin.code("POST", "/items", 409, json={"name": "copper wire"}) == "item_exists"
    w.admin.post("/items", 201, json={"name": "Copper Wier", "force": True})


def test_workers_and_admins_have_the_right_catalogue_access(world):
    w = world
    assert w.worker.code("GET", "/items", 403) == "forbidden"
    assert w.worker.code("POST", "/items", 403, json={"name": "X"}) == "forbidden"
    assert w.admin.code("POST", "/projects", 403, json={"customer_id": w.project["customer_id"], "name": "x"}) == "forbidden"
    assert w.admin.code("GET", "/requests", 403) == "forbidden"
    assert w.admin.code("GET", "/assignments", 403) == "forbidden"
    assert w.worker.get("/uom")  # everyone authenticated can read units


def test_dropdown_rule_is_request_level_and_reversible(world):
    w = world
    req = w.owner.post("/requests", 201, json={"project_id": w.project["id"]})
    rid = req["id"]

    def available():
        return {v["size_label"] for v in w.owner.get(f"/requests/{rid}/available-variants?q=copper")["items"]}

    assert available() == {"1 m", "2 m", "5 m"}
    req = w.owner.post(f"/requests/{rid}/items", 201, json={"variant_id": w.wire_variants[1]["id"], "required_qty": 3})
    assert available() == {"2 m", "5 m"}  # only that exact variant disappears
    # the master catalogue is untouched, and another request still sees all three
    other = w.owner.post("/requests", 201, json={"project_id": w.project["id"]})
    assert len(w.owner.get(f"/requests/{other['id']}/available-variants?q=copper")["items"]) == 3
    # duplicate is refused and points at the existing line
    r = w.owner.raw("POST", f"/requests/{rid}/items", json={"variant_id": w.wire_variants[1]["id"], "required_qty": 1})
    assert r.status_code == 409 and r.json()["error"]["code"] == "duplicate_line"
    line_id = req["lines"][0]["id"]
    assert r.json()["error"]["details"]["existing_line_id"] == line_id
    # removing the line brings the variant back
    w.owner.delete(f"/requests/{rid}/items/{line_id}")
    assert available() == {"1 m", "2 m", "5 m"}


def test_quantity_rules_and_bulk_is_all_or_nothing(world):
    w = world
    rid = w.owner.post("/requests", 201, json={"project_id": w.project["id"]})["id"]
    assert w.owner.code("POST", f"/requests/{rid}/items", 400,
                        json={"variant_id": w.valve_variant["id"], "required_qty": 2.5}) == "fractional_quantity"
    assert w.owner.raw("POST", f"/requests/{rid}/items", json={"variant_id": w.wire_variants[1]["id"], "required_qty": 0}).status_code == 422
    w.owner.post(f"/requests/{rid}/items", 201, json={"variant_id": w.wire_variants[1]["id"], "required_qty": 2.5})  # metres may be fractional
    bad = {"lines": [{"variant_id": w.wire_variants[2]["id"], "required_qty": 1},
                     {"variant_id": w.valve_variant["id"], "required_qty": 1.5}]}
    assert w.owner.code("POST", f"/requests/{rid}/items:bulk", 400, json=bad) == "fractional_quantity"
    assert len(w.owner.get(f"/requests/{rid}")["lines"]) == 1  # the valid first line was rolled back too
    good = {"lines": [{"variant_id": w.wire_variants[2]["id"], "required_qty": 1},
                      {"variant_id": w.valve_variant["id"], "required_qty": 1}]}
    assert len(w.owner.post(f"/requests/{rid}/items:bulk", 201, json=good)["lines"]) == 3


def test_request_codes_finalize_and_variant_identity_lock(world):
    w = world
    r1 = w.owner.post("/requests", 201, json={"project_id": w.project["id"]})
    r2 = w.owner.post("/requests", 201, json={"project_id": w.project["id"]})
    assert (r1["code"], r2["code"]) == ("PR-0001", "PR-0002")
    assert w.owner.code("POST", f"/requests/{r1['id']}/finalize", 400) == "empty_request"
    w.owner.post(f"/requests/{r1['id']}/items", 201, json={"variant_id": w.wire_variants[5]["id"], "required_qty": 1})
    w.owner.post(f"/requests/{r1['id']}/finalize")
    vid = w.wire_variants[5]["id"]
    # size/unit are frozen once used in a finalized request; other fields stay editable
    assert w.admin.code("PATCH", f"/variants/{vid}", 409, json={"size_option_id": w.sizes[1]["id"]}) == "variant_identity_locked"
    assert w.admin.patch(f"/variants/{vid}", json={"description": "Annealed"})["description"] == "Annealed"
    # a variant that is only in a draft is still freely editable
    assert w.admin.patch(f"/variants/{w.wire_variants[1]['id']}", json={"size_option_id": w.sizes[2]["id"]})


def test_editing_after_assignment_follows_the_rules(world):
    w = world
    req = build_request(w)
    wire_line, valve_line = req["lines"]
    a = assign(w, req)
    aid = a["id"]
    # add a line: it flows to the live assignment and the worker is told
    extra = w.owner.post(f"/requests/{req['id']}/items", 201, json={"variant_id": w.wire_variants[1]["id"], "required_qty": 6})
    assert len(w.owner.get(f"/assignments/{aid}")["items"]) == 3
    assert any(n["type"] == "list_edited" for n in w.worker.get("/notifications")["items"])
    # change quantity: allocation follows
    w.owner.patch(f"/requests/{req['id']}/items/{wire_line['id']}", json={"required_qty": 12})
    item = next(i for i in w.owner.get(f"/assignments/{aid}")["items"] if i["request_item_id"] == wire_line["id"])
    assert item["allocated_qty"] == 12
    # once the worker has procured, quantity cannot drop below that and the line cannot be removed
    w.worker.post(f"/assignments/{aid}/transitions", json={"to_status": "accepted"})
    w.worker.patch(f"/assignments/{aid}/items/{item['id']}", json={"qty_procured": 8})
    assert w.owner.code("PATCH", f"/requests/{req['id']}/items/{wire_line['id']}", 409, json={"required_qty": 7}) == "below_procured"
    assert w.owner.code("DELETE", f"/requests/{req['id']}/items/{wire_line['id']}", 409) == "line_procured"
    # an untouched line can still be removed, and the change log is kept
    w.owner.delete(f"/requests/{req['id']}/items/{extra['lines'][-1]['id']}")
    assert len(w.owner.get(f"/assignments/{aid}")["items"]) == 2
