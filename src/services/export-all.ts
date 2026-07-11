/**
 * Export all project data to a set of CSV files for research validation.
 *
 * Returns an array of { filename, content } objects. The caller is
 * responsible for writing them to disk (via window.electron.writeFile).
 *
 * Files produced:
 *   documents.csv        — project document inventory
 *   keyword-matches.csv  — per (document × keyword) match counts + lens tags
 *   score-breakdown.csv  — per (document × subject/category) detail (scoring rule required)
 *   track.csv            — year-by-year match and score aggregates
 */

import { stringifyCsv } from './csv'
import { loadProjectCorpus, type ProjectCorpus } from './_shared/project-corpus'
import { computeCoverage } from './coverage'
import { computeCoverage2D } from './coverage-2d'
import { evaluateScore } from './scoring'
import { getKeywordListAxes } from './keyword-lists'
import { getAxis, listAxisValues } from './axes'
import { getClassificationStatus } from './classification'
import { selectAll } from './db'
import type { Document, AxisValue, ScoringRule } from '@/types/data'

export interface ExportFile {
  filename: string
  content: string
}

export interface ExportAllInput {
  projectId: string
  keywordListId: string
  scoringRule: ScoringRule | null
}

export async function exportAllData(input: ExportAllInput): Promise<ExportFile[]> {
  const { projectId, keywordListId, scoringRule } = input
  const files: ExportFile[] = []

  const posCorpus = await loadProjectCorpus({ projectId, keywordListId, polarity: 'positive' })
  const cntCorpus = await loadProjectCorpus({ projectId, keywordListId, polarity: 'counter' })
  const docs = posCorpus.docs

  files.push(buildDocumentsCSV(docs))
  files.push(await buildKeywordMatchesCSV(docs, posCorpus, cntCorpus, keywordListId))

  if (scoringRule) {
    const breakdown = await buildScoreBreakdownCSV(projectId, keywordListId, scoringRule, docs)
    if (breakdown) files.push(breakdown)
  }

  files.push(await buildTrackCSV(docs, posCorpus, cntCorpus, projectId, keywordListId, scoringRule))

  return files
}

// ---------------------------------------------------------------------------
// documents.csv
// ---------------------------------------------------------------------------

function buildDocumentsCSV(docs: Document[]): ExportFile {
  const rows: Array<Array<string | number | null>> = [
    ['title', 'filename', 'year', 'company', 'sector', 'page_count', 'word_count'],
  ]
  for (const d of docs) {
    rows.push([
      d.title ?? '',
      d.filename,
      d.year ?? '',
      d.company ?? '',
      d.sector ?? '',
      d.pageCount ?? '',
      d.wordCount ?? '',
    ])
  }
  return { filename: 'documents.csv', content: stringifyCsv(rows) }
}

// ---------------------------------------------------------------------------
// keyword-matches.csv
// ---------------------------------------------------------------------------

interface KwTagRow {
  keyword_id: string
  value_id: string
}

async function buildKeywordMatchesCSV(
  docs: Document[],
  posCorpus: ProjectCorpus,
  cntCorpus: ProjectCorpus,
  keywordListId: string
): Promise<ExportFile> {
  const kwListLensIds = await getKeywordListAxes(keywordListId)

  // Resolve axis names and all their values
  const lensInfoById = new Map<string, { name: string; values: AxisValue[] }>()
  for (const lensId of kwListLensIds) {
    const axis = await getAxis(lensId)
    if (!axis) continue
    const values = await listAxisValues(lensId)
    lensInfoById.set(lensId, { name: axis.name, values })
  }

  // keyword_id → value_id[] per lens
  const kwTagsByLens = new Map<string, Map<string, string[]>>()
  for (const lensId of kwListLensIds) {
    const rows = await selectAll<KwTagRow>('keywords.tagsForList', [keywordListId, lensId])
    const map = new Map<string, string[]>()
    for (const row of rows) {
      const list = map.get(row.keyword_id) ?? []
      list.push(row.value_id)
      map.set(row.keyword_id, list)
    }
    kwTagsByLens.set(lensId, map)
  }

  // value_id → display name
  const valueDisplayById = new Map<string, string>()
  for (const { values } of lensInfoById.values()) {
    for (const v of values) valueDisplayById.set(v.id, v.displayName ?? v.value)
  }

  const lensColumnNames = kwListLensIds.map((id) => lensInfoById.get(id)?.name ?? id)

  const csvRows: Array<Array<string | number | null>> = [
    ['document', 'year', 'company', 'keyword', 'polarity', ...lensColumnNames, 'match_count'],
  ]

  for (const doc of docs) {
    for (const kw of posCorpus.keywords) {
      const count = posCorpus.countFor(doc.id, kw.id)
      const tagCols = kwListLensIds.map((lensId) => {
        const valueIds = kwTagsByLens.get(lensId)?.get(kw.id) ?? []
        return valueIds.map((id) => valueDisplayById.get(id) ?? id).join(' | ')
      })
      csvRows.push([doc.title ?? doc.filename, doc.year ?? '', doc.company ?? '', kw.text, 'positive', ...tagCols, count])
    }
    for (const kw of cntCorpus.keywords) {
      const count = cntCorpus.countFor(doc.id, kw.id)
      const tagCols = kwListLensIds.map((lensId) => {
        const valueIds = kwTagsByLens.get(lensId)?.get(kw.id) ?? []
        return valueIds.map((id) => valueDisplayById.get(id) ?? id).join(' | ')
      })
      csvRows.push([doc.title ?? doc.filename, doc.year ?? '', doc.company ?? '', kw.text, 'counter', ...tagCols, count])
    }
  }

  return { filename: 'keyword-matches.csv', content: stringifyCsv(csvRows) }
}

