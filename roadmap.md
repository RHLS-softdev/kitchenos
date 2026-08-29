# KitchenOS Roadmap (v3 — desktop-first pivot)

This replaces the previous (v2) roadmap's commercialisation model. Stages
1-3 below were built against a Flask/Postgres multi-tenant SaaS plan; the
product and business model have since changed to a free offline desktop
app plus a paid cloud tier. The Stage 1-3 *feature* work (recipes,
inventory, procurement, workflow, financial reporting) is still valid and
mostly done — see `progress-report.md`. What changed is everything about
*how it ships and how it's sold.*

---

## The new product model

- **Free, forever, offline.** A desktop app (Tauri) that a small restaurant
  downloads and runs with zero ongoing cost to us. All data lives in a
  local SQLite file. We never see it, host it, or carry liability for it.
- **Premium, $50/month per kitchen.** Multi-kitchen sync, AI analytics,
  and supplier ordering — features that only make sense with a real cloud
  backend behind them. Billed and gated per Clerk Organization ("Kitchen"),
  paid via Stripe.
- **Cloud backend for premium only:** Convex (database, real-time sync,
  serverless functions) + Clerk (auth, organizations, billing UI). The
  free app has zero code paths that can reach either.

### Hard architectural rules (unchanged from the brief, restated here so
they stay visible next to the plan they constrain)

1. Zero free cloud cost — the free app never calls Convex or Clerk unless
   the user explicitly subscribes.
2. Security by backend — every premium Convex mutation checks the caller's
   Clerk Organization subscription tier itself and throws rather than
   trusting the client.
3. Code separation — `/core` (local/free) and `/enterprise` (cloud/paid)
   never share a build target.
4. Seamless migration — local SQLite data exports to JSON, imports into
   Convex via a secure mutation, once a user subscribes.
5. Ship the free app now; build premium in parallel.

---

## Stage 0 — Architecture pivot (current stage)

Goal: turn the existing Flask/Postgres SaaS codebase into a shippable free
desktop app, with the premium layer scaffolded (not deployed) alongside it.

