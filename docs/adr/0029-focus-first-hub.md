# ADR-0029: Focus-first hub: findings deep-link into the tools

**Status:** Accepted
**Date:** 2026-07-12
**Evidence:** `src/components/project/workflows.ts` (catalogue + landing), `src/components/project/WorkflowTabs.tsx`, `src/pages/workflow/Focus.tsx` (deep links), `Compare.tsx` (`?metric=`), `Read.tsx` (`?doc=`); ADR-0011, ADR-0012, ADR-0017

## Context

The project workspace exposed eleven workflows in one horizontal tab strip,
grouped into Explore → Measure → Verify phases with inline uppercase phase
labels between the tabs. Three problems surfaced in use: the non-interactive
phase labels read as extra tabs (same row, similar size, subtle colour —
figure-ground confusion); twelve items exceed what a horizontal strip
communicates at a glance; and the pipeline ordering put Focus **last**, even
though its question is "which documents should you look at first?" and
ADR-0011/0012 built it precisely to give researchers repeatable *direction*.
The actual research loop is hub-and-spoke — rank by notability, drill into
the evidence, adjust, re-rank — not a pipeline completed left to right.

## Decision

**Focus is the hub.** It moves to the front of the strip (its own group,
right after Overview/Setup) and becomes the landing workflow for a project
(last-visited still wins; the fallback changes from Overview to Focus, and
Focus renders its own finish-Setup guidance when the project isn't ready).

**Findings are links.** Every Focus finding deep-links into the tool that
explains it: signal chips and extreme cards open Compare preset to that
metric (`?metric=repetition|diversity|intensity|evidence-reuse|coverage-spread`,
auto-run on arrival) or Score for the score signal; document titles open
Read on that document (`?doc=<id>`). The other workflows stop being a
taxonomy to memorise and become where findings take you.

**The strip is decluttered, not restructured.** Inline phase labels are
removed; groups keep a thin divider with the phase name as a tooltip, and
the Overview cards remain the place where the phases are taught.

## Alternatives considered

- **Two-level navigation (phase tabs + action row)** — rejected: every tool
  becomes two clicks, cross-phase hops get heavier, and users must remember
  which phase owns which tool. Phases are the methodology's categories, not
  the user's.
- **Keep pipeline order, declutter only** — rejected as the endpoint (kept
  as the first step): it fixes the visual noise but leaves Focus buried
  last, contradicting its role.
- **Merge Overview into Focus** — deferred: one front door showing setup
  nudges when incomplete and the ranking when ready is attractive, but
  Overview's question-card catalogue still earns its keep for newcomers.
  Revisit once deep links have bedded in.

## Consequences

- Deep-linked pages accept URL parameters, which makes workflow views
  addressable — a prerequisite for future "share this view" or report
  cross-references.
- Compare auto-runs when arriving via deep link; a stale-looking idle form
  after a click-through was the worst version of the flow.
- The tab strip no longer teaches the phases; the Overview page and group
  tooltips carry that. If newcomers get lost, revisit with onboarding
  hints rather than reinstating inline labels.
- Focus needs a run before its links exist — an empty Focus landing page
  with a single "Rank documents" button is the intended first interaction.
