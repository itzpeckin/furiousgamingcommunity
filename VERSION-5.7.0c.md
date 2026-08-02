# Franchise HQ v5.7.0c

## Trade Detail Routing Hotfix

This release fixes case-sensitive routing for submitted three-team and four-team private trades.

### Corrected behavior

- Multi-team transaction IDs retain their original casing when read from the route.
- Trade detail lookup also compares IDs case-insensitively for backward compatibility.
- A successfully submitted trade opens immediately after creation.
- Participating owners and Commissioners can reopen the transaction from the Trade Center.
- The unified builder, Back warning, Clear Trade, and recovery behavior remain unchanged.
- No roster, depth chart, cap, or League Data mutation is introduced.
