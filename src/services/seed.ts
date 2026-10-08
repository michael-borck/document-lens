/**
 * Seed sustainability defaults on first launch.
 *
 * Creates: SDG / Pillar / Function lenses + their values; the SDG
 * keyword list (positive + counter) sourced from the Universities
 * keyword XLSX; the Wedding Cake Score scoring rule.
 *
 * Idempotent: checks for an existing SDG keyword list by source name
 * before doing anything; no-ops if defaults are already in place.
 *
 * Per design principle #9 (generalise the structure; ship sustainability
 * defaults). A new sustainability researcher opens the app and these
 * defaults are already loaded — zero configuration.
 */

import {
  createAxis,
  createAxisValue,
  listAxes,
} from './axes'
import {
  createKeywordList,
  createKeyword,
  setKeywordListAxes,
  setKeywordTag,
  listKeywordLists,
} from './keyword-lists'
import {
  createScoringRule,
  listScoringRules,
} from './scoring-rules'
import { SDGS, PILLARS, FUNCTIONS } from '@/data/sdg-meta'
import sustainabilityKeywords from '@/data/sustainability-keywords.json'
import v9SearchTerms from '@/data/v9-search-terms.json'
import type { Axis, AxisValue } from '@/types/data'

const SDG_KEYWORD_LIST_SOURCE = 'SDGs (Universities)'
const V9_LIST_SOURCE = 'SDG search stems (v9)'
const WEDDING_CAKE_SCORE_NAME = 'Wedding Cake Score'

interface SourceKeyword {
  sdg: number
  sdg_label: string
  text: string
  polarity: 'positive' | 'counter'
  note: string | null
}

interface SourceFile {
  positive: SourceKeyword[]
  counter: SourceKeyword[]
}

const KEYWORD_DATA = sustainabilityKeywords as SourceFile

/**
 * The researchers' own v9 search-term sheet (ADR-0038 seed source).
 * Stems are verbatim from the coding-sheet template — several are
 * deliberately truncated words ("marginalis", "recycl"), so every v9
 * keyword is seeded with prefix match mode (ADR-0037), faithful to the
 * wildcard search their instrument used.
 */
interface V9Entry {
  cluster: string
  sdg: number
  shortName: string
  stems: string[]
  counterStems: string[]
  counterNote: string
}

const V9_DATA = v9SearchTerms as {
  source: string
  rules: string[]
  entries: V9Entry[]
}

export interface SeedResult {
  alreadySeeded: boolean
  lensesCreated: number
  keywordsCreated: number
  scoringRulesCreated: number
}

// In-flight guard: React StrictMode double-mounts effects in dev, and without
// this two concurrent seeds both pass the idempotency check below and the
// second dies on UNIQUE constraints (harmless but noisy — and a real tauri dev
// session shows it too). Concurrent callers share one seed run.
let inFlight: Promise<SeedResult> | null = null

