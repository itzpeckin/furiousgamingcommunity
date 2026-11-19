# Recovery plan

Restore the last verified Git-integrated 8.2.38 application deployment using source 8f9bff5b71a342ae3d628e3eb68640f48d6ee3ce and APP_VERSION=8.2.38 if the application change fails acceptance. Resolve the deployment from that immutable source before rollback; no unverified deployment ID is assumed. No schema rollback is needed: migration 56 remains current.

Preserve the successful 2028 archive and its 2,579 player summaries, 36 GM summaries and 32 carried team assignments, plus the now-active 2029 season with source season ID 4 and live snapshot 2eaed956-20be-45cb-90ae-4c20e54a304b. The unchanged 2028 closure digest is 8ba04c2e499db1cd0f7256a4a54bf910d237c12deb5559e79488b5a95b6bbb8a. Do not replay Archive Season, reopen the closed season, rewrite EA source markers or restore the whole database as an application rollback.

The authorized 2029 yearly update has completed and activated after a fresh capture verified the exact new season for the linked franchise. For any later mismatch, the following recovery guidance applies. If EA still returns 2028 offseason, stop that attempt without activating a candidate. The commissioner should advance the franchise into the 2029 preseason in Madden and run Import Season Schedule; if Madden already shows 2029, retry that import once. If EA still returns 2028, contact support with the error details. Do not reconnect EA as a season workaround.

Stop publication on failed strict checks, hosted preview isolation failures or production health regressions. Record any live update outcome separately from application deployment. Retain typed mismatch diagnostics and the original archive evidence for follow-up investigation.

8.2.39 production deployment 3af24ab9-9072-4ea6-b683-e5cb64aad60e, Main 935e833915fcb137143414f92adf2f4e5b63c411, passed health checks. Post-deployment verification retained the active 2029 snapshot and unchanged 2028 archive digest. Fresh commissioner browser acceptance passed with the 2029 Week 1 snapshot live, the complete 272-game schedule and no season-mismatch warning. Owner acceptance remains pending; preserve those verified data states if application rollback becomes necessary.
