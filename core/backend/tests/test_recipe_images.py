import io
from .conftest import register, auth_header


def _make_recipe(client, headers, name="Risotto"):
	r = client.post("/recipes", headers=headers, json={"name": name})
	return r.get_json()


def test_upload_get_and_delete_image(client):
	data = register(client)
	headers = auth_header(data["access_token"])
	recipe = _make_recipe(client, headers)

	fake_image = (io.BytesIO(b"not-really-a-jpeg-but-bytes-are-bytes"), "photo.jpg")
	r = client.post(
		f"/recipes/{recipe['id']}/image",
		headers=headers,
		data={"image": fake_image},
		content_type="multipart/form-data",
	)
	assert r.status_code == 200
	filename = r.get_json()["imageFilename"]
	assert filename.endswith(".jpg")

	r = client.get(f"/recipes/{recipe['id']}/image", headers=headers)
	assert r.status_code == 200
	assert r.data == b"not-really-a-jpeg-but-bytes-are-bytes"

	r = client.delete(f"/recipes/{recipe['id']}/image", headers=headers)
	assert r.status_code == 200
	assert r.get_json()["imageFilename"] is None

	r = client.get(f"/recipes/{recipe['id']}/image", headers=headers)
	assert r.status_code == 404


def test_rejects_disallowed_file_type(client):
	data = register(client)
	headers = auth_header(data["access_token"])
	recipe = _make_recipe(client, headers)

	bad_file = (io.BytesIO(b"#!/bin/sh\necho hi"), "script.sh")
	r = client.post(
		f"/recipes/{recipe['id']}/image",
		headers=headers,
		data={"image": bad_file},
		content_type="multipart/form-data",
	)
	assert r.status_code == 400


def test_reupload_replaces_the_old_file(client):
	data = register(client)
	headers = auth_header(data["access_token"])
	recipe = _make_recipe(client, headers)

	client.post(f"/recipes/{recipe['id']}/image", headers=headers,
	            data={"image": (io.BytesIO(b"first"), "a.jpg")}, content_type="multipart/form-data")
	first_get = client.get(f"/recipes/{recipe['id']}/image", headers=headers)
	assert first_get.data == b"first"

	client.post(f"/recipes/{recipe['id']}/image", headers=headers,
	            data={"image": (io.BytesIO(b"second"), "b.png")}, content_type="multipart/form-data")
	second_get = client.get(f"/recipes/{recipe['id']}/image", headers=headers)
	assert second_get.data == b"second"


def test_image_access_is_scoped_to_the_owning_org(client):
	owner_a = register(client, org_name="Org A", email="a@test.com")
	owner_b = register(client, org_name="Org B", email="b@test.com")
	recipe = _make_recipe(client, auth_header(owner_a["access_token"]))

	client.post(f"/recipes/{recipe['id']}/image", headers=auth_header(owner_a["access_token"]),
	            data={"image": (io.BytesIO(b"secret"), "a.jpg")}, content_type="multipart/form-data")

	r = client.get(f"/recipes/{recipe['id']}/image", headers=auth_header(owner_b["access_token"]))
	assert r.status_code == 404
