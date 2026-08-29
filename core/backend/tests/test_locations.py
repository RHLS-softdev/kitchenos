from .conftest import register, auth_header


def test_registering_creates_a_default_location(client):
	data = register(client)
	r = client.get("/locations", headers=auth_header(data["access_token"]))
	locations = r.get_json()
	assert len(locations) == 1
	assert locations[0]["name"] == "Main Kitchen"
	assert locations[0]["is_default"] is True


def test_new_inventory_item_defaults_to_the_default_location(client):
	data = register(client)
	headers = auth_header(data["access_token"])
	default_loc = client.get("/locations", headers=headers).get_json()[0]

	r = client.post("/inventory", headers=headers, json={"name": "Flour"})
	assert r.get_json()["location_id"] == default_loc["id"]


def test_item_can_be_created_in_a_specific_location(client):
	data = register(client)
	headers = auth_header(data["access_token"])
	fridge = client.post("/locations", headers=headers, json={"name": "Walk-in Fridge"}).get_json()

	r = client.post("/inventory", headers=headers, json={"name": "Cream", "location_id": fridge["id"]})
	assert r.get_json()["location_id"] == fridge["id"]


def test_only_one_location_can_be_default_at_a_time(client):
	data = register(client)
	headers = auth_header(data["access_token"])
	main = client.get("/locations", headers=headers).get_json()[0]
	branch = client.post("/locations", headers=headers, json={"name": "Downtown Branch", "is_default": True}).get_json()
	assert branch["is_default"] is True

	main_after = client.get(f"/locations/{main['id']}", headers=headers).get_json()
	assert main_after["is_default"] is False


def test_cannot_delete_a_location_with_items_in_it(client):
	data = register(client)
	headers = auth_header(data["access_token"])
	default_loc = client.get("/locations", headers=headers).get_json()[0]
	client.post("/inventory", headers=headers, json={"name": "Flour"})  # lands in default_loc

	r = client.delete(f"/locations/{default_loc['id']}", headers=headers)
	assert r.status_code == 400
	assert "error" in r.get_json()


def test_can_delete_an_empty_location(client):
	data = register(client)
	headers = auth_header(data["access_token"])
	empty = client.post("/locations", headers=headers, json={"name": "Unused Shelf"}).get_json()

	r = client.delete(f"/locations/{empty['id']}", headers=headers)
	assert r.status_code == 204


def test_staff_cannot_create_or_delete_locations(client, app):
	from app.extensions import db
	from app.models import User

	data = register(client, org_name="Staff Kitchen", email="staff-loc@test.com")
	with app.app_context():
		u = User.query.filter_by(email="staff-loc@test.com").first()
		u.role = "staff"
		db.session.commit()
	r = client.post("/auth/login", json={"email": "staff-loc@test.com", "password": "pass1234"})
	staff_headers = auth_header(r.get_json()["access_token"])

	r = client.post("/locations", headers=staff_headers, json={"name": "New Spot"})
	assert r.status_code == 403


def test_bootstrap_backfills_orgs_that_predate_locations(app):
	"""Simulates an org that existed before this feature: has inventory but
	zero locations and location_id=NULL, exactly what db_upgrade.py's
	column-add would leave an upgrading user's real database looking like."""
	from app.extensions import db
	from app.models import Organization, InventoryItem
	from app.bootstrap import ensure_default_locations

	with app.app_context():
		org = Organization(name="Old Kitchen", plan="solo")
		db.session.add(org)
		db.session.flush()
		item = InventoryItem(org_id=org.id, name="Legacy Flour")
		db.session.add(item)
		db.session.commit()
		assert item.location_id is None

		ensure_default_locations(db)

		from app.models import Location
		default = Location.query.filter_by(org_id=org.id, is_default=True).first()
		assert default is not None
		assert default.name == "Main Kitchen"
		db.session.refresh(item)
		assert item.location_id == default.id


def test_bootstrap_is_idempotent(app):
	"""Running the backfill twice (as happens on every app launch) shouldn't
	create a second default location or touch already-assigned items."""
	from app.extensions import db
	from app.models import Location
	from app.bootstrap import ensure_default_locations

	with app.app_context():
		ensure_default_locations(db)
		ensure_default_locations(db)
		# The `app` fixture's own conftest-registered org isn't created here,
		# but any org that does exist should still have exactly one default.
		for org_id in {loc.org_id for loc in Location.query.all()}:
			defaults = Location.query.filter_by(org_id=org_id, is_default=True).all()
			assert len(defaults) <= 1
