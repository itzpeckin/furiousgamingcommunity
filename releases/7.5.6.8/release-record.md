# FranchiseHQ 7.5.6.8

## Scope

Correct the retained 2027 Week 1 import without requiring another Madden export. Ordinary nonzero statistics routes now own their period, so the retained Week 2 team-summary route cannot enter a Week 1 snapshot because of misleading cumulative payload fields. Week 0 sentinel payload-period handling remains intact.

## Added during delivery

One shared authority helper now governs both future-route scoping and statistics-batch provenance. Mapping revision v6 permits one exact-source recomposition, while the completed yearly schedule continues to provide all 272 games across 18 weeks. Same-week history rules prevent the current snapshot's affected Week 1-labelled rows from being carried forward.

## Known inherited blockers

Madden's explicit Free Agents route remains blocked upstream and therefore unknown/null, never zero. Import performance work remains planned for 7.5.7. Neither limitation requires a repeated 18-week schedule export.

## Validation evidence

The Production-shaped regression gives an ordinary Week 2 team route misleading playable Week 1 payload metadata and proves that its route still resolves to Week 2 and remains outside a proven Week 1 candidate. A Week 0 sentinel with that same payload continues to resolve to Week 1. Focused, repository, strict, hosted, Main, and Production acceptance evidence is recorded in `validation-evidence.json`.

## Deployment status

Production publication and retained-source recomposition are owner-authorized. The corrected snapshot must show Season 2027 Week 1, 272 games, zero statistics, unchanged blocked/null Free Agents, and retained prior snapshots before acceptance is complete.

## Rollback

The exact pre-release runtime baseline is Main `b27a791c9171b24b1879f4e60e59934312d3bb63`, Production release 7.5.6.7, Pages deployment `00156068-d518-4cea-9ad4-95c60a0ab4fc`, and migration 42. Runtime rollback must retain active snapshot `512d2196-338b-4ab9-8f6d-51128c9d036b`, previous snapshot `8a71d810-7e7c-475a-b471-e1babdc8d7a0`, any corrected snapshot, every capture/report/candidate/mapping/snapshot/audit record, the permanent URL, season/game-year and Discord state, and blocked/null Free Agent semantics. It must not restore a D1 bookmark.
