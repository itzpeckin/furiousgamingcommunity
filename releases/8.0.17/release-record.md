# FranchiseHQ 8.0.17 — unified Madden import workspace

## Scope

Place EA Direct and Madden Import inside one section above the Data Source Selector. Keep Quick Controls adjacent on desktop and stack the sections on mobile. Standing authorization covers PR, merge and production publication.

## Added during delivery

One Madden Import workspace contains Step 1: Collect Madden data (EA Direct or Companion App) and Step 2: Import to your league. Copy explains that collection alone does not update live rosters, ratings, development traits or statistics. The completed EA collection shortcut moves to Step 2. Existing event handlers, polling, access controls and publication actions are preserved. Desktop visual acceptance identified a narrow trade-reset description; the adjacent controls now stack its description and buttons at all widths.

## Known inherited blockers

No delivery blocker. Collection and import remain separate commissioner actions. Existing unrelated Discord delivery attention remains outside scope.

## Validation evidence

Existing release and EA UI behavior checks, hosted assets, and desktop/mobile browser acceptance are recorded on the PR and release receipt. Verify source order, adjacent Quick Controls, one instance of each panel, and no page overflow. Do not run a collection or import as a layout check.

## Deployment status

Pages-only candidate. Worker and migration 48 unchanged; no production data actions.

## Rollback

Restore v8.0.16 / Main 55a3de8cdc5908e75926106d5f2185b6657fff00 / Pages a38587b3-a832-4275-99c2-8807a073ef96. Preserve data and import Worker.
