# ADR-0014: BYOK AI — main-process-only, encrypted keys, always flagged

**Status:** Accepted
**Date:** 2026-07-09
**Evidence:** `5765ece` (BYOK provider infrastructure), `fb16d14` (AI observations); `electron/ai-providers.ts`, `src/services/ai-observations.ts`, `src/components/AiObservationsPanel.tsx`

## Context

The app is offline-first (ADR-0001) and all other signals are deterministic. An
*optional* AI "observations" layer (interpret the signals, suggest where to look)
was wanted, but it must not leak keys, must avoid browser CORS, must be
transparent for reproducibility, and must not become a hidden dependency.

## Decision

**Bring-your-own-key.** Support 7 providers collapsed to **3 API shapes**
(Anthropic Messages; OpenAI-compatible — OpenAI/Grok/OpenAI-compat/Ollama/
Ollama+Bearer; Gemini). Keys are **encrypted with Electron `safeStorage`** (OS
keychain) and **never sent to the renderer** (revealed only on an explicit Show,
decrypted in main). **All LLM/network calls run in the main process** — no CORS,
keys never touch the DOM. Several providers can be stored, one active.
Test-connection = list-models. The **AI never computes signals** — it only
interprets the deterministic ones it is given, and its output is **always flagged
"AI-generated / not a repeatable signal"** with provider/model attribution.

## Alternatives considered

- **Calls from the renderer** — rejected: CORS + key exposure to any XSS.
- **A bundled/default model or a hosted key** — rejected: cost, privacy, and it
  would break the offline default and the reproducibility principle.
- **Let AI compute the signals** — rejected: the signals must stay deterministic;
  AI is interpretation only.

## Consequences

- The one network-dependent, non-deterministic feature — clearly walled off and
  flagged, honouring "deterministic signals; transparently flag all GenAI".
- Local providers (Ollama) keep it fully offline-capable if desired.
- A non-family `setuptools<81` pin (ADR-0003) is unrelated to this.
