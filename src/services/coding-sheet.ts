/**
 * Coding-sheet rows: one row per paragraph per goal (the v11 shape).
 *
 * Pure: no database, no filesystem. The CLI feeds it paragraphs from the engine
 * and a keyword list from a CSV; the desktop export dialog will feed it the
 * same things. The study's vocabulary and goal list live in that data.
 */

import {
  findCodingSpans,
  normaliseForCodingMatch,
  type CodingMatchMode,
} from './_shared/keyword-match'

export interface CodingKeyword {
  type: string
  sdg: string
  keyword: string
  mode: CodingMatchMode
  excludesBefore?: string[]
}

export interface CodingParagraph {
  page: number
  startOffset: number
  text: string
}

export interface CodingReport {
  /** Short code used in the Claim ID, e.g. ANU. */
  code: string
  /** Name as it goes in the sheet, e.g. ANU or Monash. */
  university: string
  /** Annual report or Strategic plan. */
  report: string
  year: number
  paragraphs: CodingParagraph[]
  /** PDF page -> printed page, from the engine's page map. */
  printedPage?: Record<number, number | null>
}

export type Goal = number | 'General'

export interface CodingRow {
  claim_id: string
  organization: string
  report: string
  year: number
  page: number
  printed_page: number | null
  primary_value: Goal
  keywords: string
  passage: string
  context: string
}

export interface FigureRow {
  claim_id: string
  has_figure: 'Yes'
}

const GOAL_ORDER: Goal[] = [6, 13, 14, 15, 'General']

function goalRank(goal: Goal): number {
  const rank = GOAL_ORDER.indexOf(goal)
  return rank === -1 ? GOAL_ORDER.length : rank
}

export function compareGoals(a: Goal, b: Goal): number {
  return goalRank(a) - goalRank(b)
}

function goalsFor(keyword: CodingKeyword): Goal[] {
  if (keyword.type === 'General') return ['General']
  if (keyword.sdg.includes('(')) {
    return (keyword.sdg.match(/[0-9]+/g) ?? []).map(Number) as Goal[]
  }
  const goal = Number(keyword.sdg)
  return Number.isFinite(goal) ? [goal] : []
}

/** A number with a unit. Conservative on purpose: a figure the coder can see. */
export function containsFigure(text: string): boolean {
  return /[0-9][0-9,.]*\s*(?:tco2|co2|tonnes?|per cent|%|hectares?|ha\b|kwh|mwh|gj\b|tj\b|kl\b|ml\b|megawatts?|mw\b)/i.test(
    text
  )
}

/**
 * Build the rows for one report.
 *
 * A row exists for every (paragraph, goal) pair the keyword list fires on.
 * Countervailing terms sit on their own goal's row. Netting terms sit on SDG 13,
 * and a term tagged `13 (15)` (biodiversity offsets) also joins an SDG 15 row
 * when that paragraph has one.
 */
export function buildCodingSheetRows(
  report: CodingReport,
  keywords: CodingKeyword[]
): { rows: CodingRow[]; figures: FigureRow[]; firedTerms: Set<string> } {
  const order = new Map(keywords.map((keyword, index) => [keyword.keyword, index]))
  const tag = /annual/i.test(report.report) ? 'AR' : 'SP'
  const rows: CodingRow[] = []
  const figures: FigureRow[] = []
  const firedTerms = new Set<string>()
  let sequence = 0

  report.paragraphs.forEach((paragraph, index) => {
    const text = normaliseForCodingMatch(paragraph.text)
    const fired = new Map<Goal, Set<string>>()
    const add = (goal: Goal, term: string) => {
      const terms = fired.get(goal) ?? new Set<string>()
      terms.add(term)
      fired.set(goal, terms)
    }
    const multiGoalNetting: CodingKeyword[] = []

    for (const keyword of keywords) {
      const spans = findCodingSpans(text, keyword.keyword, keyword.mode, {
        excludesBefore: keyword.excludesBefore,
      })
      if (spans.length === 0) continue
      firedTerms.add(keyword.keyword)
      const goals = goalsFor(keyword)
      if (keyword.type === 'Netting' && goals.length > 1) {
        multiGoalNetting.push(keyword)
        continue
      }
      for (const goal of goals) add(goal, keyword.keyword)
    }

    for (const keyword of multiGoalNetting) {
      const goals = goalsFor(keyword)
      const first = goals[0]
      if (first === undefined) continue
      add(first, keyword.keyword)
      const second = goals[1]
      if (second !== undefined && fired.has(second)) add(second, keyword.keyword)
    }

    if (fired.size === 0) return

    const previous = index > 0 ? (report.paragraphs[index - 1]?.text ?? '') : ''
    const next = report.paragraphs[index + 1]?.text ?? ''
    const context = [previous, next].filter(Boolean).join(' ')

    for (const goal of [...fired.keys()].sort(compareGoals)) {
      const terms = [...(fired.get(goal) ?? [])].sort(
        (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)
      )
      sequence += 1
      const claimId = `${report.code}-${report.year}-${tag}-${String(sequence).padStart(4, '0')}`
      rows.push({
        claim_id: claimId,
        organization: report.university,
        report: report.report,
        year: report.year,
        page: paragraph.page,
        printed_page: report.printedPage?.[paragraph.page] ?? null,
        primary_value: goal,
        keywords: terms.join('; '),
        passage: paragraph.text,
        context,
      })
      if (containsFigure(paragraph.text)) {
        figures.push({ claim_id: claimId, has_figure: 'Yes' })
      }
    }
  })

  return { rows, figures, firedTerms }
}
