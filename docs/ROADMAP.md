# FranchiseHQ Production Roadmap

**Document owner:** FranchiseHQ

**First customer league:** Furious Gaming Community (FGC)

**Updated:** August 27, 2026

**Revision:** 1.23

**Current production:** 7.1.0 database foundation, delivered through PR #8

**Current work:** 7.2.0 repository publication, hosted checks, and isolated staging validation

**Next gate:** Complete the authorized pull request and isolated staging migration/deployment, reconcile preservation evidence, then request a separate production decision.

## Product decisions

- The product is **FranchiseHQ**. FGC is configuration and the first league, never the application identity or a product-wide hard-code.
- FGC launches as the only enabled production tenant. League-owned data is tenant-scoped now so adding league two later is controlled activation, not a retrofit.
- Server data is authoritative for shared league features. Browser storage is limited to temporary UI preferences.
- Every release must work at phone and desktop widths. Mobile is an acceptance requirement, not a later port.
- Madden sources feed one canonical snapshot model. Companion, approved direct-EA access, and CSV/Excel must not create separate downstream products.
- Free Agents are a required first-class dataset. A source must provide and reconcile them or explicitly prove their absence.
- Production publication, database migration, Discord configuration, membership edits, FGC reset, import, and snapshot activation are separate authorization decisions.
- Every validated release updates this roadmap with requested additions, unexpected work, defects, deferrals, evidence, and the next exact gate.
- The refresh/login inconvenience is accepted temporarily. Session redesign remains frozen until 7.5.0 unless evidence shows an authorization or data-exposure vulnerability.

## Current facts and accepted limitations

- 7.1.0 is production and established a reproducible database, continuous migration ledger, preservation checks, and target-locked migration command.
- Refreshing Commissioner HQ or Trade Center can return a user to Account or require another login, especially on mobile. The owner accepted this as a temporary UX defect.
- Commissioner settings can remain browser-local and disagree between commissioners. The shared schema exists; 7.4.2 moves the feature to server authority.
- EA has restored Madden NFL 27 Companion data flow. After 7.2, discovery and a safe FGC teams/rosters/players activation are the immediate priority.
- No FGC Madden reset has occurred. Reset and activation require preview, recovery evidence, staging rehearsal, and explicit owner approval.

## Release tracker

| Version | Status | Outcome |
| --- | --- | --- |
| 7.0.0–7.0.5 | Production history | Engineering baseline, security containment, onboarding, ownership, and Commissioner-management foundations |
| 7.1.0 | Production | Canonical database, target-locked migration, preservation, and recovery foundation |
| 7.2.0 | In local validation | Tenant-ready core with FGC as the only enabled league |
| 7.3.0 | Next | Madden 27 payload discovery and source lock |
| 7.3.1 | Planned | Canonical teams, players, rosters, and Free Agents mapping |
| 7.3.2 | Planned | Recoverable FGC reset, import, validation, and activation |
| 7.3.3 | Planned | Production team, roster, player, and Free Agent experience |
| 7.3.4 | Planned | Stable shareable team and player URLs |
| 7.3.5 | Planned | Team assignment, My Team, and ownership reconciliation |
| 7.3.6 | Planned | Incremental Madden updates and freshness reporting |
| 7.3.7 | Research gate | Approved direct-EA and CSV/Excel adapters |
| 7.4.0–7.4.6 | Planned | Core platform features, mobile polish, consistency, and operations |
| 7.5.0 | Required before RC | Authentication and session framework |
| 7.6.0-rc.1 | Planned | Private FGC release candidate |
| 7.7.0 | Planned | FGC production launch |
| 8.0.0 | Planned | Multi-league activation |
| 8.1.0 | Planned | Multi-league administration and operations |

## 7.1.0 — Database Foundation

**Delivered**

- One active migration sequence initializes a clean database and upgrades production-shaped legacy data.
- Shared settings/revisions, import/snapshot, transaction, and runtime tables moved into migrations; request handlers no longer create schema.
- Runtime guards fail closed below the required schema version.
- Fresh install, legacy upgrade, identity preservation, foreign keys, backup/restore, and production target checks passed.
- Production reached a continuous ledger through version 20 with protected counts and ownership unchanged.

**Still deferred**

- Shared settings are schema only until 7.4.2.
- No Madden reset/import, membership edit, Discord change, or session redesign was included.

## 7.2.0 — Tenant-Ready Core

**What we build**

- One trusted server resolver for league routes, aliases, login joins, APIs, imports, and jobs.
- Explicit tenant identity with status, timezone, branding, configuration, domains, aliases, and feature controls.
- No fallback to FGC, a first database row, a product-coded league ID, or a browser-seeded tenant.
- Mandatory direct `league_id` scope on every league-owned table, including legacy validation and one-row-per-league tables.
- Tenant-ID namespaces for new KV/R2 Companion data while retained D1 object references keep existing stored captures readable.
- Tenant audit context with league, actor, request, action, resource, outcome, and details.
- Two-tenant regressions proving identical team IDs and membership assignments remain isolated.
- FGC remains the sole enabled production tenant; future league records default disabled.

