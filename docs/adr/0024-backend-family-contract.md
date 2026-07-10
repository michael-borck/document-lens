# ADR-0024: Backend as a family member — `api` package + lens-contract

**Status:** Accepted
**Repo:** document-analyser (backend)
**Date:** 2026-05-25
**Evidence:** `3806963` "Adopt lens-contract; move app to api package; CORS via add_cors; 0.5.0"; `378656b` (canonical extract_text + capability manifest); `6c335e3` / `712993e` (optional auth gate, 0.7.0)

## Context

`document-analyser` is one of a family of tools (ADR-0003). Each needs a
consistent HTTP shape — health, capability manifest, CORS for the desktop
client, and an optional auth gate — and a canonical public API. Duplicating that
per service invites drift.

## Decision

- **Move the FastAPI app from `main.py` into a `document_analyser.api` package**
  so the standard entry point is `from document_analyser.api import app` (this is
  why the desktop build requires backend `>=0.5.0`).
- **Adopt `lens-contract`** — the shared family package that provides
  `add_auth`, `add_cors`, `add_contract_routes` (a consistent `/health` +
  `/manifest`), applied in `api/__init__.py`.
- Expose a **canonical `extract_text()`** and a capability manifest as the
  backend's stable public surface.
- The **auth gate is optional** (a per-launch bearer token from the desktop
  host; absent → unauthenticated, for older builds / dev).

## Alternatives considered

- **Bespoke per-service health/CORS/auth** — rejected: the family would drift;
  a shared contract keeps them consistent.

## Consequences

- The desktop client and backend agree on health/manifest/auth by contract.
- Couples the backend to `lens-contract`; the desktop build must install it
  (it's a normal dependency).
