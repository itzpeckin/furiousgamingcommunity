# Franchise HQ v5.7.0p

## Multi-Team Approval Limit Runtime Hotfix

This hotfix restores the missing `multiApprovalLimitCheck()` runtime helper used by committee-queue reconciliation and final multi-team approval.

It does not change trade limits or approval rules. It makes the existing v5.7.0o rules executable:

- Each participating team is evaluated independently.
- Only already approved trades count as used trades.
- The current transaction is excluded from its own usage calculation.
- A committee transaction is cancelled when a participant no longer has enough trades remaining.
- Unlimited mode bypasses the limit check.
