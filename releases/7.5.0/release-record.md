# FranchiseHQ 7.5.0 Release Record

## Scope

Replace the fragmented browser-login behavior with one centralized, tenant-aware authentication and session framework while preserving exact league routes, controlled mobile and owner recovery, and all existing league-data boundaries.

## Added during delivery

- One public-domain `franchisehq.app` browser session uses a 7-day idle window, a fixed 30-day absolute expiry, 24-hour token rotation, hash-only token storage, and an independent session-bound CSRF token.
- Discord OAuth, same-origin establishment, the origin-bound one-time handoff, logout, expiry, rotation, and revocation share one server implementation. `pages.dev` remains only a controlled recovery entrance and does not become a second session authority.
- Exact league routes survive refresh and authentication return on mobile Discord, mobile browser, and desktop. The controlled owner fallback remains identity-restricted and returns to the canonical public domain.
- Authorization capabilities are derived from the current active membership on the server. Team, role, deactivation, and membership-removal changes advance an authorization version and revoke existing browser sessions rather than leaving stale authority in a client cache.
- Authenticated browser mutations require exact same-origin evidence and a matching session-bound CSRF token. Existing short-lived server-import delegation remains separately scoped.
- Authentication entry points use the configured Cloudflare rate-limit binding when available and a durable D1 fallback otherwise; no mutable isolate-local request state is used.
- Additive migration 36 extends sessions and membership authorization metadata and adds privacy-minimized session security events plus durable authentication rate-limit buckets. Session tokens, CSRF tokens, Discord credentials, and raw user agents are never written to audit rows.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is not interpreted as zero. The owner-directed 7.5.0 sequence does not complete the still-required 7.4.5 canonical-consistency, 7.4.6 operations/recovery, or deferred 7.4.7 adapter gates.

## Validation evidence

Focused authentication, session, OAuth handoff, authorization, middleware, membership, migration, tenancy, direct-route, mobile, and desktop regression coverage is consolidated with the complete repository suite and strict release gate. Fresh and legacy database fixtures advance through migration 36 while preserving protected identities and referential integrity. The complete suite passed 211/211, the strict gate passed 202/202, exact candidate quality run `34309907085` passed before merge, and Main quality run `34310513119` passed after merge.

Production D1 target `franchise-hq-db-madden27` (`b2529150-28af-42ca-a07b-69506764ccb6`) was confirmed before mutation. Additive migration 36, SHA-256 `de096b35979d7b62858e171d98eb2baec82e5d71bfb2aa00d44e1d4dd69e1a0d`, was applied between Time Travel bookmarks `000001ba-00000ae7-000050e1-68d8968ee694bbf62b0df3bc788fe187` and `000001ba-00000b15-000050e1-0ae1677e021a8cdbc4039a27683589b7`. Verification confirmed its ledger row, two tables, six session columns, one membership column, four foreign keys, complete backfill of all 185 preexisting sessions, unchanged protected counts, and zero foreign-key violations.

Authenticated HTTPS acceptance refreshed the exact route `https://franchisehq.app/leagues/furious-gaming-community#commissioner/league-data` at desktop and 390×844 mobile widths. Both retained the path/hash and commissioner session and rehydrated Release 7.5.0 with the current Week 16 authority. The first legacy-session request rotated exactly once into a 168-hour idle / fixed 30-day session with 64-character token and CSRF hashes. Two privacy-minimized security events and four durable rate-limit buckets were created; the unrevoked-session count remained 167.

## Deployment status

Exact candidate `1a9d5a2e627e89b9b0a6ea9c78449a771101a357` was published through [PR #56](https://github.com/itzpeckin/furiousgamingcommunity/pull/56) and merged to Main as `43774ea365ee81d1727914242f906d7537195b8d` only after migration 36 passed Production verification. Cloudflare Pages deployment `6b0f9729-c174-4b81-9ec5-ba2eb5d92c1e` succeeded and serves Release 7.5.0.

The active snapshot observed immediately before migration and again after acceptance remained `f469399a-d4b1-446f-9264-75c17486d438` at Season 2026, Regular Season Week 16 with 32 teams, 2,029 rostered players, 288 games, 11,714 statistics, 32 standings, and ready validation. All 19 snapshots, 31 users, 31 memberships, 30 active team assignments, 672 draft picks, six trade workflows, one Discord installation, and 16 active schedule threads remain present. This Week 16 state and the additional retained snapshot predated and were independent of the release. No staging resource, Discord command/configuration, credential, membership, assignment, import, active-snapshot move, reset, deletion, archive, season transition, or export URL changed. Madden's Free Agent warning remains blocked and its product count remains unknown/null, never zero.

## Rollback

If runtime acceptance fails, redeploy exact source baseline `639c896eaa041241111ca612761978310f2c19ec`. Leave additive migration 36 in place and retain its session columns, authorization versions, rate-limit buckets, rotation lineage, and append-only security events. Do not restore either bookmark after new authentication activity without a separate recovery authorization. Preserve every league-data row, active snapshot, permanent export URL, membership, assignment, audit, Discord installation, trade, transaction, and blocked/null Free Agent state.