export function seedSustainabilityDefaults(): Promise<SeedResult> {
  if (!inFlight) {
    inFlight = runSeed().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

async function runSeed(): Promise<SeedResult> {
  // Idempotency check: if the SDG keyword list is already there, bail out.
  const existingLists = await listKeywordLists()
  if (existingLists.some((l) => l.source === SDG_KEYWORD_LIST_SOURCE)) {
    return { alreadySeeded: true, lensesCreated: 0, keywordsCreated: 0, scoringRulesCreated: 0 }
  }

  // ------------------------------------------------------------------
  // 1. Create the three built-in lenses + their values
  // ------------------------------------------------------------------

  const sdgAxis = await createAxis({
    name: 'SDG',
    description: 'UN Sustainable Development Goals 1–17. Each keyword in the SDG list carries one or more SDG values.',
    type: 'keyword-attached',
    isHierarchical: false,
    isBuiltin: true,
  })

  const pillarAxis = await createAxis({
    name: 'Pillar',
    description: 'Wedding Cake model: Biosphere supports Society which supports Economy, with Partnership as connector. Derived from each keyword\'s SDG value.',
    type: 'keyword-attached',
    isHierarchical: false,
    isBuiltin: true,
  })

  const functionAxis = await createAxis({
    name: 'Function',
    description: 'Universities delivery functions: Research, Teaching/curriculum, Engagement, Campus operations, Governance. Inferred per section via embedding similarity (deterministic, batch-friendly). Cross-cutting is a human-only override, never classified (ADR-0033).',
    type: 'document-context',
    isHierarchical: false,
    isBuiltin: true,
  })

  // SDG values: 1–17 with display names from SDG metadata
  const sdgValueByNumber = new Map<number, AxisValue>()
  for (const sdg of SDGS) {
    const value = await createAxisValue({
      axisId: sdgAxis.id,
      value: String(sdg.number),
      displayName: `SDG ${sdg.number} — ${sdg.name}`,
      sortOrder: sdg.number,
    })
    sdgValueByNumber.set(sdg.number, value)
  }

  // Pillar values: biosphere / society / economy / partnership
  const pillarValueByKey = new Map<string, AxisValue>()
  for (const p of PILLARS) {
    const value = await createAxisValue({
      axisId: pillarAxis.id,
      value: p.value,
      displayName: p.displayName,
      description: p.description,
      sortOrder: p.sortOrder,
    })
    pillarValueByKey.set(p.value, value)
  }

  // Function values: research / teaching / engagement / operations / governance
  for (const f of FUNCTIONS) {
    await createAxisValue({
      axisId: functionAxis.id,
      value: f.value,
      displayName: f.displayName,
      description: f.description,
      sortOrder: f.sortOrder,
    })
  }

  // ------------------------------------------------------------------
  // 2. Create the SDG keyword list and seed its keywords + tags
  // ------------------------------------------------------------------

  const sdgList = await createKeywordList({
    name: 'SDGs (Universities)',
    description: 'UN Sustainable Development Goals — keyword set curated for university annual reports and strategies. Includes both positive (signals SDG delivery) and counter (signals misalignment / greenwashing) keywords.',
    type: 'built-in',
    source: SDG_KEYWORD_LIST_SOURCE,
  })

  // The SDG list's keywords carry SDG and Pillar tags.
  await setKeywordListAxes(sdgList.id, [sdgAxis.id, pillarAxis.id])

  let keywordsCreated = 0
  for (const polarity of ['positive', 'counter'] as const) {
    const source = polarity === 'positive' ? KEYWORD_DATA.positive : KEYWORD_DATA.counter
    let order = 0
    for (const entry of source) {
      const sdgMeta = SDGS.find((s) => s.number === entry.sdg)
      if (!sdgMeta) continue // skip if SDG number is somehow invalid
      const sdgValue = sdgValueByNumber.get(entry.sdg)
      const pillarValue = pillarValueByKey.get(sdgMeta.pillar)
      if (!sdgValue || !pillarValue) continue

      const keyword = await createKeyword({
        listId: sdgList.id,
        text: entry.text,
        polarity,
        notes: entry.note ?? undefined,
        sortOrder: order++,
      })
      await setKeywordTag(keyword.id, sdgAxis.id, sdgValue.id)
      await setKeywordTag(keyword.id, pillarAxis.id, pillarValue.id)
      keywordsCreated++
    }
  }

  // ------------------------------------------------------------------
  // 2b. Seed the researchers' v9 search-term list (ADR-0038). Their own
  // stems, prefix match mode; counter terms are the UNAMBIGUOUS
  // transgression lists only. The SDG 13/7 climate counter-list is tagged
  // to BOTH SDGs (sheet rule: one boundary, count once, file by domain).
  // ------------------------------------------------------------------

  if (!existingLists.some((l) => l.source === V9_LIST_SOURCE)) {
    const v9List = await createKeywordList({
      name: 'SDG search terms (v9)',
      description:
        'The Planetary Universities research instrument: neutral SDG search stems and unambiguous countervailing terms, verbatim from the coding-sheet template (v9). Stems match by word-start (prefix) — several are deliberately truncated. Framing, prominence and provenance are human-coded afterwards (see the Coding Legend).',
      type: 'built-in',
      source: V9_LIST_SOURCE,
    })
    await setKeywordListAxes(v9List.id, [sdgAxis.id, pillarAxis.id])

    for (const entry of V9_DATA.entries) {
      const sdgMeta = SDGS.find((s) => s.number === entry.sdg)
      const sdgValue = sdgValueByNumber.get(entry.sdg)
      const pillarValue = sdgMeta ? pillarValueByKey.get(sdgMeta.pillar) : null
      if (!sdgMeta || !sdgValue) continue

      // SDG 13's climate/energy counter-list is shared with SDG 7.
      const sharedSdg = entry.sdg === 13 ? 7 : null
      const sharedSdgValue = sharedSdg ? sdgValueByNumber.get(sharedSdg) : null
      const sharedSdgMeta = sharedSdg ? SDGS.find((s) => s.number === sharedSdg) : null
      const sharedPillarValue = sharedSdgMeta ? pillarValueByKey.get(sharedSdgMeta.pillar) : null

      for (const stem of entry.stems) {
        const kw = await createKeyword({
          listId: v9List.id,
          text: stem,
          polarity: 'positive',
          matchMode: 'prefix',
          sortOrder: keywordsCreated,
        })
        await setKeywordTag(kw.id, sdgAxis.id, sdgValue.id)
        if (pillarValue) await setKeywordTag(kw.id, pillarAxis.id, pillarValue.id)
        keywordsCreated++
      }
      for (const stem of entry.counterStems) {
        const kw = await createKeyword({
          listId: v9List.id,
          text: stem,
          polarity: 'counter',
          matchMode: 'prefix',
          notes: entry.counterNote || undefined,
          sortOrder: keywordsCreated,
        })
        await setKeywordTag(kw.id, sdgAxis.id, sdgValue.id)
        if (pillarValue) await setKeywordTag(kw.id, pillarAxis.id, pillarValue.id)
        if (sharedSdgValue) await setKeywordTag(kw.id, sdgAxis.id, sharedSdgValue.id)
        if (sharedPillarValue) await setKeywordTag(kw.id, pillarAxis.id, sharedPillarValue.id)
        keywordsCreated++
      }
    }
  }

  // ------------------------------------------------------------------
  // 3. Create the Wedding Cake Score scoring rule
  // ------------------------------------------------------------------

  const scoringRulesCreated = await seedWeddingCakeScore(
    sdgAxis.id,
    pillarAxis.id,
    functionAxis.id
  )

  return {
    alreadySeeded: false,
    lensesCreated: 3,
    keywordsCreated,
    scoringRulesCreated,
  }
}

async function seedWeddingCakeScore(
  sdgLensId: string,
  pillarLensId: string,
  functionLensId: string
): Promise<number> {
  // Idempotency: skip if a rule with this name (or the legacy '5-level' name) already exists.
  const existing = await listScoringRules()
  if (existing.some((r) => r.name === WEDDING_CAKE_SCORE_NAME || r.name === '5-level Wedding Cake Score')) return 0

  // Definition shape (interpreted by the rule evaluator, not by SQL).
  // Rule logic: count how many Function values (Research, Teaching/
  // curriculum, Engagement, Campus operations, Governance) have keyword
  // matches in ALL THREE pillars (Biosphere, Society, Economy) —
  // Partnership is excluded from the requirement. Result is the count
  // (0–5), mapped to Levels 0–5 over a 3 × 5 = 15-cell coverage grid
  // (ADR-0033).
  const definition = {
    type: 'wedding-cake',
    version: 1,
    sdgLensId,
    pillarLensId,
    functionLensId,
    requiredPillars: ['biosphere', 'society', 'economy'],
    countAxis: 'function',
  }

  const outputLevels = [
    { value: 0, label: 'Level 0', description: 'No delivery function delivered economic, environmental and social SDGs at the same time.' },
    { value: 1, label: 'Level 1', description: 'One delivery function delivered economic, environmental and social SDGs at the same time.' },
    { value: 2, label: 'Level 2', description: 'Two delivery functions delivered economic, environmental and social SDGs at the same time.' },
    { value: 3, label: 'Level 3', description: 'Three delivery functions delivered economic, environmental and social SDGs at the same time.' },
    { value: 4, label: 'Level 4', description: 'Four delivery functions delivered economic, environmental and social SDGs at the same time.' },
    { value: 5, label: 'Level 5', description: 'All five delivery functions delivered economic, environmental and social SDGs at the same time.' },
  ]

  await createScoringRule({
    name: WEDDING_CAKE_SCORE_NAME,
    description: 'For each delivery Function (Research, Teaching/curriculum, Engagement, Campus operations, Governance), check whether the document delivers SDGs in all three Pillars (Biosphere, Society, Economy) simultaneously. The score is the count of Functions that satisfy this — Level 0 (none) to Level 5 (all five).',
    isBuiltin: true,
    definition,
    outputLevels,
  })

  return 1
}

/**
 * Helper exposed to UI / tests: have any of the built-in axes been
 * seeded? Used to gate the seeding call so we don't run it on every
 * app launch when the user already has the defaults.
 */
export async function hasBuiltinAxes(): Promise<boolean> {
  const axes = await listAxes()
  return axes.some((a: Axis) => a.isBuiltin)
}
