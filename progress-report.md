Last updated: July 21st, 2026 (v2 update)

Stages 1 through 3 of the roadmap are now substantially complete, along with
the cross-cutting infrastructure gaps the README had flagged (RBAC, rate
limiting, automated tests, relational supplier model). See
`kitchenos-backend/CHANGELOG.md` for the full technical rundown.

---

# v2 update — credentials, icons, and the ingredient database

Addressing the "notes for the next version" — status against each item:

| Note | Status |
| --- | --- |
| Shelf life tracker for inventory | 🟡 **Partially covered, not new this round.** Per-item expiry countdown and `InventoryBatch` (per-lot expiry) both already existed from the previous round. Gap found while reviewing: batches have no UI at all yet — the model/API exists (`/inventory-batches`) but nothing surfaces it. Flagged below, not fixed this round. |
| Ingredient database (nutrition, allergens, etc.) | ✅ **New.** `Ingredient` model + full CRUD + search + CSV export + a new "Ingredients" page. Verification is owner-gated and separate from ordinary editing. |
| Recipe nutrition auto-calculated from ingredients | ✅ **New.** `POST /recipes/<id>/recalculate-nutrition` sums linked ingredients, honestly reports any line it couldn't resolve rather than guessing. Long-term cooking-transformation note added directly in `app/nutrition.py`'s docstring and in `roadmap.md`. |
| Deterministic verified-nutrition-database system (search, open DB access, manual input, AI parser) | 🔵 **UI scaffolding done, automated half deferred as agreed.** Manual entry/search/verify are real; the "Look up nutrition" button is visibly present but disabled, with the full plan written into `roadmap.md`'s new addendum. |
| Convert prep/cook times to a sensible unit | ✅ **New.** `DurationInput` (amount + min/hours/days picker, stores minutes internally) replaces the raw-minutes fields; `fmtMins` now formats day-scale durations too. |
| Subdivide produce category | ✅ **New.** Shared `CATEGORIES` list (Fruit, Leafy Greens, Alliums, Root Vegetables, Cruciferous, Squash & Gourds, Mushrooms, Fresh Herbs, ...) used by both Inventory and Ingredients. |
| Voice input everywhere manually entered; lock down auto-calculated fields | 🟡 **Broad but not exhaustive.** Built `VoiceField`/`useSpeechToText` once and applied it across Recipes, Ingredients, Inventory, Equipment, Catering, Marketplace, and Workflow's manual-entry fields. Auto-calculated recipe nutrition fields lock to owner-only edits once `nutritionSource` is "calculated" (tested). Some manual fields likely still don't have it — see "known gaps" below. |
| Every database exportable as CSV | ✅ **New.** Added to the shared CRUD factory, so every resource built on it got `/export.csv` for free (recipes, inventory, ingredients, equipment, suppliers, orders, tasks, temperature logs); added by hand to the one hand-rolled resource (shift notes). |
| Export buttons grayed out by credentials, assigned by position; only the chef can export recipes | ✅ **New, with a scoping simplification.** Recipe export is owner-only. Credentials use the existing owner/manager/staff permission tiers (already wired through JWT/RBAC) rather than a new configurable position→permission system — a `position` field was added to `User` for display (e.g. "Head Chef") but role, not position, is what's actually checked. Flagging this simplification explicitly rather than silently narrowing scope. |
| Use Tabler outline icons | ✅ **New.** Vendored the specific outline icons needed (no npm dependency) and swapped the nav to the exact list provided, plus icons used elsewhere in the app (buttons, empty states). |
| Search bars on every database page | ✅ **New** on Recipes, Ingredients, Inventory, Equipment, Suppliers, Procurement, Workflow tasks. Catering has one too. Reports/Dashboard don't have a list to search. |
| Clean up procurement so every tool works on every item | ✅ **New.** Orders without structured line items can now be marked received (previously the Receive button didn't even appear for them); added an Edit action so due date/total/invoice link are reachable after creation. |
| Local deterministic parser + voice input vs. cloud AI (pricing justification) | 🔵 **Documented, not built.** Added an addendum to `roadmap.md` — and corrected an inaccuracy while writing it: today's voice input uses the browser's own `SpeechRecognition` API, which typically depends on the browser vendor's cloud service, not a model bundled with KitchenOS. Bundling a real local model is the deferred work, not something already true. |
| General consistency pass — nothing mockup-only | ✅ **New, found real issues.** Marketplace's "Place order"/"View profile" buttons did nothing — now real (a working detail modal, and an honest handoff to Procurement instead of a fake in-place order). Billing had three fabricated numbers with no data behind them (a hardcoded "28.4%" food cost, a hardcoded "$12.40" cost/cover, and a hardcoded "Venue · $149/mo" plan disconnected from the database) — all three now come from real data (`/reports/food-cost`, a real per-cover calculation, and the actual `Organization.plan` field, newly exposed via `/auth/me`). Pricing's "Get started" and Billing's "Upgrade"/"Manage billing" are now honestly disabled with an explanatory tooltip rather than silently doing nothing. |

### Known gaps from this round

- **Inventory batches have no UI.** The backend (`InventoryBatch`, FIFO-capable) has existed since the previous round, but nothing in the frontend lists, creates, or edits a batch — only whole-item quantity is visible. Worth a dedicated pass.
- **Voice input coverage isn't exhaustive.** `VoiceField` was applied to the highest-traffic manual-entry forms; a few smaller manual fields elsewhere in the app likely still use the plain `Field` component. The mechanism is proven and reusable — remaining coverage is mechanical, not risky.
- **Position→credential mapping is a display simplification**, not a configurable system — see the credentials row above. If real job-title-based permission tiers (beyond owner/manager/staff) are wanted later, that's a distinct scoped feature.
- A snake_case/camelCase naming bug was caught and fixed before shipping (`kcal_per_100g` couldn't round-trip through the frontend's automatic case conversion — renamed to `kcal_per100g` and friends, verified with a standalone round-trip check). Mentioning it here because it's the kind of bug that's invisible until data silently fails to save — worth being aware of the constraint (no `_<digit>` in field names) for any future schema additions.

Everything above is validated: 22 backend tests, a clean migration up/down round-trip, a green frontend build, and a clean lint pass.

---

# v1 update (previous round) — Stage 1-3 roadmap completion

| Stage          | Component                         | Status     | Notes       |
| -------------- | --------------------------------- | ---------- | ----------- |
| **Foundation** | React/Vite frontend               | ✅ Complete | Implemented |
|                | Flask backend                     | ✅ Complete | Implemented |
|                | PostgreSQL                         | ✅ Complete | Implemented |
|                | Alembic migrations                | ✅ Complete | New migration added this update, verified up/down |
|                | JWT authentication                | ✅ Complete | Implemented |
|                | **Role-based access control**     | ✅ Complete | **New** — owner/manager/staff enforced on mutate/delete |
|                | Organization-scoped multi-tenancy | ✅ Complete | Implemented |
|                | AI proxy                          | ✅ Complete | Server-side |
|                | **AI rate limiting**              | ✅ Complete | **New** — Flask-Limiter, 20/hour default per route |
|                | **Automated tests**               | ✅ Complete | **New** — 15 pytest tests, auth/RBAC/every new feature |
|                | **Error monitoring**              | ✅ Complete | **New** — optional Sentry/GlitchTip, off by default |
|                | Seed/demo data                    | ✅ Complete | Expanded with new modules' data |
|                | Docker support                    | ✅ Complete | Present |

---

# Stage 1 — Core Product (MVP)

## Recipes

| Feature              | Status                                    |
| -------------------- | ------------------------------------------ |
| CRUD                 | ✅                                         |
| Ingredients          | ✅                                         |
| Nutrition            | ✅                                         |
| Allergens            | ✅                                         |
| Recipe scaling       | ✅ (used for catering)                     |
| Factsheet export     | ✅                                         |
| Images               | ⚠️ Still unknown — not touched this update |
| **Version history**  | ✅ **New** — auto-snapshot on every edit, `GET /recipes/<id>/versions` |
| Cost calculation     | ✅ **New** — `menu_price` field + cost/serving now drive the Stage 3 profitability report |
| Categories           | 🟡 Likely (unchanged) |
| **Storage instructions** | ✅ **New** — `storage_notes` field |
| **Shelf life**        | ✅ **New** — `shelf_life_days` field |

Approximate completion: **95%** (up from 70–80%) — only "Images" remains unconfirmed.

## Inventory

| Feature              | Status         |
| -------------------- | -------------- |
| CRUD                 | ✅              |
| Stock levels         | ✅              |
| Par levels           | ✅              |
| Expiry tracking      | ✅              |
| **Supplier information** | ✅ **New** — real `supplier_id` FK (was plain text; text field kept as a synced display fallback) |
| Alerts               | ✅              |
| Multiple locations   | ⚠️ Still unknown — not addressed this update |
| **FIFO**             | ✅ **New** — via `InventoryBatch` (lot number, received date, expiry per batch) |
| **Batch tracking**   | ✅ **New** — `InventoryBatch` model + endpoint |
| **Waste logging**    | ✅ **New** — `WasteLog` model (reason, qty, cost impact) + endpoint |

Approximate completion: **90%** (up from 65–70%) — only "multiple locations" remains open.

## Shopping

| Feature                | Status     |
| ---------------------- | ---------- |
| Shopping list          | ✅          |
| Auto generation        | ✅          |
| Catering integration   | ✅          |
| Procurement conversion | ✅          |
| **Supplier grouping**  | ✅ **New** — list now grouped by supplier with subtotal |
| **Price estimation**   | ✅ **New** — per-item and per-group estimated cost |
| Duplicate merging      | ✅ Confirmed — was already implemented (previously marked unknown) |

Approximate completion: **100%**

## Procurement

| Feature            | Status |
| ------------------- | ------ |
| CRUD               | ✅      |
| Supplier orders    | ✅      |
| Spend tracking     | ✅      |
| AI forecast        | ✅      |
| Purchase orders    | ✅      |
| **Receiving**       | ✅ **New** — `POST /orders/<id>/receive`, updates inventory qty + creates a batch automatically |
| **Partial deliveries** | ✅ **New** — per-line-item qty received, order status becomes "partial" until fully received |
| **Invoice attachment** | ✅ **New** — `invoice_url` field (a link, not a file upload — no object storage wired up) |
| Supplier history   | ✅ **New** — supplier comparison report covers spend/order count/on-time % |

Approximate completion: **95%**

## Dashboard

| Feature            | Status |
| ------------------- | ------ |
| Inventory alerts   | ✅      |
| Catering overview  | ✅      |
| Equipment warnings | ✅      |
| Quick links        | ✅      |
| **Food cost**       | ✅ **New** — average food cost % across priced recipes |
| **Open orders**     | ✅ **New** — count of non-delivered/non-cancelled orders |

Approximate completion: **100%**

---

# Stage 2 — Restaurant Workflow *(new this update)*

| Component          | Status |
| -------------------- | ------ |
| Catering           | ✅ (unchanged) |
| Production scaling | ✅ (unchanged) |
| **Prep lists**       | ✅ **New** — `KitchenTask` (type=prep) |
| **Cleaning schedules** | ✅ **New** — `KitchenTask` (type=cleaning) |
| **Kitchen checklist** | ✅ **New** — `KitchenTask` (type=checklist) — the three task types share one model, filtered in the UI |
| **Temperature logs**  | ✅ **New** — `TemperatureLog`, with automatic in/out-of-range flagging |
| **Waste reports**     | ✅ **New** — covered by the Stage 1 `WasteLog` (logged from Inventory) |
| **Shift notes**       | ✅ **New** — `ShiftNote`, an append-only feed |
| **Internal messaging** | ✅ **New (lightweight)** — the same shift-notes feed doubles as a simple team board; this is a posted-notes feed, not real-time chat |
| **Kitchen calendar**  | ✅ **New** — `GET /calendar` aggregates catering/task/equipment dates; not a stored table |

Completion: **≈90%** (up from 20–30%) — everything from the roadmap checklist is covered functionally, though "kitchen calendar" is a read-only list view rather than a full calendar UI widget, and "internal messaging" is a feed rather than real-time chat.

---

# Stage 3 — Financial Intelligence *(new this update)*

| Component           | Status |
| --------------------- | ------ |
| Billing module      | ✅ (unchanged) |
| Spend tracking      | ✅ (unchanged) |
| **Food cost %**       | ✅ **New** — per-recipe and overall average |
| **Menu engineering**  | ✅ **New** — star/plowhorse/puzzle/dog quadrant classification |
| **Gross margin**      | ✅ **New** — per-recipe margin & margin % |
| **Profitability**     | ✅ **New** — `/reports/profitability` |
| **Inventory valuation** | ✅ **New** — total + by category |
| **Supplier comparison** | ✅ **New** — spend, order count, on-time % |
| **Historical pricing** | ✅ **New** — `PriceHistory`, logged automatically on every cost change |
| **Purchase trends**    | ✅ **New** — monthly spend aggregation |
| Analytics reports     | ✅ **New** — CSV export for profitability, valuation, supplier comparison, and purchase trends |

Completion: **≈90%** (up from 30–40%). Caveat worth flagging: "popularity" in the
menu-engineering report is a proxy (how often a recipe appears on a catering
menu), since there's no POS integration yet to count actual covers sold —
noted directly in the report's UI copy.

---

# Stages 4–8 (unchanged this update)

Not in scope for this pass — see `roadmap.md` for the original plan. Briefly:
Stage 4 (AI) and Stage 6 (Enterprise/equipment) are untouched; Stage 5
(Collaboration/permissions) got a partial boost from this update's RBAC work
(permission *enforcement* is done — audit log, notifications, and activity
feed are still open); Stages 7–8 (Marketplace/Ecosystem) are untouched.

---

# What's set up for the following phases

- **Data model**: `InventoryBatch`, `PriceHistory`, `OrderLineItem`, and the
  supplier FK give Stage 4 (AI) and Stage 6 (Enterprise) real data to build
  on — e.g. AI reorder suggestions can use batch/expiry data directly, HACCP
  compliance reporting can build on `TemperatureLog`.
- **CRUD factory hooks** (`on_before_update`, `on_after_write`,
  `mutate_roles`, `delete_roles`) mean new resources get versioning, audit
  hooks, and RBAC for free — no bespoke blueprint needed for the common case.
- **Reports blueprint pattern** (`app/reports.py`) is a template for further
  analytics without needing Metabase/Superset yet — those remain documented
  recommendations in `components-to-integrate.md` if/when a dedicated BI
  tool becomes worth the infrastructure cost.

# Known gaps carried forward (see backend README for the full list)

- Multiple inventory locations, recipe images, digital signatures/barcode
  scanning, and the Stage 8 ecosystem integrations are all still open.
- Flask-Limiter's storage is in-memory — fine for one process, needs Redis
  once there's more than one worker.
- Scheduling (APScheduler), full-text search (Meilisearch), and BI
  dashboards (Metabase) remain recommendations, not integrations — the data
  they'd consume (batches, price history, tasks) is now in place, which is
  what "set up to facilitate the following phases" was aiming for.

# Overall progress estimate

| Area                   | Completion (before → after) |
| ------------------------ | ---------------------------: |
| Foundation             |                  100% → 100% |
| MVP/Core Operations    |                    ≈72% → ≈95% |
| Restaurant Workflow    |                    ≈25% → ≈90% |
| Financial Intelligence |                    ≈35% → ≈90% |
| AI                     |                    ≈70% → ≈70% (untouched) |
| Collaboration          |          ≈40% → ≈55% (permission enforcement landed; audit log/notifications still open) |
| Enterprise Features    |                    ≈38% → ≈38% (untouched) |
| Marketplace            |                    ≈18% → ≈18% (untouched) |
| Ecosystem Integrations |                        0% → 0% |

### Overall roadmap completion

Taking the roadmap as a whole, this update moves the project from
**≈45–50%** to roughly **≈60–65%** complete. For the narrower goal of a
**Version 1.0 commercial release for independent restaurants**, this update
closes nearly everything on the checklist for that milestone: KitchenOS is
now approximately **90% complete** against that specific bar. What's left
for a v1.0 cut is mostly polish and hardening rather than new functionality:
automated frontend tests, a shared rate-limit backend (Redis) for
multi-worker deployment, recipe images, and subscription/licensing
enforcement.