**Explicit exclusions**

- No second production league, FGC reset/import, active-snapshot switch, team reassignment, shared-settings UI rewrite, trade rewrite, or session-refresh redesign.
- Building and testing migration 21 does not authorize applying it to staging or production.

**Release gate**

- Clean install and production-shaped upgrade reach version 21 with zero foreign-key violations.
- Existing rules, settings, active snapshot pointer, and validation-player rows survive the migration.
- Unknown tenants/features fail closed and disabled tenants cannot resolve publicly.
- Runtime scans find no hard-coded FGC/default tenant and no independent league resolver.
- One consolidated strict gate passes before review.

## 7.3.0 — Madden 27 Payload Discovery and Source Lock

- Privately capture one current Companion export without activation.
- Inventory every route, dataset, field, identifier, relationship, and season/week marker.
- Locate and count Free Agents explicitly, then create sanitized regression fixtures.
- Gate: source league/version/season/week are verified; teams, players, rosters, and Free Agents are located or precisely reported absent; no user-facing data changes.

## 7.3.1 — Canonical Madden Mapping

- Map teams, players, roster membership, and Free Agents into one canonical candidate snapshot.
- Preserve source IDs/provenance and generate stable internal identities.
- Validate counts, duplicates, missing teams, invalid fields, and unassigned records without inventing data.
- Gate: the candidate reconciles to source, each player is on one roster or in Free Agents, and a mapping failure cannot change the active snapshot.

## 7.3.2 — Safe FGC Reset, Import, and Activation

- Add an exact reset preview, protected identity/membership preservation, recovery bookmark, typed confirmation, tenant audit, and atomic active-snapshot switch.
- Rehearse backup → reset → import → validate → activate → rollback in staging.
- Preserve Justin and Gas identities for later imported-team assignment; disabled users remain disabled.
- Gate: failures leave the last good snapshot visible, and the owner separately approves the exact production reset/import/activation.

## 7.3.3 — Team, Roster, Player, and Free Agent Experience

- Serve team pages, roster groups, player profiles, and Free Agent browsing from one active Madden 27 snapshot.
- Show source-supported ratings, contracts, abilities, positions, and freshness; use honest unavailable/stale states.
- Build phone-first layouts without player-card overflow or nested-scroll traps.
- Gate: phone and desktop counts/identities reconcile to the active FGC snapshot with no old-owner, logo, color, player, or demo fallback.

## 7.3.4 — Stable Team and Player URLs

- Add league-scoped `/teams/{teamSlug}` and `/players/{publicPlayerId}` routes.
- Link players from rosters, Free Agents, statistics, transactions, Trade Block, and proposals; link teams throughout the platform.
- Preserve valid links through trades/releases/renames and expose only safe social metadata.
- Gate: two users opening one URL see the same active identity; raw database row IDs are not the public contract.

## 7.3.5 — Ownership Reconciliation and My Team

- Match imported teams to FranchiseHQ memberships without trusting owner names in Madden data.
- Add Commissioner assignment/reassignment with duplicate-team and lockout protections.
- Drive My Team, ownership badges, and team-dependent features from the same authority.
- Gate: Justin resolves to Buccaneers and Gas to Packers after reviewed assignment; no active duplicate owner or cross-tenant inference is possible.

## 7.3.6 — Incremental Madden Updates

- Intake later Companion exports without a destructive full reset.
- Compare snapshots, report freshness/warnings, and activate teams, rosters, transactions, schedule, standings, and statistics atomically as supported.
- Gate: duplicate exports are idempotent, successful updates are coherent, and failure/rollback retains the previous complete experience.

## 7.3.7 — Additional Madden Source Adapters

- Investigate policy-compliant direct-EA connectivity using documented/authorized access only.
- Add CSV/Excel intake where commissioner exports are available.
- Make every adapter feed the same validator and snapshot activation contract.
- Gate: no undocumented credential exchange, prohibited scraping, or unstable private endpoint becomes a production dependency.

## 7.4.0 — Full Trade Center and Advanced Trade Block

- Server-backed listings, multi-asset offers, counters, decisions, review, status history, concurrency, notifications, and canonical links.
- Gate: two accounts see one lifecycle; unauthorized, stale, duplicate, replayed, and cross-tenant actions fail safely.

## 7.4.1 — Transactions and League History

- Canonical trades, signings, releases, movements, evidence, corrections, season history, and permanent links.
- Gate: repeated evidence is idempotent and each transaction reconciles to before/after roster states.

## 7.4.2 — Commissioner HQ and Rules

- Move settings to `league_settings` with revisions, validation, and optimistic concurrency.
- Consolidate member/team/role administration, feature controls, audit history, and Rules drafts/publication.
- Gate: Commissioner A's saved revision becomes authoritative for Commissioner B and conflicts cannot silently overwrite newer work.

## 7.4.3 — GOTW and Confidence Pool

