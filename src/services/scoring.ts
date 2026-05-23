/**
 * Score Evaluator — the single place a Scoring Rule turns a project's corpus
 * into per-document scores. Collapses the Wedding-Cake math + mode decision
 * that used to live, copied, in Track, Compare, and the Score page.
 *
 * Dispatch goes through the Rule Evaluator Registry, keyed by the rule
 * definition's `type`. Each evaluator owns its whole pipeline (resolve mode,
 * pick the matrices it needs, count) and leans on a pure inner core
 * (_shared/wedding-cake.ts) for the math. The generic shell never sees a
 * Pillar or a Function — so a new rule type plugs in without touching callers.
 */

import { computeCoverage } from './coverage'
import { computeCoverage2D } from './coverage-2d'
import { getClassificationStatus } from './classification'
import { listLensValues } from './lenses'
import { weddingCakeFull, weddingCakeV1, type DocScore } from './_shared/wedding-cake'
import type { Document, KeywordPolarity, LensValue, ScoringRuleDefinition } from '@/types/data'

export type { DocScore, TraceStep, TraceStatus } from './_shared/wedding-cake'

/** Which path an evaluator took, given the data available. */
export type ScoringMode = 'full' | 'v1-prerequisite'

export interface ScoreEvaluation {
  mode: ScoringMode
  /** Documents the score was computed over (those with usable coverage data). */
  documents: Document[]
  /** Per-document score + Evaluation Trace, keyed by document id. */
  perDocument: Map<string, DocScore>
}

export interface EvaluateScoreInput {
  projectId: string
  keywordListId: string
  /** Raw rule definition (carries `type` for dispatch). */
  definition: ScoringRuleDefinition
  polarity: KeywordPolarity
}

type RuleEvaluator = (input: EvaluateScoreInput) => Promise<ScoreEvaluation>

interface WeddingCakeDefinition {
  type?: string
  pillarLensId?: string
  functionLensId?: string
  requiredPillars?: string[]
}

const weddingCakeEvaluator: RuleEvaluator = async (input) => {
  const def = input.definition as WeddingCakeDefinition
  if (!def.pillarLensId) {
    throw new Error('wedding-cake rule requires a pillarLensId')
  }

  const pillarValues = await listLensValues(def.pillarLensId)
  const required = (def.requiredPillars ?? [])
    .map((name) => pillarValues.find((v) => v.value === name))
    .filter((v): v is LensValue => Boolean(v))

  // Mode: full when every document is Function-classified; else fall back to
  // the v1 Pillar-coverage prerequisite.
  const mode = await resolveWeddingCakeMode(input.projectId, def.functionLensId)

  const perDocument = new Map<string, DocScore>()

  if (mode === 'full' && def.functionLensId) {
    const functionValues = await listLensValues(def.functionLensId)
    const matrix = await computeCoverage2D({
      projectId: input.projectId,
      keywordListId: input.keywordListId,
      rowLensId: def.pillarLensId,
      colLensId: def.functionLensId,
      polarity: input.polarity,
    })
    for (const doc of matrix.documents) {
      perDocument.set(doc.id, weddingCakeFull(matrix.cells[doc.id] ?? {}, required, functionValues))
    }
    return { mode, documents: matrix.documents, perDocument }
  }

  const matrix = await computeCoverage({
    projectId: input.projectId,
    keywordListId: input.keywordListId,
    polarity: input.polarity,
    lensId: def.pillarLensId,
  })
  for (const doc of matrix.documents) {
    perDocument.set(doc.id, weddingCakeV1(matrix.lensTotals?.[doc.id] ?? {}, required))
  }
  return { mode, documents: matrix.documents, perDocument }
}

async function resolveWeddingCakeMode(
  projectId: string,
  functionLensId: string | undefined
): Promise<ScoringMode> {
  if (!functionLensId) return 'v1-prerequisite'
  const status = await getClassificationStatus(projectId, functionLensId)
  const allClassified = status.totalDocuments > 0 && status.classifiedDocuments === status.totalDocuments
  return allClassified ? 'full' : 'v1-prerequisite'
}

/** The Rule Evaluator Registry — one entry per scoring rule type. */
const REGISTRY: Record<string, RuleEvaluator> = {
  'wedding-cake': weddingCakeEvaluator,
}

/**
 * Evaluate a scoring rule over a project's documents. Dispatches on the rule
 * definition's `type`; throws for an unsupported type so callers surface a
 * clear "rule isn't supported here" message.
 */
export async function evaluateScore(input: EvaluateScoreInput): Promise<ScoreEvaluation> {
  const type = (input.definition as { type?: string }).type
  const evaluator = type ? REGISTRY[type] : undefined
  if (!evaluator) {
    throw new Error(`Unsupported scoring rule type: ${type ?? '(none)'}`)
  }
  return evaluator(input)
}
