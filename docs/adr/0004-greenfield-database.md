# ADR-0004: Greenfield database — no migrations, wipe on schema change

**Status:** Accepted
**Date:** 2026-05-12
**Evidence:** `5430d75` (greenfield v2 SQLite schema; drops migrate* functions; adds readSchemaVersion), `ec73822` (schema bump 2→3), `electron/schema.ts`, `electron/database.ts`

## Context

Document Lens is a pre-release desktop tool. During heavy iteration the SQLite
schema changes often. There is no fleet of users with irreplaceable data to
preserve, and hand-written migration scripts are overhead and a source of bugs.

## Decision

Ship a **schema contract** (`schema.ts`) plus a `schema_version` sentinel table.
On startup, if the on-disk version differs from the app's `SCHEMA_VERSION` (or
the table is absent), **delete and recreate the database file**. Every
incompatible schema change bumps `SCHEMA_VERSION`; the DB is wiped and re-seeded
on next launch. No migration scripts are shipped.

## Alternatives considered

- **Versioned migration scripts** — rejected for this stage: complexity and risk
  with no data to protect.

## Consequences

- Schema changes are cheap during development.
- Users lose local project data on a schema bump — acceptable pre-release, and
  the user is warned before shipping such a change. When the product has real
  users, this ADR must be revisited (additive `ALTER TABLE` migrations, at
  minimum).
- The Library/project data is intentionally non-precious; a `.lens` bundle
  export is the durable, portable artefact (see user stories US-X-02/03).
