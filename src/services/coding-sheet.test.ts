import { describe, expect, it } from 'vitest'

import {
  buildCodingSheetRows,
  compareGoals,
  containsFigure,
  type CodingKeyword,
  type CodingReport,
  type Goal,
} from './coding-sheet'
import {
  findCodingSpans,
  normaliseForCodingMatch,
} from './_shared/keyword-match'

function kw(
  keyword: string,
  sdg: string,
  type = 'SDG subject',
  mode: 'prefix' | 'word' | 'phrase' = 'prefix'
): CodingKeyword {
  return { keyword, sdg, type, mode }
}

const KEYWORDS: CodingKeyword[] = [
  kw('water', '6'),
  kw('climate', '13'),
  kw('emission', '13'),
  kw('biodiversity', '15'),
  kw('diesel', '13', 'Countervailing'),
  kw('offset', '13 (15)', 'Netting', 'phrase'),
  kw('SDGs', 'General', 'General'),
]

function report(texts: string[]): CodingReport {
  return {
    code: 'ANU',
    university: 'ANU',
    report: 'Annual report',
    year: 2025,
    paragraphs: texts.map((text, i) => ({ page: 10 + i, startOffset: i * 1000, text })),
    printedPage: { 10: 8, 11: 9, 12: null },
  }
}

describe('coding matching', () => {
  it('keeps SDG labels from over-matching a longer number', () => {
    const spans = findCodingSpans('SDG 13 and SDG 1 cover this.', 'SDG 1', 'phrase')
    expect(spans.map((s) => s.matched)).toEqual(['SDG 1'])
  })

  it('matches phrases across spaces, line-end hyphens and plurals', () => {
    for (const text of ['fossil fuel use', 'fossil -fuel use', 'fossil-fuel use', 'fossil fuels']) {
      expect(findCodingSpans(text, 'fossil fuel', 'phrase').length).toBe(1)
    }
    expect(findCodingSpans('fossilised fuel', 'fossil fuel', 'phrase')).toEqual([])
  })

  it('matches whole acronyms with an optional plural only', () => {
    expect(findCodingSpans('two LGCs and one LGC', 'LGC', 'word').length).toBe(2)
    expect(findCodingSpans('records and recreation', 'REC', 'word')).toEqual([])
    expect(findCodingSpans('two ACCUs', 'ACCU', 'word').length).toBe(1)
  })

  it('extends phrase endings so plurals are found', () => {
    expect(findCodingSpans('carbon credits', 'carbon credit', 'phrase').length).toBe(1)
  })

  it('drops a match a forbidden word immediately precedes', () => {
    expect(
      findCodingSpans('greenhouse gas emissions', 'gas', 'prefix', {
        excludesBefore: ['greenhouse'],
      })
    ).toEqual([])
    expect(
      findCodingSpans('gas boilers replaced the old plant', 'gas', 'prefix', {
        excludesBefore: ['greenhouse'],
      }).length
    ).toBe(1)
  })

  it('normalises subscripts and non-breaking spaces without moving offsets', () => {
    const original = '25\u00a0tonnes of CO\u2082 emitted'
    const normalised = normaliseForCodingMatch(original)
    expect(normalised).toBe('25 tonnes of CO2 emitted')
    expect(normalised.length).toBe(original.length)
    const span = findCodingSpans(normalised, 'CO2', 'prefix')[0]
    expect(original.slice(span.start, span.end)).toBe('CO\u2082')
  })
})

describe('buildCodingSheetRows', () => {
  it('makes one row per paragraph per goal, sharing the paragraph', () => {
    const { rows } = buildCodingSheetRows(
      report(['Water use fell while the climate strategy advanced.']),
      KEYWORDS
    )
    expect(rows.map((r) => r.primary_value)).toEqual([6, 13])
    expect(rows.every((r) => r.passage.includes('Water use'))).toBe(true)
    expect(rows.map((r) => r.keywords)).toEqual(['water', 'climate'])
    expect(rows.map((r) => r.claim_id)).toEqual(['ANU-2025-AR-0001', 'ANU-2025-AR-0002'])
  })

  it('puts countervailing and netting terms on their goal rows', () => {
    const { rows } = buildCodingSheetRows(
      report(['Diesel use continued.', 'The project was offset.']),
      KEYWORDS
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].primary_value).toBe(13)
    expect(rows[0].keywords).toBe('diesel')
    expect(rows[1].primary_value).toBe(13)
    expect(rows[1].keywords).toBe('offset')
  })

  it('adds an offset to an SDG 15 row when the paragraph has one', () => {
    const { rows } = buildCodingSheetRows(
      report(['Biodiversity offsets for the new building.']),
      KEYWORDS
    )
    expect(rows.map((r) => r.primary_value)).toEqual([13, 15])
    expect(rows[0].keywords).toBe('offset')
    expect(rows[1].keywords).toBe('biodiversity; offset')
  })

  it('sorts goals in sheet order and General last', () => {
    const goals: Goal[] = [15, 'General', 6, 13]
    expect(goals.sort(compareGoals)).toEqual([6, 13, 15, 'General'])
  })

  it('uses the neighbouring paragraphs as context', () => {
    const { rows } = buildCodingSheetRows(
      report(['Before.', 'Water use fell.', 'After.']),
      KEYWORDS
    )
    expect(rows[0].context).toBe('Before. After.')
  })

  it('maps PDF pages to printed pages and flags figures', () => {
    const { rows, figures } = buildCodingSheetRows(
      report(['Water use fell 12 per cent.']),
      KEYWORDS
    )
    expect(rows[0].printed_page).toBe(8)
    expect(figures).toEqual([{ claim_id: 'ANU-2025-AR-0001', has_figure: 'Yes' }])
  })

  it('detects figures only when a number carries a unit', () => {
    expect(containsFigure('269 tCO2e this year')).toBe(true)
    expect(containsFigure('12 per cent')).toBe(true)
    expect(containsFigure('Scope 1 and 2')).toBe(false)
  })

  it('reports which terms fired anywhere', () => {
    const { firedTerms } = buildCodingSheetRows(
      report(['Water use fell.']),
      KEYWORDS
    )
    expect([...firedTerms]).toEqual(['water'])
  })
})
