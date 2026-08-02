# Validation — v5.6.2a

1. Confirm footer shows v5.6.2a.
2. Diagnostics should report 1,568 player stats and 32 team stats in Development Data.
3. Switching into and out of Team Rankings should occur without the previous multi-second delay.
4. Run `FranchiseHQ.leagueStatistics.getSupportedFields("receiving")`; future sources without Targets will not display that column.
5. Test a real player ID with `FranchiseHQ.leagueStatistics.getPlayerStats(FranchiseHQ.leagueRosters.searchPlayers("")[0].id)`. It must return an object.
6. Commissioner HQ → Teams & Owners must display all 32 supplied owners.
7. Eddie, Term, Benny, Big Red, Devo, and Peckin must show Commissioner.
8. Blevins must show Trade Committee. Peckin retains full Commissioner controls and is also stored as a committee member.
9. No red console errors.
