from datetime import datetime, date
from werkzeug.security import generate_password_hash, check_password_hash
from .extensions import db


# ── Tenancy ──────────────────────────────────────────────────────
class Organization(db.Model):
    __tablename__ = "organizations"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    plan = db.Column(db.String(20), nullable=False, default="solo")  # solo | venue | chain
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    users = db.relationship("User", backref="organization", lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {"id": self.id, "name": self.name, "plan": self.plan}


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True)
    email = db.Column(db.String(200), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="owner")  # owner | manager | staff — the actual permission tier
    # Job title shown in the UI (e.g. "Head Chef", "Sous Chef", "Line Cook").
    # Display-only — permission checks always go through `role` above, not this.
    position = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {"id": self.id, "email": self.email, "role": self.role,
                 "position": self.position, "org_id": self.org_id}


# ── Shared helper ────────────────────────────────────────────────
def _non_negative(errors, value, field, label=None):
    if (value or 0) < 0:
        errors[field] = f"{label or field} cannot be negative"


def _current_user_is_owner():
    """
    True if the current request's JWT role is "owner", OR if there's no
    request/JWT context at all (e.g. seed.py or a test fixture creating
    data directly) — there's no "other user" to protect data from in that
    case, so it falls open rather than raising.
    """
    try:
        from flask_jwt_extended import get_jwt
        return get_jwt().get("role") == "owner"
    except RuntimeError:
        return True


# ── Recipes ──────────────────────────────────────────────────────
class Recipe(db.Model):
    __tablename__ = "recipes"

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True)

    name = db.Column(db.String(200), nullable=False)
    category = db.Column(db.String(50), default="Main")
    origin = db.Column(db.String(100), default="")
    servings = db.Column(db.Integer, default=4)
    cost = db.Column(db.Float, default=0)
    kcal = db.Column(db.Integer, default=0)
    protein = db.Column(db.Float, default=0)
    carbs = db.Column(db.Float, default=0)
    fat = db.Column(db.Float, default=0)
    prep_mins = db.Column(db.Integer, default=0)
    cook_mins = db.Column(db.Integer, default=0)
    verified = db.Column(db.Boolean, default=False)

    # Menu price is what's charged per serving on the menu — cost (above) is
    # what it costs to make. The gap between the two drives the Stage 3
    # profitability / menu-engineering reports (see app/reports.py).
    menu_price = db.Column(db.Float, default=0)
    storage_notes = db.Column(db.String(500), default="")   # e.g. "Refrigerate, use within 3 days"
    shelf_life_days = db.Column(db.Integer, nullable=True)

    allergens = db.Column(db.JSON, default=list)     # ["dairy","gluten"]
    flavours = db.Column(db.JSON, default=list)      # ["umami","savoury"]
    # [{"name","qty","unit","ingredientId"}] — ingredientId is optional; when
    # set, it links this line to a verified Ingredient (see the Ingredient
    # model below) so nutrition can be auto-calculated from real data.
    ingredients = db.Column(db.JSON, default=list)
    steps = db.Column(db.JSON, default=list)         # ["Step 1...", ...]

    # Set only by POST/DELETE /recipes/<id>/image (app/uploads.py) — never
    # part of FIELDS below, so a plain PUT can't be used to point this at an
    # arbitrary path. Just the filename, not a full path: the upload folder
    # itself is resolved server-side (config.UPLOAD_DIR) since it's a
    # different place on every machine.
    image_filename = db.Column(db.String(255), nullable=True)

    # manual | partial | calculated — see app/nutrition.py. "calculated"
    # means every ingredient line resolved against verified Ingredient data;
    # "partial" means some did; "manual" means this was hand-entered (the
    # default, and what every pre-existing recipe stays as).
    nutrition_source = db.Column(db.String(20), default="manual")

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    FIELDS = ["name", "category", "origin", "servings", "cost", "kcal", "protein", "carbs",
              "fat", "prep_mins", "cook_mins", "verified", "allergens", "flavours",
              "ingredients", "steps", "menu_price", "storage_notes", "shelf_life_days"]
    NUTRITION_FIELDS = ("kcal", "protein", "carbs", "fat")

    def to_dict(self):
        d = {f: getattr(self, f) for f in self.FIELDS}
        d["id"] = self.id
        d["nutritionSource"] = self.nutrition_source
        d["imageFilename"] = self.image_filename
        return d

    def update_from_dict(self, data):
        locked = self.nutrition_source == "calculated" and not _current_user_is_owner()
        for f in self.FIELDS:
            if f in data:
                if locked and f in self.NUTRITION_FIELDS:
                    continue  # silently ignore — see _current_user_is_owner() below
                setattr(self, f, data[f])
        return self

    def validate(self):
        errors = {}
        if not (self.name or "").strip():
            errors["name"] = "Name is required"
        if (self.servings if self.servings is not None else 4) < 1:
            errors["servings"] = "Must be at least 1"
        for f, label in [("cost", "Cost"), ("kcal", "Calories"), ("protein", "Protein"),
                          ("carbs", "Carbs"), ("fat", "Fat"), ("prep_mins", "Prep time"),
                          ("cook_mins", "Cook time"), ("menu_price", "Menu price")]:
            _non_negative(errors, getattr(self, f), f, label)
        if self.shelf_life_days is not None and self.shelf_life_days < 0:
            errors["shelf_life_days"] = "Shelf life cannot be negative"
        return errors


