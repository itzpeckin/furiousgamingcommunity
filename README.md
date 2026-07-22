# Franchise HQ — TC-007 Trade History

TC-007 adds the permanent, permission-aware transaction archive and strengthens TC-006 with automatic committee conflict-of-interest recusal.

## Committee conflict protection
- Every committee account is mapped to the franchise it represents.
- A committee member cannot vote on any trade involving that franchise.
- The member remains able to review the submitted package, but the entire ballot panel is visibly grayed out.
- Approve, Reject, and Abstain are disabled and cannot be triggered through the click handler.
- The member appears as `Recused` in the confidential committee roster.
- Review progress and pending counts use only eligible committee members.
- The three-vote approval/rejection threshold remains unchanged.

## TC-007 Trade History
- Dedicated permanent Trade History workspace inside Trade Center.
- Search by trade number, team, player, or draft pick.
- Filter by final result and franchise.
- Approved transactions are visible league-wide.
- Rejected, declined, withdrawn, and expired negotiations remain visible only to involved owners, committee, and commissioner roles.
- History cards show final package terms, result, submitted version, version count, and committee result when public.
- Opening a record preserves existing privacy rules for messages, superseded versions, calculations, and ballots.

Replace all six project files, commit, and allow Cloudflare to deploy. Hard-refresh once after deployment.
