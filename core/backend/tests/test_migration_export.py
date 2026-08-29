from .conftest import register, auth_header


def test_owner_can_export_empty_org(client):
	data = register(client)
	r = client.get("/migration/export", headers=auth_header(data["access_token"]))
	assert r.status_code == 200
	body = r.get_json()
	assert body["schema_version"] == 1
	assert body["org_id"] == data["user"]["org_id"]
	assert body["tables"]["recipes"] == []


def test_export_includes_created_data(client):
	data = register(client)
	headers = auth_header(data["access_token"])
	client.post("/inventory", headers=headers, json={"name": "Flour", "qty": 5})

	r = client.get("/migration/export", headers=headers)
	items = r.get_json()["tables"]["inventory_items"]
	assert len(items) == 1
	assert items[0]["name"] == "Flour"


def test_export_never_includes_the_users_table(client):
	"""users has an org_id column like everything else — without the explicit
	exclusion this table-driven exporter would otherwise sweep local password
	hashes into a JSON file meant to migrate into Clerk, which doesn't even
	use them."""
	data = register(client)
	r = client.get("/migration/export", headers=auth_header(data["access_token"]))
	assert "users" not in r.get_json()["tables"]


def test_export_includes_child_rows_scoped_through_a_parent(client):
	"""equipment_logs and order_line_items have no org_id of their own —
	confirms they're joined in via their parent rather than silently dropped."""
	data = register(client)
	headers = auth_header(data["access_token"])

	eq = client.post("/equipment", headers=headers, json={"name": "Oven"}).get_json()
	client.post(f"/equipment/{eq['id']}/log", headers=headers, json={"note": "Serviced"})

	r = client.get("/migration/export", headers=headers)
	logs = r.get_json()["tables"]["equipment_logs"]
	assert len(logs) == 1
	assert logs[0]["equipment_id"] == eq["id"]


def test_export_is_owner_only(client, app):
	from app.extensions import db
	from app.models import User

	staff_data = register(client, org_name="Staff Kitchen", email="staff@test.com")
	with app.app_context():
		u = User.query.filter_by(email="staff@test.com").first()
		u.role = "staff"
		db.session.commit()

	r = client.post("/auth/login", json={"email": "staff@test.com", "password": "pass1234"})
	staff_token = r.get_json()["access_token"]

	r = client.get("/migration/export", headers=auth_header(staff_token))
	assert r.status_code == 403


def test_export_does_not_leak_other_orgs_data(client):
	owner_a = register(client, org_name="Org A", email="a@test.com")
	owner_b = register(client, org_name="Org B", email="b@test.com")
	client.post("/inventory", headers=auth_header(owner_a["access_token"]), json={"name": "Org A Flour"})

	r = client.get("/migration/export", headers=auth_header(owner_b["access_token"]))
	assert r.get_json()["tables"]["inventory_items"] == []
