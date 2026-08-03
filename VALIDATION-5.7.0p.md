# v5.7.0p Focused Validation

1. Confirm the footer shows `v5.7.0p`.
2. Clear the console and open Trade Center.
3. Navigate through Drafts, Sent, Received, Committee, Approved, Rejected, AI Suggestions, and History.
4. Confirm `multiApprovalLimitCheck is not defined` does not appear.
5. Run `typeof FGC_TRADE.tradeDataDiagnostics` and expect `"function"`.
6. Run `FGC_TRADE.tradeDataDiagnostics()` and confirm the service reports version `5.7.0p`.
7. Move a valid three-team trade into Committee Review and confirm the Committee tab renders.
8. With sufficient trades remaining, cast the final approval and confirm the trade can become Approved.
9. With a participating team out of trades, open the Committee tab and confirm the invalid pending trade is cancelled or removed from the actionable queue with an out-of-trades reason.
10. Disable seasonal trade limits and confirm multi-team committee trades are not cancelled because of trade usage.