- Build schedule-backed GOTW selection and Confidence Pool weeks, picks, locks, scoring, standings, corrections, and audit.
- Gate: incomplete/ambiguous schedules cannot open or score, and phone/desktop permission and timing tests pass.

## 7.4.4 — Mobile UX, Accessibility, Performance, and Legacy Removal

- Audit all routes at phone, tablet, and desktop widths; complete keyboard, focus, screen-reader, contrast, reduced-motion, and performance work.
- Remove nested-scroll traps, oversized cards, dead renderers, duplicate modules, stale local authorities, seeded identities, and unused styles behind regressions.
- Gate: critical journeys have no horizontal page scroll and pass automated plus manual accessibility/phone acceptance.

## 7.4.5 — Canonical League Consistency

- Use one server season/week/snapshot and shared team/player/game selectors across all features.
- Standardize loading, empty, unavailable, stale, and incomplete-import states.
- Gate: no feature silently falls back to demo/local data and all core pages report the same identities/context.

## 7.4.6 — Monitoring, Backups, Security, and Recovery

- Add tenant-safe logs, request/action IDs, useful alerts, retained backups, restore drills, rate limits, dependency/secret procedures, and incident communications.
- Gate: a simulated failure is detected, contained, restored, reconciled, and documented without exposing private data.

## 7.5.0 — Authentication and Session Framework

**Cost-control rule:** Capture the cookie/origin/callback/route evidence once, approve one design, implement once, run one consolidated automated gate, and perform one device acceptance cycle. No speculative patch loop.

- Establish one public-domain session model plus a controlled owner recovery path.
- Centralize Discord OAuth, issue/rotation/expiry/revocation, logout, CSRF, and capability checks.
- Preserve safe direct routes through refresh and authentication return; invalidate access after role/revoke changes.
- Gate: refresh, login, logout, expiry, replay, revoke, CSRF, cross-league, mobile Discord, mobile browser, and desktop tests pass.

## 7.6.0-rc.1 — Private FGC Release Candidate

- Freeze scope except release blockers and test a representative private cohort of commissioners, committee members, and owners.
- Validate onboarding, ownership, Madden data, URLs, trades, transactions, rules, GOTW, confidence, mobile, recovery, and sessions.
- Rehearse deployment/rollback from exact artifacts; publish privacy, terms, support, retention, incident, and help material.
- Gate: no unresolved critical/high blocker, recovery reconciles, monitoring/support are active, and the owner accepts one exact candidate.

## 7.7.0 — FGC Production Launch

- Deploy the accepted RC commit, execute only pre-authorized migrations/imports, invite FGC in waves, and observe key signals.
- Gate: owner acceptance passes on production and the observation window, release record, roadmap, support notes, and recovery evidence are complete.

## 8.0.0 — Multi-League Activation

- Enable controlled creation of additional leagues with isolated branding, domains, features, roles, imports, storage, jobs, rate limits, logs, backup/export, suspension, and deletion.
- Gate: two real leagues operate concurrently and every recovery/lifecycle exercise affects only its selected tenant while FGC stays unchanged.

## 8.1.0 — Multi-League Administration and Operations

- Support different roles/teams per account, safe league switching, platform-owner separation, lifecycle administration, quotas/billing readiness, support/audit tools, and custom-domain automation.
- Gate: role/team/domain/lifecycle changes cannot cross tenants and platform operations are separately authorized and audited.

## Delivery method for every version

1. Confirm scope, exclusions, and authorization boundary.
2. Start from the exact accepted production commit and create one version branch.
3. Implement related work together; do not publish partial patch chains.
4. Add regressions for each defect and contract tests for each new authority.
5. Run one consolidated strict gate and update this roadmap with discoveries.
6. Review the candidate, then request separate staging and production authorizations when applicable.
7. Publish one exact commit, validate that exact build, observe it, and record owner acceptance.

## Change log

- **Revision 1.18:** Recorded 7.0.5 domain-specific authentication and Commissioner management work and its partial owner acceptance.
- **Revision 1.19:** Accepted refresh/login temporarily; elevated shared settings; adopted the 7.1–8.1 sequence; deferred authentication until after core platform work; retained Free Agents, multi-source import, and mobile requirements.
- **Revision 1.20:** Recorded authorization for one consolidated 7.1 commit, push, pull request, and hosted-check cycle.
- **Revision 1.21:** Completed staging recovery rehearsal and production migrations 18–20 with protected data reconciled; advanced to the 7.2 decision gate.
- **Revision 1.22:** Recorded the authorized 7.2 tenant-ready implementation; centralized tenant resolution, scoping, feature/domain configuration, storage namespaces, and audit context; moved verified Madden 27 discovery/import/activation directly after 7.2; retained session redesign at 7.5.0 before the private RC.
- **Revision 1.23:** Recorded the owner's consolidated authorization for one 7.2 commit, branch push, pull request, hosted checks, staging migration 21, and deployment of the exact candidate to the registered isolated staging environment. Production remains outside this authorization.
