# Franchise HQ v5.7.4 Validation

1. Confirm footer shows v5.7.4.
2. Open Commish HQ → Commissioner Controls → Trade Center → Trade Limits & Asset Rules.
3. Confirm Enable Free Trades, Maximum Player Overall, and Earliest Eligible Draft Round are present.
4. Set the rule to 69 OVR and Round 4.
5. Build a trade where every outgoing player is 69 OVR or lower and every outgoing pick is Round 4 or later.
6. Confirm the builder shows FREE TRADE ELIGIBLE and 0 trades required for every team.
7. Submit, accept, and approve the trade. Confirm remaining seasonal trades do not decrease.
8. Build a trade containing a 70 OVR player or Round 1–3 pick. Confirm it displays STANDARD TRADE and uses normal trade limits.
9. Set a team to zero remaining trades. Confirm Create a New Trade remains available when Free Trades are enabled and the team is labeled Free Trades Available / Free Trades Only.
10. Confirm a zero-remaining team can submit a qualifying Free Trade but cannot submit a nonqualifying standard trade.
11. Test the AND rule in a three-team trade: if one team's outgoing package fails, the entire transaction is standard.
12. Confirm Committee Review recalculates the current rule and displays Free Trade or Standard Trade status.
13. Confirm Teams & Owners usage shows Free Trade · 0 Trades Used.
14. Disable Free Trades and confirm zero-remaining teams can no longer start or join new trades.
15. Confirm no red JavaScript console errors.
