# Franchise HQ v5.9.0.3b — Validation Engine Registration Hotfix

Fixes public API registration so `FranchiseHQ.leagueValidationEngine` is always exposed, including when an older cached Platform core is present. Validation dependencies are now resolved when an API is called rather than crashing during script load.
