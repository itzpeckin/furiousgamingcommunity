# Recovery plan

Rollback Pages to the last verified 8.2.14 deployment and restore import Worker version 8c0a6380-fc66-44ef-8e57-4719de78e89d if a runtime regression occurs. Preserve migration 54 and all existing snapshots, catalogs, roster identities and archived seasons. Do not erase captures or reconnect EA as a rollback action.

Before publication, check that no affected import, EA collection or schedule workflows are active. Verify all three Workflow bindings and disabled public Worker URLs after deployment.

A failed schedule handoff leaves the completed export available through Refresh and Import Latest Export. Its pinned source rejects conflicting newer exports. Retry Schedule Sync resumes missing member additions and archival. Archived threads retain conversations; never delete them during recovery. Do not restore an older active snapshot without a separate verified recovery plan.
