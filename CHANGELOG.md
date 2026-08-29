# Changelog

## 0.6.0 (2026-08-26)

- Desktop pivot release: free offline app (Tauri + SQLite sidecar), local
  voice dictation (faster-whisper), Stage 1-3 feature set complete.
- Premium web app (enterprise/) buildable + deployed; Convex/Clerk/Stripe
  wiring scaffolded.
- **0.6.1 fixes (this pass):**
  - Pricing page rewritten to the real Free / Premium ($50/mo) model
    (removed the stale Solo/Venue/Chain storefront).
  - Removed Google Fonts egress (offline-first; Tauri CSP blocked it anyway).
  - `getByClerkOrgId` now checks caller's organization membership.
  - Landing copy corrected: no "no account" overclaim, analytics marked
    roadmap, system requirements + first-run tutorial added.
  - README / premium upsell no longer advertise unbuilt AI analytics.
  - Version alignment: enterprise/ now 0.6.0.
