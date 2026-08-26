# FranchiseHQ 7.0.2 Release Record

**Status:** Released to production; owner phone acceptance pending
**Production authorized:** Yes — August 26, 2026  
**Production changed:** Yes — application artifact only; no database, data, credential, binding, or import-Worker change

## Scope

Make FranchiseHQ login persistence and FGC member onboarding safe enough to begin inviting league members while Madden NFL 27 Companion App intake is paused. This release repairs Commissioner HQ, Trade Center, and Trade Block refresh behavior; adds commissioner-controlled Discord membership and team access management; and changes no production data, credentials, bindings, database schema, or import service.

## Added during delivery

- Removed the unconditional legacy browser-local account redirect that forced Discord login after a hard refresh.
- Re-rendered Commissioner HQ, Trade Center, and Trade Block after the real FranchiseHQ session resolves.
- Preserved safe hash routes through explicit Discord login using short-lived browser session state rather than credentials in a URL.
- Added a copyable league invite link and a documented Pending → Active workflow.
- Added complete Pending, Active, and Disabled Discord membership views to Teams & Owners.
- Restored missing membership helper functions that could crash the Teams & Owners tab.
- Corrected disabled-state classification for staff without teams.
- Corrected OAuth re-entry after a commissioner restores a disabled member to Pending.
- Added mobile layouts for invite, Pending, Active, and Disabled controls.
- Reprioritized the roadmap: Madden NFL 27 intake/reset is now 7.0.3, followed by mobile rosters/player links/Trade Block Lite in 7.0.4.

## Security and reliability controls

- Shared league URLs create inactive Pending memberships and grant no active access.
- Commissioners may activate only users who first accepted that league's invite through Discord.
- Membership mutations remain commissioner-only and same-league scoped.
- Roles, user IDs, Discord IDs, team IDs, JSON shape, and request size are validated.
- Team-owner activation requires a team, and a conditional database update prevents a second active user from claiming an occupied team.
- Commissioners cannot demote or deactivate their own commissioner membership, and a league cannot lose its last active commissioner.
- Disabled members must be explicitly restored to Pending before reactivation.
- Membership activation, update, deactivation, and restoration remain audit events.
- No migration was added and no persistent league record is changed by deploying the application artifact.

## Known inherited blockers

- Seven registered migration defects remain assigned to 7.1.0; strict migration validation is expected to fail.
- The successful GitHub Pages run emitted a non-blocking warning that `actions/upload-artifact@v4` still targets Node 20 and is being forced onto Node 24; upgrade or replacement is tracked as release-hygiene maintenance.
- The protected preview environment still lacks isolated D1, R2, KV, and OAuth resources, so authenticated hosted staging cannot be claimed.
- The shared league link can create Pending requests from any Discord user who knows the URL. It cannot grant access; tokenized/expiring invitations remain a future multi-tenant enhancement if operational spam requires them.
- Trade Center, Trade Block, GOTW, and Confidence Pool records remain browser-local controlled-beta workflows.
- Madden NFL 27 export discovery, Companion token-path replacement, Free Agent verification, and controlled league-data reset are paused until a stable representative export is available.
- Player-card mobile layout and general scroll remediation remain in 7.0.4.

## Validation evidence

- JavaScript syntax passed for the changed browser and Functions modules.
- The original 16 focused session/security tests passed unchanged.
- Five new onboarding tests passed for input validation, invite-only activation, duplicate-team blocking, commissioner self-lockout prevention, and refresh/onboarding wiring.
- The complete local baseline quality gate reports zero unregistered failures and preserves the seven expected migration blockers.
- Pull request #4 passed all four hosted checks before merge.
- The `main` production quality gate, Cloudflare Pages deployment, and GitHub Pages deployment passed after merge.
- Direct observation of `https://franchise-hq.pages.dev/` returned the FranchiseHQ landing page labeled Release 7.0.2.
- Manual commissioner/member phone acceptance remains pending and is documented in `docs/AUTH-ONBOARDING.md`.

## Deployment status

- Candidate: `codex/franchisehq-7.0.2` at `c248b1514f0a0240201760476dc70aa319246e08`.
- GitHub pull request: [#4](https://github.com/itzpeckin/furiousgamingcommunity/pull/4), squash-merged after all four checks passed.
- Production: `main` commit `1418d0bba1074f5ab9f4e50453d6837d72dde809`; `https://franchise-hq.pages.dev/` observed serving Release 7.0.2.
- GitHub quality, GitHub Pages, and Cloudflare Pages: passed.
- Database, league data, credentials, Cloudflare bindings, and import Worker: unchanged.

## Rollback

- Immediate source baseline: production 7.0.1 at `af9d12573e29ec1cbf4e9a14024f8e7bcb39ebca`.
- Immutable recovery tag: `v7.0.0`.
- 7.0.2 adds no migration and performs no deployment-time data mutation.
- Reverting the application/Functions artifact to `af9d125` restores 7.0.1.

## Owner acceptance

Implementation was authorized after the owner prioritized reliable login and team onboarding over the temporarily blocked Madden Companion work. On August 26, 2026, the owner authorized one controlled publication cycle. That cycle completed as pull request #4 and production commit `1418d0b`; every hosted and production check passed, and the canonical Cloudflare URL served Release 7.0.2. The phone checklist in the onboarding runbook remains the final owner acceptance gate.
