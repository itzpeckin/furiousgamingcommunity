# FranchiseHQ Production Roadmap

**Document owner:** FranchiseHQ

**First customer league:** Furious Gaming Community (FGC)

**Updated:** August 27, 2026

**Revision:** 1.21

**Current production:** 7.1.0 database foundation and application release delivered through PR #8

**Current work:** 7.2.0 tenant-ready core scope and implementation planning

**Next decision gate:** Review and authorize the exact 7.2.0 scope. Do not begin tenant rewiring until the 7.1 observation checks remain clean.

## Product decisions that govern every release

- The application is **FranchiseHQ**. FGC is configuration and the first league, never the application identity or a product-wide hard-code.
- FGC launches as the only enabled production tenant, but league-owned data is structured for enforced multi-tenant isolation from 7.2 onward.
- Every feature must work at phone and desktop widths. A dedicated mobile/accessibility release completes the system-wide polish, but mobile is an acceptance requirement in every release.
- Server data is authoritative for shared league features. Browser-local storage may hold temporary UI preferences, never Commissioner settings, ownership, rules, trades, confidence picks, GOTW, or other league records.
- Madden imports are versioned source adapters feeding one canonical snapshot. Companion App, an approved direct-EA route, and CSV/Excel must not create separate downstream products.
- Free Agents are a required first-class import dataset. Every supported source must either reconcile them or explicitly prove that the source did not provide them.
- Production deployment, database migration, membership changes, and league-data reset are separate authorization decisions.
- A completed release updates this document with requested additions, unexpected work, defects, deferrals, validation evidence, and the next exact gate.
- The current refresh/login inconvenience is accepted temporarily. Authentication implementation is frozen until 7.5.1 unless evidence shows a real authorization or data-exposure vulnerability.

## Current facts and accepted limitations

- 7.0.5 is live and supports Discord onboarding, Commissioner access, canonical Madden-team ownership, and the owner-only Pages fallback.
- A refresh on Commissioner HQ or Trade Center can return a user to Account or require another login, especially on mobile. This is a known UX defect, not considered a 7.1 blocker by the owner.
- Commissioner settings can currently remain browser-local: one commissioner's update may not appear for another commissioner. This is a data-authority defect. 7.1 adds its canonical shared database contract; 7.3.3 moves the feature to that contract.
- The Madden NFL 27 Companion App is not yet reliable enough to make its export the critical path. Database, tenant, URL, trade, transaction, Commissioner, rules, and mobile work proceed without waiting for it.
- No FGC Madden-data reset has occurred. Reset and activation remain explicit, audited, recoverable operations in the import program.

## Release tracker

| Version | Status | Outcome |
| --- | --- | --- |
| 7.0.0–7.0.5 | Production history | Controlled engineering baseline, security containment, onboarding, ownership, and Commissioner management foundations |
| 7.1.0 | Production | Canonical database, target-locked migration, preservation, and recovery foundation |
| 7.2.0 | Planned | Tenant-ready core with FGC as the only enabled league |
| 7.3.0 | Planned | Stable player and team page URLs |
| 7.3.1 | Planned | Full Trade Center and advanced Trade Block |
| 7.3.2 | Planned | Transactions and league history |
| 7.3.3 | Planned | Commissioner HQ, shared settings, Confidence Pool, GOTW, and Rules |
| 7.3.4 | Planned | Mobile UX, accessibility, performance, and legacy-code removal |
| 7.3.5 | Planned | Canonical league experience and cross-feature data consistency |
| 7.3.6 | Planned | Monitoring, backups, security, and recovery |
| 7.4.0 | Movable when source evidence is ready | Multi-source Madden import, Free Agents, validation, reset, and activation |
| 7.5.0 | Planned after a verified Madden NFL 27 source | Madden NFL 27 league experience |
| 7.5.1 | Deferred but required before release candidate | Authentication and session framework |
| 7.6.0-rc.1 | Planned | Private FGC release candidate |
| 7.7.0 | Planned | FGC production launch |
| 8.0.0 | Planned | Multi-league activation |
| 8.1.0 | Planned | Multi-league identity, administration, and operations |

## 7.1.0 — Database Foundation

**What we build**

