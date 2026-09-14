# FranchiseHQ 7.5.6.3

## Scope

Approved scope: shared rendered Discord player cards for `/player name` and `/trade-block view`, and audited commissioner player/pick transfers. Website Player Card presentation and Trade Create cards remain unchanged. Existing global command schemas are unchanged; no command registration is needed.

The deterministic SVG-to-PNG renderer uses locally vendored, licensed resvg WASM and Barlow font. Cards include team branding, a portrait when supplied, HT/WT, OVR/AGE/DEV and the exact requested position-specific ratings. RTR is the rounded mean of all three supplied route-running attributes; missing values stay unknown. Discord retains a native hyperlinked player title because text within a rendered image cannot be individually clicked. Trade Block uses the identical card with a Looking For footer.

Signed, self-contained media URLs require the existing encrypted bot secret, make no anonymous database queries, reject tampering, restrict image origins and size, bound fetch time, and cache rendered PNGs. No paid image generation or new secret is introduced. Issued cards are snapshots of the command response, not automatically edited historical Discord messages.

Commish HQ → Command Center → Roster & Pick Corrections opens a mobile-ready team/asset search with confirmation and an optional audit note. Moves are commissioner-only, league-scoped, idempotent and guarded against stale ownership/snapshots in the atomic D1 batch. Moves update player ownership or pick ownership, remove stale Trade Block listings, and record an immutable movement audit, tenant Audit event and league Transactions entry. Trade allowances and active snapshots are not changed.

FranchiseHQ retains approved-trade and commissioner ownership across imports. Madden continues supplying ratings, statistics and other source facts; roster differences are evidence, not authorization to undo ownership. Active legacy trade overlays are preserved without replaying retired trades or changing current ownership during migration. The immutable commissioner audit belongs to the persistent plane; the edition-scoped player ownership ledger is copied, removed and restored only by the existing separately authorized game-year archive workflow, not by imports or same-edition season advancement. Audit source IDs remain historical evidence even after an archive removes runtime source rows.

## Added during delivery

Local Worker acceptance caught an unsupported redirect option. Image fetching now uses manual redirects and rejects non-2xx responses rather than following unvalidated origins. Temporary image failures retry after 60 seconds instead of caching a portrait-less card for a week. Cache keys discard unrelated query parameters. Persistent-plane classification preserves ownership/audits through separately authorized game-year archives. Mobile controls have 44-pixel touch targets and do not compress status text behind the confirmation panel.

## Known inherited blockers

None blocking this release. Annual import/current-week source proof remains deferred until the next season. Year-by-year contract research and whole-trade reversal are outside this release.

## Validation evidence

Repository regressions: 242 passing tests; authentication/mobile: 12 passing tests. Local Cloudflare runtime returned a signed 115,901-byte PNG with real team logo/portrait, repeat requests succeeded, and unsigned/forged requests returned 404. Local Chrome checks passed at 390 and 1280 pixels with no horizontal dialog overflow and a 44-pixel Confirm Move control. The generated preview uses explicitly illustrative ratings, not altered Production player data. Final inventory/release-contract gate is required before publication.

## Deployment status

Publication and Production migration/deployment verification are pending. The following sequence is authorized:

1. Confirm account `cc973c5a4c4ed410382f376244af078f`, D1 `franchise-hq-db-madden27`, ID `b2529150-28af-42ca-a07b-69506764ccb6`. Never use the Madden 26 database.
2. Capture protected counts, exact pick ownership/revisions, active overlays, user/membership assignment state and active snapshot. Retrieve `/bookmark` before schema changes.
3. Execute the **complete** [migration 41](../../migrations/0041_commissioner_roster_ownership.sql), beginning with `PRAGMA foreign_keys = ON;`, without an introductory comment. It creates two empty tables, three unique indexes, two lookup indexes, seven guards/immutability triggers and migration ledger entry 41. No ownership baseline, player move or pick move is run.
4. Verify migration 41, table columns/indexes/triggers, `PRAGMA foreign_key_check`, both new tables empty, protected counts and exact ownership state unchanged.
5. Only then merge the checked PR to Main; monitor GitHub and Cloudflare Pages Production and verify live release/assets and signed PNG support read-only.

Publication/deployment evidence is pending; standing owner authorization applies throughout this release. No production import, reset, archive, transition, export URL rotation, membership/credential change, active snapshot change or Free Agent reinterpretation is authorized or performed as an acceptance test.

## Rollback

Pre-release Main is `c03cf9b433563c114a3b89c20494acb498f3f916`. Retain migration 41 and every audit/ownership row; do not drop tables or restore a database as a routine code rollback. Once new authoritative ownership is written, an older code version that ignores it is not a safe rollback: use a forward compatibility fix instead. The pre-migration D1 bookmark is recovery evidence, not authorization to reset or overwrite league data.
