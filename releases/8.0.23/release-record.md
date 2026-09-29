# FranchiseHQ 8.0.23

## Scope

Commissioners can opt into written coaching archetype checks, choose a source channel or existing thread, a results channel, and bans among Defensive Genius, Offensive Guru, Development Wizard and College Coach. The background scanner reads historical and new submissions, associates the actual Discord author with league ownership, and applies deterministic rules. /coach status and /coach missing expose results. Unreadable evidence prompts a clearer screenshot. Rule changes reuse observations. Weekly ability icons remain deferred.

Companion imports use bounded bulk snapshot writes with the existing checkpoint and replay contract. A complete adjacent previous/current-week export retains an empty current week, while All Weeks future placeholders do not advance the live week. EA reconnection reuses a complete schedule for the exact prepared franchise/edition/season. Connection panels preserve open settings and reject stale background responses. Reconnect errors name the navigation path. First verified live imports create current-week schedule threads; week advances still create the new week before deleting prior threads. /games includes full teams, standings and Discord GM identities with final scores.

## Added during delivery

Regressions cover historical/live pagination, actual author mapping, tenant and guild isolation, permission revocation, transient inference failure, deleted reports, rule changes, exact-season schedule reuse, stale connection refreshes and complete adjacent-week export selection.

## Known inherited blockers

Weekly icon recognition is deferred. Private or unsupported share links require a direct screenshot attachment. Live speed improvement will be measured on the next user import.

## Validation evidence

Local regression tests, strict release checks, preview and production acceptance are recorded in validation-evidence.json and the external release receipt. No live user import is required for deployment; timing improvement must be verified on the next real import.

## Deployment status

Authorized under standing release approval. Migration 50 adds only coaching settings and observations. Pages adds Workers AI and a dedicated scanner secret. A new minute-scheduled worker calls the authenticated bounded scanner endpoint. Existing import Worker remains unchanged. All coaching settings default off; no source channel or league bans are invented.

## Rollback

Disable the coaching scanner trigger and restore Pages deployment 98b247e4-3ffb-4460-9e9e-f222f2b68e43 (v8.0.22). Retain additive migration 50, coaching audit records, all active snapshots and existing import Worker. No data deletion is needed.

## Production acceptance correction

Regional Xbox share-page redirects are accepted only on the existing Xbox allowlist. The supplied public Xbox link resolved to its validated full image. Oversized multi-image submissions request new evidence rather than silently checking a subset. Command registration uses the available production metadata cache when the optional league-configuration cache is absent. Authenticated scanner diagnostics report image-reader and Message Content readiness without exposing credentials.
