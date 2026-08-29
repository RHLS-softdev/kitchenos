from .conftest import register, auth_header


def test_supplier_link_syncs_text_field(client, owner):
	token, _ = owner
	r = client.post("/suppliers", headers=auth_header(token), json={"name": "Fresh Farms", "rating": 4.5})
	supplier_id = r.get_json()["id"]

	r = client.post("/inventory", headers=auth_header(token),
	                 json={"name": "Tomatoes", "cost": 2.5, "supplier_id": supplier_id})
	assert r.status_code == 201
	assert r.get_json()["supplier"] == "Fresh Farms"


def test_price_history_logs_on_cost_change(client, owner):
	token, _ = owner
	r = client.post("/inventory", headers=auth_header(token), json={"name": "Flour", "cost": 1.0})
	item_id = r.get_json()["id"]

	client.put(f"/inventory/{item_id}", headers=auth_header(token), json={"cost": 1.5})
	client.put(f"/inventory/{item_id}", headers=auth_header(token), json={"cost": 1.5})  # no change — shouldn't log again

	r = client.get(f"/reports/price-history/{item_id}", headers=auth_header(token))
	costs = [row["unitCost"] for row in r.get_json()]
	assert costs == [1.0, 1.5]


def test_waste_log_and_inventory_batch(client, owner):
	token, _ = owner
	r = client.post("/inventory", headers=auth_header(token), json={"name": "Milk", "cost": 1.2})
	item_id = r.get_json()["id"]

	r = client.post("/waste-logs", headers=auth_header(token), json={
		"inventory_item_id": item_id, "item_name": "Milk", "qty": 2, "unit": "l",
		"reason": "spoilage", "cost_impact": 2.4,
	})
	assert r.status_code == 201

	r = client.post("/inventory-batches", headers=auth_header(token), json={
		"inventory_item_id": item_id, "lot_number": "L1", "qty": 10,
		"unit_cost": 1.2, "received_date": "2026-07-01",
	})
	assert r.status_code == 201


def test_recipe_version_history_tracks_edits(client, owner):
	token, _ = owner
	r = client.post("/recipes", headers=auth_header(token),
	                 json={"name": "Soup", "cost": 1.0, "menu_price": 6.0})
	recipe_id = r.get_json()["id"]

	client.put(f"/recipes/{recipe_id}", headers=auth_header(token), json={"cost": 1.5})
	client.put(f"/recipes/{recipe_id}", headers=auth_header(token), json={"cost": 2.0})

	r = client.get(f"/recipes/{recipe_id}/versions", headers=auth_header(token))
	versions = r.get_json()
	assert len(versions) == 2
	# newest first; the first edit's pre-image had the original cost of 1.0
	assert versions[-1]["snapshot"]["cost"] == 1.0


def test_receiving_partial_then_full_delivery(client, owner):
	token, _ = owner
	r = client.post("/suppliers", headers=auth_header(token), json={"name": "Farms Co", "rating": 5})
	supplier_id = r.get_json()["id"]
	r = client.post("/inventory", headers=auth_header(token), json={"name": "Rice", "qty": 0, "cost": 1.0})
	item_id = r.get_json()["id"]

	r = client.post("/orders", headers=auth_header(token), json={
		"supplier_id": supplier_id, "total": 20.0,
		"line_items": [{"inventory_item_id": item_id, "name": "Rice", "qty_ordered": 10, "unit_cost": 2.0}],
	})
	order = r.get_json()
	line_id = order["lineItems"][0]["id"]

	r = client.post(f"/orders/{order['id']}/receive", headers=auth_header(token),
	                 json={"lines": [{"line_item_id": line_id, "qty_received": 4}]})
	assert r.get_json()["status"] == "partial"

	r = client.post(f"/orders/{order['id']}/receive", headers=auth_header(token),
	                 json={"lines": [{"line_item_id": line_id, "qty_received": 6}]})
	assert r.get_json()["status"] == "delivered"

	r = client.get(f"/inventory/{item_id}", headers=auth_header(token))
	assert r.get_json()["qty"] == 10


def test_profitability_and_valuation_reports(client, owner):
	token, _ = owner
	client.post("/recipes", headers=auth_header(token), json={"name": "Pasta", "cost": 2.0, "menu_price": 10.0, "servings": 1})
	client.post("/inventory", headers=auth_header(token), json={"name": "Cheese", "qty": 5, "cost": 4.0})

	r = client.get("/reports/profitability", headers=auth_header(token))
	rows = r.get_json()
	assert rows[0]["marginPct"] == 80.0

	r = client.get("/reports/inventory-valuation", headers=auth_header(token))
	assert r.get_json()["total"] == 20.0

	r = client.get("/reports/export/profitability.csv", headers=auth_header(token))
	assert r.content_type.startswith("text/csv")


def test_kitchen_task_temperature_log_and_calendar(client, owner):
	token, _ = owner
	client.post("/tasks", headers=auth_header(token),
	             json={"type": "cleaning", "title": "Deep clean fryer", "due_date": "2026-08-01"})
	r = client.post("/temperature-logs", headers=auth_header(token),
	                 json={"location": "Freezer 1", "reading_type": "freezer", "temp_c": -10})
	assert r.get_json()["withinRange"] is False  # -10 is above the -18 freezer threshold

	r = client.get("/calendar", headers=auth_header(token))
	assert any(e["type"] == "cleaning" for e in r.get_json())


def test_shift_note_author_is_server_set(client, owner):
	token, user = owner
	r = client.post("/shift-notes", headers=auth_header(token), json={"note": "86 the salmon"})
	assert r.status_code == 201
	assert r.get_json()["authorEmail"] == user["email"]
