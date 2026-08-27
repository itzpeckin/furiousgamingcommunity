# FranchiseHQ 7.0.5 Authentication and Member-Onboarding Runbook

## Goal

Invite FGC members through a predictable Discord login and manage each member from one server-backed Commissioner workflow. The public application remains `franchisehq.app`; the exact `franchise-hq.pages.dev` hostname is an owner-only operational fallback.

## Domain and refresh behavior

- A login begun on `franchisehq.app` uses `https://franchisehq.app/api/auth/discord/callback` and establishes a cookie only on that domain.
- A login begun on the exact owner fallback uses `https://franchise-hq.pages.dev/api/auth/discord/callback` and establishes a separate cookie only on that domain.
- The league path and safe hash route are carried through login. Refreshing Commissioner HQ, Trade Center, or Trade Block returns to that exact screen.
- If Discord completes authorization in a different mobile browser context and the original short-lived state cookie is unavailable, FranchiseHQ displays the Discord identity and requires **Continue to FranchiseHQ** before completing the one-time handoff.
- The Pages fallback still fails closed unless the configured owner Discord identity also has active commissioner membership. Other users and all Pages preview subdomains use `franchisehq.app`.

Both exact callback URLs must be registered in the FranchiseHQ Discord application before 7.0.5 reaches production.

## Commissioner workflow

1. Open **Commissioner HQ → Teams & Owners**.
2. Select **Copy Invite Link** and send the `franchisehq.app` league link privately to the intended member.
3. Ask the member to open the link and connect their own Discord account.
4. The member appears under **New players awaiting assignment** and cannot enter the league while Pending.
5. Open that member's **Manage** dialog.
6. Assign one canonical imported team and choose the league role: Team Owner, Trade Committee, or Commissioner.
7. Select **Save Assignment**. Every active FGC member must have a team, including league staff.
8. Ask the member to select **Check Again** or reopen the invite link.

## Ongoing access management

**Teams & Owners** is the single management surface. It combines imported Madden team identity with authenticated FranchiseHQ membership identity. Use **Manage** to:

- assign or change a member's imported team;
- assign or change the member's league role;
- revoke platform access;
- explicitly reactivate a revoked member by selecting that identity and saving a valid team/role assignment.

The standalone Active and Disabled Discord panels are intentionally removed. The Pending queue remains so commissioners can see new members requiring action. Revoked identities remain available inside **Manage** for deliberate recovery without restoring an obsolete second workflow.

## Security behavior

- An invite URL is not a password and never activates membership by itself.
- Active membership requires an accepted Discord identity, an allowed role, and a canonical imported team.
- A revoked member cannot be reactivated accidentally; the management request must explicitly mark reactivation.
- One imported team cannot have two active controlling members.
- A current commissioner cannot revoke or demote their own active commissioner account, and the final commissioner is protected.
- Invalid roles, identifiers, oversized requests, cross-league requests, and cross-origin mutations are rejected.
- Session cookies are HTTP-only, Secure, SameSite=Lax, and renewed from a valid server session.
- Discord OAuth state is short-lived, origin-bound, and single-use. Same-origin completion creates the session directly; a context-switch handoff is one-time and requires visible confirmation when the state cookie is missing.
- Commissioner member/team changes are written to the membership audit log.

## 7.0.5 desktop and phone acceptance checklist

Use one commissioner browser and a separate ordinary-member browser or private window.

1. From `https://franchisehq.app/leagues/furious-gaming-community`, open Commissioner HQ, refresh, and confirm the same screen remains visible without another login.
2. Repeat exact-screen refresh for Trade Center and Trade Block on desktop and phone.
3. Start a fresh login on `franchisehq.app` and confirm Discord identifies `https://franchisehq.app` as the return site.
4. As Justin/Peckin, start a fresh login on `https://franchise-hq.pages.dev/leagues/furious-gaming-community` and confirm Discord identifies `https://franchise-hq.pages.dev` as the return site.
5. If Discord opens the result outside its embedded browser, confirm FranchiseHQ shows the expected Discord identity and requires **Continue to FranchiseHQ** before the league opens.
6. Open the Pages address as Gas or another non-commissioner and confirm FranchiseHQ routes the browser to `https://franchisehq.app/`.
7. Confirm Commissioner HQ contains **New players awaiting assignment** and **Teams & Owners**, but does not contain standalone Active or Disabled Discord member panels.
8. Confirm the invite link begins with `https://franchisehq.app/`.
9. Manage a Pending test member: choose an imported team and role, save, and confirm access becomes active. Attempting to activate without a team must fail.
10. Change that member's role/team, then revoke access. Confirm the member cannot enter the league.
11. Select the revoked identity from a team's **Manage** dialog, assign a valid team/role, and save. Confirm that explicit action reactivates access.
12. Attempt to assign an occupied team and confirm FranchiseHQ blocks it. Confirm the acting commissioner cannot revoke or demote themself.
13. Confirm My Team, Trade Center, and Trade Block use the authenticated member's assigned team after refresh.
14. On representative phone widths, confirm Pending rows, Teams & Owners rows, and Manage actions fit without horizontal page scrolling or trapped inner scrolling.

## Known boundary

Trade Center, Trade Block, GOTW, and Confidence Pool workflow records remain browser-local controlled-beta data in 7.0.5. Madden NFL 27 schema adaptation, Free Agent verification, and any real FGC data reset remain separately gated. The owner-only Pages hostname is a temporary operational fallback and is not a public multi-tenant domain strategy.
