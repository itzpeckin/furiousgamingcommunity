# Franchise HQ v5.4.8 — Validation Guide

Validate that normalized League Data events are available, correctly scoped, immutable, and backward compatible.

## Required checks

1. Site displays v5.4.8.
2. Existing League Data behavior still works.
3. `league:modeChanged` fires on mode changes.
4. `league:dataChanged` fires when the active source changes.
5. `league:stateChanged` fires for meaningful transitions.
6. Existing `franchisehq:league-data-state-changed` remains available.
7. Event payload contains the documented fields.
8. Payload status and source metadata are frozen.
9. A single action does not create an uncontrolled event loop.
10. No red console errors appear.

See the release instructions provided with the downloadable package for the complete step-by-step test procedure.
