from .conftest import register, auth_header


def _make_staff(client, app, email):
	from app.extensions import db
	from app.models import User
	data = register(client, org_name=f"Org {email}", email=email)
	with app.app_context():
		u = User.query.filter_by(email=email).first()
		u.role = "staff"
		db.session.commit()
	r = client.post("/auth/login", json={"email": email, "password": "pass1234"})
	return r.get_json()["access_token"]


def test_ingredient_manual_crud_open_to_any_authenticated_user(client, app):
	staff_token = _make_staff(client, app, "cook@test.com")
	r = client.post("/ingredients", headers=auth_header(staff_token), json={
		"name": "Tomato", "category": "Fruit", "default_unit": "g",
		"grams_per_unit": {"g": 1, "piece": 120},
		"kcal_per100g": 18, "protein_per100g": 0.9, "carbs_per100g": 3.9, "fat_per100g": 0.2,
		"allergens": [],
	})
	assert r.status_code == 201, r.get_json()
	assert r.get_json()["verified"] is False
	assert r.get_json()["source"] == "manual"


def test_ingredient_verify_is_owner_only(client, owner, app):
	token, _ = owner
	r = client.post("/ingredients", headers=auth_header(token), json={"name": "Salt"})
	ingredient_id = r.get_json()["id"]

	staff_token = _make_staff(client, app, "line-cook@test.com")
	r = client.post(f"/ingredients/{ingredient_id}/verify", headers=auth_header(staff_token), json={"verified": True})
	assert r.status_code == 403

	r = client.post(f"/ingredients/{ingredient_id}/verify", headers=auth_header(token),
	                 json={"verified": True, "source": "open_database"})
	assert r.status_code == 200
	body = r.get_json()
	assert body["verified"] is True
	assert body["source"] == "open_database"
	assert body["verifiedAt"] is not None


def test_recipe_nutrition_recalculates_from_linked_ingredients(client, owner):
	token, _ = owner
	r = client.post("/ingredients", headers=auth_header(token), json={
		"name": "Chicken breast", "grams_per_unit": {"g": 1, "kg": 1000},
		"kcal_per100g": 165, "protein_per100g": 31, "carbs_per100g": 0, "fat_per100g": 3.6,
	})
	ingredient_id = r.get_json()["id"]

	r = client.post("/recipes", headers=auth_header(token), json={
		"name": "Grilled Chicken", "servings": 1,
		"ingredients": [{"name": "Chicken breast", "qty": 200, "unit": "g", "ingredientId": ingredient_id}],
	})
	recipe_id = r.get_json()["id"]
	assert r.get_json()["nutritionSource"] == "manual"

	r = client.post(f"/recipes/{recipe_id}/recalculate-nutrition", headers=auth_header(token))
	assert r.status_code == 200
	body = r.get_json()
	assert body["nutritionSource"] == "calculated"
	assert body["kcal"] == 330  # 165 * 2
	assert body["recipe"]["kcal"] == 330
	assert body["unresolvedLines"] == []


def test_recipe_nutrition_reports_unresolved_lines_honestly(client, owner):
	token, _ = owner
	r = client.post("/recipes", headers=auth_header(token), json={
		"name": "Mystery Soup", "servings": 1,
		"ingredients": [{"name": "Unknown broth", "qty": 1, "unit": "cup"}],  # no ingredientId at all
	})
	recipe_id = r.get_json()["id"]
	r = client.post(f"/recipes/{recipe_id}/recalculate-nutrition", headers=auth_header(token))
	body = r.get_json()
	assert body["nutritionSource"] == "manual"
	assert len(body["unresolvedLines"]) == 1
	assert "not linked" in body["unresolvedLines"][0]["reason"]


def test_calculated_nutrition_fields_locked_to_owner(client, owner, app):
	token, _ = owner
	r = client.post("/ingredients", headers=auth_header(token), json={
		"name": "Rice", "grams_per_unit": {"g": 1},
		"kcal_per100g": 130, "protein_per100g": 2.7, "carbs_per100g": 28, "fat_per100g": 0.3,
	})
	ingredient_id = r.get_json()["id"]
	r = client.post("/recipes", headers=auth_header(token), json={
		"name": "Plain Rice", "servings": 1,
		"ingredients": [{"name": "Rice", "qty": 100, "unit": "g", "ingredientId": ingredient_id}],
	})
	recipe_id = r.get_json()["id"]
	client.post(f"/recipes/{recipe_id}/recalculate-nutrition", headers=auth_header(token))

	staff_token = _make_staff(client, app, "prep-cook@test.com")
	# staff is in a DIFFERENT org, so use a manager in the SAME org instead
	# to test the lock itself rather than org isolation.
	from app.extensions import db
	from app.models import User
	with app.app_context():
		u = User.query.filter_by(email="prep-cook@test.com").first()
		u.org_id = User.query.filter_by(email="owner@test.com").first().org_id
		u.role = "manager"
		db.session.commit()
	r = client.post("/auth/login", json={"email": "prep-cook@test.com", "password": "pass1234"})
	manager_token = r.get_json()["access_token"]

	r = client.put(f"/recipes/{recipe_id}", headers=auth_header(manager_token), json={"kcal": 9999})
	assert r.status_code == 200
	assert r.get_json()["kcal"] == 130  # manager's override was silently ignored

	r = client.put(f"/recipes/{recipe_id}", headers=auth_header(token), json={"kcal": 999})
	assert r.get_json()["kcal"] == 999  # owner's override goes through


def test_recipe_export_is_owner_only(client, owner, app):
	token, _ = owner
	r = client.get("/recipes/export.csv", headers=auth_header(token))
	assert r.status_code == 200
	assert r.content_type.startswith("text/csv")

	staff_token = _make_staff(client, app, "server@test.com")
	r = client.get("/recipes/export.csv", headers=auth_header(staff_token))
	assert r.status_code == 403


def test_ingredient_export_allows_manager(client, app):
	owner_data = register(client, email="chef-owner@test.com")
	from app.extensions import db
	from app.models import User
	with app.app_context():
		u = User.query.filter_by(email="chef-owner@test.com").first()
	client.post("/ingredients", headers=auth_header(owner_data["access_token"]), json={"name": "Butter"})

	with app.app_context():
		u2 = User(org_id=u.org_id, email="manager@test.com", role="manager")
		u2.set_password("pass1234")
		db.session.add(u2)
		db.session.commit()
	r = client.post("/auth/login", json={"email": "manager@test.com", "password": "pass1234"})
	manager_token = r.get_json()["access_token"]

	r = client.get("/ingredients/export.csv", headers=auth_header(manager_token))
	assert r.status_code == 200
