# FranchiseHQ 7.5.6.12

## Scope

Add two multi-league Discord operations: a completed-game team rushing-rule audit and a weighted Superstar/X-Factor roster audit with source-backed first-observed trait timing.

## Added during delivery

FranchiseHQ now exposes `/rush rule` and `/abilities` through tenant-resolved shared Discord read models. The ability audit includes FB in the half-weight group, retains every other unlisted position at a full point, and writes qualifying development-trait observations during the same atomic snapshot activation that makes imported league data live.

## Rushing rule

`/rush rule` defaults to the current imported regular-season week and accepts an optional Week 1–18 value. It checks only completed regular-season games, sums every source-backed player carry for each team, reports teams below 10 carries with their opponent, and compares summed player rushing yards with Madden's team-game rushing yards. Missing or malformed statistics remain explicitly unable to verify and are never converted to zero or a violation.

## Ability counts

`/abilities` lists every team's weighted Superstar/X-Factor total. An optional team selection returns the qualifying players, development trait, position weight, rookie label, and first source-backed observation. FB, K, P, LT, LG, C, RG, RT, OL, and LS count as 0.5; every other position counts as 1. The 7.5 value is described as the season-opening and trade-acquisition benchmark, not a live roster cap, because development gains may legitimately raise a team above it.

## Trait history

Additive migration 43 creates a tenant- and franchise-season-scoped observation ledger. The currently active snapshot becomes the honest tracking baseline, and every later atomic activation records current Superstar/X-Factor observations in the same activation batch. Week 1 and preseason baselines display as **Season opening**. Later changes display as **First observed Week N**, avoiding an unsupported claim that a trait was earned during an unimported interval.

## Safety boundaries

This release does not run a Madden export/import, move the active snapshot, create schedule threads, reset or delete data, rotate the export URL, archive or transition a season, change credentials/memberships/assignments, or interpret blocked Free Agents as zero. Migration 43 is additive and its ledger participates in the existing game-year archive/remove/restore boundary.

## Known inherited blockers

Madden's explicit Free Agents route remains blocked upstream and therefore unknown/null, never zero. Import performance remains planned for 7.5.7. Neither limitation affects the rushing-rule or ability audits.

## Validation evidence

Fresh and legacy migration tests, command definitions, signed command execution, FB/offensive-line half weights, other-position full weights, rookie labels, first-observed history, rushing violations, yard mismatches, and missing-data language are covered. The complete repository and strict release gates each pass 253/253 automated checks; generated inventory is current at 633 tracked files and 79 routes.

## Deployment status

Pull request, protected Main merge, additive Production migration 43, exact-name registration of only `rush` and `abilities`, Production deployment, and read-only acceptance are standing-authorized.

## Rollback

The exact runtime baseline is Main `6adcdd43880d7c70b6aee9e4fddf733d3823413f`, Production release 7.5.6.11, and migration 42. Runtime rollback may restore that code while retaining additive migration 43 and every trait observation, snapshot, mapping, capture/report, audit, yearly schedule, permanent export URL, Discord thread, season/game-year record, and blocked/null Free Agent state.
