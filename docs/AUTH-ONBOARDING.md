# FranchiseHQ 7.0.2 Member Onboarding Runbook

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

## 7.0.2 phone acceptance checklist

Use one commissioner browser and one separate member browser or private window.

1. Refresh Homepage, Commissioner HQ, Trade Center, and Trade Block. None should require a new login.
2. Copy the invite link from Teams & Owners.
3. Open it as a different Discord user and confirm the Pending page appears.
4. Confirm that user cannot enter the league before approval.
5. Activate the member as Team Owner with one team.
6. Reopen the league link and confirm the assigned team and member pages survive refresh.
7. Attempt to assign the same team to another Pending user and confirm FranchiseHQ blocks it.
8. Disable the test member and confirm league entry is denied.
9. Restore the member to Pending, activate them again, sign in again, and confirm the old disabled state does not return.
10. On phone and desktop, confirm the Teams & Owners Pending/Active/Disabled controls fit without horizontal page scrolling.

## Known boundary

Trade Center, Trade Block, GOTW, and Confidence Pool workflow records remain browser-local controlled-beta data in 7.0.2. This release fixes their authenticated page/session behavior; it does not make those workflow records authoritative or shared.
