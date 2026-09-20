# FranchiseHQ 8.0.1.1

## Scope

Immediately repair the single-word league-name startup failure found during authenticated Production acceptance of 8.0.1. Preserve the complete 8.0.1 tenant-isolation and empty-tenant membership repair.

## Added during delivery

- The league initials formatter now joins only the array branch used by multi-word names and handles a one-word name such as `P2W` as a normal string.
- The browser asset version is advanced so clients cannot retain the faulty 8.0.1 startup script from cache.
- A source regression locks the one-word branch while preserving multi-word initials such as FGC.

## Known inherited blockers

None are registered in the quality baseline. P2W still has no active Madden snapshot or imported teams; that is expected and does not block Commissioner activation without a team. Blocked or missing Free Agents remain unknown.

## Validation evidence

Authenticated read-only acceptance caught the exact JavaScript error in the deployed 8.0.1 script before any membership or league-data action. The corrected candidate passes all 303 tests in the complete strict repository gate and will receive the same signed-in P2W acceptance after deployment.

## Deployment status

8.0.1.1 is authorized as an immediate code-only Production hotfix. No migration or data operation is required.

## Rollback

Redeploy Main `c32c966bb751601a6a6b77693b678945771c1a6e` only if necessary, recognizing that its 8.0.1 runtime contains the single-word startup defect. Do not restore or modify D1; retain every tenant, membership, snapshot, import, export, audit, identity, and season record.
