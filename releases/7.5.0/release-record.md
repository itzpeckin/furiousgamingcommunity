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

Focused authentication, session, OAuth handoff, authorization, middleware, membership, migration, tenancy, direct-route, mobile, and desktop regression coverage is consolidated with the complete repository suite and strict release gate. Fresh and legacy database fixtures advance through migration 36 while preserving protected identities and referential integrity. Exact results are recorded in `validation-evidence.json`.

## Deployment status

Local validation candidate only on `codex/franchisehq-7.5.0`, based on exact Main evidence commit `639c896eaa041241111ca612761978310f2c19ec`. GitHub publication, a pull request, hosted checks, merge to Main, migration 36, Production deployment, and device acceptance have not run and are not authorized by this implementation cycle. Production remains FranchiseHQ 7.4.4.12 on migration 35.

No Production or staging resource, Discord command/configuration, credential, user, membership, team assignment, league-data row, import, active snapshot, reset, deletion, archive, season transition, or export URL changed. Blocked Free Agents remain unknown/null.

## Rollback

Before publication, discard the local candidate and return to exact source baseline `639c896eaa041241111ca612761978310f2c19ec`. If a later separately authorized deployment applies migration 36, application rollback may return code to this baseline while leaving the additive columns and empty framework tables in place; do not remove migration 36 or delete retained session-security evidence. Preserve every league-data row, active snapshot, permanent export URL, membership, assignment, audit, Discord installation, trade, transaction, and blocked/null Free Agent state.
