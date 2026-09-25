# FranchiseHQ 8.0.10 — EA Direct

## Scope

FHQ-owned EA sign-in, platform profile and franchise selection, encrypted tenant-bound credentials, private first preview, durable manual weekly collection, and the yearly schedule catalog. Weekly collection captures prior and current periods; only the hub identifies the current week. Existing importer validation and explicit publication remain authoritative.

## Added during delivery

Closed private EA capture leaks in older Companion report/stitch/mapping selectors. Added atomic authorization and cancellation checks at collection publication, collision protection against concurrent Companion exports, resumed collection polling and bounded token refresh. Migration 48 is additive.

## Known inherited blockers

EA can reject exports or change the unofficial protocol. This release cannot repair an EA outage. Live authenticated collection is not certified until a commissioner signs in. New-league bootstrap remains a separate roadmap gate; the first connection requires a prepared matching franchise season.

## Validation evidence

See validation-evidence.json. Local tests exercise complete/partial collections, all 18 schedule weeks, token refresh, tenant isolation, CSRF-compatible browser actions, cancelled jobs, source collisions, and previous/current week coverage. Hosted preview and Production results will be recorded separately. No claim of live EA acceptance is made from mocked protocol tests.

## Deployment status

Implementation and release are authorized. GitHub publication, migration 48, new EA client/encryption deployment secrets, and Cloudflare deployments are pending validation. No automatic collection or live import runs during deployment.

## Rollback

Deploy Main baseline f893f385d01056dd59406276d20a2c66a00903cf (8.0.9). Retain migration 48, captured data, audit history and encrypted credentials; older code does not use the additive tables. Disable the EA collector binding if necessary; Companion continues to operate. Do not restore a whole database over newer league activity or rotate existing export URLs.
