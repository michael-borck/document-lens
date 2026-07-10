# ADR-0015: IPC security boundary — keyed query registry + fs-guard

**Status:** Accepted
**Date:** 2026-05-21 (query registry), 2026-05-29 (fs/security hardening)
**Evidence:** `a183dbe` (cutover — remove raw SQL IPC), `46e3e6b`/`fd89b7a` (registry migration), `fd9d902` (harden Electron security S1–S5); `electron/queries.ts`, `electron/fs-guard.ts`; `CONTEXT.md` "Query Registry"

## Context

The renderer displays untrusted content (imported document text). Early IPC let
the renderer send **arbitrary SQL** to the main process, and read/write
**arbitrary filesystem paths** — an XSS-to-arbitrary-SQL/DDL and
arbitrary-file-access hole.

## Decision

Make the main-process IPC surface a **least-privilege boundary**:

- **Keyed query registry** — the renderer can only invoke **named, pre-registered
  queries** (`db:select`/`db:run` resolve a key from `electron/queries.ts`;
  `db:update` uses a per-table column allowlist). The raw `db:query` handler is
  **removed entirely** — a compromised renderer can call only the registered
  queries.
- **fs-guard** — `fs:*` IPC is confined to the userData subtree, files/dirs the
  user picked via a native dialog this session, and DB-registered document
  sources. Bundle import writes only sanitised basenames (zip-slip fix);
  `shell.openExternal/openPath` has a scheme allowlist; a per-launch bearer token
  authenticates the renderer↔backend; CSV export escapes formula/DDE injection.

## Alternatives considered

- **Trust the renderer** — rejected: imported documents are an untrusted input
  source; XSS must not escalate to SQL/DDL or file access.

## Consequences

- The registry also made the data layer testable — a swappable `DbDriver` runs
  the *same* registered queries against in-memory SQLite in tests (ADR-0016).
- New DB access must be added as a registered query, not ad-hoc SQL — a small,
  deliberate friction that keeps the boundary intact.