class RecipeVersion(db.Model):
    """
    A snapshot of a Recipe taken right before each edit, so past versions
    aren't lost. Populated automatically by the recipes CRUD blueprint's
    on_before_update hook (see app/resources.py) — nothing else needs to
    write to this table.
    """
    __tablename__ = "recipe_versions"

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True)
    recipe_id = db.Column(db.Integer, db.ForeignKey("recipes.id"), nullable=False, index=True)
    snapshot = db.Column(db.JSON, nullable=False)   # full Recipe.to_dict() at the time
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {"id": self.id, "recipeId": self.recipe_id,
                 "createdAt": self.created_at.isoformat(), "snapshot": self.snapshot}


class Ingredient(db.Model):
    """
    The verified nutrition/allergen database (Stage 3's "ingredient
    database"). Recipes optionally link ingredient lines to a row here
    (see Recipe.ingredients) so their nutrition can be auto-calculated
    instead of hand-typed — see app/nutrition.py.

    `source`/`verified`/`verified_by_user_id`/`verified_at` are deliberately
    NOT in FIELDS (not editable via the normal CRUD PUT) — they only change
    through the dedicated POST /ingredients/<id>/verify route, which is
    owner-only. That's the actual protection for "verified" data; everything
    else here (name, category, nutrition numbers as manually typed in) is
    editable by any authenticated org member, same as other catalog data.

    Nutrition is stored per 100g, the standard reference basis, and
    `grams_per_unit` is a small manual unit-conversion table (e.g.
    {"piece": 120, "cup": 240}) used to convert a recipe line's qty/unit
    into grams. A unit with no entry there just can't be auto-calculated —
    see app/nutrition.py, which reports that rather than guessing.
    """
    __tablename__ = "ingredients"

    SOURCES = ("manual", "open_database", "ai_parsed")

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True)

    name = db.Column(db.String(200), nullable=False)
    category = db.Column(db.String(50), default="Other")
    default_unit = db.Column(db.String(20), default="g")
    grams_per_unit = db.Column(db.JSON, default=dict)  # {"g": 1, "piece": 120, "cup": 240}

    kcal_per100g = db.Column(db.Float, default=0)
    protein_per100g = db.Column(db.Float, default=0)
    carbs_per100g = db.Column(db.Float, default=0)
    fat_per100g = db.Column(db.Float, default=0)
    allergens = db.Column(db.JSON, default=list)
    notes = db.Column(db.String(500), default="")

    # Not in FIELDS — see the docstring above. Only POST /ingredients/<id>/verify writes these.
    source = db.Column(db.String(20), default="manual")
    verified = db.Column(db.Boolean, default=False)
    verified_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    verified_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    FIELDS = ["name", "category", "default_unit", "grams_per_unit", "kcal_per100g",
              "protein_per100g", "carbs_per100g", "fat_per100g", "allergens", "notes"]

    def to_dict(self):
        d = {f: getattr(self, f) for f in self.FIELDS}
        d["id"] = self.id
        d["source"] = self.source
        d["verified"] = self.verified
        d["verifiedByUserId"] = self.verified_by_user_id
        d["verifiedAt"] = self.verified_at.isoformat() if self.verified_at else None
        return d

    def update_from_dict(self, data):
        for f in self.FIELDS:
            if f in data:
                setattr(self, f, data[f])
        return self

    def validate(self):
        errors = {}
        if not (self.name or "").strip():
            errors["name"] = "Ingredient name is required"
        for f, label in [("kcal_per100g", "Calories"), ("protein_per100g", "Protein"),
                          ("carbs_per100g", "Carbs"), ("fat_per100g", "Fat")]:
            _non_negative(errors, getattr(self, f), f, label)
        return errors


