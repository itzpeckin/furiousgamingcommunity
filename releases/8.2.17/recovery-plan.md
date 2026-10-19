# Recovery

Baseline: v8.2.16 at a2677ac717b5871ee7afcb4fe03701370bfbca26. No migration is required.

Publish the compatible private Import Worker before Pages so cooldown responses are honored. Preserve all three existing Workflow bindings, private URLs and runtime limits. Wait for active import/EA/scheduling workflows to settle before replacing the Worker. Verify exact deployed source, binding names and Pages version.

If rollback is necessary, restore the previous Pages deployment and Import Worker version 1c9ace6f-e891-4912-b94f-45e5e0e7bc2e. Do not delete scheduling rows or threads. Previous code has the known throttle failure and can require Retry Schedule Sync; completed thread and member records permit resumption. Keep archived conversation history.

Trade-block reconciliation only changes active to zero for mismatched player listings. It never moves assets or transfers listings. Retain retired listing rows; a verified current owner can explicitly relist. Do not bulk reactivate stale listings during rollback.