- Preserve every historical migration file but remove it from the replayable sequence.
- Establish one immutable active sequence that can initialize an empty database and upgrade the current production-shaped database.
- Define a machine-readable schema contract and a continuous migration ledger.
- Create the shared league-settings and revision foundation required to eliminate per-browser Commissioner settings.
- Move every table/index creation out of normal API requests and into migrations.
- Make protected database operations fail safely when the expected database version is absent.
- Validate fresh install, legacy upgrade, identity preservation, relationships, foreign keys, backup, restore, and request-time mutation removal.
- Document staging, production, stop conditions, Time Travel recovery, and the no-improvised-drop rollback rule.

**Why now**

Every shared feature and every future league depends on a database that can be reproduced, upgraded, and recovered without guesswork.

**Explicitly excluded**

- No live migration or deployment without a later authorization.
- No authentication/session work, membership edit, Madden data reset, importer activation, or Discord configuration change.
- 7.1 creates the shared-settings contract but does not yet rewire the Commissioner UI.

**Release gate**

- One strict local gate passes with no registered migration exceptions.
- A clean database reaches version 20 with all required tables and columns.
- A production-like database upgrades without changing tested identities or relationships.
- Backup/restore and foreign-key checks pass.
- Read-only production inventory is recorded.
- Isolated staging migration and recovery rehearsal pass before production approval is requested.

**Completion evidence — August 27, 2026**

- Local migration, legacy-upgrade, backup/restore, schema-mutation, target-confirmation, and preservation tests passed.
- Isolated staging reached version 20 with 50 application tables and zero foreign-key violations; a marker-write and Time Travel restore rehearsal preserved the complete schema and removed the marker.
- Production was bookmarked, migrated in order from legacy max version 17 to a continuous 1–20 ledger, and bookmarked again.
- Production retained exactly 1 league, 8 users, 8 memberships, 7 active team assignments, 97 sessions, and the complete pre-change ownership distribution.
- Production increased only from 47 to the expected 50 application tables and retained zero foreign-key violations.
- The release adds a committed, target-locked D1 plan/apply command so later schema releases do not depend on manual dashboard batches.
- PR #8 is the single source and deployment record for the application release; no Madden reset, membership edit, Discord change, or authentication rewrite was included.

## 7.2.0 — Tenant-Ready Core

**What we build**

- One trusted league-resolution service for paths, APIs, jobs, and imports.
- Mandatory `league_id` scope for every league-owned read and write.
- Central query helpers that cannot silently fall back to FGC or the first database row.
- FGC as the first league record with branding, slug/domain, timezone, configuration, and enabled features.
- Server-enforced feature configuration with safe defaults.
- Audit context containing league, actor, request, and action IDs.
- Cross-league isolation tests using an internal test tenant that never becomes user-facing.
- Removal of fixed FGC strings, fixed owner/team IDs, and default-league authorization assumptions.

**Why**

Building a secure single-tenant launch on tenant-scoped foundations avoids a costly and risky retrofit when league two arrives.

**Release gate**

- Automated tests prove identical IDs in two leagues cannot read, update, delete, enumerate, or infer one another's data.
- Background jobs, exports, audit records, and cache keys carry league scope.
- Only FGC is enabled in production.

## 7.3.0 — Player and Team Page URLs

**What we build**

- Stable, league-scoped public identities for teams and players.
- Shareable routes such as `/leagues/{leagueSlug}/teams/{teamSlug}` and `/leagues/{leagueSlug}/players/{publicPlayerId}`.
- Player links from rosters, Free Agents, search, statistics, transactions, Trade Block, and trade proposals.
- Team links from standings, schedule, transactions, and Commissioner screens.
- Direct-link refresh and authentication-return behavior covered by tests, while the wider session redesign remains deferred.
- Open Graph/social metadata with safe public fields and no private account details.
- Mobile player and team layouts that do not overflow or create nested-scroll traps.

**Release gate**

- Two users opening the same URL see the same active player/team.
- Imports preserve valid links and safely resolve traded, released, renamed, or missing records.
- Raw internal row IDs are not the public URL contract.

## 7.3.1 — Full Trade Center and Advanced Trade Block

**What we build**

