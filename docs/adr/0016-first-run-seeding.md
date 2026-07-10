# ADR-0016: First-run seeding — generalise the structure, ship sustainability defaults

**Status:** Accepted
**Date:** 2026-05-12
**Evidence:** `0e00b6b` (pre-load sustainability defaults on first launch), `e5489ee` (first-run wizard); `src/services/seed.ts`; user-stories design principle #9, US-X-13

## Context

The tool must be **domain-general** (a scoring rule, axes, and keyword lists are
generic structures), yet a sustainability researcher should get value on day one
**without configuring anything**. These pull in opposite directions.

## Decision

Keep the structures generic, and add an **idempotent first-launch seed** that
pre-loads a working sustainability setup: the SDG keyword list (positive +
counter), the SDG / Pillar / Function axes, and the 5-level Wedding Cake scoring
rule. The idempotency guard is keyed on the keyword-list source name and runs
every launch (so it self-heals but never duplicates). The first-run wizard offers
Sustainability, General, and (disabled, "coming soon") Cybersecurity focuses.

## Alternatives considered

- **Empty first run** — rejected: violates "work the first time" (principle #5);
  a non-expert can't assemble the SDG/Pillar/Function/Wedding-Cake configuration
  themselves.
- **Hard-code sustainability** — rejected: the generic structures let the tool
  serve other domains (e.g. NIST CSF) via user-defined rules.

## Consequences

- Day-one value for the primary persona; general-purpose for others.
- The Cybersecurity focus is deferred until its seed (which lists, lenses, rule)
  is designed — the framework JSONs exist but the seed does not.
