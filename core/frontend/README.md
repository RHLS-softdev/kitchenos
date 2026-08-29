# KitchenOS frontend

The KitchenOS UI — a standalone Vite + React app that talks to the
`kitchenos-backend` API (Flask + PostgreSQL).

## Quick start

```bash
cp .env.example .env
# edit .env if your backend isn't at the default http://localhost:5000

npm install
npm run dev
```

Open the printed local URL. You'll land on a login screen — either sign in
with the backend's seeded demo account (`chef@meridian.test` /
`demo-password-123`, see `kitchenos-backend/seed.py`) or create a new
organization.

The backend must be running for this to do anything — see
`kitchenos-backend/README.md`.

## Structure

```
src/
  api/
    client.js          — low-level fetch wrapper: JWT storage, auto-refresh,
                          ApiError with field-level validation errors
    caseConvert.js      — camelCase <-> snake_case for API payloads
    authContext.js      — useAuth() hook + AuthContext
    AuthProvider.jsx     — login/register/logout, session bootstrap
    useApiResource.js   — generic CRUD hook for a REST resource
    ai.js               — calls backend /ai/* endpoints
  pages/                — one file per sidebar module
  ui.jsx                — shared components (Btn, Modal, Field, Pill, ...)
  theme.js              — color tokens
  lib/utils.js          — formatting + shopping-list logic
  App.jsx               — layout, navigation, wires pages to API resources
  LoginScreen.jsx
```

## Data flow

Every resource (`recipes`, `inventory`, `equipment`, `catering`,
`suppliers`, `orders`) is loaded via `useApiResource("/path")` in `App.jsx`,
which returns `{ data, create, update, remove, loading }`. Pages receive
`data` plus the relevant handlers as props — they don't talk to the API
directly except for AI calls (`api/ai.js`) and the equipment service-log
endpoint (handled in `App.jsx` since it's not standard CRUD).

All API payloads are camelCase on the frontend and converted to/from
snake_case automatically (`caseConvert.js`), so `prepMins`, `parLevel`,
`lastService`, `menuRecipeIds`, etc. work the same as they did in the
original artifact prototype.

### Notes on backend mapping

- **Catering menus**: the backend stores `menuRecipeIds` (an array of
  recipe IDs), not recipe names. `Catering.jsx` resolves names for display
  via the loaded `recipes` list.
- **Equipment "Log service"**: calls `POST /equipment/<id>/log` directly
  (see `logService` in `App.jsx`), not the generic update endpoint, since
  it also appends to the server-side service log.
- **Voice stocktake**: matches parsed item names against existing inventory
  by name (case-insensitive) and updates quantity via the generic update
  endpoint. Unmatched items are flagged and skipped — they're not
  auto-created as new inventory items.

## Validation & errors

Forms validate client-side (required fields, non-negative numbers, etc.)
for instant feedback, and also surface server-side validation errors
(`ApiError.fieldErrors`, converted to camelCase) in the same inline-error
UI — so a failed save always shows *why*, whichever side caught it.

AI calls (`api/ai.js`) return `{ ok, data | error }`; failures render via
the shared `AIError` component with a retry button, matching the artifact's
"AI drafts, human verifies" pattern — nothing from Voice Input or the
procurement forecast is saved without an explicit verification step.

## Auth

JWTs are stored in `localStorage` (`kos_access` / `kos_refresh`). On a 401,
the client tries `/auth/refresh` once before logging the user out. There's
no "remember me" toggle — sessions persist until the refresh token expires
(30 days server-side) or the user signs out from the Billing page.
