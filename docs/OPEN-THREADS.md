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
