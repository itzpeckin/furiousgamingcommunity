# EA Direct connection and acceptance guide

Release: 8.0.10 Production; 8.0.11 corrective candidate, September 25, 2026.

EA Direct adds a FranchiseHQ-owned Madden connection alongside the Companion App. The commissioner can connect an EA account, select the matching Madden franchise, collect a private preview, and then collect league updates or the yearly schedule. Both sources use the existing FranchiseHQ validation and retained-source model.

## Current acceptance status

Production 8.0.10 is deployed. Owner sign-in reached EA profile discovery, but finding franchises returned a generic rejection. No EA connection or collection job was created. The 8.0.11 correction separates the initial account-token format from persona-scoped JWS tokens, preserves profile/franchise selections, and adds credential-safe failed-step diagnostics. This protocol difference is a confirmed implementation mismatch, not proof of the original rejection's exact cause. Authenticated Madden 27 franchise access and collection remain pending owner connection and live preview acceptance. Passing mock tests do not establish live compatibility, roster availability, or first-league onboarding.

After 8.0.11, use **Restart EA sign-in** (or **Connect EA Account** if the setup expired) to obtain a fresh initial token; retrying an old profile setup would reuse its old token. Do not send the EA return address, password, or account tokens to support. The displayed step/support details contain only fixed FHQ step names, a numeric EA HTTP status when available, and recognized error categories; raw provider responses are never displayed or logged.

Deployment does not sign into EA, collect league data, run an import, change the current week, or create scheduling threads. Those actions begin only from the commissioner's controls. Automatic scheduled sync is a later milestone.

EA Direct uses community-documented Companion protocols. It is not an official supported public EA integration contract. The owner has explicitly accepted the possibility that EA changes those protocols. That acceptance does not remove the need to report service failures accurately and retain the existing live data when collection cannot complete.

## Commissioner workflow

1. Open the league's Command Center and find **Madden Connection** near the Data Source Selector.
2. Select **EA Direct**, then **Connect EA Account**.
3. Follow **Sign in on EA** and enter the password on EA's website. FranchiseHQ has no EA password field.
4. EA returns to `http://127.0.0.1/success` with a one-time code and setup state. The local page may report that it cannot connect; copy the complete address into the **EA return address** field in FranchiseHQ. The UI clears the pasted field immediately when submitted. Do not put the address in a support message or screenshot.
5. Choose the EA profile and then the Madden franchise belonging to this FHQ league. An existing league's franchise identity must match; connecting another franchise does not repurpose the league.
6. Select **Test Connection & Collect Preview**. Inspect the available teams, periods, schedules, statistics, rosters, and Free Agent evidence. This preview remains private and cannot activate a snapshot.
7. After a successful, server-verified preview, use **Sync from EA** for an ordinary weekly update or **Import Yearly Schedule** for the season schedule.

The **Companion App** choice opens the existing export/import controls. Selecting a connection tab does not change the active snapshot or the Data Source Selector's No Data, Demo Data, or Madden Data preference.

## Collection behavior

| Action | Data collected | Publication behavior |
| --- | --- | --- |
| Test Connection & Collect Preview | League hub, teams, standings, previous/current-period schedules and statistics, attempted team rosters and Free Agents | Retained private evidence only; no import-ready pointer, snapshot activation, current-week change, or Discord work |
| Sync from EA | Explicit previous and current export periods, League Info, standings, attempted rosters and Free Agents | A complete eligible collection becomes available to the standard importer; **Review Import** refreshes and opens those controls, and the commissioner explicitly runs the import |
| Import Yearly Schedule | All 18 regular-season schedule weeks plus source identity evidence | A complete 272-game catalog becomes available to the existing schedule experience; it does not activate a weekly snapshot or advance the current week |

For example, at Regular Season Week 6, a weekly sync requests Week 5 results/statistics and Week 6 schedule/statistics together. The league hub establishes the current export period; the largest schedule week cannot set the live clock. The hub is checked again before completion, and an advance during collection stops publication of the inconsistent batch.

Current and historical periods retain normal route authority. Regular-season statistics remain subject to the existing stage filters; collecting a preseason period does not make it a regular-season statistic. Yearly collection uses the separate schedule catalog rather than a future-week live snapshot.

The connection must match the league's prepared Madden edition and franchise-season identity. This release does not silently create or switch game years or franchise seasons. New-league operating readiness remains its own roadmap gate.

## Missing data and failures