# ── Locations (multi-site inventory) ────────────────────────────────
class Location(db.Model):
    """
    A physical place inventory can be stored — "Main Kitchen", "Walk-in
    Fridge", "Downtown Branch", etc. Every org gets one default location
    automatically (see app/bootstrap.py) so existing single-site kitchens
    don't have to think about this at all; multi-site ones can add more.
    """
    __tablename__ = "locations"

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True)

    name = db.Column(db.String(100), nullable=False)
    # Exactly one location per org should be `is_default` at a time — enforced
    # by the locations blueprint's on_after_write hook (see app/resources.py),
    # not at the DB level, so it stays swappable via a normal PUT.
    is_default = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    FIELDS = ["name", "is_default"]

    def to_dict(self):
        d = {f: getattr(self, f) for f in self.FIELDS}
        d["id"] = self.id
        return d

    def update_from_dict(self, data):
        for f in self.FIELDS:
            if f in data:
                setattr(self, f, data[f])
        return self

    def validate(self):
        errors = {}
        if not (self.name or "").strip():
            errors["name"] = "Location name is required"
        return errors


# ── Inventory ────────────────────────────────────────────────────
class InventoryItem(db.Model):
    __tablename__ = "inventory_items"

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True)

    name = db.Column(db.String(200), nullable=False)
    category = db.Column(db.String(50), default="Other")
    unit = db.Column(db.String(20), default="")
    qty = db.Column(db.Float, default=0)
    par_level = db.Column(db.Float, default=0)
    cost = db.Column(db.Float, default=0)
    supplier = db.Column(db.String(200), default="")  # free-text fallback / display cache
    supplier_id = db.Column(db.Integer, db.ForeignKey("suppliers.id"), nullable=True, index=True)
    expires = db.Column(db.Date, nullable=True)
    # Nullable so a pre-existing row (from before this feature, or a bare
    # ALTER TABLE ADD COLUMN on someone's upgrading local DB) doesn't fail
    # validation — app/bootstrap.py backfills these to the org's default
    # location on startup, so in practice a user rarely sees "unassigned".
    location_id = db.Column(db.Integer, db.ForeignKey("locations.id"), nullable=True, index=True)

    FIELDS = ["name", "category", "unit", "qty", "par_level", "cost", "supplier",
              "supplier_id", "expires", "location_id"]

    def to_dict(self):
        d = {f: getattr(self, f) for f in self.FIELDS}
        d["id"] = self.id
        if isinstance(d["expires"], date):
            d["expires"] = d["expires"].isoformat()
        return d

    def update_from_dict(self, data):
        for f in self.FIELDS:
            if f in data:
                value = data[f]
                if f == "expires":
                    value = date.fromisoformat(value) if value else None
                setattr(self, f, value)
        # Keep the free-text `supplier` field in sync so older parts of the
        # UI (and the shopping-list computation) that just read that string
        # keep working once an item is linked to a real Supplier row.
        if self.supplier_id:
            supplier = Supplier.query.get(self.supplier_id)
            if supplier:
                self.supplier = supplier.name
        # A brand-new item (no id yet — see crud.py's create_item, which
        # sets org_id then calls this) with no location specified goes to
        # the org's default location rather than sitting unassigned.
        if self.id is None and self.location_id is None:
            default = Location.query.filter_by(org_id=self.org_id, is_default=True).first()
            if default:
                self.location_id = default.id
        return self

    def validate(self):
        errors = {}
        if not (self.name or "").strip():
            errors["name"] = "Item name is required"
        _non_negative(errors, self.qty, "qty", "Quantity")
        _non_negative(errors, self.par_level, "par_level", "Par level")
        _non_negative(errors, self.cost, "cost", "Cost")
        return errors


