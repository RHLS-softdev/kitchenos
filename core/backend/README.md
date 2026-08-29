# KitchenOS backend

A small Flask + SQLite API backing the KitchenOS frontend. Provides
persistence, JWT auth with org-based multi-tenancy, and a server-side AI
proxy so the frontend never holds an API key.

> **Desktop-build changes (this pass):** this was Flask + PostgreSQL; it's
> now Flask + SQLite only. Postgres is gone (`psycopg2-binary` removed,
> `DATABASE_URL` is ignored on the desktop build — see `app/config.py`),
> because the free tier runs entirely local per Hard Rule 1, and cloud data
> now lives in Convex (`../../enterprise/`) rather than a hosted Postgres.
> `run_sidecar.py` is the new desktop entrypoint (waitress, not gunicorn —
> gunicorn doesn't run on Windows). `app/migration.py` is new: `GET
> /migration/export` dumps everything for a user who's about to subscribe.
> Everything else below (routes, models, RBAC, the CRUD factory) is
> unchanged.

## Quick start (Docker)

There's a single `docker compose up --build` for the whole stack (Postgres +
this API + the frontend) — see the root `README.md`. That's the easiest way
to run this backend; the steps below are for running it standalone.

```bash
cp .env.example .env
# edit .env: set JWT_SECRET_KEY and your AI_API_KEY (Groq/OpenRouter)

docker build -t kitchenos-api .
docker run --rm -p 5000:5000 --env-file .env \
  -e DATABASE_URL=sqlite:////app/kitchenos.db \
  kitchenos-api sh -c "flask db upgrade && python3 seed.py && flask run --host=0.0.0.0"
```

API is now at `http://localhost:5000`. Health check: `GET /health`.

## Quick start (local, no Docker)

Requires a running Postgres (or use SQLite for a quick look — set
`DATABASE_URL=sqlite:///kitchenos.db` in `.env`).

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # edit as needed

export FLASK_APP=run.py
flask db upgrade
python3 seed.py        # optional demo data
flask run
```

## Auth flow

1. `POST /auth/register` — `{org_name, email, password}` → creates an
   Organization + an `owner` User, returns access + refresh tokens.
2. `POST /auth/login` — `{email, password}` → tokens.
3. Send `Authorization: Bearer <access_token>` on every other request.
4. `POST /auth/refresh` — send the refresh token to get a new access token
   when the old one expires (8h default).

The JWT carries `org_id` and `role` claims. Every CRUD query is filtered by
`org_id` — this is the entire multi-tenancy mechanism. There's no
cross-org access path by design.

## Resources

Standard REST CRUD (`GET/POST` on the collection, `GET/PUT/DELETE` on
`/<id>`) for:

- `/recipes`
- `/inventory`
- `/equipment` (+ `POST /equipment/<id>/log` to record a service visit)
- `/suppliers`
- `/catering`
- `/orders`

Server-side validation mirrors the frontend artifact's rules (required
fields, non-negative numbers, servings ≥ 1, etc.) and returns
`{"errors": {"field": "message"}}` with HTTP 400 on failure.

### Notes on simplifications

- `inventory.supplier` and `orders.supplier` are plain text fields, matching
  the artifact. If you want real supplier linkage, add a `supplier_id` FK to
  the `suppliers` table later — it's an additive migration.
- `catering.menu_recipe_ids` is a JSON array of recipe IDs (the artifact uses
  recipe *names*; the frontend integration step should resolve IDs↔names
  against its already-loaded `/recipes` list).

## AI proxy (`/ai/*`)

All AI calls happen server-side against an OpenAI-compatible
`/chat/completions` endpoint — configure `AI_BASE_URL`, `AI_API_KEY`,
`AI_MODEL` in `.env`. Defaults target Groq's free tier.

- `POST /ai/flavour` — `{query}` → flavour profile JSON (same shape as the
  artifact's Flavour AI)
- `POST /ai/forecast` — no body; pulls the org's current inventory +
  catering from the DB and returns a procurement forecast
- `POST /ai/voice-recipe` — `{transcript}` → structured recipe draft
- `POST /ai/voice-stocktake` — `{transcript}` → list of stock counts

All four return `{"error": "..."}` with HTTP 502 on AI failures (rate
limits, bad JSON, etc.) — mirrors the `AIError` banner already in the
artifact. The frontend should keep its human-verification step before
saving anything these return.

## Migrations

Initial schema is in `migrations/versions/`. After changing `app/models.py`:

```bash
flask db migrate -m "describe your change"
flask db upgrade
```

## What's deliberately not here yet

- Role-based permission checks beyond `owner`/`manager`/`staff` existing as
  a field — no endpoint currently restricts by role. Add a decorator like
  `@require_role("owner")` when you need it (e.g. only owners can delete
  equipment).
- Rate limiting on `/ai/*` — worth adding (e.g. Flask-Limiter) before
  opening this up beyond your own pilot, since AI calls cost money/quota.
- File uploads (recipe photos etc.) — not modeled.
- Tests — the manual curl walkthrough in this README's quick-start covers
  the happy paths; a `tests/` dir with pytest + a test DB is the natural
  next addition.