- An upstream EA roster outage can also affect EA Direct. Direct collection is not a guarantee that a disabled EA dataset becomes available.
- A complete, eligible same-season roster baseline may be carried forward by the existing importer when fresh rosters are unavailable. A new league without that baseline still needs a verified first roster source.
- Incomplete team-roster coverage is recorded as incomplete. It is not used to empty rosters, drop missing players, or manufacture a complete player pool.
- The Free Agent request is separate and uses EA's `returnFreeAgents` request field. Returned players may carry `isFreeAgent`. A failed or missing Free Agent response remains blocked or unknown; only a successful, explicitly empty response can prove an empty pool.
- A newer Companion export arriving while EA collection runs must not be overwritten by the older collection. The EA evidence is retained and the commissioner receives a fresh-sync instruction when the import-ready selection cannot be updated safely.
- Expired EA credentials require **Reconnect EA Account**. **Disconnect EA Account** removes usable connection credentials and cancels pending collection authority while preserving imported league data and retained evidence.
- Collection progress is durable. Refreshing the page discovers the existing job and resumes status checks; it does not issue a second sync automatically.

No complete EA transaction-history feed is implemented or claimed. Existing roster comparisons can show observed player movement, but they do not prove the exact trade package, effective timestamp, transaction cause, or movements that occurred between observations. A native transaction feed requires separate source verification.

## Credential and tenant boundaries

Connection and sync controls require a current commissioner membership for the exact league. Browser mutations use FranchiseHQ's existing same-origin and CSRF protections. Changing the active league clears the connection UI, cancels its pending requests, and prevents late responses from showing another league's data.

EA setup is bound to the initiating league, user, and FHQ session, has an expiry, and validates the returned OAuth state. The server accepts only the expected loopback callback shape. Profile and franchise choices must come from the choices EA returned during that setup.

EA account tokens and checkpoint session material are encrypted with AES-GCM. The authenticated encryption scope includes the tenant and record identity, so another tenant cannot reuse the ciphertext. The key is a deployment secret, not a repository or browser setting. Tokens and raw sign-in addresses are not returned in public status responses or routine error messages. Only the reviewed connection, sync, and job-step routes are exposed; the legacy credential probes remain unavailable.

Collection jobs have a limited lifetime, exact league/connection identity, a hashed delegation token, and durable checkpoints. Final publication also checks current job, connection, session, and membership authority. Disconnecting or revoking access prevents an in-flight job from publishing its final ready selection or yearly catalog.

## Deployment and owner acceptance

Deployment requires additive migration 48, the EA collector Workflow binding, existing private export storage, and configured EA client/credential-encryption secrets. The platform returns a setup-required state when configuration is unavailable. Do not include secret values in release records, tickets, test fixtures, browser storage, or logs.

The acceptance sequence is:

1. Verify the release, database additions, service bindings, authenticated access boundaries, and Command Center layout without starting a live import.
2. Have the owner sign into EA and choose the existing matching FGC franchise. Record success or the safe error category; do not capture the one-time return address.
3. Run the private preview and compare the real EA current period, previous/current week coverage, and dataset availability with Madden. Record roster and Free Agent availability explicitly.
4. With the verified connection, perform a commissioner-initiated weekly sync and inspect the retained source and import readiness. Publishing it is a separate explicit commissioner import action.
5. Verify the ordinary import preserves prior-week results/statistics, shows the EA-proven current week, and drives the existing one-week Discord rollover after activation.
6. Exercise yearly schedule collection only when desired by the commissioner. Verify the full regular-season schedule, unchanged live week and snapshot, and absence of new future-week scheduling threads.

Do not report live EA sign-in, direct import, or yearly catalog acceptance as complete until those actual checks pass. A deploy-time code check is not a substitute for owner sign-in. Existing exports, snapshots, audits, season history, and the Companion export URL stay retained.

## Research provenance

The protocol research reference is the [Snallabot Madden documentation](https://github.com/snallabot/snallabot-service/tree/main/docs/madden), including its [EA API guide](https://github.com/snallabot/snallabot-service/blob/main/docs/madden/ea_api.md) and [export guide](https://github.com/snallabot/snallabot-service/blob/main/docs/madden/export_api.md). The reference repository publishes an [MIT license](https://github.com/snallabot/snallabot-service/blob/main/LICENSE).

FranchiseHQ's integration is an independent implementation based on interoperability research; no Snallabot implementation code was copied into this release. No other league-management service account, connector, or commercial partnership is required. The community documentation establishes a research starting point, not proof that EA currently accepts this deployment's login or datasets.