class InventoryBatch(db.Model):
    """
    A received lot of an inventory item — lets stock be tracked and consumed
    FIFO (oldest `received_date` first) instead of as one undifferentiated
    quantity. Created automatically when a purchase order is received (see
    app/workflow.py's /orders/<id>/receive), or manually for stock already
    on hand.
    """
    __tablename__ = "inventory_batches"

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id"),
                                   nullable=False, index=True)

    lot_number = db.Column(db.String(100), default="")
    qty = db.Column(db.Float, default=0)
    unit_cost = db.Column(db.Float, default=0)
    received_date = db.Column(db.Date, default=lambda: datetime.utcnow().date())
    expires = db.Column(db.Date, nullable=True)

    FIELDS = ["inventory_item_id", "lot_number", "qty", "unit_cost", "received_date", "expires"]

    def to_dict(self):
        d = {f: getattr(self, f) for f in self.FIELDS}
        d["id"] = self.id
        for df in ["received_date", "expires"]:
            if isinstance(d[df], date):
                d[df] = d[df].isoformat()
        return d

    def update_from_dict(self, data):
        for f in self.FIELDS:
            if f in data:
                value = data[f]
                if f in ("received_date", "expires"):
                    value = date.fromisoformat(value) if value else None
                setattr(self, f, value)
        return self

    def validate(self):
        errors = {}
        if not self.inventory_item_id:
            errors["inventory_item_id"] = "An inventory item must be selected"
        _non_negative(errors, self.qty, "qty", "Quantity")
        _non_negative(errors, self.unit_cost, "unit_cost", "Unit cost")
        return errors


class WasteLog(db.Model):
    """A single waste event — spoilage, trim, overproduction, etc."""
    __tablename__ = "waste_logs"

    REASONS = ("spoilage", "trim", "overproduction", "prep_error", "other")

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id"), nullable=True, index=True)

    item_name = db.Column(db.String(200), nullable=False)  # kept even if the item link is removed later
    qty = db.Column(db.Float, default=0)
    unit = db.Column(db.String(20), default="")
    reason = db.Column(db.String(20), default="other")
    cost_impact = db.Column(db.Float, default=0)  # qty * unit cost at time of logging
    notes = db.Column(db.String(500), default="")
    logged_at = db.Column(db.DateTime, default=datetime.utcnow)

    FIELDS = ["inventory_item_id", "item_name", "qty", "unit", "reason", "cost_impact", "notes"]

    def to_dict(self):
        d = {f: getattr(self, f) for f in self.FIELDS}
        d["id"] = self.id
        d["loggedAt"] = self.logged_at.isoformat()
        return d

    def update_from_dict(self, data):
        for f in self.FIELDS:
            if f in data:
                setattr(self, f, data[f])
        return self

    def validate(self):
        errors = {}
        if not (self.item_name or "").strip():
            errors["item_name"] = "Item name is required"
        if self.reason not in self.REASONS:
            errors["reason"] = f"Must be one of: {', '.join(self.REASONS)}"
        _non_negative(errors, self.qty, "qty", "Quantity")
        return errors


class PriceHistory(db.Model):
    """
    One row per cost change on an inventory item — populated automatically
    (see app/resources.py's on_after_write hook for inventory) so Stage 3's
    historical-pricing report has real data without any extra manual step.
    """
    __tablename__ = "price_history"

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id"), nullable=False, index=True)
    supplier_id = db.Column(db.Integer, db.ForeignKey("suppliers.id"), nullable=True)

    unit_cost = db.Column(db.Float, nullable=False)
    recorded_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {"id": self.id, "inventoryItemId": self.inventory_item_id,
                 "supplierId": self.supplier_id, "unitCost": self.unit_cost,
                 "recordedAt": self.recorded_at.isoformat()}