- Server-backed Trade Block listings with current roster/team eligibility checks.
- Multi-asset proposals, counters, decline/withdraw flows, status history, notes, and notifications.
- Commissioner and Trade Committee review using explicit server capabilities.
- Concurrency/version checks so two users cannot overwrite the same proposal.
- Automatic stale-listing handling after roster changes or snapshot activation.
- Canonical player/team links throughout sharing and negotiation.
- Responsive phone workflows for listing, composing, reviewing, and deciding a trade.

**Release gate**

- Two accounts can complete the full permitted lifecycle and see the same state.
- Unauthorized, cross-team, cross-league, stale, duplicate, and replayed actions fail safely.
- Browser-local legacy trade data cannot override the server record.

## 7.3.2 — Transactions and League History

**What we build**

- Canonical transaction feed for trades, signings, releases, roster movements, and supported Commissioner adjustments.
- Evidence links back to source snapshots and movement classification.
- Team, player, season, week, and transaction permalinks.
- League-history views for seasons, champions, standings, records, awards, and major events as reliable data becomes available.
- Correction/amendment records instead of silent history rewrites.
- Import deduplication and idempotency for repeated evidence.

**Release gate**

- Reprocessing the same source does not duplicate history.
- Transactions reconcile to before/after roster states.
- Corrections are attributable and the prior evidence remains available.

## 7.3.3 — Commissioner HQ, Confidence Pool, GOTW, and Rules

**What we build**

- Move Commissioner settings from browser-local state into `league_settings` with revision history and server validation.
- Add optimistic concurrency so one commissioner is warned instead of silently overwriting another's newer settings.
- Make every session read the same authoritative setting after save/refresh.
- Consolidate Commissioner dashboards, pending work, role/team administration, audit history, and feature controls.
- Server-backed Rules with sections, revisions, publish/draft status, and shareable public view.
- Schedule-sourced GOTW with nomination/selection, lock times, results, and audit history.
- Schedule-sourced Confidence Pool weeks, games, picks, confidence uniqueness, deadlines, scoring, and standings.
- Refuse to open/score a week when the active schedule snapshot is incomplete or ambiguous.

**Release gate**

- Commissioner A changes a setting and Commissioner B sees the same revision after a normal refresh.
- Concurrent edits produce a visible conflict, not silent data loss.
- GOTW and Confidence Pool reference canonical games from one active snapshot.
- Lock, scoring, correction, and permission tests pass across phone and desktop.

## 7.3.4 — Mobile UX, Accessibility, Performance, and Legacy Removal

**What we build**

- Audit every route at representative iOS, Android, tablet, and desktop widths.
- Replace oversized player cards, competing scroll regions, touch traps, and layout shifts.
- Keyboard navigation, visible focus, semantic labels, contrast, reduced-motion behavior, and screen-reader landmarks.
- Shared design tokens/components for navigation, cards, tables, forms, dialogs, notices, loading, empty, and error states.
- Route-level performance budgets and reduced initial JavaScript/data loading.
- Inventory and remove dead renderers, duplicate modules, stale local-storage authorities, seeded demo identity, and unused styles.
- Regression coverage before each legacy path is removed.

**Release gate**

- Critical journeys pass WCAG-oriented automated checks plus manual keyboard/screen-reader review.
- No critical phone route requires horizontal page scrolling.
- Core screens meet documented performance budgets on a representative cellular profile.

## 7.3.5 — Canonical League Experience and Data Consistency

**What we build**

- One server-owned active-season/week context consumed by Home, Teams, My Team, Standings, Schedule, Stats, Trades, GOTW, and Confidence Pool.
- Consistent loading, unavailable, stale, incomplete-import, and no-active-season states.
- Shared search across teams, players, Free Agents, transactions, rules, and history.
- Notification center for assignments, trades, deadlines, Commissioner decisions, and import status.
- Data-freshness indicators tied to the active snapshot and last verified source.
- Cross-feature reconciliation checks so ownership, roster, schedule, and statistics cannot present contradictory active state.

**Release gate**

- Every core screen reports the same league, season, week, active snapshot, team ownership, and data-freshness state.
- Search and notifications honor tenant and role boundaries.
- No stale browser cache can supersede server-authoritative league data.

## 7.3.6 — Monitoring, Backups, Security, and Recovery

**What we build**

