# Known Issues — v0.6.0

Still open (non-blocking for the free-tier release):

- Missing feature: Localization tools (Spanish, Japanese)
- Missing feature: Tutorial page
- Missing feature: Profile management
- Ingredient categories should display icons with the text.
- Allergen dictionary should already be integrated and autocompleted, and
  have a toggle with an "other" function. Also include icons.

Resolved since the last check (v0.6.0 release pass):

- ~~Voice input not yet wired up~~ — voice input IS wired (VoiceField /
  VoiceIconButton across the app, local faster-whisper dictation; see
  roadmap Stage 1). This item was stale.
- ~~Upgrade button disabled / payments placeholder~~ — Billing now shows
  the Free→Premium model and the Upgrade button opens the premium web
  app (see roadmap Stage 0 release-pass note).
- ~~Desktop build broken (frontendDist absolute path)~~ — fixed and
  re-packaged as 0.6.0.
- ~~App icons missing~~ — generated from `icon.png`.
