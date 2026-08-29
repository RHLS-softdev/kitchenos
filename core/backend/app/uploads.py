"""
Recipe photos. Files live on local disk under config.UPLOAD_DIR (next to the
SQLite file on desktop — see config.py), referenced from Recipe.image_filename
by filename only. Serving goes through an org-scoped GET route rather than a
generic static folder, so it's authorized the same way every other resource
in this app is — a filename alone shouldn't be enough to fetch someone else's
recipe photo.
"""
import os
import uuid
from flask import Blueprint, request, jsonify, send_from_directory, current_app
from flask_jwt_extended import jwt_required
from werkzeug.utils import secure_filename
from .extensions import db
from .crud import get_org_id
from .models import Recipe

bp = Blueprint("recipe_images", __name__, url_prefix="/recipes")

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif"}


def _ext(filename):
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _upload_dir():
    path = current_app.config["UPLOAD_DIR"]
    os.makedirs(path, exist_ok=True)
    return path


def _get_org_recipe(recipe_id):
    return Recipe.query.filter_by(id=recipe_id, org_id=get_org_id()).first()


@bp.route("/<int:recipe_id>/image", methods=["POST"])
@jwt_required()
def upload_recipe_image(recipe_id):
    recipe = _get_org_recipe(recipe_id)
    if not recipe:
        return jsonify({"error": "Recipe not found"}), 404

    file = request.files.get("image")
    if not file or not file.filename:
        return jsonify({"error": "No image file provided"}), 400

    ext = _ext(secure_filename(file.filename))
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({"error": f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"}), 400

    # Old photo (if any) is removed first so a recipe never accumulates
    # orphaned files across repeated re-uploads.
    if recipe.image_filename:
        old_path = os.path.join(_upload_dir(), recipe.image_filename)
        if os.path.exists(old_path):
            os.remove(old_path)

    # Filename is server-generated (org + recipe + random) rather than
    # derived from the uploaded name — sidesteps collisions and path
    # traversal in one move, no extra sanitizing logic needed.
    filename = f"recipe_{get_org_id()}_{recipe_id}_{uuid.uuid4().hex}.{ext}"
    file.save(os.path.join(_upload_dir(), filename))

    recipe.image_filename = filename
    db.session.commit()
    return jsonify(recipe.to_dict())


@bp.route("/<int:recipe_id>/image", methods=["GET"])
@jwt_required()
def get_recipe_image(recipe_id):
    recipe = _get_org_recipe(recipe_id)
    if not recipe or not recipe.image_filename:
        return jsonify({"error": "No image set for this recipe"}), 404
    return send_from_directory(_upload_dir(), recipe.image_filename)


@bp.route("/<int:recipe_id>/image", methods=["DELETE"])
@jwt_required()
def delete_recipe_image(recipe_id):
    recipe = _get_org_recipe(recipe_id)
    if not recipe:
        return jsonify({"error": "Recipe not found"}), 404
    if recipe.image_filename:
        path = os.path.join(_upload_dir(), recipe.image_filename)
        if os.path.exists(path):
            os.remove(path)
        recipe.image_filename = None
        db.session.commit()
    return jsonify(recipe.to_dict())
