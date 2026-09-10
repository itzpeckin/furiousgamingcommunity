# FranchiseHQ 7.5.4 Release Record

## Scope

Enable the already authorized Week 10 remediation to recompose the retained 43-route source exactly once. Align latest-export status, candidate preview, and candidate start on the same mapper revision so an older completed run cannot suppress the corrected import.

No new Madden export is required. Preserve ordinary route authority, empty Week 0 placeholder handling, blocked/null Free Agents, the permanent export URL, all prior snapshots, and all audits.

## Added during delivery

- Centralized the candidate mapping revision in the shared import contract.
- Both preview and start now derive the exact same revisioned source fingerprint.
- New candidate runs durably record their mapping revision in source counts.
- Latest-export status treats only a completed candidate from the current mapping revision as live.
- Regression coverage proves an older completed run does not block one current-revision run, while repeat starts remain idempotent.

## Known inherited blockers

None.

## Validation evidence

Focused candidate and permanent-export tests prove the current revision becomes importable once and returns to exact-source reuse afterward. The complete strict repository gate passed with 209 tests, 255 syntax-checked modules, 599 tracked files, and 76 routes. Hosted checks and post-deployment Production verification remain required.

## Deployment status

Owner-authorized Production hotfix. Publication, hosted validation, deployment, retained-source recomposition, and atomic activation remain pending.

## Rollback

Code rollback baseline is Main commit `4d7400d2098c2e9fca84dae59659df22ef0f8dd6`. The active snapshot `a07614fc-a996-467f-86c2-d87926072882`, every malformed and prior snapshot, and lifecycle audits must remain retained. Rollback must never delete or rewrite snapshots, rotate the export URL, archive/transition the season, or reinterpret blocked Free Agents.
