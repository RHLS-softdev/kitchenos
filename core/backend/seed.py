"""
Seeds the database with the same sample data used in the KitchenOS frontend
artifact (kitchenos_v2.jsx), under a demo organization/user.

Usage:
    flask --app run.py shell -c "from seed import run; run()"
or just:
    python3 seed.py
"""
from datetime import date, datetime
from dotenv import load_dotenv

load_dotenv()

from app import create_app
from app.extensions import db
from app.models import (
    Organization, User, Recipe, Ingredient, InventoryItem, Equipment, EquipmentLog,
    Supplier, CateringEvent, Order, OrderLineItem, KitchenTask, TemperatureLog, ShiftNote,
)
from app.nutrition import recalculate_recipe_nutrition


def run():
    app = create_app()
    with app.app_context():
        if Organization.query.filter_by(name="Meridian Hotels — London").first():
            print("Demo data already present — skipping.")
            return

        org = Organization(name="Meridian Hotels — London", plan="venue")
        db.session.add(org)
        db.session.flush()

        user = User(org_id=org.id, email="chef@meridian.test", role="owner", position="Head Chef")
        user.set_password("demo-password-123")
        db.session.add(user)

        r1 = Recipe(org_id=org.id, name="Duck Confit", category="Main", origin="French",
                     servings=4, cost=38, kcal=680, protein=42, carbs=8, fat=48,
                     prep_mins=1440, cook_mins=360, verified=True, menu_price=64,
                     storage_notes="Keep submerged in fat, refrigerated", shelf_life_days=14,
                     allergens=["none"], flavours=["umami", "fat", "savoury"],
                     ingredients=[
                         {"name": "Duck legs", "qty": "4", "unit": "pcs"},
                         {"name": "Duck fat", "qty": "500", "unit": "g"},
                         {"name": "Fresh thyme", "qty": "4", "unit": "sprigs"},
                         {"name": "Garlic", "qty": "4", "unit": "cloves"},
                         {"name": "Coarse salt", "qty": "30", "unit": "g"},
                     ],
                     steps=[
                         "Salt duck legs generously with coarse salt, fresh thyme and smashed garlic. Refrigerate overnight (min. 12 hours).",
                         "Remove from cure, pat dry thoroughly. Submerge in duck fat in a low-sided oven dish.",
                         "Cook at 80°C for 6 hours until meat pulls freely from bone.",
                         "Rest 20 minutes uncovered. Crisp skin under the grill for 4 minutes and serve.",
                     ])

        r2 = Recipe(org_id=org.id, name="Mushroom Risotto", category="Main", origin="Italian",
                     servings=6, cost=18, kcal=420, protein=12, carbs=68, fat=14,
                     prep_mins=15, cook_mins=30, verified=True, menu_price=22,
                     storage_notes="Best made to order — does not hold well", shelf_life_days=1,
                     allergens=["dairy", "gluten"], flavours=["umami", "creamy", "earthy"],
                     ingredients=[
                         {"name": "Arborio rice", "qty": "500", "unit": "g"},
                         {"name": "Mixed mushrooms", "qty": "300", "unit": "g"},
                         {"name": "Parmigiano", "qty": "80", "unit": "g"},
                         {"name": "Shallots", "qty": "2", "unit": "pcs"},
                         {"name": "White wine", "qty": "150", "unit": "ml"},
                         {"name": "Vegetable stock", "qty": "1200", "unit": "ml"},
                         {"name": "Unsalted butter", "qty": "50", "unit": "g"},
                     ],
                     steps=[
                         "Warm stock in a separate pan. Sauté shallots in butter until soft and translucent.",
                         "Add mushrooms and cook until their moisture fully evaporates.",
                         "Add rice and toast 2 minutes. Deglaze with white wine and stir until absorbed.",
                         "Add stock one ladle at a time, stirring constantly. Continue 18–20 minutes.",
                         "Off heat, fold in Parmigiano and cold butter. Season generously and serve immediately.",
                     ])

        r3 = Recipe(org_id=org.id, name="Lemon Tart", category="Dessert", origin="French",
                     servings=8, cost=14, kcal=310, protein=5, carbs=44, fat=14,
                     prep_mins=60, cook_mins=25, verified=False, menu_price=9,
                     storage_notes="Refrigerate, best within 2 days", shelf_life_days=2,
                     allergens=["dairy", "gluten", "egg"], flavours=["acid", "sweet", "bright"],
                     ingredients=[
                         {"name": "Lemons", "qty": "4", "unit": "pcs"},
                         {"name": "Eggs", "qty": "4", "unit": "pcs"},
                         {"name": "Double cream", "qty": "200", "unit": "ml"},
                         {"name": "Caster sugar", "qty": "150", "unit": "g"},
                         {"name": "Unsalted butter", "qty": "80", "unit": "g"},
                         {"name": "Plain flour", "qty": "200", "unit": "g"},
                     ],
                     steps=[
                         "Make shortcrust pastry, wrap and rest 30 minutes. Blind bake shell at 180°C for 15 minutes; remove paper and bake 5 more.",
                         "Zest and juice lemons. Whisk with eggs and sugar until pale.",
                         "Stir in cream, strain through a fine sieve.",
                         "Pour into warm tart shell. Bake at 160°C for 20–25 minutes until just set with a slight wobble.",
                         "Cool completely at room temperature before slicing.",
                     ])

        db.session.add_all([r1, r2, r3])
        db.session.flush()  # need recipe IDs for catering menus below

        # Ingredient database demo data — a few verified entries, linked into
        # the risotto's ingredient lines so nutrition auto-calc has something
        # real to compute. Left partially linked on purpose (4 of 7 lines) to
        # show the "partial" state honestly, same as recalculation would in
        # real use with an incomplete ingredient database.
        ing_rice = Ingredient(org_id=org.id, name="Arborio rice", category="Grain",
                                default_unit="g", grams_per_unit={"g": 1, "kg": 1000},
                                kcal_per100g=356, protein_per100g=6.5, carbs_per100g=77, fat_per100g=0.6,
                                allergens=[], source="open_database", verified=True,
                                verified_by_user_id=user.id, verified_at=datetime.utcnow())
        ing_mushroom = Ingredient(org_id=org.id, name="Mixed mushrooms", category="Mushrooms",
                                    default_unit="g", grams_per_unit={"g": 1, "kg": 1000},
                                    kcal_per100g=22, protein_per100g=3.1, carbs_per100g=3.3, fat_per100g=0.3,
                                    allergens=[], source="open_database", verified=True,
                                    verified_by_user_id=user.id, verified_at=datetime.utcnow())
        ing_parmesan = Ingredient(org_id=org.id, name="Parmigiano", category="Dairy",
                                    default_unit="g", grams_per_unit={"g": 1, "kg": 1000},
                                    kcal_per100g=431, protein_per100g=38, carbs_per100g=4.1, fat_per100g=29,
                                    allergens=["dairy"], source="manual", verified=False)
        ing_butter = Ingredient(org_id=org.id, name="Unsalted butter", category="Dairy",
                                  default_unit="g", grams_per_unit={"g": 1, "kg": 1000},
                                  kcal_per100g=717, protein_per100g=0.9, carbs_per100g=0.1, fat_per100g=81,
                                  allergens=["dairy"], source="open_database", verified=True,
                                  verified_by_user_id=user.id, verified_at=datetime.utcnow())
        db.session.add_all([ing_rice, ing_mushroom, ing_parmesan, ing_butter])
        db.session.flush()  # need ingredient IDs to link into r2's ingredient lines

        r2.ingredients = [
            {"name": "Arborio rice", "qty": "500", "unit": "g", "ingredientId": ing_rice.id},
            {"name": "Mixed mushrooms", "qty": "300", "unit": "g", "ingredientId": ing_mushroom.id},
            {"name": "Parmigiano", "qty": "80", "unit": "g", "ingredientId": ing_parmesan.id},
            {"name": "Shallots", "qty": "2", "unit": "pcs"},
            {"name": "White wine", "qty": "150", "unit": "ml"},
            {"name": "Vegetable stock", "qty": "1200", "unit": "ml"},
            {"name": "Unsalted butter", "qty": "50", "unit": "g", "ingredientId": ing_butter.id},
        ]
        nutrition_result = recalculate_recipe_nutrition(r2, org.id)
        r2.kcal = nutrition_result["kcal"]
        r2.protein = nutrition_result["protein"]
        r2.carbs = nutrition_result["carbs"]
        r2.fat = nutrition_result["fat"]
        r2.nutrition_source = nutrition_result["nutritionSource"]

        s1 = Supplier(org_id=org.id, name="FreshFarm Co", type="Farm", distance=42, rating=4.8,
                     products=["Chicken", "Duck", "Pork"], certified=["organic"],
                     contact="mark@freshfarm.co", note="Direct farmer, seasonal availability")
        s2 = Supplier(org_id=org.id, name="Dairy Direct", type="Dairy co-op", distance=18, rating=4.6,
                     products=["Cream", "Cheese", "Butter", "Milk"], certified=["halal"],
                     contact="orders@dairydirect.com", note="3-day lead time")
        s3 = Supplier(org_id=org.id, name="GreenLeaf Market", type="Produce hub", distance=8, rating=4.5,
                     products=["Vegetables", "Fruit", "Herbs"], certified=["organic", "seasonal"],
                     contact="supply@greenleaf.io", note="Daily delivery available")
        s4 = Supplier(org_id=org.id, name="GrainHouse", type="Mill", distance=95, rating=4.3,
                     products=["Rice", "Flour", "Pasta"], certified=[],
                     contact="bulk@grainhouse.com", note="Bulk orders only, 50kg minimum")
        db.session.add_all([s1, s2, s3, s4])
        db.session.flush()  # need supplier IDs to link inventory items below

        i_duck = InventoryItem(org_id=org.id, name="Duck legs", category="Protein", unit="kg",
                       qty=2, par_level=6, cost=14.0, supplier_id=s1.id,
                       expires=date(2026, 5, 22))
        db.session.add_all([
            InventoryItem(org_id=org.id, name="Chicken breast", category="Protein", unit="kg",
                           qty=24, par_level=10, cost=8.4, supplier_id=s1.id,
                           expires=date(2026, 5, 24)),
            InventoryItem(org_id=org.id, name="Heavy cream", category="Dairy", unit="L",
                           qty=4, par_level=8, cost=3.2, supplier_id=s2.id,
                           expires=date(2026, 5, 21)),
            InventoryItem(org_id=org.id, name="Arborio rice", category="Grain", unit="kg",
                           qty=15, par_level=5, cost=4.1, supplier_id=s4.id,
                           expires=date(2027, 1, 1)),
            i_duck,
            InventoryItem(org_id=org.id, name="Parmigiano", category="Dairy", unit="kg",
                           qty=3, par_level=2, cost=22.0, supplier_id=s2.id,
                           expires=date(2026, 6, 15)),
            InventoryItem(org_id=org.id, name="Lemons", category="Produce", unit="pcs",
                           qty=30, par_level=20, cost=0.4, supplier_id=s3.id,
                           expires=date(2026, 5, 28)),
        ])
        db.session.flush()  # need i_duck's ID for the order line item below

        eq1 = Equipment(org_id=org.id, name="Combi oven — Bay 1", status="ok",
                         last_service=date(2026, 2, 10), next_service=date(2026, 8, 10),
                         warranty="2028-02", cost=14200)
        eq2 = Equipment(org_id=org.id, name="Walk-in refrigerator", status="warning",
                         last_service=date(2025, 11, 1), next_service=date(2026, 5, 1),
                         warranty="2027-06", notes="Seal needs inspection", cost=8900)
        eq3 = Equipment(org_id=org.id, name="Industrial dishwasher", status="ok",
                         last_service=date(2026, 4, 15), next_service=date(2026, 10, 15),
                         warranty="2026-12", cost=6400)
        eq4 = Equipment(org_id=org.id, name="Blast chiller", status="critical",
                         last_service=date(2025, 9, 1), next_service=date(2026, 3, 1),
                         warranty="2025-09", notes="Overdue — schedule immediately", cost=9800)
        db.session.add_all([eq1, eq2, eq3, eq4])

        db.session.add_all([
            CateringEvent(org_id=org.id, name="Board dinner — Meridian Hotels", date=date(2026, 6, 14),
                           pax=40, status="confirmed", revenue=4800, menu_recipe_ids=[r1.id, r3.id]),
            CateringEvent(org_id=org.id, name="Staff conference — City Hospital", date=date(2026, 6, 28),
                           pax=120, status="planning", revenue=3600, menu_recipe_ids=[r2.id],
                           notes="Vegetarian options required"),
            CateringEvent(org_id=org.id, name="Wedding — Ashford Estate", date=date(2026, 7, 12),
                           pax=220, status="quoted", revenue=18400, menu_recipe_ids=[r1.id, r2.id, r3.id]),
        ])

        order1 = Order(org_id=org.id, supplier="FreshFarm Co", supplier_id=s1.id,
                        status="in-transit", due=date(2026, 5, 21), total=312, created_at=date(2026, 5, 17))
        order1.line_items = [
            OrderLineItem(name="Duck legs", unit="kg", qty_ordered=8, qty_received=0,
                            unit_cost=14.0, inventory_item_id=i_duck.id),
        ]
        db.session.add_all([
            order1,
            Order(org_id=org.id, supplier="Dairy Direct", supplier_id=s2.id, items="Heavy cream 12L, Parmigiano 2kg",
                  status="processing", due=date(2026, 5, 23), total=186, created_at=date(2026, 5, 18)),
            Order(org_id=org.id, supplier="GreenLeaf Market", supplier_id=s3.id, items="Assorted produce",
                  status="delivered", due=date(2026, 5, 20), total=94, received_at=date(2026, 5, 19),
                  created_at=date(2026, 5, 15)),
        ])

        # Stage 2 — restaurant workflow demo rows
        db.session.add_all([
            KitchenTask(org_id=org.id, type="prep", title="Portion duck legs for the weekend",
                         assigned_to="Line cook", due_date=date(2026, 5, 20), recurring="weekly"),
            KitchenTask(org_id=org.id, type="cleaning", title="Deep clean walk-in fridge",
                         assigned_to="Closing shift", due_date=date(2026, 5, 24), recurring="weekly"),
            KitchenTask(org_id=org.id, type="checklist", title="Fire suppression system check",
                         assigned_to="Head chef", due_date=date(2026, 6, 1)),
            TemperatureLog(org_id=org.id, location="Walk-in fridge 1", reading_type="fridge", temp_c=3.5),
            TemperatureLog(org_id=org.id, location="Freezer 2", reading_type="freezer", temp_c=-19),
            TemperatureLog(org_id=org.id, location="Soup station hot hold", reading_type="hot_hold", temp_c=58,
                            notes="Below 63°C — reheated and rechecked"),
            ShiftNote(org_id=org.id, author_id=user.id, shift="evening",
                       note="86'd the lemon tart — used the last of the shortcrust. Order more flour."),
        ])

        db.session.commit()
        print("Seeded demo org 'Meridian Hotels — London'.")
        print("Login: chef@meridian.test / demo-password-123")


if __name__ == "__main__":
    run()
