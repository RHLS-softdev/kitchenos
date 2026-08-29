# Agent instructions — KitchenOS

Offline-first kitchen management for independent restaurants. Free
desktop app (Tauri sidecar + Flask backend, local SQLite) + optional
Premium tier (Convex + Clerk + Stripe, per-kitchen billing).

## Layout

- `core/` — the free desktop app: `core/backend` (Flask, local SQLite),
  `core/frontend` (web UI bundled by Tauri).
- `enterprise/` — the Premium commercial layer: `enterprise/convex`
  (Convex functions incl. the Stripe webhook — the ONLY grant path for
  Premium), `enterprise/frontend` (premium dashboard UI), `enterprise/src`.
- `desktop/` — Tauri shell packaging.

## Rules

- **Hard Rule 1**: the free app must never call Convex, Clerk, or Stripe
  (zero free cloud cost / no liability for free user data). `config.py`
  enforces this via `DESKTOP_FREE_BUILD`; `JWT_SECRET_KEY` is fail-closed
  outside the free build (never run a server with the dev secret).
- **Premium grant**: only the Stripe webhook in `enterprise/convex/http.ts`
  grants the premium tier. Never add another grant path.
- **Licensing**: root `LICENSE` is MIT (app code); `enterprise/convex/LICENSE`
  is proprietary (commercial layer).

## Commands

```bash
# free app backend
cd core && pip install -r requirements.txt && python run.py
# premium web app
cd enterprise && npm install && npm run dev
```

## Related

`lingua-mundi-ops` (deploy/backup/audit scripts + wiring guides),
`lingua-mundi` + `shikibu` + `subtitle-toolkit` (sibling products).