- Structured logs with correlation IDs and secret/personal-data redaction.
- Health signals for authentication, APIs, imports, snapshots, scheduled jobs, and client failures.
- Alerts with severity, ownership, and a human response runbook.
- D1 recovery bookmarks plus retained encrypted exports appropriate to the recovery window.
- Restore rehearsals that measure recovery-point and recovery-time objectives.
- Rate limits, abuse protection, secure headers, dependency review, secret rotation procedure, and audit retention.
- Incident, degraded-mode, maintenance, and recovery communications.

**Release gate**

- A simulated application failure and database-recovery exercise are detected, contained, restored, and documented.
- Alerts are actionable rather than noisy, and secrets/private data do not appear in logs.
- Backup evidence is usable, not merely present.

## 7.4.0 — Multi-Source Madden Import

This release can move earlier or later relative to 7.3.x when a reliable Madden NFL 27 sample becomes available. It may run in parallel conceptually, but production activation still obeys the database and tenant contracts.

**What we build**

- Versioned canonical import/snapshot schema and source provenance.
- Companion App adapter based on verified Madden NFL 27 payloads.
- CSV/Excel adapter for commissioner-exported datasets.
- Policy-compliant direct-EA investigation; no undocumented credential exchange or prohibited scraping becomes a production dependency.
- Dataset discovery that inventories every section rather than assuming old export names.
- First-class Free Agent discovery, mapping, counts, validation, and activation.
- Private source artifact storage, integrity hashes, import states, warnings, blocking errors, and audit evidence.
- Idempotent build and atomic activation: users see the old complete snapshot or the new complete snapshot, never a partial mix.
- Commissioner-only reset preview with typed confirmation, preserve/reset/remap manifest, backup reference, audit event, and safe failure behavior.
- Sanitized representative regression fixtures for each supported source/version.

**Companion App contingency**

- If the Companion App remains unreliable, 7.4 proceeds with fixture discovery and approved CSV/Excel intake.
- No release gate depends on pretending an unavailable dataset exists.
- Direct-EA work remains research until authorization, policy, identity, rate-limit, and stability requirements are proven.

**Release gate**

- Duplicate, malformed, partial, wrong-league, wrong-season/week, missing-section, and activation-failure tests preserve the last good snapshot.
- Teams, rosters, players, Free Agents, schedule, standings, statistics, and transactions reconcile to the source or report a precise absence.
- Staging backup → reset → import → validate → activate → rollback is proven before FGC production data is touched.

## 7.5.0 — Madden NFL 27 Experience

**What we build**

- Production-quality rosters, depth/position views, player profiles, Free Agent browsing, teams, schedule, standings, statistics, and leaders from the active Madden NFL 27 snapshot.
- Madden-version-aware labels and fields; unavailable source fields are omitted or marked unavailable, never invented.
- Import freshness, warnings, and Commissioner action status surfaced clearly.
- Player comparison, roster needs, and league insights only where canonical data supports them.
- Phone-first navigation and sharing for the high-frequency league workflows.

**Release gate**

- A representative FGC import reconciles across every surfaced dataset.
- The same snapshot identity is visible throughout the platform.
- Commissioner and member acceptance passes on phone and desktop.

## 7.5.1 — Authentication and Session Framework

This release is intentionally after the core platform work and before the private release candidate. It is not being repeatedly patched during 7.1–7.5.

**What we build**

- Reproduce the refresh/domain/mobile handoff issue once with captured request, cookie, origin, callback, and route evidence.
- Establish one documented public-domain session model plus a controlled owner recovery path.
- Centralize Discord OAuth, session issue/rotation/expiry/revocation, logout, CSRF, and capability checks.
- Preserve safe direct routes through refresh and authentication return.
- Invalidate sessions appropriately after membership/role/access changes.
- Add end-to-end browser tests for mobile Discord, mobile browser, desktop, expiry, logout, revocation, replay, and protected routes.

**Cost-control rule**

- No speculative patch cycles. Diagnosis produces one evidence package, one approved implementation, one consolidated automated gate, and one device acceptance cycle.

**Release gate**

- Refresh stays on the requested route without an unnecessary login when the session is valid.
- Sign-in, logout, expiry, role change, revoke, replay, CSRF, and cross-league protections pass.
- Phone and desktop validation use the same published candidate that passed automation.

