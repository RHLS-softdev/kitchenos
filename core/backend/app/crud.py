import csv
import io
import json
from functools import wraps
from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import jwt_required, get_jwt
from .extensions import db


def get_org_id():
    """Pull org_id out of the current JWT's claims."""
    return get_jwt()["org_id"]


def require_roles(*roles):
    """
    Route decorator: 403s unless the current JWT's role claim is one of `roles`.
    Must sit BELOW @jwt_required() (i.e. closer to the function) so the JWT
    has already been verified and loaded by the time this reads it.
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if get_jwt().get("role") not in roles:
                return jsonify({"error": "You don't have permission to do that."}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


# Roles allowed to delete, if a blueprint doesn't override it. Deletion is
# the specifically-flagged gap in the README ("any user can delete
# equipment") — everything else (create/update/read) stays open to any
# authenticated org member unless a blueprint passes its own mutate_roles.
DEFAULT_DELETE_ROLES = ("owner", "manager")

# Default export permission — every resource gets CSV export for free (see
# make_crud_blueprint below); who's allowed to actually use it defaults to
# owner+manager, with individual blueprints tightening further (recipes are
# owner-only — "only the chef can export recipes").
DEFAULT_EXPORT_ROLES = ("owner", "manager")


def rows_to_csv(rows):
    """dict -> CSV text. Nested list/dict values (allergens, JSON columns,
    etc.) get JSON-encoded into their cell rather than dropped, so nothing
    silently goes missing from an export."""
    buffer = io.StringIO()
    if rows:
        flat_rows = [
            {k: (json.dumps(v) if isinstance(v, (list, dict)) else v) for k, v in row.items()}
            for row in rows
        ]
        writer = csv.DictWriter(buffer, fieldnames=list(flat_rows[0].keys()))
        writer.writeheader()
        writer.writerows(flat_rows)
    return buffer.getvalue()


def make_crud_blueprint(name, model, url_prefix, mutate_roles=None, delete_roles=None,
                         export_roles=None, on_before_update=None, on_after_write=None,
                         on_before_delete=None):
    """
    Build a Blueprint exposing standard REST CRUD for `model`, scoped by org_id.

    Requires the model to implement:
      - to_dict()
      - update_from_dict(data)
      - validate() -> dict of {field: error_message}, empty if valid

    Optional params:
      - mutate_roles: tuple of roles allowed to POST/PUT. None = any
        authenticated org member (the previous, unrestricted behaviour).
      - delete_roles: tuple of roles allowed to DELETE. Defaults to
        DEFAULT_DELETE_ROLES — pass an explicit tuple to override, e.g. for
        append-only logs you still want staff to be able to prune.
      - export_roles: tuple of roles allowed to GET /export.csv. Defaults
        to DEFAULT_EXPORT_ROLES. Pass () to block export entirely, or a
        narrower tuple (e.g. ("owner",)) to restrict it further.
      - on_before_update(item): called with the item as it was BEFORE
        update_from_dict is applied, e.g. to snapshot a version history row.
      - on_after_write(item, created): called after a successful commit on
        create or update, with created=True/False, e.g. to log a price
        history row when cost changes.
      - on_before_delete(item): called before deletion; return a non-empty
        string to block the delete with that message as a 400 (e.g. "this
        location still has items in it"), or None/falsy to allow it.
    """
    bp = Blueprint(name, __name__, url_prefix=url_prefix)
    delete_roles = delete_roles if delete_roles is not None else DEFAULT_DELETE_ROLES
    export_roles = export_roles if export_roles is not None else DEFAULT_EXPORT_ROLES

    def _guard_mutate(fn):
        return require_roles(*mutate_roles)(fn) if mutate_roles else fn

    @bp.route("", methods=["GET"])
    @jwt_required()
    def list_items():
        items = model.query.filter_by(org_id=get_org_id()).all()
        return jsonify([item.to_dict() for item in items])

    @bp.route("", methods=["POST"])
    @jwt_required()
    @_guard_mutate
    def create_item():
        data = request.get_json() or {}
        item = model()
        item.org_id = get_org_id()
        item.update_from_dict(data)
        errors = item.validate()
        if errors:
            return jsonify({"errors": errors}), 400
        db.session.add(item)
        db.session.commit()
        if on_after_write:
            on_after_write(item, True)
        return jsonify(item.to_dict()), 201

    @bp.route("/export.csv", methods=["GET"])
    @jwt_required()
    @require_roles(*export_roles)
    def export_csv():
        items = model.query.filter_by(org_id=get_org_id()).all()
        csv_text = rows_to_csv([item.to_dict() for item in items])
        return Response(csv_text, mimetype="text/csv",
                         headers={"Content-Disposition": f'attachment; filename="{name}.csv"'})

    @bp.route("/<int:item_id>", methods=["GET"])
    @jwt_required()
    def get_item(item_id):
        item = model.query.filter_by(id=item_id, org_id=get_org_id()).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(item.to_dict())

    @bp.route("/<int:item_id>", methods=["PUT"])
    @jwt_required()
    @_guard_mutate
    def update_item(item_id):
        item = model.query.filter_by(id=item_id, org_id=get_org_id()).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        if on_before_update:
            on_before_update(item)
        data = request.get_json() or {}
        item.update_from_dict(data)
        errors = item.validate()
        if errors:
            db.session.rollback()
            return jsonify({"errors": errors}), 400
        db.session.commit()
        if on_after_write:
            on_after_write(item, False)
        return jsonify(item.to_dict())

    @bp.route("/<int:item_id>", methods=["DELETE"])
    @jwt_required()
    @require_roles(*delete_roles)
    def delete_item(item_id):
        item = model.query.filter_by(id=item_id, org_id=get_org_id()).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        if on_before_delete:
            block_reason = on_before_delete(item)
            if block_reason:
                return jsonify({"error": block_reason}), 400
        db.session.delete(item)
        db.session.commit()
        return "", 204

    return bp
