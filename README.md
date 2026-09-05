# KitchenOS

An offline-first kitchen operations app for independent restaurants — free
forever for a single kitchen running entirely on local data, with an
optional $50/month/kitchen Premium tier (multi-kitchen sync, supplier ordering,
supplier ordering) for venues that need more than one kitchen talking to
each other.

## What this is

KitchenOS began as a recipe/nutrition tracker and grew into a full kitchen
operations app: recipes, ingredients, inventory (with FIFO batch tracking
and waste logging), shopping/procurement, daily workflow (prep lists,
cleaning schedules, temperature logs, shift notes), and financial reporting
(food cost, menu engineering, profitability). See `roadmap.md` for the
full build plan and `progress-report.md` for where each piece stands.

As of this pass, the product strategy is: ship the free tier as a desktop
app (Tauri) with everything running locally against SQLite — no account,
no server, no cost or liability for us on the free tier — and build
multi-kitchen/cloud features as a separate premium layer on Convex + Clerk
+ Stripe that a kitchen only touches once it explicitly subscribes.

AI is a core part of the pitch, but every AI feature requires human
verification before anything is saved — this is a deliberate safety design,
not a placeholder.

## Project structure

```
core/                   — the free, offline app. This is the whole product
                          for a free user; it has no knowledge Convex/Clerk
                          exist.
  backend/              — Flask + SQLite API (formerly kitchenos-backend/;
                          Postgres/Sentry/gunicorn removed — see its README)
  frontend/             — Vite + React app (formerly kitchenos-frontend/)
desktop/                — Tauri shell that packages core/ into a downloadable
                          desktop app. See desktop/README.md for build steps
                          I couldn't run from this sandbox.
enterprise/             — premium/cloud layer: Convex functions, Clerk
                          wiring, Stripe webhook. Deployed as its own web
                          app, never bundled into the free installer — see
                          enterprise/README.md for why and how.
kitchenos_v2.jsx        — original frontend prototype (Claude.ai artifact)
```

`kitchenos-frontend/` and `kitchenos-backend/` (the old top-level folders)
have been superseded by `core/frontend/` and `core/backend/` and can be
deleted once you've confirmed the copies match — nothing in them changed
during the move except what's documented in `core/backend/README.md`'s
diff notes and this restructure.

## Modules

- **Dashboard** — operations overview: inventory alerts, upcoming catering,
  equipment warnings, quick links, open orders, average food cost %
- **Recipes** — full recipe library with nutrition, allergens, flavour tags,
  ingredients (optionally linked to the ingredient database for nutrition
  auto-calc), method steps, one-click factsheet export (printable HTML),
  menu price/margin, storage notes, shelf life, automatic version history,
  and a search bar. Export is owner-only ("only the chef can export recipes")
- **Ingredients** *(new)* — the verified nutrition/allergen database recipes
  link against. Manual entry/search/edit are open to any authenticated user
  (voice-input enabled); marking an entry "verified" is owner-only. A "Look
  up nutrition" button is visibly present but disabled — the automated
  open-database + AI-parser lookup behind it is deliberately deferred, see
  `roadmap.md`
- **Inventory** — stock levels vs. par levels, expiry tracking, a real
  supplier link (dropdown, not free text), batch/lot tracking, waste
  logging, and a search bar
- **Shopping list** — auto-generated from par-level shortfalls and upcoming
  catering requirements, grouped by supplier with a price estimate; converts
  directly into a procurement order
- **Procurement** — supplier orders (freeform or structured line items),
  partial/full receiving that updates inventory automatically, spend
  tracking, AI demand forecast
- **Equipment** — service schedules, warranties, asset values, service log
- **Catering** — event pipeline, P&L, and run sheets that scale recipe
  ingredients to event headcount
- **Workflow** *(new)* — prep lists, cleaning schedules, and checklists;
  HACCP-style temperature logs; a shift-notes feed doubling as simple team
  messaging; an upcoming-events widget pulling from `/calendar`
- **Reports** *(new)* — recipe profitability & menu engineering (star /
  plowhorse / puzzle / dog), inventory valuation, supplier comparison,
  purchase trends, and CSV export
- **Flavour AI** — ingredient/dish analysis: flavour profile, pairings,
  cuisine origins, allergens, complementary recipes from your own library
- **Billing** — food cost ratios, open invoices, subscription plan,
  data & storage management
- **Marketplace** — supplier directory with direct-sourcing pitch (the
  farmer-to-business vision)
- **Voice input** — narrate a recipe or read off a stocktake; AI structures
  it into a draft that a human must verify line-by-line before it's saved

## AI features

All four AI features go through the same pattern: AI drafts → human
verifies every field → human saves. Nothing is written to the data store
without that verification step.

- **Flavour AI** — dish/ingredient analysis
- **Procurement forecast** — suggests what to order based on current
  inventory and upcoming catering
- **Voice recipe parser** — narrated recipe → structured draft
- **Voice stocktake** — read-off stock counts → structured draft

In the artifact, these run through Claude.ai's built-in Anthropic API
access. In the backend, the same prompts run server-side against a
Groq/OpenRouter-compatible endpoint, so no API key is ever exposed to the
client.

## Current status

**Frontend** (`kitchenos-frontend/`) — standalone Vite + React app, fully
wired to the backend. Login/register, all CRUD modules, AI features (via
the backend proxy), and the catering ID/name reconciliation are done and
integration-tested end-to-end. Recipe/inventory/catering/equipment/
procurement/supplier CRUD all work with inline + server-side validation.

**Backend** — working Flask API, tested end-to-end. JWT auth with
org-scoped multi-tenancy, full CRUD for all resources, server-side
validation, AI proxy for all four AI features, Alembic migration, and a
seed script with demo data.

