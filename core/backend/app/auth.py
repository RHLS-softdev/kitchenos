from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, create_refresh_token, jwt_required,
    get_jwt_identity, get_jwt
)
from .extensions import db
from .models import Organization, User, Location

bp = Blueprint("auth", __name__, url_prefix="/auth")


def _tokens_for(user):
    claims = {"org_id": user.org_id, "role": user.role}
    return {
        "access_token": create_access_token(identity=str(user.id), additional_claims=claims),
        "refresh_token": create_refresh_token(identity=str(user.id), additional_claims=claims),
        "user": user.to_dict(),
        "organization": Organization.query.get(user.org_id).to_dict(),
    }


@bp.route("/register", methods=["POST"])
def register():
    """
    Creates a new organization plus its first user (role=owner).
    Body: { "org_name": "...", "email": "...", "password": "..." }
    """
    data = request.get_json() or {}
    org_name = (data.get("org_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    errors = {}
    if not org_name:
        errors["org_name"] = "Organization name is required"
    if not email:
        errors["email"] = "Email is required"
    if len(password) < 8:
        errors["password"] = "Password must be at least 8 characters"
    if email and User.query.filter_by(email=email).first():
        errors["email"] = "An account with this email already exists"
    if errors:
        return jsonify({"errors": errors}), 400

    org = Organization(name=org_name, plan="solo")
    db.session.add(org)
    db.session.flush()  # get org.id before creating the user

    user = User(org_id=org.id, email=email, role="owner")
    user.set_password(password)
    db.session.add(user)
    # Every org starts with one default location so a single-site kitchen
    # never has to think about locations at all — see app/bootstrap.py for
    # the equivalent backfill for orgs that predate this feature.
    db.session.add(Location(org_id=org.id, name="Main Kitchen", is_default=True))
    db.session.commit()

    return jsonify(_tokens_for(user)), 201


@bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid email or password"}), 401

    return jsonify(_tokens_for(user))


@bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    user_id = get_jwt_identity()
    claims = get_jwt()
    access_token = create_access_token(
        identity=user_id,
        additional_claims={"org_id": claims["org_id"], "role": claims["role"]},
    )
    return jsonify({"access_token": access_token})


@bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "Not found"}), 404
    return jsonify({**user.to_dict(), "organization": Organization.query.get(user.org_id).to_dict()})
