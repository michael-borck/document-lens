/**
 * Score Evaluator — the single place a Scoring Rule turns a project's corpus
 * into per-document scores.
 *
 * Two scoring patterns are supported:
 *
 *   cross-coverage  (also registered as legacy 'wedding-cake')
 *     For each Subject value, check whether it has keyword matches in ALL
 *     required Layer values. Score = count of Subjects that pass.
 *     Falls back to v1-prerequisite (layer-only coverage) when subjects
 *     haven't been classified yet.
 *
 *   coverage-count
 *     Count how many Category values have at least one positive keyword
 *     match. Score = 0 to N (total category values). Single-axis / flat.
 *
 * Dispatch goes through the Rule Evaluator Registry keyed by definition.type,
 * so new rule types plug in without touching callers.
 */

import { computeCoverage } from './coverage'
import { computeCoverage2D } from './coverage-2d'
import { getClassificationStatus } from './classification'
import { listAxisValues } from './axes'
import { weddingCakeFull, weddingCakeV1, type DocScore } from './_shared/wedding-cake'
import { coverageCount } from './_shared/coverage-count'
import type { Document, KeywordPolarity, AxisValue, ScoringRuleDefinition } from '@/types/data'

export type { DocScore, TraceStep, TraceStatus } from './_shared/wedding-cake'

/** Which path an evaluator took, given the data available. */
export type ScoringMode = 'full' | 'v1-prerequisite'

export interface ScoreEvaluation {
  mode: ScoringMode
  documents: Document[]
  perDocument: Map<string, DocScore>
}

export interface EvaluateScoreInput {
  projectId: string
  keywordListId: string
  definition: ScoringRuleDefinition
  polarity: KeywordPolarity
}

type RuleEvaluator = (input: EvaluateScoreInput) => Promise<ScoreEvaluation>

// ---------------------------------------------------------------------------
// Cross-coverage evaluator (type: 'cross-coverage' | 'wedding-cake')
// ---------------------------------------------------------------------------

interface CrossCoverageDefinition {
  type?: string
  // Generic names used by new rules
  layerLensId?: string
  subjectLensId?: string
  requiredLayers?: string[]
  // Legacy names from the seeded Wedding Cake Score — treated as aliases
  pillarLensId?: string
  functionLensId?: string
  requiredPillars?: string[]
}

const crossCoverageEvaluator: RuleEvaluator = async (input) => {
  const def = input.definition as CrossCoverageDefinition
  // Resolve generic OR legacy field names
  const layerLensId = def.layerLensId ?? def.pillarLensId
  const subjectLensId = def.subjectLensId ?? def.functionLensId
  const requiredLayerValues = def.requiredLayers ?? def.requiredPillars ?? []

  if (!layerLensId) {
    throw new Error('cross-coverage rule requires a layer lens (layerLensId)')
  }

  const layerValues = await listAxisValues(layerLensId)
  const required = requiredLayerValues
    .map((name) => layerValues.find((v) => v.value === name))
    .filter((v): v is AxisValue => Boolean(v))

  const mode = await resolveCrossCoverageMode(input.projectId, subjectLensId)

  const perDocument = new Map<string, DocScore>()

  if (mode === 'full' && subjectLensId) {
    const subjectValues = await listAxisValues(subjectLensId)
    const matrix = await computeCoverage2D({
      projectId: input.projectId,
      keywordListId: input.keywordListId,
      rowAxisId: layerLensId,
      colAxisId: subjectLensId,
      polarity: input.polarity,
    })
    for (const doc of matrix.documents) {
      perDocument.set(doc.id, weddingCakeFull(matrix.cells[doc.id] ?? {}, required, subjectValues))
    }
    return { mode, documents: matrix.documents, perDocument }
  }

  const matrix = await computeCoverage({
    projectId: input.projectId,
    keywordListId: input.keywordListId,
    polarity: input.polarity,
    axisId: layerLensId,
  })
  for (const doc of matrix.documents) {
    perDocument.set(doc.id, weddingCakeV1(matrix.lensTotals?.[doc.id] ?? {}, required))
  }
  return { mode, documents: matrix.documents, perDocument }
}

async function resolveCrossCoverageMode(
  projectId: string,
  subjectLensId: string | undefined
): Promise<ScoringMode> {
  if (!subjectLensId) return 'v1-prerequisite'
  const status = await getClassificationStatus(projectId, subjectLensId)
  const allClassified = status.totalDocuments > 0 && status.classifiedDocuments === status.totalDocuments
  return allClassified ? 'full' : 'v1-prerequisite'
}

// ---------------------------------------------------------------------------
// Coverage-count evaluator (type: 'coverage-count')
// ---------------------------------------------------------------------------

interface CoverageCountDefinition {
  type?: string
  categoryLensId?: string
}

const coverageCountEvaluator: RuleEvaluator = async (input) => {
  const def = input.definition as CoverageCountDefinition
  if (!def.categoryLensId) {
    throw new Error('coverage-count rule requires a categoryLensId')
  }

  const categoryValues = await listAxisValues(def.categoryLensId)
  const matrix = await computeCoverage({
    projectId: input.projectId,
    keywordListId: input.keywordListId,
    polarity: input.polarity,
    axisId: def.categoryLensId,
  })

  const perDocument = new Map<string, DocScore>()
  for (const doc of matrix.documents) {
    perDocument.set(doc.id, coverageCount(matrix.lensTotals?.[doc.id] ?? {}, categoryValues))
  }
  return { mode: 'full', documents: matrix.documents, perDocument }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const REGISTRY: Record<string, RuleEvaluator> = {
  'cross-coverage': crossCoverageEvaluator,
  'wedding-cake': crossCoverageEvaluator, // legacy alias — existing DB records keep this type
  'coverage-count': coverageCountEvaluator,
}

export const SUPPORTED_RULE_TYPES = new Set(Object.keys(REGISTRY))

export async function evaluateScore(input: EvaluateScoreInput): Promise<ScoreEvaluation> {
  const type = (input.definition as { type?: string }).type
  const evaluator = type ? REGISTRY[type] : undefined
  if (!evaluator) {
    throw new Error(`Unsupported scoring rule type: ${type ?? '(none)'}`)
  }
  return evaluator(input)
}