> **Two auth systems, intentionally.** The free desktop app authenticates
> against the local Flask backend (JWT, org-scoped, SQLite — see
> `core/backend/app/auth.py`) and **never** calls Convex/Clerk/Stripe
> (Hard Rule 1, enforced by `DESKTOP_FREE_BUILD` in `config.py`). The
> Premium tier is a separate cloud web app that authenticates with Clerk
> (orgs) and is granted only by the Stripe webhook in
> `enterprise/convex/http.ts`. There is no shared session between the two;
> a kitchen's Premium status is read from the cloud layer, not the local DB.

**Artifact prototype** (`kitchenos_v2.jsx`) — frozen as a UI sandbox. Not
connected to the backend; uses artifact-local storage and Claude.ai's
built-in Anthropic proxy. Useful for quickly mocking up new screens before
porting them into the Vite app.

## Getting started

**One command** (needs Docker):

```bash
docker compose up --build
```

That starts Postgres, runs migrations, seeds demo data, and starts both the
API (`:5000`) and the frontend (`:5173`) — nothing else to run by hand.
Open `http://localhost:5173` and log in with `chef@meridian.test` /
`demo-password-123`. No `.env` file is required for this to work; see
`.env.example` if you want to add a real AI key later.

To stop: `Ctrl+C`, or `docker compose down` to also remove the containers
(add `-v` to that if you want to wipe the seeded database too).

**Without Docker** (two terminals):

```bash
# terminal 1 — backend
cd kitchenos-backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # SQLite works out of the box; edit for Postgres/AI key
export FLASK_APP=run.py
flask db upgrade
python3 seed.py
flask run

# terminal 2 — frontend
cd kitchenos-frontend
npm install
npm run dev
```

The `kitchenos_v2.jsx` artifact can still be opened directly in Claude.ai
for quick UI prototyping — it doesn't need either of the above.

## Tech stack

- **Frontend**: Vite + React, plain fetch-based API client with JWT
  auto-refresh, inline styles with a shared design-token palette, no
  external UI framework
- **Backend**: Flask, SQLAlchemy + Alembic, PostgreSQL, Flask-JWT-Extended,
  AI proxy (OpenAI-compatible chat completions API — Groq by default)

## Subscription tiers (product vision)

- **Solo** — $49/mo · 1 site · core recipe, inventory, and equipment
  tracking, limited voice input
- **Venue** — $149/mo · 3 sites · adds catering, procurement, Flavour AI,
  unlimited voice input, billing analytics
- **Chain** — $499/mo · unlimited sites · multi-site dashboard, centralised
  recipe library, marketplace access, AI demand forecasting, API access

## Roadmap / known gaps

Closed since the last update (see `kitchenos-backend/CHANGELOG.md` for detail):
- ~~No role-based permission enforcement~~ — `mutate_roles`/`delete_roles` on
  the CRUD factory now restrict equipment/suppliers/orders to owner/manager,
  and delete is owner/manager-only everywhere by default.
- ~~No rate limiting on `/ai/*`~~ — Flask-Limiter now caps each AI route
  (`AI_RATE_LIMIT` env var, default 20/hour).
- ~~No automated tests~~ — `kitchenos-backend/tests/` now has a pytest suite
  covering auth, RBAC, org isolation, and every new Stage 1-3 feature.
- ~~`inventory.supplier`/`orders.supplier` are plain text~~ — both now also
  have a real `supplier_id` FK to `suppliers`; the text field is kept in
  sync automatically and still used as a display fallback for unlinked rows.

Still open:
- Voice input's browser speech recognition (`SpeechRecognition` /
  `webkitSpeechRecognition`) is Chrome/Edge-only; Firefox and most mobile
  browsers fall back to typing, which already works fine. It's also a
  cloud dependency today (the browser vendor's own speech service, e.g.
  Chrome→Google) rather than a locally-bundled model — see `roadmap.md`'s
  AI architecture addendum for the target (and currently not real) local
  vs. cloud split.
- Recipe factsheet export still opens a new tab with printable HTML
  (`window.open`) — fine for desktop, may hit popup blockers on mobile.
- Pricing's "Get started" and Billing's "Upgrade"/"Manage billing" buttons
  are now honestly disabled with an explanatory tooltip (subscription/
  billing enforcement isn't wired up), rather than silently doing nothing —
  actually enforcing plan tiers is still unbuilt.
- Inventory batches (`InventoryBatch`, FIFO-capable) have no frontend UI —
  the model and `/inventory-batches` API exist, but nothing lists, creates,
  or edits one yet. Only whole-item quantity is visible in Inventory today.
- Voice input (`VoiceField`) is on the highest-traffic manual-entry forms
  across the app, but coverage isn't exhaustive — some smaller manual
  fields may still use the plain, non-voice `Field` component.
- The credentials/export-permission system uses the existing owner/manager/
  staff role tiers, not a configurable position-based permission system —
  `User.position` is a display-only job title. See `progress-report.md`'s
  v2 section for the full reasoning.
- Automated ingredient-nutrition lookup (open databases + the deterministic
  AI parser) is deliberately not built — manual entry/search/verify are;
  see `roadmap.md`'s addendum for the planned shape.
- Flask-Limiter's storage is in-memory by default — fine for one process,
  but needs a shared backend (Redis, per its docs) once you run more than
  one worker/dyno, or limits won't be enforced consistently across them.
- Scheduling (expiry alerts, recurring task generation), full-text search,
  and analytics dashboards are all still just recommendations in
  `components-to-integrate.md` (APScheduler / Meilisearch / Metabase) —
  none are wired up, since they need infrastructure beyond a code change.
  The data they'd need (batches, price history, kitchen tasks) is in place.
