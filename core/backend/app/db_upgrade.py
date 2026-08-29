"""
db.create_all() creates tables that don't exist yet, but never alters a
table that already exists — so a free-tier user who installed an earlier
version, then upgrades, keeps their old table shape forever unless
something adds the new columns for them. Full Alembic migrations solve
this properly, but the desktop build deliberately doesn't ship the
migrations/ package (see run_sidecar.py) — one more moving part to freeze
into every platform's executable, for a problem that's almost always just
"a few columns got added".

This covers that common case only: for every table SQLAlchemy knows about,
diff its model columns against what SQLite actually has (via PRAGMA
table_info) and ALTER TABLE ... ADD COLUMN for whatever's missing. SQLite
supports additive ADD COLUMN natively, so no data is touched or moved.

Deliberately does NOT attempt column drops, renames, or type changes —
none of those are safe to guess automatically, and none have come up yet.
If a real one is ever needed, that's the point to bring in Alembic for
real (the web/Postgres path already has it — see migrations/).

Web/Postgres deployments are unaffected: this only runs when the active
connection is SQLite (see the dialect check below), since that path
already has proper Alembic migrations for schema changes.
"""
from sqlalchemy import inspect, text


def sync_sqlite_schema(db):
    if db.engine.dialect.name != "sqlite":
        return
    inspector = inspect(db.engine)
    existing_tables = set(inspector.get_table_names())

    with db.engine.begin() as conn:
        for table in db.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue  # brand-new table — create_all() already handled it
            existing_columns = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing_columns:
                    continue
                col_type = column.type.compile(dialect=db.engine.dialect)
                # New columns on an existing table must be nullable (or have
                # a default) — SQLite can't backfill a NOT NULL column with
                # no default against existing rows.
                conn.execute(text(
                    f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {col_type}'
                ))
