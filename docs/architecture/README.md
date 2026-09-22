# Architecture Baseline

## Style

Site Mapper MK1 starts as a modular monolith.

The dependency direction is:

Presentation -> Application -> Domain

Infrastructure implements interfaces needed by the application/domain boundary.

## Boundary rules

- React and Next.js belong to presentation.
- Domain code must not import React, Next.js, MongoDB or MQTT.
- Presentation must not know database document shapes.
- Infrastructure must not become the owner of business rules.
- MQTT data must be parsed, validated and normalized before product code consumes it.
- Legacy compatibility may exist only in migration tooling.

## Status

This document describes the baseline boundary only. Persistence, authentication, identifiers, domain terminology and telemetry contracts remain open until their ADRs are accepted.
