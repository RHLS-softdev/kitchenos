"""
Recipe nutrition, calculated from linked Ingredient rows rather than typed
in by hand. See Ingredient/Recipe in app/models.py for the data shapes.

Deliberately NOT handled here: how cooking transforms nutrients (water
loss from reduction, vitamin degradation from heat, fat rendering out of
meat, etc.) — the numbers below are simply the sum of raw ingredient
nutrition. That's a real gap for anything cooked hard (a reduced sauce
concentrates calories per gram; a poached dish doesn't). Modeling that
properly needs a per-cooking-method transformation table, which is a
separate, larger effort — tracked in roadmap.md rather than attempted here.
"""
from .models import Ingredient


def recalculate_recipe_nutrition(recipe, org_id):
    """
    Walks recipe.ingredients, resolves each line that has an ingredientId
    against the Ingredient table + its grams_per_unit table, and sums
    nutrition. Returns a dict with the totals plus which lines couldn't be
    resolved (missing link, or a unit with no gram conversion on file) —
    it does NOT guess at those, so a partial result is always reported
    honestly rather than silently under-counting.
    """
    totals = {"kcal": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0}
    unresolved = []
    resolved_count = 0
    lines = recipe.ingredients or []

    for line in lines:
        ingredient_id = line.get("ingredientId")
        if not ingredient_id:
            unresolved.append({"name": line.get("name", "?"), "reason": "not linked to an ingredient"})
            continue

        ingredient = Ingredient.query.filter_by(id=ingredient_id, org_id=org_id).first()
        if not ingredient:
            unresolved.append({"name": line.get("name", "?"), "reason": "linked ingredient not found"})
            continue

        unit = (line.get("unit") or "").strip().lower()
        grams_per_unit = (ingredient.grams_per_unit or {}).get(unit)
        if grams_per_unit is None:
            unresolved.append({"name": line.get("name", "?"),
                                 "reason": f"no gram conversion on file for unit '{unit or '(blank)'}'"})
            continue

        try:
            qty = float(line.get("qty") or 0)
        except (TypeError, ValueError):
            unresolved.append({"name": line.get("name", "?"), "reason": "quantity isn't a number"})
            continue

        grams = qty * grams_per_unit
        scale = grams / 100.0
        totals["kcal"] += ingredient.kcal_per100g * scale
        totals["protein"] += ingredient.protein_per100g * scale
        totals["carbs"] += ingredient.carbs_per100g * scale
        totals["fat"] += ingredient.fat_per100g * scale
        resolved_count += 1

    if lines and resolved_count == len(lines):
        source = "calculated"
    elif resolved_count > 0:
        source = "partial"
    else:
        source = "manual"

    return {
        "kcal": round(totals["kcal"]), "protein": round(totals["protein"], 1),
        "carbs": round(totals["carbs"], 1), "fat": round(totals["fat"], 1),
        "resolvedCount": resolved_count, "totalLines": len(lines),
        "unresolvedLines": unresolved, "nutritionSource": source,
    }
