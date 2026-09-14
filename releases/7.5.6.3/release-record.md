# FranchiseHQ 7.5.6.3

## Scope

Approved scope: shared rendered Discord player cards for `/player name` and `/trade-block view`, and audited commissioner player/pick transfers. Website Player Card presentation and Trade Create cards remain unchanged. Existing global command schemas are unchanged; no command registration is needed.

The deterministic SVG-to-PNG renderer uses locally vendored, licensed resvg WASM and Barlow font. Cards include team branding, a portrait when supplied, HT/WT, OVR/AGE/DEV and the exact requested position-specific ratings. RTR is the rounded mean of all three supplied route-running attributes; missing values stay unknown. Discord retains a native hyperlinked player title because text within a rendered image cannot be individually clicked. Trade Block uses the identical card with a Looking For footer.

Signed, self-contained media URLs require the existing encrypted bot secret, make no anonymous database queries, reject tampering, restrict image origins and size, bound fetch time, and cache rendered PNGs. No paid image generation or new secret is introduced. Issued cards are snapshots of the command response, not automatically edited historical Discord messages.

Commish HQ → Command Center → Roster & Pick Corrections opens a mobile-ready team/asset search with confirmation and an optional audit note. Moves are commissioner-only, league-scoped, idempotent and guarded against stale ownership/snapshots in the atomic D1 batch. Moves update player ownership or pick ownership, remove stale Trade Block listings, and record an immutable movement audit, tenant Audit event and league Transactions entry. Trade allowances and active snapshots are not changed.

FranchiseHQ retains approved-trade and commissioner ownership across imports. Madden continues supplying ratings, statistics and other source facts; roster differences are evidence, not authorization to undo ownership. Active legacy trade overlays are preserved without replaying retired trades or changing current ownership during migration. The immutable commissioner audit belongs to the persistent plane; the edition-scoped player ownership ledger is copied, removed and restored only by the existing separately authorized game-year archive workflow, not by imports or same-edition season advancement. Audit source IDs remain historical evidence even after an archive removes runtime source rows.

## Added during delivery

Local Worker acceptance caught an unsupported redirect option. Image fetching now uses manual redirects and rejects non-2xx responses rather than following unvalidated origins. Temporary image failures retry after 60 seconds instead of caching a portrait-less card for a week. Cache keys discard unrelated query parameters. Persistent-plane classification preserves ownership/audits through separately authorized game-year archives. Mobile controls have 44-pixel touch targets and do not compress status text behind the confirmation panel. Final read-through found the old public Transactions filter excluded commissioner movement records; the follow-up branch admits only completed commissioner-authority roster adjustments, with an authenticated tenant-isolation regression.

## Known inherited blockers

None blocking this release. Annual import/current-week source proof remains deferred until the next season. Year-by-year contract research and whole-trade reversal are outside this release.

## Validation evidence

Repository regressions: 243 passing tests including the final Transactions visibility regression; authentication/mobile: 12 passing tests. Local Cloudflare runtime returned a signed 115,901-byte PNG with real team logo/portrait, repeat requests succeeded, and unsigned/forged requests returned 404. Local Chrome checks passed at 390 and 1280 pixels with no horizontal dialog overflow and a 44-pixel Confirm Move control. The generated preview uses explicitly illustrative ratings, not altered Production player data. The initial code PR's four checks and Main's five checks passed; final follow-up publication must pass the same gates.

## Deployment status

The authorized migration-before-merge sequence completed on September 14, 2026:

1. Confirmed account `cc973c5a4c4ed410382f376244af078f`, D1 `franchise-hq-db-madden27`, ID `b2529150-28af-42ca-a07b-69506764ccb6`. The Madden 26 database was not used.
2. Captured protected counts, exact pick ownership/revisions, active overlays, membership assignments and active snapshot. Pre-change D1 bookmark: `0000026f-000002d8-000050e6-316ac953297efd1c5510cd25b66d38bb`.
3. Executed the **complete** [migration 41](../../migrations/0041_commissioner_roster_ownership.sql) exactly once, beginning with `PRAGMA foreign_keys = ON;`, without SQL comments. Committed source SHA-256: `06cfd2ed0bc93c1dd5b72d36cad0944370d8aab9e85230c42e883b44ac7e1e0c`. The complete normalized paste matched the source. No ownership baseline, player move or pick move was run.
4. Verified migration 41, two empty tables (9 and 16 columns), all five indexes and seven triggers, foreign keys with zero violations, protected counts and exact ownership/assignments unchanged. Complete preservation results are in [migration-preservation.json](migration-preservation.json).
5. Only after migration verification, merged [PR #100](https://github.com/itzpeckin/furiousgamingcommunity/pull/100), candidate `1194136a7c6def03484269a08798220899c650ff`, to Main `d2959e43a63bd6ea17c6c6bef990e7479dbbec83`. Four PR and five Main checks passed. Cloudflare Pages Production deployment `537fb56d-a1ec-4000-9dfc-ed3c7cadc16d` succeeded at `2026-09-14T18:30:02Z` and serves FranchiseHQ.app.

Live read-only acceptance showed Current Release 7.5.6.3, successful health, unsigned card rejection (404/no-store), a 40-pick commissioner directory and full-name Baker Mayfield search returning one Buccaneers player. The dialog was closed without any move. Signed PNG rendering with the real logo/portrait was verified in the local Cloudflare runtime; visual acceptance of actual new Discord responses remains owner-operated. The follow-up branch records this evidence and corrects public Transactions visibility; it requires hosted checks and code-only republication, not another migration.

All 672 pick owners/revisions, three active overlays, 33 membership/access assignments and active snapshot `8a71d810-7e7c-475a-b471-e1babdc8d7a0` were preserved. No production import, reset, archive, transition, export URL rotation, membership/credential change, active snapshot change or Free Agent reinterpretation was performed as an acceptance test.

## Rollback

Pre-release Main is `c03cf9b433563c114a3b89c20494acb498f3f916`. Retain migration 41 and every audit/ownership row; do not drop tables or restore a database as a routine code rollback. Once new authoritative ownership is written, an older code version that ignores it is not a safe rollback: use a forward compatibility fix instead. The pre-migration D1 bookmark is recovery evidence, not authorization to reset or overwrite league data.
