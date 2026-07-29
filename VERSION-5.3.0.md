# Franchise HQ v5.3.0 — Modular Service Architecture

## Purpose

This release separates League Engine services from the frozen Stable Platform Contract 1.0.

Madden remains the only authority for official league state. No roster, contract, cap, standings, schedule, statistics, injury, or transaction authority was added to Franchise HQ.

## Architecture

- Platform services remain registered through `FranchiseHQ.defineService()`.
- Feature and engine services register through `FranchiseHQ.defineModuleService()`.
- The League Engine is available under `FranchiseHQ.modules.league`.
- Compatibility aliases such as `FranchiseHQ.leagueRepository` remain available without being included in the Platform service registry.
- The deployment manifest validates both Platform and module-scoped services.

## League module services

The following 13 services were moved out of the Platform registry:

- leagueEntities
- leagueImportContract
- leagueImportQuarantine
- leagueImportService
- leagueImportValidator
- leagueMaddenJsonAdapter
- leagueMigrations
- leagueMockAdapter
- leagueReadModel
- leagueRepository
- leagueSchema
- leagueSelectors
- leagueValidation

## Expected result

The Stable Platform Contract 1.0 audit should report no undeclared Platform services while the League module remains fully operational.