## 7.6.0-rc.1 — Private FGC Release Candidate

**What we do**

- Freeze scope except release-blocking defects.
- Use a representative private FGC cohort across commissioners, committee members, and owners.
- Execute onboarding, ownership, roster, player link, trade, transaction, rules, GOTW, confidence, import, mobile, recovery, and session checklists.
- Rehearse production deployment and rollback from exact immutable artifacts.
- Publish privacy, terms, support, incident, data-retention, and user-help material.

**Release gate**

- No unresolved critical/high release blocker.
- Data migration/import and rollback reconcile.
- Monitoring and support ownership are active.
- The owner signs off on one documented candidate.

## 7.7.0 — FGC Production Launch

**What we do**

- Deploy the exact accepted release-candidate commit.
- Apply only pre-authorized migrations/import/reset operations with recorded recovery evidence.
- Invite FGC in controlled waves and observe authentication, errors, data freshness, imports, trades, and Commissioner workflows.
- Keep a documented rollback window and publish acceptance results.

**Release gate**

- Owner acceptance completes on the production build.
- Observation-window signals remain within thresholds.
- The release record, roadmap, support notes, known limitations, and recovery evidence are complete.

## 8.0.0 — Multi-League Activation

**What we build**

- Enable creation of additional leagues through controlled administration.
- Per-league branding, slug/custom-domain readiness, features, schedules, rules, roles, imports, retention, and usage controls.
- Tenant-aware background work, cache isolation, storage namespaces, rate limits, observability, export, deletion, and recovery.
- Onboarding and suspension/offboarding workflows that cannot affect another league.
- Capacity and cost controls suitable for multiple active leagues.

**Release gate**

- Two real isolated league configurations operate concurrently under automated boundary tests.
- Backup, restore, export, suspension, and deletion exercises affect only the selected league.
- FGC behavior and data remain unchanged unless explicitly configured.

## 8.1.0 — Multi-League Identity, Administration, and Operations

**What we build**

- One FranchiseHQ account can hold different roles and teams in different leagues.
- Safe league switching with explicit current-league context.
- Platform-owner administration separated from league-commissioner authority.
- League lifecycle, billing-readiness, quotas, support tooling, audit search, and operational dashboards.
- Custom-domain/callback automation that preserves tenant routing and secure session boundaries.

**Release gate**

- Role and team changes in one league do not alter another league.
- Platform operations are separately authorized and audited.
- Custom-domain login, switching, suspension, recovery, and offboarding pass without cross-tenant leakage.

## How each version is delivered

1. Confirm scope, exclusions, and authorization boundary in its release record.
2. Start from the exact accepted production commit and create one version branch.
3. Implement related work together rather than publishing partial file patches.
4. Add regression tests for every defect and a contract test for every new shared authority.
5. Run one consolidated local quality gate and update this roadmap with discoveries.
6. Review the candidate and request separate staging authorization when needed.
7. Require isolated staging, recovery evidence, and hosted checks before production approval.
8. Publish one exact commit, validate that exact build, observe it, and record owner acceptance.

## Change log

- **Revision 1.18:** Recorded 7.0.5 domain-specific authentication and Commissioner management work, plus its production publication and partial owner acceptance.
- **Revision 1.19:** Accepted refresh/login as a temporary limitation; elevated shared Commissioner settings as a core data-authority defect; replaced the former numbering with the owner-approved 7.1–8.1 sequence; deferred authentication to 7.5.1 after core platform features but before the private release candidate; added Madden Companion contingency, multi-source import, Free Agent discovery, per-release mobile requirements, and the 7.1 database candidate/evidence rules.
- **Revision 1.20:** Recorded the owner's authorization for one consolidated 7.1.0 commit, branch push, pull request, and hosted-check cycle. Staging migration, production migration/deployment, authentication, memberships, and Madden data remain outside that authorization.
- **Revision 1.21:** Completed the isolated staging migration/recovery rehearsal; added a dependency-free, target-locked D1 release command; recorded the owner's production authorization; applied and reconciled migrations 18–20 without changing protected data or ownership; and advanced the roadmap to the 7.2.0 decision gate.
