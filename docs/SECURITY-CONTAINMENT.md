# FranchiseHQ 7.0.1 Security Containment

## Purpose

Release 7.0.1 closes the known public data and credential-bearing paths before FGC begins using FranchiseHQ as a real league service. It does not redesign the database, activate Madden NFL 27 data, reset league data, or make browser-local league workflows authoritative.

## Route policy

| Surface | Guest | Active member | Commissioner | 7.0.1 behavior |
|---|---:|---:|---:|---|
| League directory | Public projection | Public projection | Public projection | Returns name, slug, and canonical path only. |
| League metadata | Denied | Same league only | Same league only | Internal IDs and snapshot metadata require membership. |
| Snapshot/read model | Denied | Same league only | Same league only | Bounded pagination; raw source objects and bulk downloads removed. A small allowlisted compatibility projection preserves approved roster, schedule, and standings fields used by the current UI. |
| Free Agents | Denied | Same league only | Same league only | Member DTO only; raw source object removed. |
| Rules read | Denied | Same league only | Same league only | Runtime table creation removed. |
| Rules update | Denied | Denied | Same league only | Payload size, count, field, and duplicate-ID validation enforced. |
| Companion capture metadata | Denied | Denied | Same league only | Discovery, Free Agent capture, receiver status, and export history are commissioner-only. |
| Companion ingestion | Token required | Token required | Token required | Header tokens are supported; query-string tokens are rejected. |
| EA-direct experiments | Not found | Not found | Not found | Directory middleware fails closed before any experimental handler executes. |

Signed-in cross-league access returns `404` so the response does not confirm whether another tenant or resource exists. Role failures inside the correct league return `403`.

## Authentication and session controls

- Discord handoffs use a 256-bit random code stored only as a hash in D1.
- The handoff is valid for two minutes, bound to the exact destination origin, consumed atomically, and carried in an auto-submitted POST body rather than a URL.
- GET session claims and GET logout are rejected with `405`.
- Logout remains available through same-origin POST forms and the application API.
- Session lookup tests every distinct persistent-cookie candidate. A stale primary cookie can no longer mask a valid recovery cookie after refresh.
- Successful league document and league-selector responses repair both persistent cookies from the valid server session.
- OAuth state is consumed only after Discord exchange, identity lookup, and the local user write succeed.

## Browser and request controls

- Sensitive responses no longer emit wildcard CORS.
- Cross-origin state-changing requests are rejected when a browser supplies a mismatched `Origin` header; the origin-bound one-time handoff is the sole explicit exception.
- Authentication login and claim routes allow 30 attempts per Cloudflare client address per ten-minute isolate window and return `429` with `Retry-After` after that budget.
- Enforced headers include HSTS, `nosniff`, frame denial, a restrictive referrer policy, and a permissions policy.
- CSP is introduced in report-only mode because the inherited application still contains inline scripts and styles. Enforcement requires the later frontend-module cleanup.
- Unhandled API failures and all API responses with status 500 or higher return a correlation ID and a safe generic message instead of exception details.

Cloudflare account-level rate limiting remains the required long-term distributed control. The in-code limit is immediate abuse containment, not a claim of globally coordinated quota enforcement.

## Import compatibility note

The current Companion route-discovery receiver still supports its existing token-in-path URL because the external Madden exporter cannot yet be assumed to support a custom authorization header. It is a private compatibility endpoint, never linked publicly, and does not return raw payloads. Release 7.0.3 must replace or formally constrain this mechanism during the Madden NFL 27 adapter work, including token rotation and log-redaction verification. Query-string credentials are not accepted anywhere in 7.0.1.

## User-facing controlled-beta disclosure

The application now states that Trade Center, Trade Block, GOTW, and Confidence Pool changes are stored only on the current device. Those workflows must not be represented as official shared league records until their server-backed releases pass tenant and role testing.

## Deferred mobile findings

The owner accepted the 7.0.0 phone smoke test with three findings. Refresh-session persistence is part of 7.0.1. Player-card model/layout problems and competing scroll regions are recorded in 7.0.3, where the roster/player experience is rebuilt against Madden NFL 27 data and tested on representative iOS and Android browsers.
