# Premium/cloud layer — setup & architecture decisions

## Why this isn't inside the desktop installer at all

Hard Rule 1 says the free app must never call Convex or Clerk. The
strictest way to guarantee that isn't a runtime `if (subscribed)` check —
it's for the Convex/Clerk/Stripe SDKs to not be physically present in the
free build's bundle in the first place. So:

- `desktop/` (the thing you ship as the free installer) only ever imports
  from `core/frontend`. It has no import path to anything in this folder.
- Premium runs as **a separate web app** — build `core/frontend` +
  `enterprise/frontend` together as their own Vite target, deploy it
  somewhere (Vercel/Netlify/your own host), and that's "KitchenOS Premium."
- The desktop app's only connection to premium is one button: "Upgrade to
  Premium," which opens that web app in the user's system browser (Tauri's
  `shell.open`, not a network call the app itself makes). Clicking it is
  the explicit subscribe action Hard Rule 1 carves out.
- Migration (Rule 4) happens as: free app has an "Export my data" button
  that downloads the JSON from `GET /migration/export` (already built —
  see `core/backend/app/migration.py`); the premium web app has an
  "Import my local data" file picker that calls
  `enterprise/convex/migration.ts`'s `importKitchenData` with that file's
  contents. No direct connection between the two processes is needed.

I haven't scaffolded the `enterprise/frontend` Vite project itself
(vite.config, index.html, package.json build scripts) — the individual
`.jsx`/`.js` files in this folder are written and ready to drop into one.
Setting up that second Vite target is straightforward but it's real,
separate scaffolding work — next on the task list, not done in this pass.

## Accounts and keys — only you can do these

I have no network access to convex.dev, clerk.com, or stripe.com from this
sandbox, so none of this can be pre-filled or verified from here:

1. **Clerk**: create an application at https://dashboard.clerk.com.
   Enable Organizations (Configure -> Organizations). Each Clerk
   Organization = one Kitchen, per your spec.
   Create a JWT Template named exactly `convex` (JWT Templates -> New ->
   Convex — Clerk has a built-in Convex template preset).
2. **Convex**: `npm install convex` then `npx convex dev` from
   `enterprise/` once its own package.json/project is set up, to get a
   deployment. Set these with `npx convex env set <NAME> <value>`:
   - `CLERK_JWT_ISSUER_DOMAIN` (from Clerk's JWT template settings)
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET` (from step 3 below)
3. **Stripe**: create a $50/month recurring Price. Add a webhook endpoint
   pointing at `https://<your-convex-deployment>.convex.site/stripe/webhook`
   listening for `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
   When creating a Checkout Session for the upgrade flow, pass
   `metadata: { clerkOrgId }` (Checkout Session) and also set that same
   metadata on the underlying Subscription (`subscription_data.metadata`),
   since `http.ts` reads `clerkOrgId` from both depending on event type.
4. Frontend env vars for the premium web app (`enterprise/frontend`, once
   its Vite project exists): `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_CONVEX_URL`.

## What's a reviewed-but-unverified first draft

Same caveat as `desktop/README.md`: I wrote `convex/*.ts` against my
knowledge of Convex + `convex/react-clerk` + Stripe's Node SDK APIs, but I
can't `npx convex dev` from here to typecheck or deploy it — none of
convex.dev/clerk.com/stripe.com are reachable from this sandbox. Treat the
`convex/` folder as ready to run `npx convex dev` against and fix whatever
it flags, not as already-verified.

## Update — standalone Vite project (built, v0.6.0 release pass)

The roadmap's "Standalone `enterprise/` Vite project" gap is now closed:
`enterprise/` IS that project. `npm install && npm run build` works
(`vite build`, verified) and `npm run typecheck` typechecks the Convex
server code (`tsc -p tsconfig.json`). What was added in this pass:

- **`package.json` / `vite.config.js` / `index.html` / `src/`** — the
  premium dashboard: `src/providers.jsx` (Clerk + Convex wiring),
  `src/App.jsx` (sign-in/up, kitchen (org) creation/switcher, plan card
  with the $50/mo upgrade, migration import, cloud-sync summary, and
  supplier orders — each premium panel gated on the tier, while the real
  enforcement stays in `convex/lib/premium.ts`), `src/useKitchenTier.js`,
  `src/styles.css`.
- **`convex/checkout.ts`** — the missing `createCheckoutSession` mutation
  the webhook's comment pointed at: $50/mo subscription, `clerkOrgId`
  through both session and subscription metadata.
- **`convex/sync.ts`** gained `listSyncedTables` (cloud-side row counts
  per local table, for the sync panel).
- **`convex/_generated/`** — locally generated equivalents of the
  codegen output (hand-written from the same template, so the project
  typechecks and builds before a deployment exists). `npx convex deploy`
  regenerates them on the real project.
- **`frontend/ClerkProviderWrapper.jsx`** updated to `@clerk/react`
  (Core 3); `@clerk/clerk-react` is deprecated.

Deploy steps are unchanged (above); the "unverified first draft" caveat
no longer applies to building — only to the live Clerk/Convex/Stripe
credentials, which are still yours to supply.
