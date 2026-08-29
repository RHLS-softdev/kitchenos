from .conftest import register, auth_header


def test_register_and_me(client):
	data = register(client)
	r = client.get("/auth/me", headers=auth_header(data["access_token"]))
	assert r.status_code == 200
	assert r.get_json()["email"] == "owner@test.com"
	assert r.get_json()["role"] == "owner"


def test_register_rejects_duplicate_email(client):
	register(client)
	r = client.post("/auth/register", json={"org_name": "Other", "email": "owner@test.com", "password": "pass1234"})
	assert r.status_code == 400
	assert "email" in r.get_json()["errors"]


def test_login_wrong_password(client):
	register(client)
	r = client.post("/auth/login", json={"email": "owner@test.com", "password": "wrongpass"})
	assert r.status_code == 401


def test_org_isolation_on_list(client):
	"""Two orgs' inventory should never bleed into each other."""
	owner_a = register(client, org_name="Org A", email="a@test.com")
	owner_b = register(client, org_name="Org B", email="b@test.com")

	client.post("/inventory", headers=auth_header(owner_a["access_token"]), json={"name": "Org A Flour"})
	client.post("/inventory", headers=auth_header(owner_b["access_token"]), json={"name": "Org B Flour"})

	r = client.get("/inventory", headers=auth_header(owner_a["access_token"]))
	names = [i["name"] for i in r.get_json()]
	assert names == ["Org A Flour"]


def test_staff_cannot_delete_but_can_create(client, app):
	from app.extensions import db
	from app.models import User

	register(client, email="owner@test.com")
	staff_data = register(client, org_name="Staff Org", email="staff@test.com")
	with app.app_context():
		u = User.query.filter_by(email="staff@test.com").first()
		u.role = "staff"
		db.session.commit()

	r = client.post("/auth/login", json={"email": "staff@test.com", "password": "pass1234"})
	staff_token = r.get_json()["access_token"]

	r = client.post("/inventory", headers=auth_header(staff_token), json={"name": "Salt"})
	assert r.status_code == 201
	item_id = r.get_json()["id"]

	r = client.delete(f"/inventory/{item_id}", headers=auth_header(staff_token))
	assert r.status_code == 403


def test_owner_can_delete(client):
	data = register(client)
	r = client.post("/inventory", headers=auth_header(data["access_token"]), json={"name": "Salt"})
	item_id = r.get_json()["id"]
	r = client.delete(f"/inventory/{item_id}", headers=auth_header(data["access_token"]))
	assert r.status_code == 204


def test_equipment_mutate_requires_manager_or_owner(client, app):
	from app.extensions import db
	from app.models import User

	owner_data = register(client, email="owner2@test.com")
	with app.app_context():
		u = User.query.filter_by(email="owner2@test.com").first()
		u.role = "staff"
		db.session.commit()
	r = client.post("/auth/login", json={"email": "owner2@test.com", "password": "pass1234"})
	staff_token = r.get_json()["access_token"]

	r = client.post("/equipment", headers=auth_header(staff_token), json={"name": "Oven"})
	assert r.status_code == 403
