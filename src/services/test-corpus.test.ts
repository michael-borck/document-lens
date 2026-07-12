/**
 * Executable expectations for the synthetic test corpus (ADR-0028).
 *
 * Loads the Markdown sources in samples/test-corpus/docs, computes the
 * substance signals with the SAME pure functions the app uses
 * (substance.ts + keyword-match.ts) over the SAME shipped seed keywords,
 * and asserts every expectation in corpus-manifest.json. The manifest —
 * not this file — is the source of truth for what each document tests;
 * expectations are relative (orderings, trends) or generous bands so the
 * signal formulas can be tuned without rewriting the corpus.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  computeSubstanceSignals,
  evidenceReuseRatio,
  type SubstanceSignals,
} from './substance'
import { countConcept } from './_shared/keyword-match'
import { SDGS } from '@/data/sdg-meta'
import sustainabilityKeywords from '@/data/sustainability-keywords.json'

const CORPUS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../samples/test-corpus'
)

// ---------------------------------------------------------------------------
// Manifest + corpus loading
// ---------------------------------------------------------------------------

interface Manifest {
  keyword_list_source: string
  extra_sdg_tags: Record<string, number[] | string>
  documents: Array<{ id: string; company: string; year: number }>
  expectations: {
    orderings: Array<{ signal: string; higher: string; lower: string; why: string }>
    bands: Array<{ signal: string; doc: string; min?: number; max?: number }>
    trends: Array<{ signal: string; company: string; direction: 'rising' | 'falling'; strict: boolean }>
  }
}

const manifest: Manifest = JSON.parse(
  readFileSync(path.join(CORPUS_DIR, 'corpus-manifest.json'), 'utf8')
)

/** Strip YAML frontmatter; the body is what extraction would deliver. */
function loadDocBody(file: string): string {
  const raw = readFileSync(path.join(CORPUS_DIR, 'docs', file), 'utf8')
  return raw.replace(/^---\n[\s\S]*?\n---\n/, '')
}

// ---------------------------------------------------------------------------
// Keywords: the shipped seed set, exactly as seed.ts loads it
// ---------------------------------------------------------------------------

interface SeedKeyword {
  text: string
  polarity: 'positive' | 'counter'
  sdgs: Set<number>
}

function loadSeedKeywords(): SeedKeyword[] {
  const data = sustainabilityKeywords as {
    positive: Array<{ sdg: number; text: string }>
    counter: Array<{ sdg: number; text: string }>
  }
  const byKey = new Map<string, SeedKeyword>()
  for (const polarity of ['positive', 'counter'] as const) {
    for (const entry of data[polarity]) {
      const key = `${polarity}:${entry.text}`
      const existing = byKey.get(key)
      if (existing) existing.sdgs.add(entry.sdg)
      else byKey.set(key, { text: entry.text, polarity, sdgs: new Set([entry.sdg]) })
    }
  }
  // The manifest's extra SDG tags (cross-cutting buzzwords the researcher
  // tags with a second SDG) — what makes evidence reuse exercisable.
  for (const [text, sdgs] of Object.entries(manifest.extra_sdg_tags)) {
    if (!Array.isArray(sdgs)) continue // skip _comment
    for (const kw of byKey.values()) {
      if (kw.text === text) for (const s of sdgs) kw.sdgs.add(s)
    }
  }
  return [...byKey.values()]
}

const keywords = loadSeedKeywords()
const pillarBySdg = new Map(SDGS.map((s) => [s.number, s.pillar]))

// ---------------------------------------------------------------------------
// Per-document signal computation (mirrors compare.ts semantics)
// ---------------------------------------------------------------------------

interface DocSignals extends SubstanceSignals {
  id: string
  company: string
  year: number
  wordCount: number
  totalMatches: number
  counterMatches: number
  evidenceReuse: number
  pillarsCovered: number
}

function computeDoc(id: string, company: string, year: number): DocSignals {
  const text = loadDocBody(`${id}.md`)
  const wordCount = text.split(/\s+/).filter(Boolean).length

  let totalMatches = 0
  let uniqueKeywords = 0
  let counterMatches = 0
  let reuseMatches = 0
  const pillars = new Set<string>()

  for (const kw of keywords) {
    const n = countConcept(text, [kw.text])
    if (n === 0) continue
    totalMatches += n
    uniqueKeywords++
    if (kw.polarity === 'counter') counterMatches += n
    // Evidence reuse: matches on keywords tagged to >1 value of the first
    // keyword-attached axis (the SDG axis) — see compare.ts.
    if (kw.sdgs.size > 1) reuseMatches += n
    // Pillar coverage: base-SDG pillars of matched positive keywords.
    if (kw.polarity === 'positive') {
      for (const sdg of kw.sdgs) {
        const pillar = pillarBySdg.get(sdg)
        if (pillar) pillars.add(pillar)
      }
    }
  }

  const signals = computeSubstanceSignals({
    totalMatches,
    uniqueKeywords,
    enabledKeywords: keywords.length,
    wordCount,
  })

  return {
    id,
    company,
    year,
    wordCount,
    totalMatches,
    counterMatches,
    evidenceReuse: evidenceReuseRatio(reuseMatches, totalMatches),
    pillarsCovered: pillars.size,
    ...signals,
  }
}

