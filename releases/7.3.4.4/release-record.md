# FranchiseHQ 7.3.4.4 Release Record

**Status:** Deployed and verified in Production; pending owner UI acceptance

**Production changed:** Yes. Production runs exact Main commit `5a16ccb311b368ae1df5f7fcf3e4f95bc01c9cd8`, Pages deployment `51e55575-0032-41af-b5d3-a69c67f54d2e`, and import Worker build `44d2c02b-f6e1-433f-9e28-339fa6d0f382` / version `1e01f1a9`. Exact validated Week 9 snapshot `8b47ec76-7369-495e-913f-edc0310b49e1` is active; prior Week 7 snapshot `841ce1b5-a4a6-4246-a53a-01cd1f189663` is archived and retained as the previous pointer.

## Scope

Make the commissioner's routine flow match the product contract. **Import Latest Export** must create or reuse its season destination, map, validate, and atomically publish the exact eligible snapshot in one click. **Archive Season** must freeze the completed same-edition franchise season into History Books and prepare the next franchise season in one click. The currently validated Week 9 candidate is the only Production snapshot authorized for activation in this cycle.

## Added during delivery

- Move validated candidate publication into the commissioner-authorized finalize transaction with an expected-prior-pointer compare-and-swap guard.
- Update the active pointer, old/new snapshot states, game-year link states, franchise-season state, candidate run, lifecycle event, and tenant audit in one guarded D1 batch.
- Treat repeated finalization of the already-active exact candidate as an idempotent success without duplicate activation evidence.
- Remove routine destination-creation and snapshot-activation buttons from the commissioner workflow; the single Import action creates/reuses the destination automatically.
- Replace manual same-edition season fields and typed confirmation with one Archive Season action that freezes closure evidence, prepares the next season, archives the old destination, and clears only the selected latest export.
- Require a new export after Archive Season by refusing any report that predates the newly prepared season.

## Known inherited blockers

- The source jumps from active Week 7 to captured Week 9. Missing Week 8 remains visible and is not manufactured or silently filled.
- Madden's explicit Free Agent route remains blocked upstream. The rostered-player import may proceed only with Free Agents unknown/null.
- Session refresh inconvenience remains deferred to 7.5.0.

## Validation evidence

- A database-backed endpoint regression proves one finalize request moves only the exact candidate from validated to active, archives the prior snapshot, preserves blocked/null Free Agents, creates one lifecycle event and one audit row, and is idempotent on retry.
- A database-backed endpoint regression proves one Archive Season request freezes the completed season, prepares the derived next season, clears the latest-source selection without rotating the URL, retains the live pointer and all protected rows, and is idempotent on retry.
- The full strict gate passed with 104/104 automated tests, 203 JavaScript modules, 533 inventory files, 65 routes, and 79 required tables.
- Migration 26 remains current; 7.3.4.4 adds no schema migration.
- Read-only Production reconciliation proved the exact recovered 43-route source, Week 9, 32 teams, 2,043 rostered players, 29 games, 717 statistics, 32 standings, validation ready with zero errors, the retained Week 8 warning, and blocked/null Free Agents before activation.
- Post-activation reconciliation proved one exact active pointer, the prior Week 7 pointer retained, one activation lifecycle event, one activation audit row, unchanged endpoint token version 1, eight users, eight memberships, no season closure, and zero foreign-key violations.

## Deployment status

- PR #20 published exact candidate `5a16ccb311b368ae1df5f7fcf3e4f95bc01c9cd8`; all four candidate checks and all seven Main/deployment checks passed. Main was fast-forwarded to the same exact commit.
- Cloudflare Pages Production deployment `51e55575-0032-41af-b5d3-a69c67f54d2e` and import Worker build `44d2c02b-f6e1-433f-9e28-339fa6d0f382` / version `1e01f1a9` succeeded. The live domain visibly reports 7.3.4.4.
- The deployed commissioner endpoint atomically activated exact durable run `candidate_import_bb7020cd-bbd8-4eea-a810-7eb2012ed848` and snapshot `8b47ec76-7369-495e-913f-edc0310b49e1`. Its short-lived delegation was deleted immediately and verifies at zero retained rows.
- No staging cycle, migration, new Madden export, Archive Season operation, Madden game-year transition, reset, permanent deletion, URL rotation, or credential change is authorized or required.

## Rollback

- The exact runtime rollback baseline is 7.3.4.3 commit `0a5dc06b90fbf2fe718482106c5c7a037f2d6dfa`, Pages deployment `3d667ec0-73f8-4188-9e5b-76f154634dfe`, and Worker build `8fa92466-efe6-438f-8811-3cae1c4f6138`.
- Runtime rollback must retain the exact latest-ready recovered export, candidate snapshots, captures, reports, active pointer, URL token version, history, lifecycle events, and audits.
- If Week 9 has been activated, restoring Week 7 is a separate snapshot rollback decision; never move the pointer as an implied code rollback.
- Do not reset data, delete history, rotate the export URL, run Archive Season, run a game-year transition, manufacture Week 8, or reinterpret blocked/null Free Agents as a rollback shortcut.