# ── Equipment ────────────────────────────────────────────────────
class Equipment(db.Model):
    __tablename__ = "equipment"

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True)

    name = db.Column(db.String(200), nullable=False)
    status = db.Column(db.String(20), default="ok")  # ok | warning | critical
    last_service = db.Column(db.Date, nullable=True)
    next_service = db.Column(db.Date, nullable=True)
    warranty = db.Column(db.String(20), default="")  # e.g. "2028-02"
    notes = db.Column(db.String(500), default="")
    cost = db.Column(db.Float, default=0)

    logs = db.relationship("EquipmentLog", backref="equipment", lazy=True,
                            cascade="all, delete-orphan", order_by="EquipmentLog.date")

    FIELDS = ["name", "status", "last_service", "next_service", "warranty", "notes", "cost"]

    def to_dict(self):
        d = {f: getattr(self, f) for f in self.FIELDS}
        d["id"] = self.id
        for df in ["last_service", "next_service"]:
            if isinstance(d[df], date):
                d[df] = d[df].isoformat()
        d["log"] = [log.to_dict() for log in self.logs]
        return d

    def update_from_dict(self, data):
        for f in self.FIELDS:
            if f in data:
                value = data[f]
                if f in ("last_service", "next_service"):
                    value = date.fromisoformat(value) if value else None
                setattr(self, f, value)
        return self

    def validate(self):
        errors = {}
        if not (self.name or "").strip():
            errors["name"] = "Equipment name is required"
        _non_negative(errors, self.cost, "cost", "Asset value")
        return errors


class EquipmentLog(db.Model):
    __tablename__ = "equipment_logs"

    id = db.Column(db.Integer, primary_key=True)
    equipment_id = db.Column(db.Integer, db.ForeignKey("equipment.id"), nullable=False, index=True)
    date = db.Column(db.Date, nullable=False, default=lambda: datetime.utcnow().date())
    note = db.Column(db.String(500), default="")

    def to_dict(self):
        return {"id": self.id, "date": self.date.isoformat(), "note": self.note}


# ── Suppliers ────────────────────────────────────────────────────
class Supplier(db.Model):
    __tablename__ = "suppliers"

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True)

    name = db.Column(db.String(200), nullable=False)
    type = db.Column(db.String(50), default="Other")
    distance = db.Column(db.Float, default=0)
    rating = db.Column(db.Float, default=5.0)
    products = db.Column(db.JSON, default=list)
    certified = db.Column(db.JSON, default=list)
    contact = db.Column(db.String(200), default="")
    note = db.Column(db.String(500), default="")

    FIELDS = ["name", "type", "distance", "rating", "products", "certified", "contact", "note"]

    def to_dict(self):
        d = {f: getattr(self, f) for f in self.FIELDS}
        d["id"] = self.id
        return d

    def update_from_dict(self, data):
        for f in self.FIELDS:
            if f in data:
                setattr(self, f, data[f])
        return self

    def validate(self):
        errors = {}
        if not (self.name or "").strip():
            errors["name"] = "Name is required"
        _non_negative(errors, self.distance, "distance", "Distance")
        if not (1 <= (self.rating or 0) <= 5):
            errors["rating"] = "Must be between 1 and 5"
        return errors


# ── Catering ─────────────────────────────────────────────────────
class CateringEvent(db.Model):
    __tablename__ = "catering_events"

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True)

    name = db.Column(db.String(200), nullable=False)
    date = db.Column(db.Date, nullable=True)
    pax = db.Column(db.Integer, default=1)
    status = db.Column(db.String(20), default="quoted")  # quoted|planning|confirmed|completed|cancelled
    revenue = db.Column(db.Float, default=0)
    notes = db.Column(db.String(500), default="")

    # List of recipe IDs used as menus for this event.
    menu_recipe_ids = db.Column(db.JSON, default=list)

    FIELDS = ["name", "date", "pax", "status", "revenue", "notes", "menu_recipe_ids"]

    def to_dict(self):
        d = {f: getattr(self, f) for f in self.FIELDS}
        d["id"] = self.id
        if isinstance(d["date"], date):
            d["date"] = d["date"].isoformat()
        return d

    def update_from_dict(self, data):
        for f in self.FIELDS:
            if f in data:
                value = data[f]
                if f == "date":
                    value = date.fromisoformat(value) if value else None
                setattr(self, f, value)
        return self

    def validate(self):
        errors = {}
        if not (self.name or "").strip():
            errors["name"] = "Event name is required"
        if not self.date:
            errors["date"] = "Date is required"
        if (self.pax if self.pax is not None else 1) < 1:
            errors["pax"] = "Must be at least 1"
        _non_negative(errors, self.revenue, "revenue", "Revenue")
        return errors


