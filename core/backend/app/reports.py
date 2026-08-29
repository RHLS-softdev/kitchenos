import csv
import io
from collections import defaultdict
from flask import Blueprint, jsonify, Response
from flask_jwt_extended import jwt_required
from .crud import get_org_id
from .models import (
	Recipe, InventoryItem, CateringEvent, Order, Supplier, PriceHistory,
)

bp = Blueprint("reports", __name__, url_prefix="/reports")


# ── Recipe profitability / menu engineering ───────────────────────
def _profitability_rows(org_id):
	recipes = Recipe.query.filter_by(org_id=org_id).all()
	catering = CateringEvent.query.filter_by(org_id=org_id).all()

	# Popularity proxy: how many catering menus a recipe appears on. There's
	# no POS integration yet (see roadmap Stage 8), so real per-cover sales
	# data isn't available — this is the best signal on hand.
	usage_count = defaultdict(int)
	for event in catering:
		for rid in (event.menu_recipe_ids or []):
			usage_count[rid] += 1
	median_popularity = sorted(usage_count.values())[len(usage_count) // 2] if usage_count else 0

	rows = []
	for r in recipes:
		if not r.menu_price:
			continue  # can't assess profitability without a menu price
		# Recipe.cost is a batch total (see the frontend's cost/servings display) —
		# menu_price is per serving, so cost has to be brought down to the same
		# per-serving basis before the two can be compared.
		cost_per_serving = r.cost / r.servings if r.servings else r.cost
		margin = r.menu_price - cost_per_serving
		margin_pct = (margin / r.menu_price * 100) if r.menu_price else 0
		popularity = usage_count.get(r.id, 0)
		high_margin = margin > 0
		high_popularity = popularity >= median_popularity and popularity > 0
		if high_margin and high_popularity:
			quadrant = "star"          # profitable and popular — protect it
		elif high_margin and not high_popularity:
			quadrant = "puzzle"        # profitable but rarely sold — promote it
		elif not high_margin and high_popularity:
			quadrant = "plowhorse"     # popular but thin margin — re-cost it
		else:
			quadrant = "dog"           # neither — candidate to cut
		rows.append({
			"recipeId": r.id, "name": r.name, "cost": round(cost_per_serving, 2), "menuPrice": r.menu_price,
			"margin": round(margin, 2), "marginPct": round(margin_pct, 1),
			"popularity": popularity, "quadrant": quadrant,
		})
	return rows


@bp.route("/profitability", methods=["GET"])
@jwt_required()
def profitability():
	return jsonify(_profitability_rows(get_org_id()))


# ── Food cost % (overall) ──────────────────────────────────────────
@bp.route("/food-cost", methods=["GET"])
@jwt_required()
def food_cost():
	rows = _profitability_rows(get_org_id())
	priced = [r for r in rows if r["menuPrice"]]
	if not priced:
		return jsonify({"averageFoodCostPct": None, "recipeCount": 0})
	avg_pct = sum(100 - r["marginPct"] for r in priced) / len(priced)
	return jsonify({"averageFoodCostPct": round(avg_pct, 1), "recipeCount": len(priced)})


# ── Inventory valuation ────────────────────────────────────────────
def _inventory_valuation_by_category(org_id):
	items = InventoryItem.query.filter_by(org_id=org_id).all()
	by_category = defaultdict(float)
	for i in items:
		by_category[i.category or "Other"] += (i.qty or 0) * (i.cost or 0)
	return sorted(
		[{"category": c, "value": round(v, 2)} for c, v in by_category.items()],
		key=lambda row: -row["value"],
	)


@bp.route("/inventory-valuation", methods=["GET"])
@jwt_required()
def inventory_valuation():
	by_category = _inventory_valuation_by_category(get_org_id())
	return jsonify({"total": round(sum(r["value"] for r in by_category), 2), "byCategory": by_category})


# ── Supplier comparison ────────────────────────────────────────────
def _supplier_comparison_rows(org_id):
	suppliers = {s.id: s.name for s in Supplier.query.filter_by(org_id=org_id).all()}
	orders = Order.query.filter_by(org_id=org_id).all()

	stats = defaultdict(lambda: {"orderCount": 0, "totalSpend": 0.0, "onTime": 0, "dueCount": 0})
	for o in orders:
		key = o.supplier_id or o.supplier or "Unlinked"
		s = stats[key]
		s["orderCount"] += 1
		s["totalSpend"] += o.total or 0
		if o.due:
			s["dueCount"] += 1
			if o.received_at and o.received_at <= o.due:
				s["onTime"] += 1

	rows = []
	for key, s in stats.items():
		name = suppliers.get(key, key) if isinstance(key, int) else key
		on_time_pct = round(s["onTime"] / s["dueCount"] * 100, 1) if s["dueCount"] else None
		rows.append({"supplier": name, "orderCount": s["orderCount"],
					  "totalSpend": round(s["totalSpend"], 2), "onTimePct": on_time_pct})
	rows.sort(key=lambda r: -r["totalSpend"])
	return rows


@bp.route("/supplier-comparison", methods=["GET"])
@jwt_required()
def supplier_comparison():
	return jsonify(_supplier_comparison_rows(get_org_id()))


# ── Purchase trends (monthly spend) ────────────────────────────────
def _purchase_trends_rows(org_id):
	orders = Order.query.filter_by(org_id=org_id).all()
	by_month = defaultdict(float)
	for o in orders:
		if o.created_at:
			by_month[o.created_at.strftime("%Y-%m")] += o.total or 0
	return [{"month": m, "spend": round(v, 2)} for m, v in sorted(by_month.items())]


@bp.route("/purchase-trends", methods=["GET"])
@jwt_required()
def purchase_trends():
	return jsonify(_purchase_trends_rows(get_org_id()))


# ── Historical pricing for one inventory item ──────────────────────
@bp.route("/price-history/<int:item_id>", methods=["GET"])
@jwt_required()
def price_history(item_id):
	rows = (PriceHistory.query
			.filter_by(org_id=get_org_id(), inventory_item_id=item_id)
			.order_by(PriceHistory.recorded_at.asc()).all())
	return jsonify([r.to_dict() for r in rows])


# ── CSV export ──────────────────────────────────────────────────────
_EXPORTABLE = {
	"profitability": _profitability_rows,
	"inventory-valuation": _inventory_valuation_by_category,
	"purchase-trends": _purchase_trends_rows,
	"supplier-comparison": _supplier_comparison_rows,
}


@bp.route("/export/<name>.csv", methods=["GET"])
@jwt_required()
def export_csv(name):
	builder = _EXPORTABLE.get(name)
	if not builder:
		return jsonify({"error": f"Unknown report '{name}'. Available: {', '.join(_EXPORTABLE)}"}), 404

	rows = builder(get_org_id())
	buffer = io.StringIO()
	if rows:
		writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
		writer.writeheader()
		writer.writerows(rows)
	return Response(
		buffer.getvalue(),
		mimetype="text/csv",
		headers={"Content-Disposition": f'attachment; filename="{name}.csv"'},
	)
