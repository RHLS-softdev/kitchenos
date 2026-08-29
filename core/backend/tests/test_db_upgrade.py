from sqlalchemy import text, inspect
from app import create_app
from app.extensions import db
from app.db_upgrade import sync_sqlite_schema


def test_adds_missing_column_without_touching_existing_rows():
	app = create_app()
	app.config.update(TESTING=True, SQLALCHEMY_DATABASE_URI="sqlite://")
	with app.app_context():
		# Simulate an "old" install: create the recipes table by hand with
		# only a few columns, as if image_filename didn't exist yet — then
		# insert a row the way an existing user's data would already be there.
		with db.engine.begin() as conn:
			conn.execute(text(
				"CREATE TABLE recipes (id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, name VARCHAR(200) NOT NULL)"
			))
			conn.execute(text(
				"INSERT INTO recipes (id, org_id, name) VALUES (1, 1, 'Old Recipe')"
			))

		db.create_all()  # creates every other table, leaves recipes alone (already exists)
		sync_sqlite_schema(db)

		columns = {c["name"] for c in inspect(db.engine).get_columns("recipes")}
		assert "image_filename" in columns
		assert "menu_price" in columns  # a second, unrelated column added later

		with db.engine.connect() as conn:
			row = conn.execute(text("SELECT id, org_id, name, image_filename FROM recipes WHERE id=1")).mappings().one()
		assert row["name"] == "Old Recipe"  # existing data untouched
		assert row["image_filename"] is None  # new column backfilled as NULL


def test_is_a_no_op_on_an_already_up_to_date_schema(app):
	with app.app_context():
		before = {c["name"] for c in inspect(db.engine).get_columns("recipes")}
		sync_sqlite_schema(db)  # should find nothing missing and do nothing
		after = {c["name"] for c in inspect(db.engine).get_columns("recipes")}
		assert before == after
