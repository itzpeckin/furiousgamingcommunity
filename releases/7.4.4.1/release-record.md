# FranchiseHQ 7.4.4.1 Release Record

**Status:** Production deployed; read-only verified; pending owner desktop/mobile acceptance

**Production changed:** Yes, code only. Exact candidate `668b13e0a4fcaef82f8a3300beef768993d145fa` was published through PR #44, merged to Main as `6cc5f29d263b4113e5e87ebe81665d81753440d4`, and deployed by Cloudflare Pages deployment `548c8453-775c-4b0c-8aac-b03acc543004`. Migration 33 remains current. No membership or assignment mutation, import, snapshot activation, URL rotation, archive, transition, reset, deletion, or other data operation ran.

## Scope

This code-only acceptance remediation restores a readable five-column Teams & Owners directory on wide screens and makes every owner, role, presence, and assignment control usable from a phone.

## Added during delivery

- Desktop Team & Owner rows now use exactly five aligned columns: Franchise, Owner, Role, Status, and a right-aligned Manage action.
- Owner names and Discord handles are bounded within their own column, while longer roles wrap inside a dedicated role cell instead of colliding with Status.
- Tablet and phone rows become complete management cards rather than hiding Owner, Role, and Status.
- Every phone card keeps a 44-pixel Manage target alongside the franchise identity and exposes labeled Owner, Role, and Status details below it.
- The assignment dialog becomes a bounded phone bottom sheet with full-width Save Assignment, Remove from Team, and Revoke Access controls.
- Manage actions have a team-specific accessible name while retaining the existing commissioner-only, server-authoritative membership workflow.

## Known inherited blockers

Madden's explicit Free Agent route remains blocked upstream. Its count stays unknown/null and is not interpreted as zero.

## Validation evidence

The Commissioner HQ contract verifies the five-column desktop directory, the complete responsive card hierarchy, restored phone details, visible Manage action, and phone-safe assignment dialog. Exact candidate `668b13e` passed 4/4 PR checks. Main quality and deployment checks passed. Signed-in, read-only Production acceptance confirmed release 7.4.4.1, the live Teams & Owners workspace, all five directory fields in order, team-specific Manage actions, and the complete Save Assignment / Remove from Team / Revoke Access dialog without saving a mutation. The live `trade-module.js` and `styles.css` SHA-256 hashes match Main exactly. Season 2026 / Regular Season Week 13 and blocked/null Free Agent semantics remain intact. The complete evidence is recorded in `validation-evidence.json`.

## Deployment status

Published from `codex/franchisehq-7.4.4.1` through [PR #44](https://github.com/itzpeckin/furiousgamingcommunity/pull/44), merged to Main as `6cc5f29d263b4113e5e87ebe81665d81753440d4`, and deployed to Production through Cloudflare Pages deployment `548c8453-775c-4b0c-8aac-b03acc543004`. The import Worker source did not change and its Production build/version remain `b87f1bb1-71cc-4695-af0c-c3fe1415223f` / `326ee7ef-55b2-4041-8eb2-db4ee9358bd0`; exact-candidate upload build `b43db836-d8d7-4f99-a7e4-2a36002c9111` passed without receiving Production traffic. D1 remains on migration 33 and no database operation was required or run.

## Rollback

The immutable rollback baseline is exact Main evidence commit `00b4831192bdb6b5f3dff86212ae55f22853dc1f`, tree `1b3c85d3f36b7d1f8826c295353f072d0002c27c`, representing the recorded FranchiseHQ 7.4.4 Production state. This candidate adds no database migration.

## Next gate

Owner desktop/mobile acceptance of the live Teams & Owners layout is next. After acceptance, continue with the remaining 7.4.5 consistency work without changing league data unless separately authorized.
