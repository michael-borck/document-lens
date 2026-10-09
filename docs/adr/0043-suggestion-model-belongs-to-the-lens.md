# ADR-0043: The suggestion model belongs to the lens, and a domain mismatch is silence

**Status:** Accepted
**Date:** 2026-10-09
**Deciders:** Michael Borck
**Evidence:** ADR-0030 (the find/judge split), ADR-0038 (the legend ships as data), ADR-0039
(ClimateBERT framing suggestions), ADR-0041 (typed decision primitives), ADR-0042 (analysis code
belongs with the claim, not inside the artefact); `document_analyser/analyzers/climate_framing.py`
and `document_analyser/api/routes/health.py`; paper §5.5 and DP6.

## Context

DP1 makes a configurable lens the core of the instrument, and DP10 requires that an external
methodology be expressed as data flowing through existing seams rather than as code. The keyword
lists, axis definitions, categories and measurement levels all obey this: a new lens supplies them as
data and no release is needed.

The suggestion layer does not obey it. Three models are named in a module constant in the analysis
service:

    MODEL_SPECS = {
        "detector":   "climatebert/distilroberta-base-climate-detector",
        "commitment": "climatebert/distilroberta-base-climate-commitment",
        "target":     "climatebert/netzero-reduction",
    }

`DOCUMENT_ANALYSER_CLIMATEBERT_REVISIONS` pins revisions (`detector=<sha>`) so a rerun can be tied to
the same weights. It cannot change which models are loaded. Selecting a different model family is an
edit to Python, which is precisely what DP10 forbids. The framing axis is data; the thing proposing
values for it is code, and that code is domain-specific.

Three consequences follow, and the second is the dangerous one.

*The capability is not portable.* A researcher who defines a cybersecurity lens gets the axes,
keywords, polarity, typing and scoring rule they supplied, and gets climate suggestions for the
judgement axis. The lens is configurable except where it most needs to be.

*It fails silently and it fails plausibly.* A climate classifier asked about a security passage does
not raise. It returns scores from a model whose training distribution does not contain that material,
and the app has no way to notice, because nothing in the code knows which domain the active lens
belongs to. Whether those scores are near-arbitrary or accidentally reasonable depends on the
passage, which is worse than either a clear failure or a clear absence. DP6 requires that the
instrument report which capabilities are present rather than substituting silently; today the health
endpoint returns `climate_framing_loaded`, a boolean about one specific domain's models with no
reference to the lens in use. A user cannot learn from the interface whose models produced a
suggestion.

*The paper implies something false.* §5.5 describes the suggestion layer without noting that it is
bound to one domain, and DP6 is stated as a property the instrument holds. A reviewer who reads the
code against the paper finds a gap between the principle and the artefact, which is the failure ADR-0042
was written to prevent one level up.

This is not a reason to remove the climate models. ADR-0041 keeps them deliberately: they were
trained on climate disclosure text, which is adjacent to the pilot corpus, and the honest position
is to measure alternatives against them rather than assume. The problem is that they are
*unconditionally* applied rather than *conditionally* applicable.

## Decision

1. **Suggestion models are declared by the lens, as an optional capability block.** A lens either
   names the models it wants, with their revisions, or explicitly declares that it has none. Absence
   of the block is a declaration, not an oversight, and the instrument treats it as such.
2. **A model whose declared domain does not match the lens produces no suggestions.** Not a warning,
   not a suggestion with a caveat attached: no suggestion. The health report states the reason, so the
   absence is visible rather than mysterious.
3. **Every suggestion carries the lens it was produced for, alongside the model id and revision.** The
   record is already kept (ADR-0041 rule 2); this adds the lens identity so a later calibration study
   can tell which lens produced which suggestion, and so a mixed-corpus export is interpretable.
4. **The deterministic rung-0 rules are not domain-bound and remain available to every lens.** They
   are number-and-date and negation patterns, and they continue to run when no suggestion model is
   declared. A lens with no models is degraded in exactly the way §4.3 describes and reports itself as
   degraded — which is the behaviour the current code achieves by accident, and now by design.
5. **The loaded-model domain is reported next to the active lens in the health surface.** The
   present boolean becomes a statement a researcher can act on: which models are loaded, which lens is
   open, and whether the two correspond.

## Alternatives considered

- **Leave it, and document the limitation in the paper** — rejected. The limitation is real but it is
  not a research finding; it is a seam that was not cut, and documenting an unintended behaviour as
  though it were a property would weaken DP6 rather than qualify it.
- **Make the model names configurable through an environment variable, as the revisions already are**
  — rejected as insufficient. It would let an operator point the service at a different model family,
  but the *lens* still could not declare one, the health surface still could not report the
  correspondence, and a project bundle exported from one machine would carry no record of which models
  it used. It moves the hardcoding out of the source file without making it data.
- **Refuse to suggest at all when the lens is not the sustainability lens** — rejected as a special
  case. It encodes today's single domain into the rule, which is the pattern this whole ADR exists to
  remove. A security lens that *does* declare security models must be able to use them.
- **Warn but still suggest** — rejected. A warning attached to a confident wrong suggestion from
  another field's model is worse than silence, because it moves the judgement onto the user without
  giving them the information to make it. Silence is recoverable; a plausible number is not.

## Consequences

- A lens can now be defined entirely as data, including the question of what may assist it. The
  general facility in §6.6 becomes true of the whole instrument rather than of the deterministic
  portion only.
- The three climate models become an opt-in capability of the sustainability lens, which is what they
  have been in all along. No behaviour changes for that lens.
- There is a migration: the sustainability lens seed gains a capability block naming the three models
  at their pinned revisions, and the health surface gains lens correspondence. Until the seed carries
  the block, the lens declares no models and no suggestions are produced — the safe default, and a
  visible regression rather than a silent one, which is the behaviour DP6 already asks for.
- A lens author who omits the block and expects suggestions will get none, and will be told why. We
  consider that the correct trade: an author who wants assistance can see how to declare it, whereas an
  author who receives plausible wrong suggestions has no way to notice.
- This does not settle which model a given lens should use. ADR-0041's comparison is still the
  instrument for that, and this ADR only ensures the comparison is run per lens rather than against a
  hardcoded incumbent.
- Revisit if: a second lens declares its own models, which is the first real test of whether the
  capability block is general or merely accommodates a second instance of the same shape; or if
  ADR-0041's comparison produces a winner for a non-climate domain, at which point the per-lens
  declaration stops being a configuration convenience and becomes load-bearing.
