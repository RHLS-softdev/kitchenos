import pytest
from app import create_app
from app.extensions import db as _db


@pytest.fixture()
def app(tmp_path):
	"""Fresh app + in-memory SQLite DB for every test — nothing persists between tests."""
	app = create_app()
	app.config.update(
		TESTING=True,
		SQLALCHEMY_DATABASE_URI="sqlite://",
		# Without this, upload tests would write into the real per-user
		# app-data folder (see config.py) instead of a throwaway test dir.
		UPLOAD_DIR=str(tmp_path / "uploads"),
	)
	with app.app_context():
		_db.create_all()
		yield app
		_db.drop_all()


@pytest.fixture()
def client(app):
	return app.test_client()


def register(client, org_name="Test Kitchen", email="owner@test.com", password="pass1234"):
	r = client.post("/auth/register", json={"org_name": org_name, "email": email, "password": password})
	assert r.status_code == 201, r.get_json()
	return r.get_json()


def auth_header(token):
	return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def owner(client):
	"""Registers an org and returns (access_token, user_dict)."""
	data = register(client)
	return data["access_token"], data["user"]
