# FranchiseHQ 7.5.7

## Scope

Reduce weekly import round trips and make activation/thread readiness independently observable, while repairing the mobile team Depth Chart, adding a grouped table view, and restoring canonical Madden height and weight in Player Card banners.

## Added during delivery

Statistics mapping now advances through at most four existing bounded batches per request. Browser validation now matches the background workflow's bounded four-by-500 processing. Commissioner HQ records source checking, every existing import phase, atomic activation, click-to-live, browser refresh, and Discord thread readiness separately. These changes retain exact-source hashes, mapping-revision behavior, validation, atomic activation, and the existing period-advance thread gate.

The current formation Depth Chart is wrapped in a phone-only two-axis scroll viewport so offense, defense, and special teams stay reachable without overflowing the page. A Formation/Table toggle adds nine requested roster groups. Within each group, each actual position shows depth entries 1–3 with Position, Player Name, Overall, Age, Height, Weight, and Development.

The live browser roster adapter now retains `heightInches` and `weightLbs`, which were already present in the protected active-snapshot DTO. Height is formatted as feet/inches and weight as pounds in the grouped Depth Chart table and canonical Player Card banner. No Madden data rewrite is needed.

## Known inherited blockers

Madden's explicit Free Agents route remains blocked upstream and therefore unknown/null, never zero. Production-sized timing baselines will be recorded by the next commissioner-initiated retained-source and full-season imports; the release does not manufacture an import solely to produce a benchmark.

## Validation evidence

Focused UI/data/import/Discord regressions pass 90/90. The complete repository suite passes 253/253, including same-week no-thread behavior, one-week-only thread creation, full-season schedule isolation, failure preservation, blocked-Free-Agent truthfulness, tenant isolation, security, and migration immutability. The generated system inventory is current at 633 tracked files and 79 routes.

## Deployment status

Pull request, protected Main merge, Production Pages/Worker publication, and signed-in read-only desktop/390px acceptance are standing-authorized. No database migration or Discord command registration is required.

## Rollback

The exact runtime baseline is Main `4d51e4f7d57beb523b9fe33879e39becfebbbdda`, Production release 7.5.6.12, and migration 43. Runtime rollback may restore that code while retaining all snapshots, imports, timing records, mappings, captures/reports, audits, yearly schedules, development-trait observations, permanent export URL, Discord thread records, season/game-year records, and blocked/null Free Agent state. Rollback does not authorize an export/import, active-pointer change, thread operation, data reset/deletion, URL rotation, season archive/transition, or player biography rewrite.
