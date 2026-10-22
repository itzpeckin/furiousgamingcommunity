# Storage retention recovery

Stop scheduled retention first. Restore the Pages application to 8.2.19 only if needed; its retired cleanup route must not be invoked. Leave the additive schema and private recovery objects intact.

The live site reads published snapshots, which retention never deletes. For forensic working-copy recovery, list only import-working-archives/v1/<league>/<kind>/<mapping>/ in the private bucket and use restorePreviewChunk with that exact scope. It verifies the content hash and row scope and never overwrites existing rows. Verify restored rows against all recovery chunks before explicitly re-enabling any mapping. Do not broadly restore D1 Time Travel: that could recreate deleted OTL data.

No raw source or credentials are logged. Keep backups private and retain them until a separate retention decision is approved.