# ── Procurement ──────────────────────────────────────────────────
class Order(db.Model):
    __tablename__ = "orders"

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True)

    supplier = db.Column(db.String(200), default="")  # free-text fallback / display cache
    supplier_id = db.Column(db.Integer, db.ForeignKey("suppliers.id"), nullable=True, index=True)
    items = db.Column(db.String(1000), default="")
    # processing|in-transit|partial|delivered|cancelled
    status = db.Column(db.String(20), default="processing")
    due = db.Column(db.Date, nullable=True)
    total = db.Column(db.Float, default=0)
    invoice_url = db.Column(db.String(500), default="")  # link to an uploaded/scanned invoice
    received_at = db.Column(db.Date, nullable=True)       # set once fully received
    created_at = db.Column(db.Date, default=lambda: datetime.utcnow().date())

    line_items = db.relationship("OrderLineItem", backref="order", lazy=True,
                                  cascade="all, delete-orphan")

    FIELDS = ["supplier", "supplier_id", "items", "status", "due", "total",
              "invoice_url", "received_at", "created_at"]

    def to_dict(self):
        d = {f: getattr(self, f) for f in self.FIELDS}
        d["id"] = self.id
        for df in ["due", "received_at", "created_at"]:
            if isinstance(d[df], date):
                d[df] = d[df].isoformat()
        d["lineItems"] = [li.to_dict() for li in self.line_items]
        return d

    def update_from_dict(self, data):
        for f in self.FIELDS:
            if f in data:
                value = data[f]
                if f in ("due", "received_at", "created_at"):
                    value = date.fromisoformat(value) if value else None
                setattr(self, f, value)
        if self.supplier_id:
            supplier = Supplier.query.get(self.supplier_id)
            if supplier:
                self.supplier = supplier.name
        # Structured line items, e.g. [{"name","qty_ordered","unit","unit_cost"}] —
        # optional; existing callers can keep using the freeform `items` text field.
        if "line_items" in data:
            for li_data in data["line_items"]:
                li = OrderLineItem()
                li.update_from_dict(li_data)
                self.line_items.append(li)
        return self

    def validate(self):
        errors = {}
        if not (self.supplier or "").strip():
            errors["supplier"] = "Supplier is required"
        _non_negative(errors, self.total, "total", "Total")
        return errors


# ── Restaurant workflow (Stage 2) ────────────────────────────────
class KitchenTask(db.Model):
    """
    Covers daily prep lists, cleaning schedules, and general kitchen
    checklists with one model — they're all "something to do by when, ticked
    off when done", just filtered by `type` in the UI.
    """
    __tablename__ = "kitchen_tasks"

    TYPES = ("prep", "cleaning", "checklist")

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True)

    type = db.Column(db.String(20), default="prep")
    title = db.Column(db.String(200), nullable=False)
    notes = db.Column(db.String(500), default="")
    assigned_to = db.Column(db.String(200), default="")  # free-text name/role
    due_date = db.Column(db.Date, nullable=True)
    recurring = db.Column(db.String(20), default="")  # "", "daily", "weekly"
    completed = db.Column(db.Boolean, default=False)
    completed_at = db.Column(db.DateTime, nullable=True)

    FIELDS = ["type", "title", "notes", "assigned_to", "due_date", "recurring", "completed"]

    def to_dict(self):
        d = {f: getattr(self, f) for f in self.FIELDS}
        d["id"] = self.id
        if isinstance(d["due_date"], date):
            d["due_date"] = d["due_date"].isoformat()
        d["completedAt"] = self.completed_at.isoformat() if self.completed_at else None
        return d

    def update_from_dict(self, data):
        was_completed = self.completed
        for f in self.FIELDS:
            if f in data:
                value = data[f]
                if f == "due_date":
                    value = date.fromisoformat(value) if value else None
                setattr(self, f, value)
        if self.completed and not was_completed:
            self.completed_at = datetime.utcnow()
        elif not self.completed:
            self.completed_at = None
        return self

    def validate(self):
        errors = {}
        if not (self.title or "").strip():
            errors["title"] = "Title is required"
        if self.type not in self.TYPES:
            errors["type"] = f"Must be one of: {', '.join(self.TYPES)}"
        return errors


