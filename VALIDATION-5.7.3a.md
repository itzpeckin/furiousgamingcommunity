# Franchise HQ v5.7.3a Validation

## 1. Confirm version

Expected footer:

`v5.7.3a · Notification Read-State & Analytics Drilldown`

## 2. Notification bell does not clear unread items

1. Generate at least two unread trade notifications for one identity.
2. Confirm the notification dot is visible.
3. Open the notification bell.
4. Close it without selecting a notification.
5. Open it again.

Expected:

- Both notifications remain highlighted as unread.
- The unread count is unchanged.
- No Mark All Read action appears.

## 3. One notification is marked read

1. Select one specific notification.
2. Confirm it routes to the correct trade.
3. Reopen the notification menu.

Expected:

- Only the selected notification is read.
- Other notifications remain unread.
- The unread count decreases by one.

## 4. Direct trade navigation does not mark notifications read

1. Leave an unread notification in the menu.
2. Open the same trade through Sent, Received, Committee, Approved, or History instead of clicking the notification.
3. Reopen the bell.

Expected:

- The notification remains unread.

## 5. League analytics drilldown

1. Open Trade Center → Analytics.
2. Click Completed League Trades.

Expected:

- An inline completed-trade list opens below the analytics summary.
- The number of trade cards matches the league total.
- Clicking a trade card opens its approved trade detail.

## 6. Team analytics drilldown

1. Click the signed-in team completed-trade total.
2. As Commissioner, also click a count in Completed Trades by Team.

Expected:

- The inline list contains only approved trades involving that team.
- Multi-team trades appear once in the list.
- The page does not navigate away merely from clicking the count.

## 7. Season filter

1. Open a drilldown.
2. Change the Season filter.

Expected:

- The drilldown closes.
- Counts update to the selected season.
- Opening a count again lists only approved trades from that season.

## 8. Close drilldown

Click the × control on the completed-trade list.

Expected:

- The inline list closes.
- Analytics totals remain visible.

## 9. Console check

Expected:

- No red JavaScript application errors.
