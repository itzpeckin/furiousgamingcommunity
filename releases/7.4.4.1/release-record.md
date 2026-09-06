# FranchiseHQ 7.4.4.1 Release Record

**Status:** Locally validated review candidate; publication and Production are not yet authorized

**Production changed:** No. Production remains FranchiseHQ 7.4.4 on migration 33. No membership or assignment mutation, import, snapshot activation, URL rotation, archive, transition, reset, deletion, or other data operation ran.

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

The Commissioner HQ contract verifies the five-column desktop directory, the complete responsive card hierarchy, restored phone details, visible Manage action, and phone-safe assignment dialog. The consolidated strict repository gate is recorded in `validation-evidence.json`.

## Deployment status

Local implementation only on `codex/franchisehq-7.4.4.1`. GitHub publication, hosted checks, Main, Cloudflare Pages, the import Worker, D1, Production, memberships, and assignments remain unchanged.

## Rollback

The immutable rollback baseline is exact Main evidence commit `00b4831192bdb6b5f3dff86212ae55f22853dc1f`, tree `1b3c85d3f36b7d1f8826c295353f072d0002c27c`, representing the recorded FranchiseHQ 7.4.4 Production state. This candidate adds no database migration.

## Next gate

After owner review, separately authorize exact-candidate publication, PR and hosted checks, merge to Main, code-only Production deployment, and read-only desktop/phone acceptance. No migration or league-data operation is required.