// ---------------------------------------------------------------------------
// score-breakdown.csv
// ---------------------------------------------------------------------------

async function buildScoreBreakdownCSV(
  projectId: string,
  keywordListId: string,
  scoringRule: ScoringRule,
  docs: Document[]
): Promise<ExportFile | null> {
  const def = scoringRule.definition as Record<string, unknown>
  const ruleType = def.type as string

  if (ruleType === 'cross-coverage' || ruleType === 'wedding-cake') {
    return buildCrossCoverageBreakdown(projectId, keywordListId, def, docs)
  }
  if (ruleType === 'coverage-count') {
    return buildCoverageCountBreakdown(projectId, keywordListId, def, docs)
  }
  return null
}

async function buildCrossCoverageBreakdown(
  projectId: string,
  keywordListId: string,
  def: Record<string, unknown>,
  // Kept for signature parity with the sibling breakdown builders; this one
  // resolves its documents by project, not from the passed list.
  _docs: Document[]
): Promise<ExportFile | null> {
  const layerLensId = (def.layerLensId ?? def.pillarLensId) as string | undefined
  const subjectLensId = (def.subjectLensId ?? def.functionLensId) as string | undefined
  const requiredLayerValueNames = (def.requiredLayers ?? def.requiredPillars ?? []) as string[]

  if (!layerLensId) return null

  // Determine mode (full cross-coverage or layer-only prerequisite)
  let isFull = false
  if (subjectLensId) {
    const status = await getClassificationStatus(projectId, subjectLensId)
    isFull = status.totalDocuments > 0 && status.classifiedDocuments === status.totalDocuments
  }

  if (isFull && subjectLensId) {
    // Full 2D breakdown: one row per (document × subject)
    const matrix = await computeCoverage2D({
      projectId,
      keywordListId,
      rowAxisId: layerLensId,
      colAxisId: subjectLensId,
      polarity: 'positive',
    })

    const requiredLayers = matrix.rowValues.filter((v) =>
      requiredLayerValueNames.includes(v.value)
    )
    const layerNames = requiredLayers.map((l) => `${l.displayName ?? l.value}_matches`)

    const csvRows: Array<Array<string | number | null>> = [
      [
        'document', 'year', 'company', 'subject',
        ...layerNames,
        'total_matches', 'all_required_covered', 'doc_score', 'doc_max',
      ],
    ]

    for (const doc of matrix.documents) {
      const cells = matrix.cells[doc.id] ?? {}
      const subjectCount = matrix.colValues.length
      let docScore = 0
      for (const subject of matrix.colValues) {
        if (requiredLayers.every((l) => (cells[l.id]?.[subject.id] ?? 0) > 0)) docScore++
      }

      for (const subject of matrix.colValues) {
        const layerCounts = requiredLayers.map((l) => cells[l.id]?.[subject.id] ?? 0)
        const totalMatches = layerCounts.reduce((a, n) => a + n, 0)
        const allCovered = layerCounts.every((n) => n > 0) ? 1 : 0
        csvRows.push([
          doc.title ?? doc.filename,
          doc.year ?? '',
          doc.company ?? '',
          subject.displayName ?? subject.value,
          ...layerCounts,
          totalMatches,
          allCovered,
          docScore,
          subjectCount,
        ])
      }
    }

    return { filename: 'score-breakdown.csv', content: stringifyCsv(csvRows) }
  }

  // v1-prerequisite: one row per (document × layer)
  const coverage = await computeCoverage({
    projectId,
    keywordListId,
    polarity: 'positive',
    axisId: layerLensId,
  })

  const layerValues = coverage.lensValues ?? []
  const requiredLayers = layerValues.filter((v) => requiredLayerValueNames.includes(v.value))

  const csvRows: Array<Array<string | number | null>> = [
    ['document', 'year', 'company', 'layer', 'match_count', 'is_required', 'covered', 'doc_score', 'doc_max', 'note'],
  ]

  for (const doc of coverage.documents) {
    const lensTotals = coverage.lensTotals?.[doc.id] ?? {}
    const metCount = requiredLayers.filter((l) => (lensTotals[l.id] ?? 0) > 0).length

    for (const layer of layerValues) {
      const count = lensTotals[layer.id] ?? 0
      const isRequired = requiredLayerValueNames.includes(layer.value) ? 1 : 0
      csvRows.push([
        doc.title ?? doc.filename,
        doc.year ?? '',
        doc.company ?? '',
        layer.displayName ?? layer.value,
        count,
        isRequired,
        count > 0 ? 1 : 0,
        metCount,
        requiredLayers.length,
        'layer-only (run Subject classification for full breakdown)',
      ])
    }
  }

  return { filename: 'score-breakdown.csv', content: stringifyCsv(csvRows) }
}