class TemperatureLog(db.Model):
    """
    HACCP-style temperature check. `within_range` isn't stored — it's
    derived in to_dict from `reading_type` + `temp_c` so the expected range
    (see within_range() below) can be tightened later without a migration.
    """
    __tablename__ = "temperature_logs"

    READING_TYPES = ("fridge", "freezer", "hot_hold", "other")

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True)

    location = db.Column(db.String(200), nullable=False)  # e.g. "Walk-in fridge 1"
    reading_type = db.Column(db.String(20), default="fridge")
    temp_c = db.Column(db.Float, nullable=False)
    notes = db.Column(db.String(500), default="")
    recorded_at = db.Column(db.DateTime, default=datetime.utcnow)

    FIELDS = ["location", "reading_type", "temp_c", "notes"]

    def to_dict(self):
        d = {f: getattr(self, f) for f in self.FIELDS}
        d["id"] = self.id
        d["recordedAt"] = self.recorded_at.isoformat()
        d["withinRange"] = self.within_range()
        return d

    def within_range(self):
        # Standard HACCP-ish thresholds; "other" locations aren't checked.
        limits = {"fridge": lambda t: t <= 5, "freezer": lambda t: t <= -18,
                  "hot_hold": lambda t: t >= 63}
        check = limits.get(self.reading_type)
        return True if check is None else check(self.temp_c)

    def update_from_dict(self, data):
        for f in self.FIELDS:
            if f in data:
                setattr(self, f, data[f])
        return self

    def validate(self):
        errors = {}
        if not (self.location or "").strip():
            errors["location"] = "Location is required"
        if self.reading_type not in self.READING_TYPES:
            errors["reading_type"] = f"Must be one of: {', '.join(self.READING_TYPES)}"
        return errors


class ShiftNote(db.Model):
    """
    An append-only team notes feed — covers both "shift notes" and a simple
    "internal messaging" board without building real-time chat. Posted by
    whoever is logged in; author is captured server-side, not from the body.
    """
    __tablename__ = "shift_notes"

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True)
    author_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    shift = db.Column(db.String(20), default="general")  # morning|afternoon|evening|general
    note = db.Column(db.String(1000), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        author = User.query.get(self.author_id)
        return {"id": self.id, "shift": self.shift, "note": self.note,
                 "authorEmail": author.email if author else None,
                 "createdAt": self.created_at.isoformat()}


class OrderLineItem(db.Model):
    """
    One ordered item within a purchase order. Lets receiving be tracked
    per-item (qty_received vs qty_ordered), which is what makes partial
    deliveries and per-item purchase history possible.
    """
    __tablename__ = "order_line_items"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False, index=True)
    inventory_item_id = db.Column(db.Integer, db.ForeignKey("inventory_items.id"), nullable=True)

    name = db.Column(db.String(200), nullable=False)
    unit = db.Column(db.String(20), default="")
    qty_ordered = db.Column(db.Float, default=0)
    qty_received = db.Column(db.Float, default=0)
    unit_cost = db.Column(db.Float, default=0)

    FIELDS = ["inventory_item_id", "name", "unit", "qty_ordered", "qty_received", "unit_cost"]

    def to_dict(self):
        d = {f: getattr(self, f) for f in self.FIELDS}
        d["id"] = self.id
        return d

    def update_from_dict(self, data):
        for f in self.FIELDS:
            if f in data:
                setattr(self, f, data[f])
        return self
