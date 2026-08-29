from datetime import date, datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from .extensions import db
from .crud import make_crud_blueprint, get_org_id, require_roles
from .nutrition import recalculate_recipe_nutrition
from .models import (
	Recipe, RecipeVersion, Ingredient, InventoryItem, InventoryBatch, WasteLog, PriceHistory,
	Equipment, EquipmentLog, Supplier, CateringEvent, Order, OrderLineItem, Location,
)


# ── Hooks: recipe version history ───────────────────────────────────
def _snapshot_recipe_version(recipe):
	db.session.add(RecipeVersion(org_id=recipe.org_id, recipe_id=recipe.id,
	                              snapshot=recipe.to_dict()))


# ── Hooks: inventory price history ──────────────────────────────────
def _log_price_change(item, created):
	last = (PriceHistory.query.filter_by(inventory_item_id=item.id)
	        .order_by(PriceHistory.recorded_at.desc()).first())
	if created or last is None or last.unit_cost != item.cost:
		db.session.add(PriceHistory(org_id=item.org_id, inventory_item_id=item.id,
		                             supplier_id=item.supplier_id, unit_cost=item.cost))
		db.session.commit()


# ── Hooks: locations ─────────────────────────────────────────────────
def _enforce_single_default_location(location, created):
	"""Only one location per org should be `is_default` — if this one was
	just marked default, unmark every other location in the same org."""
	if location.is_default:
		(Location.query.filter(Location.org_id == location.org_id, Location.id != location.id)
		 .update({"is_default": False}))
		db.session.commit()


def _guard_location_delete(location):
	"""Deleting a location that still has items in it would leave those
	items pointing at a location_id that no longer exists — block it
	instead, same spirit as not letting you delete a supplier with open
	orders."""
	if InventoryItem.query.filter_by(location_id=location.id).first():
		return "Move or reassign this location's inventory items before deleting it."
	return None


# Standard CRUD blueprints — one line each thanks to the generic factory.
# Equipment/suppliers/orders are asset- and spend-sensitive, so day-to-day
# staff can still read them but only owner/manager can create or edit —
# recipes/inventory/catering stay open to any authenticated org member,
# since kitchen staff need to use those constantly.
recipes_bp = make_crud_blueprint("recipes", Recipe, "/recipes",
                                  on_before_update=_snapshot_recipe_version,
                                  export_roles=("owner",))  # "only the chef can export recipes"
inventory_bp = make_crud_blueprint("inventory", InventoryItem, "/inventory",
                                    on_after_write=_log_price_change)
inventory_batches_bp = make_crud_blueprint("inventory_batches", InventoryBatch, "/inventory-batches")
waste_logs_bp = make_crud_blueprint("waste_logs", WasteLog, "/waste-logs")
equipment_bp = make_crud_blueprint("equipment", Equipment, "/equipment",
                                    mutate_roles=("owner", "manager"))
suppliers_bp = make_crud_blueprint("suppliers", Supplier, "/suppliers",
                                    mutate_roles=("owner", "manager"))
catering_bp = make_crud_blueprint("catering", CateringEvent, "/catering")
orders_bp = make_crud_blueprint("orders", Order, "/orders",
                                 mutate_roles=("owner", "manager"))
# Manual entry stays open to any authenticated user (matches "everything
# manually entered should have voice input" — staff routinely enter this),
# but marking a row `verified` only happens through /ingredients/<id>/verify
# below, which is owner-only — see the Ingredient model's docstring.
ingredients_bp = make_crud_blueprint("ingredients", Ingredient, "/ingredients")

# Storage locations — light management concern like suppliers/equipment, so
# same owner/manager gate on create/rename/delete; any staff member can
# still read the list (they need it to pick a location on an item).
locations_bp = make_crud_blueprint("locations", Location, "/locations",
                                    mutate_roles=("owner", "manager"),
                                    on_after_write=_enforce_single_default_location,
                                    on_before_delete=_guard_location_delete)

# Recipe version history — read-only, newest first.
recipe_versions_bp = Blueprint("recipe_versions", __name__, url_prefix="/recipes")


@recipe_versions_bp.route("/<int:recipe_id>/versions", methods=["GET"])
@jwt_required()
def list_recipe_versions(recipe_id):
    versions = (RecipeVersion.query
                .filter_by(recipe_id=recipe_id, org_id=get_org_id())
                .order_by(RecipeVersion.created_at.desc()).all())
    return jsonify([v.to_dict() for v in versions])


# Equipment service logs need their own endpoint (nested resource).
equipment_logs_bp = Blueprint("equipment_logs", __name__, url_prefix="/equipment")


@equipment_logs_bp.route("/<int:equipment_id>/log", methods=["POST"])
@jwt_required()
def add_service_log(equipment_id):
	"""
	Logs a completed service for a piece of equipment, marks status 'ok',
	and updates last/next service dates. Mirrors the artifact's "Log service" action.
	Body: { "date": "YYYY-MM-DD", "note": "...", "next_service": "YYYY-MM-DD" (optional) }
	"""
	eq = Equipment.query.filter_by(id=equipment_id, org_id=get_org_id()).first()
	if not eq:
		return jsonify({"error": "Not found"}), 404

	data = request.get_json() or {}
	log_date = date.fromisoformat(data["date"]) if data.get("date") else date.today()
	note = data.get("note") or "Routine service completed"

	db.session.add(EquipmentLog(equipment_id=eq.id, date=log_date, note=note))

	eq.last_service = log_date
	eq.status = "ok"
	eq.notes = ""
	if data.get("next_service"):
		eq.next_service = date.fromisoformat(data["next_service"])

	db.session.commit()
	return jsonify(eq.to_dict()), 201