async function buildCoverageCountBreakdown(
  projectId: string,
  keywordListId: string,
  def: Record<string, unknown>,
  _docs: Document[]
): Promise<ExportFile | null> {
  const categoryLensId = def.categoryLensId as string | undefined
  if (!categoryLensId) return null

  const coverage = await computeCoverage({
    projectId,
    keywordListId,
    polarity: 'positive',
    axisId: categoryLensId,
  })

  const categories = coverage.lensValues ?? []

  const csvRows: Array<Array<string | number | null>> = [
    ['document', 'year', 'company', 'category', 'match_count', 'covered', 'doc_score', 'doc_max'],
  ]

  for (const doc of coverage.documents) {
    const lensTotals = coverage.lensTotals?.[doc.id] ?? {}
    const score = categories.filter((c) => (lensTotals[c.id] ?? 0) > 0).length

    for (const cat of categories) {
      const count = lensTotals[cat.id] ?? 0
      csvRows.push([
        doc.title ?? doc.filename,
        doc.year ?? '',
        doc.company ?? '',
        cat.displayName ?? cat.value,
        count,
        count > 0 ? 1 : 0,
        score,
        categories.length,
      ])
    }
  }

  return { filename: 'score-breakdown.csv', content: stringifyCsv(csvRows) }
}

// ---------------------------------------------------------------------------
// track.csv
// ---------------------------------------------------------------------------

async function buildTrackCSV(
  docs: Document[],
  posCorpus: ProjectCorpus,
  cntCorpus: ProjectCorpus,
  projectId: string,
  keywordListId: string,
  scoringRule: ScoringRule | null
): Promise<ExportFile> {
  type YearBucket = { posTot: number; cntTot: number; docCount: number; scoreSum: number; scoredDocs: number }
  const yearData = new Map<number, YearBucket>()

  for (const doc of docs) {
    if (doc.year === null) continue
    const b = yearData.get(doc.year) ?? { posTot: 0, cntTot: 0, docCount: 0, scoreSum: 0, scoredDocs: 0 }
    for (const kw of posCorpus.keywords) b.posTot += posCorpus.countFor(doc.id, kw.id)
    for (const kw of cntCorpus.keywords) b.cntTot += cntCorpus.countFor(doc.id, kw.id)
    b.docCount++
    yearData.set(doc.year, b)
  }

  let hasScoring = false
  if (scoringRule) {
    try {
      const scoreEval = await evaluateScore({
        projectId,
        keywordListId,
        definition: scoringRule.definition,
        polarity: 'positive',
      })
      hasScoring = true
      for (const doc of docs) {
        if (doc.year === null) continue
        const s = scoreEval.perDocument.get(doc.id)
        if (!s) continue
        const b = yearData.get(doc.year)
        if (!b) continue
        b.scoreSum += s.score
        b.scoredDocs++
      }
    } catch {
      // scoring not available — omit score column
    }
  }

  const csvRows: Array<Array<string | number>> = [
    ['year', 'doc_count', 'positive_matches', 'counter_matches', ...(hasScoring ? ['avg_score'] : [])],
  ]
  for (const [year, b] of Array.from(yearData.entries()).sort((a, b_) => a[0] - b_[0])) {
    const avgScore = b.scoredDocs > 0 ? +(b.scoreSum / b.scoredDocs).toFixed(2) : 0
    csvRows.push([year, b.docCount, b.posTot, b.cntTot, ...(hasScoring ? [avgScore] : [])])
  }

  return { filename: 'track.csv', content: stringifyCsv(csvRows) }
}
