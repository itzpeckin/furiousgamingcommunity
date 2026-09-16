# FranchiseHQ 7.5.6.11

## Scope

Correct Madden contract currency normalization without imposing a maximum cap-hit value or rewriting retained source data.

## Added during delivery

The shared contract adapter now derives currency units from explicit source-format metadata or internally consistent contract relationships. Future roster mappings retain the proven dataset unit, conflicting formats fail closed before candidate creation, and no player-contract amount is used as a scale cutoff.

## Root cause and correction

The shared contract adapter selected units from whether the raw cap hit was above or below `5000`. Nick Bosa's retained value changed from `2298` in earlier 2026 snapshots to `5485` in the final 2026/current 2027 snapshots, incorrectly switching the display from the ten-thousand-dollar format to the thousand-dollar format.

The adapter now uses explicit source-format metadata or the source-backed identity between cap hit, release penalty, and net release savings. Future player mapping records retain the proven dataset unit. Contract size is never used as a format discriminator, so `5485`, `10000`, and `25000` normalize to $54.85M, $100M, and $250M respectively in the current format.

## Retained-source evidence

The active 2027 Week 1 record contains cap hit `5485`, release penalty `2218`, and net release savings `$32.67M`; $22.18M plus $32.67M proves a $54.85M cap hit. Retained 2026 Week 21 records contain Bosa cap hit `2298` ($22.98M), while the retained Week 23 record contains the same `5485` source value as 2027.

## Safety boundaries

The release is code-only and requires no migration or data rewrite. It performs no export/import, active-snapshot change, scheduling-thread action, reset, deletion, URL rotation, archive/transition, Discord registration/configuration, credential/membership/assignment change, or Free Agent reinterpretation.

## Known inherited blockers

Madden's explicit Free Agents route remains blocked upstream and therefore unknown/null, never zero. Import performance remains planned for 7.5.7. Neither limitation affects contract normalization or this code-only release.

## Validation evidence

Focused retained/current/boundary regressions pass 31/31. The complete repository suite passes 264/264 and the consolidated strict release gate passes 252/252. Generated inventory remains current at 631 tracked files and 79 routes.

## Deployment status

Pull request, protected Main merge, and Production publication are standing-authorized. Production acceptance is signed-in and read-only against the existing retained snapshot.

## Rollback

The exact runtime baseline is Main `9d3a021e22a9d93aa329bfcbfde48592b358d74f`, Production release 7.5.6.10, and migration 42. Runtime rollback must retain every snapshot, player record, mapping run, capture/report, audit, yearly schedule, permanent export URL, Discord thread, season/game-year record, and blocked/null Free Agent state.
