# Changelog

## v2 — credentials, icons, ingredient database

- **Ingredient database**: new `Ingredient` model (per-100g nutrition, allergens,
  category, a manual grams-per-unit conversion table). Full CRUD is open to any
  authenticated user (manual entry, voice-input enabled); marking a row
  `verified` is owner-only via `POST /ingredients/<id>/verify`, which also
  records who and when.
- **Recipe nutrition auto-calc**: `POST /recipes/<id>/recalculate-nutrition`
  sums linked ingredients' nutrition (via each ingredient's unit-conversion
  table) and reports any unresolved line rather than guessing. Added
  `Recipe.nutrition_source` (manual/partial/calculated). Once "calculated",
  the kcal/protein/carbs/fat fields lock to owner-only edits
  (`_current_user_is_owner()` in `app/models.py`, falls open outside a
  request context e.g. `seed.py`).
- **Generic CSV export**: added to the shared CRUD factory
  (`make_crud_blueprint`'s new `export_roles` param) — every resource built on
  it gets `GET /export.csv` for free, role-gated (default owner+manager;
  recipes are owner-only — "only the chef can export recipes"). Added by hand
  to the one hand-rolled blueprint (shift notes).
- **User.position**: a display-only job title (e.g. "Head Chef"), separate
  from `role` which remains the actual permission tier used everywhere in RBAC.
- **Auth responses now include organization info** (`/auth/login`,
  `/auth/register`, `/auth/me`) — needed so the frontend can show the real
  subscription plan instead of a hardcoded one.
- **Procurement fix**: orders with no structured line items can now be marked
  received via the same `/orders/<id>/receive` endpoint (previously their
  status silently never changed).
- **Produce category subdivision**: no backend change — category was always
  a free-text field; the frontend's dropdown list was expanded instead
  (Fruit, Leafy Greens, Alliums, Root Vegetables, Cruciferous, Squash &
  Gourds, Mushrooms, Fresh Herbs).
- **Naming fix**: `kcal_per_100g` (and siblings) renamed to `kcal_per100g` —
  the original name couldn't round-trip through the frontend's automatic
  snake_case↔camelCase conversion (an underscore immediately before a digit
  is irreversible in that scheme). Caught before shipping via a standalone
  round-trip check; worth remembering for any future field with a digit in
  its name.
- Icons: vendored the Tabler outline icons actually used (no npm dependency)
  under `kitchenos-frontend/src/icons/`.
- New frontend components: `Icon`, `DurationInput`, `VoiceField` +
  `useSpeechToText`, `SearchBox`, `ExportButton` (all in `ui.jsx` /
  `icons/Icon.jsx`) — shared building blocks used across most pages rather
  than one-off implementations per page.
- Consistency fixes: Marketplace's "Place order"/"View profile" buttons were
  previously non-functional — now real. Billing had three fabricated
  numbers (hardcoded food cost %, cost/cover, and subscription plan) with no
  data behind them — now all three come from real endpoints/fields. Pricing's
  "Get started" and Billing's "Upgrade"/"Manage billing" are now honestly
  disabled with a tooltip instead of silently doing nothing.
- New migration: `c5f7de61b88f` (ingredients, recipe nutrition/version
  fields, user position). Verified up/down.
- 7 new backend tests (`tests/test_ingredients_and_nutrition.py`) covering
  ingredient CRUD/verify, nutrition recalculation (including the honest
  partial/unresolved case), the nutrition-field lock, and export RBAC.

## Stage 1-3 completion + infrastructure (previous update)

### Infrastructure (closes README's "known gaps")
- **RBAC enforcement** — the CRUD blueprint factory (`app/crud.py`) now
  accepts `mutate_roles`/`delete_roles`. Delete defaults to owner/manager
  everywhere; equipment, suppliers, and orders also restrict create/update
  to owner/manager.
- **Rate limiting** — Flask-Limiter (already a dependency, never wired up)
  now caps every `/ai/*` route (`AI_RATE_LIMIT` env var, default 20/hour).
- **Error monitoring** — optional Sentry/GlitchTip init, gated on
  `SENTRY_DSN` being set.
- **Automated tests** — `kitchenos-backend/tests/` (pytest), covering auth,
  RBAC, org isolation, and every feature below.
- **Named DB constraints** — added a naming convention to SQLAlchemy's
  metadata so Alembic autogenerate can actually name new foreign keys
  (needed for SQLite's batch-mode ALTER TABLE; harmless on Postgres).

### Stage 1 — Core product gaps closed
- **Recipes**: menu price, storage notes, shelf life, and automatic version
  history (a snapshot is taken before every edit; `GET
  /recipes/<id>/versions`).
- **Inventory**: real `supplier_id` FK (was free text — the text field is
  now just a display cache kept in sync), `InventoryBatch` for lot/expiry
  tracking, `WasteLog` for spoilage/trim/overproduction.
- **Shopping list**: now grouped by supplier with a price estimate per item
  and per group (duplicate-merging was already implemented).
- **Procurement**: purchase orders can carry structured line items;
  `POST /orders/<id>/receive` supports partial deliveries, updates
  inventory qty automatically, and creates an `InventoryBatch` +
  `PriceHistory` row per receipt. `invoice_url` field for attaching a
  scanned invoice link.
- **Dashboard**: open-orders count, average food-cost %.

### Stage 2 — Restaurant workflow (new)
- `KitchenTask` — prep lists, cleaning schedules, and checklists in one
  model, filtered by `type` in the UI.
- `TemperatureLog` — HACCP-style checks with an automatic in/out-of-range
  flag.
- `ShiftNote` — an append-only feed covering both shift handoff notes and a
  simple team-messaging board.
- `GET /calendar` — read-only aggregation of catering events, task due
  dates, and equipment service dates (not its own table).
- New **Workflow** frontend page ties all of the above together.

### Stage 3 — Financial intelligence (new)
- `PriceHistory` — logged automatically whenever an inventory item's cost
  changes.
- `app/reports.py` — recipe profitability & menu engineering (star /
  plowhorse / puzzle / dog quadrants; popularity is a catering-menu-usage
  proxy pending POS integration), inventory valuation, supplier comparison
  (spend + on-time %), monthly purchase trends, and CSV export for each.
- New **Reports** frontend page.

### Not done / deliberately deferred
See the README's "Still open" list — mainly infra that needs a running
service rather than a code change (Meilisearch, Metabase, APScheduler,
Redis-backed rate limiting), plus a couple of pre-existing UI-only buttons
(marketplace ordering, pricing page CTAs) that were already flagged before
this update and are outside Stage 1-3.
