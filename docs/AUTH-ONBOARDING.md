# FranchiseHQ 7.0.4 Member Onboarding Runbook

## Goal

Invite FGC members into FranchiseHQ without giving an invite link any league permission by itself. Discord proves the person's identity; a commissioner separately approves the league role and team.

## Commissioner workflow

1. Open **Commissioner HQ → Teams & Owners**.
2. Select **Copy Invite Link** and send that league link privately to the intended member.
3. Ask the member to open the link and connect their own Discord account.
4. The member will see **Waiting for commissioner assignment**. They cannot enter the league while Pending.
5. In **Teams & Owners**, select **Refresh Discord** if the Pending member is not already visible.
6. Choose the member's role:
   - **Team Owner** requires a team.
   - **Trade Committee** may have a team or remain unassigned.
   - **Commissioner** may have a team or remain unassigned.
7. Choose the team when required and select **Activate**.
8. Ask the member to select **Check Again** or reopen the same invite link.

## Access management

The Teams & Owners page lists the complete server-backed Discord membership state:

- **Pending:** Discord is connected, but the account has no active league access.
- **Active:** The account can enter the league with the displayed role and team.
- **Disabled:** League access was explicitly revoked.

Use **Disable Access** to revoke a member. The current commissioner cannot disable or demote their own commissioner account. Use **Restore to Pending** before reassigning a disabled member.

## Security behavior

- The invite URL is not a password and never activates a membership.
- A commissioner can activate only a user who first accepted this league invite through Discord.
- One team cannot have two active assigned members.
- Invalid roles, identifiers, oversized requests, cross-league requests, and cross-origin mutations are rejected.
- Session cookies are HTTP-only, Secure, SameSite=Lax, and renewed from a valid server session.
- Discord OAuth state is short-lived and single-use; the final session handoff is origin-bound, one-time, and sent by POST.
- Commissioner/member/team changes are written to the membership audit log.

A person who discovers the league URL can create a Pending request but cannot enter the league. Commissioners should approve only recognized Discord identities. Tokenized, expiring invitations remain a future multi-tenant enhancement if Pending-request spam becomes a real operational concern.

## 7.0.4 phone and desktop acceptance checklist

Use one commissioner browser and one separate member browser or private window.

1. Begin from `https://franchisehq.app/leagues/fgc`, complete one fresh Discord login if requested, and refresh Homepage, Commissioner HQ, Trade Center, and Trade Block. None should require another login.
2. As Justin/Peckin, open `https://franchise-hq.pages.dev/leagues/fgc`, complete Discord login if requested, and confirm refresh stays signed in on that exact owner fallback.
3. Open the Pages address as Gas or another non-commissioner and confirm FranchiseHQ sends that browser to `https://franchisehq.app/`.
4. Copy the invite link from Teams & Owners and confirm it begins with `https://franchisehq.app/`.
5. Confirm Teams & Owners lists exactly the teams, names, logos, and colors from the active Madden import and does not resurrect an old Madden owner label or browser-stored owner.
6. Assign Justin/Peckin as Commissioner and Tampa Bay Buccaneers; assign Gas as Team Owner and Green Bay Packers; disable Saluki. Confirm a staff role and a team can coexist.
7. Reopen the league as Justin and Gas and confirm My Team, Trade Center, and Trade Block all use the assigned Buccaneers and Packers respectively after refresh.
8. Attempt to assign either occupied team to another Pending user and confirm FranchiseHQ blocks it.
9. Open **Commissioner HQ → League Data → Prepare for Madden 27**, load the preview, and confirm accounts, sessions, rules, Justin, and Gas are listed for preservation while Saluki can remain unselected. Do not type the confirmation or execute the reset during ordinary acceptance.
10. On phone and desktop, confirm Pending/Active/Disabled controls, Teams & Owners rows, the assignment dialog, and reset preview fit without horizontal page scrolling, trapped inner scrolling, or duplicate error notices.

## Known boundary

Trade Center, Trade Block, GOTW, and Confidence Pool workflow records remain browser-local controlled-beta data in 7.0.4. This release makes their authenticated team identity canonical; it does not yet make those workflow records authoritative or shared. Madden NFL 27 schema adaptation, Free Agent verification, and any real FGC reset remain separately gated.
