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

Exact candidate `7fdc697` was published through [PR #140](https://github.com/itzpeckin/furiousgamingcommunity/pull/140) after all four pull-request checks passed. It merged as Main `56dc1e1f3c6b174dd255f4f6db71dea0f043b05e`; Main quality run `35489911632`, Pages workflow run `35489911143`, build, deployment, and status reporting all passed.

Authenticated read-only Production acceptance serves release 8.0.1.1 and confirms P2W in both sidebar name locations, `P2W` initials, a working `/leagues` switch link, both authorized leagues in the selector, zero P2W imported teams, no foreign team choices, and the safe empty-tenant Commissioner/Trade Committee guidance. FGC continues to display as Furious Gaming Community with FGC initials. No activation was submitted and no membership, assignment, import, snapshot, Discord, export URL, season, credential, deletion/reset, or Free Agent data operation ran.

## Rollback

Redeploy Main `c32c966bb751601a6a6b77693b678945771c1a6e` only if necessary, recognizing that its 8.0.1 runtime contains the single-word startup defect. Do not restore or modify D1; retain every tenant, membership, snapshot, import, export, audit, identity, and season record.
