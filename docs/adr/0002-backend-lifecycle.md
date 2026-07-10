# ADR-0002: Backend lifecycle — bundled binary, spawn-only, auto-restart

**Status:** Accepted
**Date:** 2026-05-12
**Evidence:** `1325986` (drop dev-external + adopt-on-startup; auto-restart), `698830b` (kill Python child on every exit path), `b439025` (close SQLite on exit), `d7289f7` (single backend URL / port 8765)

## Context

Early builds probed port 8765 at startup and **silently adopted** any process
already answering there ("dev-external" mode). When that foreign process later
died, the app was left with no backend and no recovery — this caused a real
PDF-import failure. Orphaned Python children also lingered after quit.

## Decision

The app **always spawns and owns its backend** — no adoption of external
processes. Backend mode is strictly `embedded` (bundled binary) or `dev-auto`
(spawn a dev checkout). If the port is taken, fail loudly rather than adopt.
On crash, **auto-restart with backoff** (2 s × attempt, capped). **Kill the
Python child on every exit path** (no orphans); close the SQLite handle on
shutdown. Backend URL/port is a single source of truth (8765), overridable via
`DOCUMENT_LENS_*` env vars.

## Alternatives considered

- **Adopt an externally-running backend** — rejected as a silent, unrecoverable
  coupling. If ever needed, it must be explicit (an env-var URL), not a probe.

## Consequences

- Predictable, self-healing backend; no orphan processes.
- A developer wanting to attach a hand-run backend must opt in explicitly.
- Startup surfaces a clear backend-status phase machine (starting/ready/crashed)
  consumed by the UI status strip.
