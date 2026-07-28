# Franchise HQ Architecture Specification

**Specification:** Platform Contract v1.0 Draft  
**Introduced:** Version 4.14  
**Product:** Franchise HQ  
**Tagline:** Play in Madden. Live in Franchise HQ.

## Purpose

This document is the controlling architecture specification for the Franchise HQ frontend. It prevents the largest or most recently edited feature from dictating the structure of the product.

Franchise HQ is a league-management platform. Trade Center is one feature module within that platform.

## Architectural layers

### 1. Platform

Shared infrastructure used by every capability:

- Application lifecycle and boot sequence
- Service registration and dependency resolution
- Routing and navigation
- Global event transport
- Shared state conventions
- API transport
- Error handling
- Logging and diagnostics
- UI shell infrastructure
- Storage abstraction
- Module runtime
- Configuration and feature flags
- Security baseline
- Testing and release conventions

The Platform must not own league rules or feature-specific business behavior.

### 2. Identity

Identity answers who the user is and what context they are operating in:

- Authentication and session
- League membership
- Active role
- Active team
- Permission context

### 3. League Engine

The League Engine owns authoritative league behavior:

- League lifecycle
- Season and week state
- Team ownership rules
- Transactions
- Draft
- Waivers and free agency
- Salary cap and contracts
- Simulation

### 4. Data Services

Data Services expose stable domain APIs while hiding the underlying source:

- Teams
- Players
- Schedule
- Standings
- News
- Statistics
- Transactions
- Contracts
- Draft and scouting data

A consumer should not need to know whether data comes from mocks, memory, D1, an import, or a remote service.

### 5. Module Framework

Every feature module will eventually follow one contract:

- Metadata and ownership
- Route declarations
- Permission declarations
- Register
- Mount
- Unmount
- State boundary
- Events
- Commands
- Diagnostics
- Listener cleanup
- Feature flags

### 6. Feature Modules

User-facing capabilities include:

- Home
- Commissioner HQ
- Teams
- Players
- Schedule
- Standings
- League News
- Trade Center
- Draft Center
- Scouting
- Salary Cap
- Contracts
- Waivers
- Free Agency

No feature module is the architectural center of the product.

## Authoritative sources of truth

| Concern | Authoritative service |
|---|---|
| Current application route | `FranchiseHQ.appRouter` |
| Navigation state | `FranchiseHQ.navigation` |
| Sidebar state | `FranchiseHQ.sidebar` |
| Application readiness | `FranchiseHQ.lifecycle` |
| Authenticated user/session | `FranchiseHQ.auth` |
| Active league context | `FranchiseHQ.league` |
| Permissions | `FranchiseHQ.permissions` |
| Shared events | `FranchiseHQ.events` |
| API transport | `FranchiseHQ.api` |
| Shared storage | `FranchiseHQ.store` |
| Trade state | `FranchiseHQ.trade.state` |
| Trade negotiations | `FranchiseHQ.trade.negotiations` |

## Dependency rule

Dependencies flow downward:

```text
Feature Modules
      ↓
Module Framework
      ↓
Data Services / League Engine / Identity
      ↓
Platform
```

The Platform must never depend on a feature module.

## Naming conventions

- Services: lower camelCase; dot notation only for module-owned sub-services.
- Routes: lowercase kebab-case.
- Events: `namespace:past-tense-action`.
- Diagnostics: names must explicitly identify their scope.
- Compatibility globals: temporary adapters, never authoritative state.

## Forbidden patterns

- Reading the current route from a feature diagnostic.
- Calling `fetch()` directly from feature code when the shared API service is available.
- Writing un-namespaced feature data directly to browser storage.
- Creating multiple sources of truth for route, user, league, role, or team.
- Adding new behavior directly to `FGC_APP` or `FGC_TRADE`.
- Relying on hidden buttons as the only authorization control.
- Registering listeners without cleanup.
- Allowing Platform code to import or depend on Trade Center.

## Version 4.14 scope

Version 4.14 formalizes the contract. It does not claim that all existing code already complies with the final Platform standard. Versions 4.15 through 4.21 will implement and enforce this specification.
