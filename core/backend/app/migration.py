"""
Local -> premium migration: export.

This is the free-tier half of "Seamless Migration" (Hard Rule 4). It has
no knowledge of Convex/Clerk at all — it just dumps everything belonging
to the current local organization into one JSON file. The /enterprise
Convex `migration.importKitchenData` mutation is what turns this file
into cloud data, once a user has actually chosen to subscribe.

Deliberately table-driven instead of hand-listing every model: any table
with an org_id column is included automatically, so new org-scoped models
added later don't need this file touched. Rows are returned as plain
dicts of raw column values (snake_case, same as the DB) — the frontend
already has a caseConvert step for its own API calls, and the Convex
import mutation is the one place that should own translating this shape
into Convex documents, not this exporter.
"""
from datetime import date, datetime
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import select
from .extensions import db
from .crud import get_org_id, require_roles

bp = Blueprint("migration", __name__, url_prefix="/migration")

# `users` has an org_id column like everything else, so the generic
# table-driven scan below would otherwise sweep local password hashes into
# the export. Never useful on the other side anyway — the premium tier
# authenticates via Clerk, not this app's local JWT/password system — so
# it's excluded outright rather than field-filtered.
_EXCLUDED_TABLES = {"users"}

# Tables that belong to an org only *through* a parent row, not via their
# own org_id column — each needs its own join instead of the generic
# org_id filter below, or it's silently dropped from every export.
# table_name -> (parent_table_name, fk_column_on_this_table)
_CHILD_TABLES = {
    "equipment_logs": ("equipment", "equipment_id"),
    "order_line_items": ("orders", "order_id"),
}


def _jsonable(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _org_scoped_tables():
    for table in db.metadata.sorted_tables:
        if "org_id" in table.columns and table.name not in _EXCLUDED_TABLES:
            yield table


@bp.route("/export", methods=["GET"])
@jwt_required()
@require_roles("owner")  # exporting everything is an owner-only action, same as recipe export
def export_all():
    org_id = get_org_id()
    dump = {}
    with db.engine.connect() as conn:
        for table in _org_scoped_tables():
            rows = conn.execute(
                select(table).where(table.c.org_id == org_id)
            ).mappings().all()
            dump[table.name] = [
                {k: _jsonable(v) for k, v in row.items()} for row in rows
            ]

        # Child tables are filtered by joining against their parent's
        # already-org-scoped ids (computed above) rather than a column
        # that doesn't exist on them.
        for child_name, (parent_name, fk_col) in _CHILD_TABLES.items():
            parent_ids = [row["id"] for row in dump.get(parent_name, [])]
            rows = []
            if parent_ids:
                child_table = db.metadata.tables[child_name]
                rows = conn.execute(
                    select(child_table).where(child_table.c[fk_col].in_(parent_ids))
                ).mappings().all()
            dump[child_name] = [{k: _jsonable(v) for k, v in row.items()} for row in rows]

    return jsonify({
        "schema_version": 1,
        "exported_at": datetime.utcnow().isoformat(),
        "org_id": org_id,
        "tables": dump,
    })