| Task | Status |
| --- | --- |
| Split repo into `core/` (existing app, unchanged logic) and `enterprise/` (new) | done this pass |
| Backend: drop Postgres/gunicorn/Sentry, SQLite-only, per-user app-data path | done this pass |
| Backend: bind to 127.0.0.1 only, restrict CORS to the Tauri origin | done this pass |
| Backend: `GET /migration/export` (Hard Rule 4's local half) | done this pass |
| Backend: `run_sidecar.py` desktop entrypoint (waitress, cross-platform) | done this pass |
| Tauri shell scaffold (`tauri.conf.json`, Rust sidecar-spawn main.rs) | ✅ real-world tested — packaged as a `.deb`, installed, launched. Needed minor `tauri.conf.json` tweaks (yours, not mine) plus one real bug found this way (below) |
| PyInstaller packaging of the backend into a sidecar binary, per OS | done for Linux (the `.deb` above proves the sidecar itself starts) — Windows/macOS still unverified |
| App icons | ✅ done — generated from `icon.png` via `npx tauri icon` (`desktop/src-tauri/icons/`) |
| Convex schema + functions (kitchens, sync, supplier orders, migration import, Stripe webhook) | scaffolded — unverified, needs `npx convex dev` |
| Clerk + Convex React wiring (`enterprise/frontend/*`) | scaffolded |
| Standalone `enterprise/` Vite project (so the premium web app is actually buildable/deployable) | ✅ done (v0.6 release pass) — `enterprise/` is now that project: `npm install && npm run build` (vite) and `npm run typecheck` (convex server code) both pass. Added `convex/checkout.ts` (the $50/mo Checkout mutation http.ts's comment pointed at), `listSyncedTables`, hand-written `convex/_generated/`, and the full dashboard UI in `src/`. See `enterprise/README.md`'s update section. |
| Clerk application + Organizations + JWT template | you — needs a Clerk account |
| Convex deployment + env vars | you — needs a Convex account |
| Stripe product/price + webhook | you — needs a Stripe account |
| First end-to-end test: subscribe -> export -> import -> sync between two kitchens | blocked on the above |

**v0.6 release pass (2026-08-26):** desktop build fixed and re-packaged as
0.6.0 (tauri.conf.json's `frontendDist` was an absolute path to a missing
`/home/rex/Documentos/Software Development/KitchenOS/...` directory — made
relative to the config file; version bumped 0.5.1 → 0.6.0; the free app's
Billing page now carries the new Free→Premium model with a live "Upgrade to
Premium — $50/mo" button that opens the premium web app in the system browser
via the shell plugin, per the enterprise README's Hard-Rule-1 carve-out).
The premium web app is built and deployed (see Stage 4). Per the product
brief, **no new AI capabilities were added** in this pass — the already
started free-tier AI (FlavourAI, procurement forecasting, voice-input parser
via `core/backend/app/ai.py`, local faster-whisper dictation) is untouched,
and Stage 4's premium AI analytics remains not-started below.

**Bug found via the first real `.deb` install/run (not caught here, since I
have no GUI to actually launch a packaged app):** login failed with "Couldn't
reach the server" even though the sidecar was running. Cause: `tauri.conf.json`'s
`beforeBuildCommand` runs plain `npm run build` (Vite's default "production"
mode), but the correct backend port (`.env.desktop`, `VITE_API_BASE_URL=http://127.0.0.1:51872`)
only existed in a file Vite never actually loads in that mode — so the
bundled frontend fell back to its hardcoded dev default (`localhost:5000`),
while the sidecar listens on `51872`. Fixed by renaming `.env.desktop` ->
`.env.production`, which `vite build`'s default mode *does* load
automatically; verified by rebuilding and grepping the output bundle for
the right port. Same investigation also turned up `docker-compose.yml`
still pointing at `./kitchenos-backend`/`./kitchenos-frontend` — the
pre-restructure directory names, broken since Stage 0's `core/` split —
fixed to `./core/backend`/`./core/frontend`.

---

## Stage 1 — Finish the free desktop app (✅ done)

These were the known gaps called out in `progress-report.md`'s "Known gaps"
section — nothing new, just the honest remainder of the original Stage 1-3
MVP work, scoped as "what's left before the free app is really done." All
of them are now closed:

- **Inventory batch UI.** ✅ Done — Inventory page now has a per-item
  "Batches" toggle showing FIFO-ordered lots (lot number, qty, unit cost,
  received/expiry dates) with add/edit/delete, wired to the existing
  `/inventory-batches` CRUD. Frontend build + lint clean; backend CRUD
  lifecycle (create/list/update/delete) tested end-to-end against a live
  sidecar. Batches created automatically by receiving a purchase order
  now show up here too — first time that data's been visible anywhere.
- **Recipe images.** ✅ Done — turned out nothing existed yet (no field, no
  endpoint). Built: `Recipe.image_filename` column, `POST/GET/DELETE
  /recipes/<id>/image` (files live on local disk under `config.UPLOAD_DIR`,
  not in the DB or a cloud bucket — same local-first reasoning as SQLite
  itself), org-scoped access, 8MB cap, upload/replace/remove UI on the
  recipe detail view. Photos can only be attached to an already-saved
  recipe, not during initial creation — a deliberate scope cut to avoid a
  two-step create-then-attach flow. 6 backend tests, frontend build+lint clean.
- **Multiple inventory locations.** ✅ Done — `Location` model (org-scoped,
  exactly one `is_default` per org, enforced server-side), `location_id` on
  `InventoryItem`. Every new org gets a "Main Kitchen" default location at
  registration; an org that predates this feature gets one created and its
  existing (NULL-location) inventory backfilled to it automatically on next
  startup (`app/bootstrap.py`) — nobody sees an "unassigned" item from the
  upgrade itself. New items default to the org's default location unless
  another is picked. Deleting a location with items still in it is blocked
  server-side (400) rather than silently orphaning them — required adding
  an `on_before_delete` hook to the generic CRUD blueprint factory, a small
  backward-compatible extension (every other blueprint using the factory is
  unaffected). Frontend: location column + filter dropdown on the Inventory
  table, a "Manage locations" panel (add/rename/set default/delete). 9 new
  backend tests, 5 new frontend tests — 43 backend / 19 frontend total now.
- **Voice input coverage.** ✅ Done — audited every `<Field>` in the app;
  fixed the real gaps (recipe ingredient names and method steps — the
  flagship "cook dictates recipe" case, previously plain `<input>`/
  `<textarea>` with no mic at all; Equipment service-log notes; Marketplace
  certifications; Workflow "assigned to"). Added `VoiceIconButton`, a
  mic-only variant of `VoiceField` for dense grid/table rows where the
  full labeled component would break the layout. Deliberately left
  alone: short compact-table fields (unit-conversion rows, procurement
  line-item names) where dictating a two-word code isn't worth the UI
  weight.
- **Frontend automated tests.** ✅ Stood up — vitest + Testing Library,
  14 tests across `ui.test.jsx` (Field/Btn/Modal/voice-dictation
  primitives) and `Inventory.test.jsx` (list, search, add-item validation,
  the batch UI). Needed one fix: vitest's esbuild transform wasn't picking
  up the automatic JSX runtime the way `vite build` does (harmless for
  the actual build — confirmed via `npm run build`). Pages are
  props-driven (data + callbacks in, no internal fetching), so page tests
  need no API mocking — that pattern's now established for testing the
  remaining pages later. Backend also gained 8 tests this pass (6 for
  `/migration/export`, 2 for the new schema-sync helper below) — 34 total.
- **A migration-export bug, found by writing the tests above.**
  `/migration/export`'s table-driven design (scans SQLAlchemy metadata for
  any table with an `org_id` column) meant it would have shipped the
  `users` table — password hashes included — into the free→premium
  migration JSON. Now explicitly excluded (Clerk doesn't use these hashes
  anyway). Same pass found `equipment_logs` and `order_line_items` were
  being silently dropped, since they're scoped through a parent row, not
  their own `org_id` — now joined in explicitly. Neither bug had test
  coverage before this pass.
- **A second latent bug, found while adding the image column.** The
  desktop build's `db.create_all()` on every launch only creates *missing
  tables* — it never adds new *columns* to a table an upgrading user
  already has locally. Every schema change from here on (starting with
  `image_filename` just now) would have silently broken existing users'
  local databases. Fixed with `app/db_upgrade.py`: an additive-only
  column sync for SQLite specifically (diffs model columns against
  `PRAGMA table_info`, `ALTER TABLE ADD COLUMN` for what's missing —
  never drops/renames, that's what real Alembic migrations are for, and
  the web/Postgres path still has those). 2 tests confirm it backfills a
  missing column without touching existing rows, and no-ops when there's
  nothing to add.
- **Local speech-to-text.** ✅ Done — replaced the browser's
  `SpeechRecognition` API (a quiet cloud call to the browser vendor) with
  `faster-whisper` running the "small" model entirely on-device.
  `app/voice.py` exposes `POST /voice/transcribe`; `useSpeechToText`
  (`ui.jsx`) swapped from `SpeechRecognition` to `MediaRecorder` — record a
  clip, POST it, get text back — with the same `{listening, toggle,
  supported}` shape plus a new `transcribing` field, so every existing
  `VoiceField`/`VoiceIconButton` call site kept working unchanged.
  `pages/VoiceInput.jsx` (the standalone "narrate a whole recipe" page) had
  its own hand-rolled `SpeechRecognition` implementation, separate from the
  shared hook — that's now deleted in favor of just using the hook, one
  fewer thing to maintain. Model weights aren't downloaded by the app
  itself (would be a network call the free tier shouldn't make); they're
  bundled into the frozen executable via PyInstaller `--add-data` — see
  `desktop/README.md`, which now has the exact download-and-bundle steps.
  5 new backend tests (model mocked, no real weights needed to test the
  route logic) + rewritten frontend dictation tests (`MediaRecorder`/
  `getUserMedia` fakes replaced the old `SpeechRecognition` fakes in
  `test/setup.js`) — 48 backend / 21 frontend total now.
- **Rate limiting review.** Flask-Limiter's in-memory store was flagged as
  needing Redis "once there's more than one worker" — irrelevant now
  (single local user, single process), can be simplified or left as-is;
  low priority either way.

**Everything progress-report.md flagged as an open gap for a v1.0 free-tier
release is now closed or was already correctly non-actionable.** Two things
deliberately remain open, not overlooked:
- **Automated ingredient nutrition lookup** (USDA/Open Food Facts + AI
  normalization) — scoped in `roadmap.md`'s original addendum as its own
  project, deferred by agreement, not a Stage 1 blocker. Manual
  entry/search/verify already works; only the "look up automatically"
  button stays disabled until this is picked up.
- **Digital signatures, barcode/QR scanning, HACCP compliance docs** — these
  were always Stage 6 ("Enterprise Features," targeting hotels/chains), a
  later milestone after the free tier has real users, not part of "the free
  app is done" by any version of this roadmap.

## Stage 2 — Restaurant Workflow (done, unchanged)

Prep lists, cleaning schedules, kitchen checklist, temperature logs, waste
reports, shift notes, kitchen calendar. ~90% per `progress-report.md`;
"kitchen calendar" is a read-only list view rather than a full widget, and
"internal messaging" is a posted-notes feed rather than real-time chat —
both fine for a v1.0 free-tier cut.

## Stage 3 — Financial Intelligence (done, unchanged)

Food cost %, menu engineering, gross margin, profitability, inventory
valuation, supplier comparison, historical pricing, purchase trends. ~90%
per `progress-report.md`. "Popularity" in menu engineering is a proxy
(catering-menu frequency) pending real POS integration — documented in
the report UI already, no action needed for v1.0.

---

## Stage 4 — Premium cloud features

This is the new paid tier, replacing what the old roadmap called Stage 5
(Multi-user Collaboration) and part of Stage 4 (AI Features). Built in
`enterprise/`, gated per Clerk Organization subscription:

- **Multi-kitchen sync** — `enterprise/convex/sync.ts`'s generic
  push/pull, built on the same table-driven approach as local export, so
  it doesn't need a hand-maintained second schema.
- **Supplier ordering** — `enterprise/convex/supplierOrders.ts`, a
  Convex-native feature (not synced from local — this only exists in the
  cloud, since it needs one shared source of truth across kitchens).
- **AI analytics** — cross-kitchen reporting that needs data from more
  than one local SQLite file at once, which is the actual reason this
  needs the cloud rather than being another local feature. **Not started
  by design (release-pass instruction: no new AI capabilities beyond what
  was already started)** — the sync/order patterns are now buildable and
  deployed, so this is the natural next task once a deployment exists to
  verify against.

The existing FlavourAI recipe assistant and procurement forecasting
(`core/backend/app/ai.py`, calling Groq/OpenRouter) stay **free-tier**,
unchanged — they're a different kind of AI feature (single-kitchen, works
fine offline-adjacent via the near-zero-cost API philosophy) from the
premium cross-kitchen analytics above, and re-gating something that
already works for free would be a step backward, not a feature.

## Stage 5 — Enterprise features (later premium expansion)

Equipment maintenance/warranty tracking, HACCP documentation, barcode/QR
scanning, label printing. Unchanged from the old roadmap's Stage 6 —
still real, still valuable, still not urgent. Revisit once Stage 4's
premium tier has paying kitchens actually using multi-kitchen sync.

## Stage 6 — Platform & ecosystem (long-term, unchanged in substance)

Supplier/farmer marketplace, POS/accounting/IoT integrations. Old
roadmap's Stages 7-8. Nothing about the pivot changes this; still
post-traction work.

---

## Pricing

| Tier | Price | What it includes |
| --- | --- | --- |
| Free | $0, forever | Full single-kitchen app, offline, local data. Everything in Stages 1-3. |
| Premium | $50/month per kitchen | Everything in Free, plus multi-kitchen sync, AI analytics, supplier ordering (Stage 4). |

This replaces the old five-tier ($0/$19-29/$79-149/$299+/Custom) ladder.
Simpler pricing was implied by the new brief (one flat premium price per
kitchen) — flagging the change explicitly since it's a real simplification
of the original commercialisation plan, not an oversight.

## Milestones

- **v0.5 (current)** — feature-complete Stage 1-3 web prototype, Postgres-backed.
- **v0.6** — this pivot: free desktop app ships, local SQLite, Stage 1's
  known gaps closed.
- **v0.7** — premium beta: `enterprise/` deployed, Clerk/Convex/Stripe
  live, 2-3 pilot kitchens on sync.
- **v1.0** — commercial launch: free app + premium tier both public,
  targeting independent restaurants, small cafes, food trucks.
- **v2.0+** — Stage 5-6 work (enterprise features, marketplace,
  ecosystem integrations) once v1.0 has traction — unchanged from the
  original long-term plan.

---

## Addendum — Ingredient database: automated lookup (still deferred, unchanged)

What's **built**: `Ingredient` table (name, category, per-100g nutrition,
allergens, manual unit-conversion table, verification metadata), manual
CRUD + search + voice input, owner-only verify action, recipe nutrition
auto-calculation that reports unresolvable lines rather than guessing, and
a disabled "Look up nutrition" button already in the UI.

What's **still not built**: automated lookup against USDA FoodData
Central / Open Food Facts, the same deterministic parser used for voice
input applied to normalize search results into the `Ingredient` schema,
and a review step (`source: "open_database"`/`"ai_parsed"`,
`verified: false` until an owner confirms it). Cooking-transformation
modeling (nutrient loss from heat/water loss/fat rendering) remains an
unattempted, distinct, larger research problem — see `app/nutrition.py`'s
docstring.

## Addendum — AI architecture: local vs. cloud (updated — speech-to-text is now actually local)

Two kinds of AI work, meant to run in two different places:

- **Local, bundled with the software:** speech-to-text for voice input is
  now genuinely local — `faster-whisper` ("small" model), replacing the
  browser's own `SpeechRecognition` API (in practice the browser vendor's
  cloud service, not something bundled with KitchenOS). See Stage 1 above
  for what changed. The deterministic parser for structuring voice-input
  transcripts into recipes/stocktakes is unrelated to this and still runs
  via the cloud AI proxy below (it's a text-structuring task, not a
  speech-to-text task) — nothing to change there.
- **Cloud (free tier):** FlavourAI, procurement forecasting, and the voice-
  input parser (transcript → structured recipe/stocktake), via the existing
  multi-provider AI proxy (Groq/OpenRouter, `app/ai.py`) — stays free per
  Stage 4's note above, distinct from the new premium cross-kitchen
  analytics.
- **Cloud (premium tier, new):** the Stage 4 AI analytics feature is cloud
  by necessity (needs more than one kitchen's data at once), via Convex,
  not the Groq/OpenRouter proxy.