# Receiving needs its own endpoint (nested resource) — it isn't a plain
# field update, it fans out into inventory quantities, a new stock batch
# per line, and a price-history row per changed cost.
orders_extra_bp = Blueprint("orders_extra", __name__, url_prefix="/orders")


@orders_extra_bp.route("/<int:order_id>/receive", methods=["POST"])
@jwt_required()
@require_roles("owner", "manager")
def receive_order(order_id):
	"""
	Records a delivery — full or partial — against a purchase order.
	Body: { "received_at": "YYYY-MM-DD" (optional, defaults to today),
	         "lines": [{"line_item_id": 1, "qty_received": 5}, ...] }

	For each line: adds the newly received qty to the linked inventory
	item's stock (if linked), creates an InventoryBatch for FIFO tracking,
	and logs a PriceHistory row if the unit cost differs from last time.
	Order status becomes "delivered" once every line is fully received,
	"partial" if some but not all has arrived, unchanged otherwise.
	"""
	org_id = get_org_id()
	order = Order.query.filter_by(id=order_id, org_id=org_id).first()
	if not order:
		return jsonify({"error": "Not found"}), 404

	data = request.get_json() or {}
	received_date = date.fromisoformat(data["received_at"]) if data.get("received_at") else date.today()
	lines_by_id = {li.id: li for li in order.line_items}

	for line_update in data.get("lines", []):
		line = lines_by_id.get(line_update.get("line_item_id"))
		if not line:
			continue
		qty = float(line_update.get("qty_received") or 0)
		if qty <= 0:
			continue
		line.qty_received = (line.qty_received or 0) + qty

		if line.inventory_item_id:
			item = InventoryItem.query.filter_by(id=line.inventory_item_id, org_id=org_id).first()
			if item:
				item.qty = (item.qty or 0) + qty
				if line.unit_cost:
					item.cost = line.unit_cost  # latest received cost becomes the standing cost
				db.session.add(InventoryBatch(
					org_id=org_id, inventory_item_id=item.id, lot_number=f"PO-{order.id}",
					qty=qty, unit_cost=line.unit_cost or 0, received_date=received_date,
				))
				_log_price_change(item, created=False)

	all_received = all((li.qty_received or 0) >= (li.qty_ordered or 0) for li in order.line_items)
	any_received = any((li.qty_received or 0) > 0 for li in order.line_items)
	if order.line_items:
		order.status = "delivered" if all_received else "partial" if any_received else order.status
	else:
		# No structured line items to reconcile — there's nothing granular to
		# track, so calling this endpoint at all means "mark it received".
		order.status = "delivered"
	if all_received or not order.line_items:
		order.received_at = received_date

	db.session.commit()
	return jsonify(order.to_dict())


# Marking an ingredient "verified" is the one thing about it that's
# protected — see the Ingredient model's docstring. Everything else about
# an ingredient goes through the normal CRUD PUT above.
ingredients_extra_bp = Blueprint("ingredients_extra", __name__, url_prefix="/ingredients")


@ingredients_extra_bp.route("/<int:ingredient_id>/verify", methods=["POST"])
@jwt_required()
@require_roles("owner")
def verify_ingredient(ingredient_id):
	"""
	Body: { "verified": true|false, "source": "manual"|"open_database"|"ai_parsed" (optional) }
	Marks (or unmarks) an ingredient as verified, recording who and when.
	"""
	ingredient = Ingredient.query.filter_by(id=ingredient_id, org_id=get_org_id()).first()
	if not ingredient:
		return jsonify({"error": "Not found"}), 404

	data = request.get_json() or {}
	ingredient.verified = bool(data.get("verified", True))
	if data.get("source") in Ingredient.SOURCES:
		ingredient.source = data["source"]
	if ingredient.verified:
		ingredient.verified_by_user_id = int(get_jwt()["sub"])
		ingredient.verified_at = datetime.utcnow()
	else:
		ingredient.verified_by_user_id = None
		ingredient.verified_at = None

	db.session.commit()
	return jsonify(ingredient.to_dict())


# Nutrition recalculation isn't a plain field update — it reads linked
# Ingredient rows and computes totals — so it gets its own endpoint. Any
# authenticated user can trigger it: applying already-verified data isn't
# itself a sensitive action (unlike marking data verified in the first
# place, or hand-overriding a calculated value — see Recipe.update_from_dict).
recipes_extra_bp = Blueprint("recipes_extra", __name__, url_prefix="/recipes")


@recipes_extra_bp.route("/<int:recipe_id>/recalculate-nutrition", methods=["POST"])
@jwt_required()
def recalculate_nutrition(recipe_id):
	org_id = get_org_id()
	recipe = Recipe.query.filter_by(id=recipe_id, org_id=org_id).first()
	if not recipe:
		return jsonify({"error": "Not found"}), 404

	result = recalculate_recipe_nutrition(recipe, org_id)
	recipe.kcal = result["kcal"]
	recipe.protein = result["protein"]
	recipe.carbs = result["carbs"]
	recipe.fat = result["fat"]
	recipe.nutrition_source = result["nutritionSource"]
	db.session.commit()
	return jsonify({**result, "recipe": recipe.to_dict()})


ALL_BLUEPRINTS = [
	recipes_bp, recipe_versions_bp, recipes_extra_bp, ingredients_bp, ingredients_extra_bp,
	inventory_bp, inventory_batches_bp, waste_logs_bp,
	equipment_bp, equipment_logs_bp, suppliers_bp, catering_bp,
	orders_bp, orders_extra_bp, locations_bp,
]
