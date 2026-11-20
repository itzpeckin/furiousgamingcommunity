# Discord Week 1 scheduling repair

## Scope

The owner requested diagnosis, repair, publication, and a post-publication import to create the missing FGC scheduling threads. This corrective patch starts from production commit `3746ff8faa4fb7af35fb15805f1fec6ccac221bc` and retains release 8.2.39 and schema 56. It requires no migration or configuration change.

## Production diagnosis

Read-only production inspection found the active 2029 snapshot at proven Regular Season Week 1. Its exact preceding snapshot was Preseason Week 1. The recorded Discord transition was rejected as `skipped-period`, because the gate only recognized the opening from preseason Week 3 or 4. The configured Discord installation and scheduling channel were active, but no 2029 scheduling threads existed.

The importer may legitimately run only once during preseason. Verified same-season progression from any valid preseason week into Regular Season Week 1 must create the opening matchups. Future schedule rows alone remain insufficient to advance the league clock.

## Repair

Allow the verified preseason-to-Week-1 opening. Revalidate historical denied transition records against their exact tenant-scoped previous snapshot and proven current period before permitting recovery. Preserve the recorded evidence. Give corrected opening dispatches their own deterministic workflow key so a completed old no-op cannot suppress them.

When a user reruns an already-completed retained import, reconcile Discord scheduling only for that workflow's exact imported candidate when it is still active and belongs to the selected tenant and source. Reuse validated league data and normal thread deduplication.

The first production rerun exposed a second defect: the preview fingerprint included the full approved export, but import execution independently hashed only the selected weekly schedule/statistics. Eight changed team, standings, and roster payloads were therefore incorrectly treated as the previous completed import. Use the same full-source fingerprint for preview and execution, and advance the mapping revision so completed workflows using the old key cannot suppress the corrected import.

For truly identical exports collected in separate sessions, completed-import delivery recovery requires equal report hashes and an exact nonempty match of retained route paths, payload hashes, and byte lengths. A matching report summary alone is insufficient. Keep the latest-import button available as **Re-run Import** when publication is complete but Discord delivery needs recovery.

## Validation evidence

The first patch passed the strict repository gate and all 743 hosted tests, including migration continuity, syntax, secret scanning, inventory, and release contracts. Independent review found no actionable issue. PR #226 merged as `d30d00e788dd449473a44422fde0c49088214a94`; Pages deployment `8db36a9a-59c5-4143-a0a3-428063cf479c` succeeded. The authorized live rerun returned the earlier candidate and created no threads, revealing the preview/execution fingerprint mismatch described above.

The follow-up passed the complete strict gate: **745/745 tests**, no failures or skips, and all repository, syntax, asset, secret, environment, migration, inventory, and release checks. Independent review confirmed shared fingerprint behavior and guarded cross-session delivery recovery. A production-shaped 2029 fixture with the retained denial and a fresh same-week import created exactly 16 Week 1 threads, no future threads, and no duplicate Discord calls on repeat; the prior manifest remained unchanged. Hosted checks, publication, and final live acceptance are pending.

## Deployment and rollback

Publish through the repository pull request and existing Git-integrated Pages deployment after checks pass. Then run Import Latest Export in the FGC commissioner workspace and verify current-week game/thread coverage and zero delivery errors in production.

If rollback is necessary, restore application deployment `4750b098-d2c9-49a4-b721-38ec6f154fba` at baseline commit `3746ff8faa4fb7af35fb15805f1fec6ccac221bc`. Preserve imported snapshots, retained source exports, archived season history, and created Discord thread records. Do not restore or reset the database for this code patch.
