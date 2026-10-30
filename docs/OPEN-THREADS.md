# Open threads

Ideas that are deliberately not being worked now, recorded so they survive
being put down. Written for the situation where you come back in three weeks
with no memory of having thought any of this.

Each entry says what prompted it, what would unblock it, and where the
decision lives — so an entry can be picked up without rediscovery. If an idea
is not here, it was either done, rejected, or never had a concrete reason,
and only the last of those is worth adding.

## Active, waiting on something external

### Logits-read suggestions for the judgement axes
*Prompted by:* ADR-0041. Three climate classifiers return per-label scores,
not a distribution over the four framing levels, so a coder cannot tell
"probably Aspirational" from "confidently Aspirational". A logits read over a
declared candidate set returns the whole distribution, which makes graded
calls answerable rather than a matter of opinion. This is a shape
difference, not a preference.
*Unblocked by:* the calibration study. §6.3 Table 7 is written to answer
exactly this — deterministic rules vs the climate classifiers vs a local
logits read, on the same passages, against the same settled consensus. The
honest position is to measure and keep whichever wins; rule 8 of ADR-0041
makes a comparison the deliverable rather than a model.
*Before building:* confirm the local implementation is one forward pass with
no sampling, and pin implementation and weights by revision. A reasoning
model is inadmissible — it spends its first tokens in a hidden channel and
leaves no answer token to read.
*Cost of being wrong:* a general model loses the domain prior. ClimateBERT
was trained on adjacent text; a general instruct model was not.

### Per-lens suggestion models
*Prompted by:* ADR-0043, found while reading the code to check a paper
claim. The three models are named in a module constant in the analysis
service, so a lens for another domain silently receives climate
suggestions, and the health endpoint cannot report the mismatch. The quiet
failure is the dangerous one: a classifier asked about out-of-domain
material returns confident scores rather than raising.
*Unblocked by:* nothing — this is cuttable now. It is listed here because it
is a known, accepted, unfixed seam, not because it is blocked.
*Order matters:* cut this before opening a second lens, not after. A lens
built while the suggestion layer is hardcoded inherits the problem.