const docs = new Map<string, DocSignals>(
  manifest.documents.map((d) => [d.id, computeDoc(d.id, d.company, d.year)])
)

function signalValue(doc: DocSignals, signal: string): number {
  switch (signal) {
    case 'repetition': return doc.repetition
    case 'diversity': return doc.diversity
    case 'intensity': return doc.intensity ?? 0
    case 'evidence_reuse': return doc.evidenceReuse
    case 'counter_matches': return doc.counterMatches
    case 'pillars_covered': return doc.pillarsCovered
    case 'total_matches': return doc.totalMatches
    default: throw new Error(`Unknown signal in manifest: ${signal}`)
  }
}

// ---------------------------------------------------------------------------
// Tests: the manifest, executed
// ---------------------------------------------------------------------------

describe('test corpus (ADR-0028)', () => {
  it('every manifest document has a markdown source, and vice versa', () => {
    const files = readdirSync(path.join(CORPUS_DIR, 'docs'))
      .filter((f) => f.endsWith('.md') && !f.startsWith('._'))
      .map((f) => f.replace(/\.md$/, ''))
      .sort()
    const ids = manifest.documents.map((d) => d.id).sort()
    expect(files).toEqual(ids)
  })

  it('every document actually exercises the keyword set (no dead fixtures)', () => {
    for (const doc of docs.values()) {
      expect(doc.totalMatches, `${doc.id} has no keyword matches`).toBeGreaterThan(0)
    }
  })

  describe('orderings', () => {
    for (const o of manifest.expectations.orderings) {
      it(`${o.signal}: ${o.higher} > ${o.lower} (${o.why})`, () => {
        const higher = signalValue(docs.get(o.higher)!, o.signal)
        const lower = signalValue(docs.get(o.lower)!, o.signal)
        expect(higher, `${o.signal} of ${o.higher} (${higher}) vs ${o.lower} (${lower})`).toBeGreaterThan(lower)
      })
    }
  })

  describe('bands', () => {
    for (const b of manifest.expectations.bands) {
      it(`${b.signal} of ${b.doc} within [${b.min ?? '-'}, ${b.max ?? '-'}]`, () => {
        const value = signalValue(docs.get(b.doc)!, b.signal)
        if (b.min !== undefined) expect(value).toBeGreaterThanOrEqual(b.min)
        if (b.max !== undefined) expect(value).toBeLessThanOrEqual(b.max)
      })
    }
  })

  describe('trends', () => {
    for (const t of manifest.expectations.trends) {
      it(`${t.signal} ${t.direction} for ${t.company}${t.strict ? ' (strictly monotonic)' : ' (endpoints)'}`, () => {
        const series = [...docs.values()]
          .filter((d) => d.company === t.company)
          .sort((a, b) => a.year - b.year)
          .map((d) => ({ year: d.year, value: signalValue(d, t.signal) }))
        expect(series.length).toBeGreaterThanOrEqual(2)
        const label = series.map((s) => `${s.year}: ${s.value.toFixed(2)}`).join(', ')
        if (t.strict) {
          for (let i = 1; i < series.length; i++) {
            const [prev, cur] = [series[i - 1], series[i]]
            if (t.direction === 'rising') {
              expect(cur.value, `${t.company} ${t.signal} not rising at ${cur.year} (${label})`).toBeGreaterThan(prev.value)
            } else {
              expect(cur.value, `${t.company} ${t.signal} not falling at ${cur.year} (${label})`).toBeLessThan(prev.value)
            }
          }
        } else {
          const [first, last] = [series[0], series[series.length - 1]]
          if (t.direction === 'rising') {
            expect(last.value, `${t.company} ${t.signal} endpoints (${label})`).toBeGreaterThan(first.value)
          } else {
            expect(last.value, `${t.company} ${t.signal} endpoints (${label})`).toBeLessThan(first.value)
          }
        }
      })
    }
  })
})
