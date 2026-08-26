# FranchiseHQ Environment Separation

## Contract

FranchiseHQ has three named environments:

| Environment | Purpose | Remote production data allowed |
|---|---|---|
| Local | Developer emulation and automated checks | No |
| Staging | Cloudflare preview validation with representative/sanitized data | No |
| Production | Accepted FGC live service | Yes |

The machine-readable contract is `config/environment-contract.json`. Staging and production must use different D1 databases, R2 buckets, KV namespaces, import Workers/Workflows, OAuth applications/redirects, and secret values.

`DB` and `FRANCHISE_HQ_DB` are temporary aliases for the same logical D1 database within one environment because the 6.3.x code uses both names. They must never point across environments.

## Cloudflare configuration authority

No active root Wrangler configuration is introduced in 7.0.0 because the current Cloudflare Pages dashboard configuration has not yet been exported and reconciled. Cloudflare documents that an adopted Pages Wrangler file becomes the configuration source of truth and recommends downloading the current project configuration before opting in.

Before repository-controlled Wrangler configuration is enabled:

1. Export/download the current Pages project configuration.
2. Compare every discovered binding with the generated system inventory.
3. Provision distinct staging resources.
4. Replace resource identifiers with the staging resources in preview configuration.
5. Verify production identifiers remain unchanged.
6. Store secrets only through Cloudflare secret settings.
7. Review and merge the configuration as its own controlled change.

References:

- <https://developers.cloudflare.com/pages/functions/wrangler-configuration/>
- <https://developers.cloudflare.com/pages/functions/bindings/>
- <https://developers.cloudflare.com/pages/configuration/preview-deployments/>

## Required Pages bindings

- `DB` / `FRANCHISE_HQ_DB`: D1 database aliases.
- `COMPANION_EXPORTS`: private R2 source artifact storage.
- `COMPANION_EXPORT_META`: KV import pointer/metadata storage.
- `LEAGUE_CONFIG`: KV per-league configuration/token indirection.
- `FRANCHISE_IMPORT_WORKER`: optional service binding until the workflow is enabled.
- `ASSETS`: Cloudflare Pages static asset binding.

## Required Pages secrets

- `DISCORD_CLIENT_SECRET`
- `SESSION_SIGNING_SECRET`
- `COMPANION_EXPORT_TOKEN`

EA direct-access secrets are intentionally excluded until the 7.0.1 security containment release defines and protects those routes.
`EA_DIRECT_DISCOVERY_URL` is also forbidden until that release. The legacy `D1` fallback is inventoried but is not provisioned; `DB` and `FRANCHISE_HQ_DB` are the classified D1 bindings for the transition baseline.

## Required non-secret variables

- `APP_ENV`
- `APP_VERSION`
- `DISCORD_CLIENT_ID`
- `DISCORD_REDIRECT_URI`
- `PLATFORM_OWNER_ACCOUNT_ID` (legacy transition variable; removed by tenant-ready authorization work)

## Verification gate

Staging cannot be marked ready until a binding report proves no resource identifier or OAuth redirect is shared with production. Production remains untouched during 7.0.0.
