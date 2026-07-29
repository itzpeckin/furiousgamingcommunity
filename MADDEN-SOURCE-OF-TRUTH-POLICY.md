# Madden Source-of-Truth Policy

1. Madden is authoritative for all official league data.
2. Official league data is immutable from the Franchise HQ interface.
3. Only a validated Madden import may replace the active league snapshot.
4. Franchise HQ workflow data may never overwrite Madden entities.
5. Derived values must be reproducible solely from imported Madden facts.
6. Missing Madden data remains unavailable; Franchise HQ does not invent it.
7. Committee-approved trades remain proposals until a later Madden import confirms execution.
8. A failed import never replaces the last valid snapshot.
9. Raw source identifiers and import provenance must be retained.
10. Existing pages consume the read model; they do not own official league state.
