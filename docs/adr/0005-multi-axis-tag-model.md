# ADR-0005: Multi-axis tag model — keyword-attached vs document-context axes

**Status:** Accepted
**Date:** 2026-05-11 (superseded the "Domain list" model)
**Evidence:** `docs/design/information-architecture.md:15,407-418`; `docs/design/user-stories.md` "Resolved decisions #2"; seed `0e00b6b` (SDG/Pillar keyword-attached, Function document-context); types `5430d75`

## Context

A single keyword dimension could not represent that some classifications belong
to the *keyword itself* (an SDG number, a Wedding-Cake Pillar) while others
belong to a *region of the document* (a Function — Teaching / Research /
Engagement / Operations — inferred from where a keyword appears). The earlier
"Domain list" entity (one per project) was the wrong abstraction.

## Decision

Model classification as **Tag Axes**, each of one of two types:

- **keyword-attached** — the value is part of the keyword's definition (e.g. SDG
  1–17, Pillar). Carried on the keyword.
- **document-context** — the value is inferred from *where in the document* a
  keyword mention falls (e.g. Function, from the containing section). Carried on
  the section, joined to a match by character offset.

Axes are first-class, project-activated, and may be hierarchical (Pillar → SDG).
(Terminology later shifted: the TS/UI concept is "Axis"; the DB retains "lens" —
see ADR-0008/README on naming.)

## Alternatives considered

- **One "Domain list" per project** — rejected: a special case of an enumerated
  keyword-attached axis; couldn't express document-context classification.

## Consequences

- Enables the 2D Pillar × Function matrix (ADR-0009) and the Wedding Cake score
  (ADR-0008), both of which need one axis of each type.
- Requires section detection + section classification for document-context axes
  (ADR-0007).
- The same keyword list can be combined with different lenses per project without
  forking it (user story US-X-12).