### CPR-style passage sampling for the calibration run
*Prompted by:* Sonja's conference link to the Climate Policy Radar methodology
(full comparison: paper repo `04-literature/climate-policy-radar-comparison.md`).
Their classifier evaluation samples passages three ways — random, label-derived,
and by embedding similarity to the concept — so ambiguous boundary cases get
labelled, not just the obvious ones. Our §6.3 recall estimate is capped by the
passages the coders happen to find; similarity sampling surfaces the ones nobody
flagged. The same passage-level alignment is what the Coverage-discrepancy entry
below needs as its diagnostic.
*Decided 2026-10-21:* adopted before coding began. §6.3 amended ("Boundary
passages" paragraph + Table 6 pooled/per-slice reporting); ADR-0044 filed for the
document-analyser candidate-generation endpoint. Remaining work is the
implementation itself, tracked by that ADR.

### Climate Policy Radar concept lists as a lens source
*Prompted by:* the same link. Their Wikibase concept store (labels, definitions,
subconcepts, relationships) is open and structured. A slice could load as a
climate-policy lens keyword list through the existing bundle/CSV seams — a
configuration change that honours DP10, not a code change.
*Unblocked by:* a licence check. Their terms of use govern derivative keyword
lists; until that is read, this stays an idea. Also respects the second-lens rule
(do not build a lens just to demonstrate) — worth cutting only if a researcher
actually wants a climate-policy lens.

### Resolve the Coverage discrepancy
*Prompted by:* §6.5. A coverage figure for the validation report implies
roughly seventy per cent where manual inspection found two passages
evidently absent. Candidate mechanisms are a numerator/denominator
disagreement about suppressed mentions across workflows, a raw-versus-
deduplicated boundary, or a per-axis contribution that does not sum to the
axis total.
*Unblocked by:* the same passage-level alignment the calibration study
produces. That is why the calibration run doubles as the diagnostic.
*Note:* do not delete this from the paper. It is reported as open, and it is
the strongest available evidence that the explainability principles work —
the figure was inspectable, and a researcher with an independent count did
not accept it.

## Blocked on data

### Second lens
*Prompted by:* §6.6. The portability claim is designed for, not
demonstrated, and one research programme specified every requirement the
abstraction currently satisfies.
*Unblocked by:* a researcher outside this programme who needs a lens for
their own reasons. Do **not** build one to satisfy a contribution type — a
demonstration built to demonstrate evidences plausibility, not generality.
*Order matters:* this is the load-bearing test for DP1's generality claim.

### Non-climate suggestions
*Prompted by:* the same seam as above. If a security lens needs assistance,
it needs its own domain prior — probably a small set of narrow binary
predicates (control assertion, incident disclosure, quantified metric)
rather than a trained language model.
*Unblocked by:* a second lens existing, plus ADR-0043.

### Biodiversity lens + engagement-level scoring rule (Jonäll 2026)
*Prompted by:* Jonäll (2026, AAAJ, doi 10.1108/AAAJ-01-2025-7696) — a manual NVivo
keyword content analysis of 196 Swedish reports that derives peripheral/operational/
strategic engagement levels, with a published keyword list (her Table 2) and documented
false positives ("rehabilitation" in patient care, "protection" in electrical
equipment). The closest manual twin of the instrument's pipeline and the strongest
second-lens candidate on record: keyword seed list ready-made, exclusion-phrase seeds
ready-made, external researcher with the need (contactable, CC-BY paper; full note in
paper repo `04-literature/jonall2026-engagement-levels.md`).
*Unblocked by:* the second-lens rule — an external researcher who needs the lens for
their own reasons. A lens built to demonstrate generality evidences plausibility, not
generality. If it is ever built, an engagement-level rule type for the Scoring Rule
registry needs its own ADR (next number): general-vs-concrete is computable at rung 0
(numbers, dates, hedges); proximity-to-core-business stays human under DP9, with
Function classification as a hint only. The registry's second adapter after Wedding Cake.
*Cost of being wrong:* low — the candidate is recorded, not built; the paper's §6.6
portability claim stays designed-for rather than demonstrated either way.

### Concept-level semantic find (embedding hints on keyword coverage)
*Prompted by:* the same comparison. CPR fills its search gaps with dense
retrieval; the pinned embedding machinery from ADR-0007 could give a
thresholded cosine "semantic coverage hint" at concept level — rung 1 on the
ADR-0035 ladder, flagged suggestions only, never recorded codes (DP9).
*Unblocked by:* the calibration study. If the embeddings' domain-classification
agreement is good on settled cells, the same machinery generalises to this; if
not, the hint would import the same weakness at a finer grain.

## Waiting on a human decision

### AJIS word count
*Prompted by:* the manuscript is over the venue limit and the §6.3 tables
will lengthen it further.
*Why deferred:* trimming before the results land means cutting prose twice.
*Unblocked by:* the calibration results. Then cut once, from a complete
draft.

### Second-lens framing in §6.6
Recorded as a limitation rather than an experiment. Reconsider only if a
reviewer treats the concession as fatal rather than as scoping.

## Closed, kept for the record

- **`npm run calibrate` TypeScript harness** — retired. Its ordinal α was
  missing a square and was not Krippendorff's metric. The Python tool in the
  paper repo is the single implementation. See ADR-0042.
- **Training on the pilot's own labels** — prohibited, not deferred.
  Circularity, unreliable targets, and leakage by construction. ADR-0041
  rule 6.
- **Acceptance-theory framing (TOE, UTAUT, TAM)** — considered and
  declined for the paper. Those explain adoption; this paper has no adoption
  evidence, and citing them would import a framework the data cannot support.
