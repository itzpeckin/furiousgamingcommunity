# FranchiseHQ 7.5.6.5

## Scope

Add the reusable commissioner-facing **Import Yearly Schedule** workflow. It collects Regular Season Weeks 1–18 through the existing permanent Madden export URL, validates all 272 unique games, and seals one immutable season schedule revision without changing the active week or invoking Discord.

Normal **Import Latest Export** is disabled in the browser and rejected by the server while collection is open. Finishing clears only the normal latest-export selection so the next current-week capture starts a fresh weekly source. A later normal import composes the yearly catalog beneath retained results and the newest current-week schedule, preserving stable Confidence Pool game identity.

## Added during delivery

Additive migration 42 introduces tenant- and franchise-season-scoped collection/revision rows plus retained capture links. Ordinary nonzero schedule routes remain authoritative, non-empty `/week/reg/0/` routes use payload periods, empty Week 0 remains a placeholder, and preseason/postseason routes do not enter the regular-season catalog. Commissioner UI states show progress, readiness, completion, and the exact 18-week/272-game gate.

## Known inherited blockers

Madden Companion's All Weeks control can emit only one current schedule period. Commissioners may therefore need to send the 18 Regular Season weeks individually during **Import Yearly Schedule**. FranchiseHQ cannot manufacture schedule rows that Madden did not provide. Blocked Free Agents remain unknown/null and are unrelated to this workflow.

## Validation evidence

Focused coverage validates ordinary/sentinel route authority, empty Week 0 handling, full and incomplete coverage, weekly-import interlock, immutable completion, raw-capture/audit retention, zero collection-time snapshots or Discord threads, unchanged URL token version, weekly overlay precedence, Confidence Pool identity stability, migration preservation, and foreign-key integrity. The complete repository suite passes 259/259 and the consolidated strict gate passes 247/247.

## Deployment status

The release completed on September 15, 2026. Candidate `21e3b23e4fd24bd16f921f12d85f280022f56503` passed all four hosted checks in [PR #106](https://github.com/itzpeckin/furiousgamingcommunity/pull/106) and merged to Main as `6fe3facd8b01b1e66e4c089448e7bf90721a7662`. Main quality workflow `35033045177` and Pages workflow `35033043906` passed. Cloudflare Pages Production deployment `76204841-1eba-46af-8dd5-7672fe519876` serves 7.5.6.5, and verified Worker build `e74f4b8e-c032-4807-b5db-6def6ebfbc51` was promoted as Worker version `924b2e52` at 100% traffic.

Migration 42 was applied to exact Production D1 database `franchise-hq-db-madden27` / `b2529150-28af-42ca-a07b-69506764ccb6` between retained bookmarks `000002c5-000002b2-000050e7-4d6e0ac3a9c03211afe397ae30029696` and `000002c5-000002e2-000050e7-fda80eaac71c0d9d9bb6c78af8461719`. It added exactly two tables, three named indexes, four guards, and one migration-ledger row. Protected counts, all 189 tenant audits, and active snapshot `8a71d810-7e7c-475a-b471-e1babdc8d7a0` remained unchanged; foreign keys are clean.

Authenticated read-only acceptance confirmed the Production release marker and enabled **Import Yearly Schedule** control. No collection was started: yearly import rows and linked captures remain zero. The 105 retained Discord schedule-thread rows were not touched; their latest update remains September 13, 2026. No export/import, snapshot activation, reset/deletion, URL rotation, archive/transition, credential/membership/assignment change, Discord registration/configuration, or blocked-Free-Agent reinterpretation ran.

## Rollback

The exact rollback baseline is Main `18d239bcd4cf15ab0da25d3340fd2ad071716c5c`, Pages deployment `72a3b739-d2b2-4052-8ae5-3c2ca201a1e4`, and prior Worker version `326ee7ef`. Runtime rollback must retain migration 42, every yearly schedule collection/revision, capture link, source capture/R2 object, audit, snapshot, and the current active pointer. Do not drop the additive tables or modify a completed immutable revision. Restore a compatible runtime before continuing an open collection.
