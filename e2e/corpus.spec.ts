/**
 * Corpus acceptance test (ADR-0028): import the synthetic test corpus through
 * the real backend, then check Compare and Focus against the manifest's
 * relative expectations — the same expectations the unit test asserts over
 * the markdown sources, here verified through the full app pipeline
 * (PDF extraction → SQLite → Compare/Focus UI).
 *
 * Prerequisites (skips itself when missing):
 *   - corpus PDFs built: `npm run build:corpus`
 *   - document-analyser backend reachable (sibling checkout in dev)
 *
 * Evidence reuse needs multi-SDG keywords; the manifest's `extra_sdg_tags`
 * are applied through the app's own IPC query registry (the same writes the
 * Keywords page would make) before running Compare.
 */
import { test, expect, waitForBackendReady, ROOT } from './fixtures'
import type { Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const CORPUS = path.join(ROOT, 'samples', 'test-corpus')
const manifest = JSON.parse(readFileSync(path.join(CORPUS, 'corpus-manifest.json'), 'utf8')) as {
  extra_sdg_tags: Record<string, number[] | string>
  documents: Array<{ id: string; company: string; year: number }>
  expectations: {
    orderings: Array<{ signal: string; higher: string; lower: string; why: string }>
    trends: Array<{ signal: string; company: string; direction: 'rising' | 'falling'; strict: boolean }>
  }
}
const PDFS = manifest.documents.map((d) => path.join(CORPUS, 'pdf', `${d.id}.pdf`))

// Documents surface in the app under their PDF-metadata title (stamped from
// the markdown frontmatter by the build script), not their filename.
const TITLE_BY_ID = new Map<string, string>(
  manifest.documents.map((d) => {
    const raw = readFileSync(path.join(CORPUS, 'docs', `${d.id}.md`), 'utf8')
    const m = raw.match(/^title:\s*(.+)$/m)
    if (!m) throw new Error(`no frontmatter title in ${d.id}.md`)
    return [d.id, m[1].trim()]
  })
)

/** Compare-metric option label per manifest signal name. */
const METRIC_OPTIONS: Record<string, string> = {
  repetition: 'Repetition (matches ÷ unique keyword)',
  diversity: 'Diversity (keyword breadth)',
  intensity: 'Intensity (matches / 1k words)',
  evidence_reuse: 'Evidence reuse (multi-pillar %)',
}

interface CompareRow { title: string; year: number | null; value: number }

/** Select a Compare metric, run it, and harvest the Underlying-data table. */
async function runCompare(page: Page, optionLabel: string): Promise<CompareRow[]> {
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: optionLabel }).click()
  await page.getByRole('button', { name: /run compare|re-run/i }).click()
  const details = page.locator('details', { hasText: 'Underlying data' })
  await expect(details).toBeVisible({ timeout: 60_000 })
  if (!(await details.locator('table').isVisible())) {
    await details.locator('summary').click()
  }
  const rows: CompareRow[] = []
  for (const tr of await details.locator('tbody tr').all()) {
    const cells = await tr.locator('td').allInnerTexts()
    rows.push({
      title: cells[1].trim(),
      year: cells[2].trim() === '—' ? null : Number(cells[2]),
      value: Number(cells[5].replace(/[%,]/g, '')),
    })
  }
  return rows
}

const rowFor = (rows: CompareRow[], docId: string): CompareRow => {
  const title = TITLE_BY_ID.get(docId)!
  const row = rows.find((r) => r.title === title)
  expect(row, `no Compare row titled "${title}" (${docId})`).toBeTruthy()
  return row!
}

test('corpus import: Compare and Focus reproduce the manifest expectations', async ({
  app,
  page,
}, testInfo) => {
  test.slow()
  test.skip(!PDFS.every(existsSync), 'corpus PDFs not built — run `npm run build:corpus` first')

  const ready = await waitForBackendReady(page, 150_000)
  test.skip(!ready, 'analysis backend not reachable — skipping')

  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths })
    dialog.showOpenDialogSync = () => paths
  }, PDFS)

  // --- Create a project and import the 13 corpus PDFs ----------------------
  await page.getByRole('button', { name: /create your first project/i }).click()
  await page.getByPlaceholder(/SDG Reports/i).fill('Corpus Check')
  await page.getByRole('button', { name: 'Next' }).click()

  const dialog = page.getByRole('dialog')
  await page.getByRole('button', { name: /import new documents/i }).first().click()

  // Small single-page PDFs; still give the backend room.
  for (const probe of ['Veridia Metals', 'Atlas University', 'Annual Report 2024']) {
    await expect(dialog.getByRole('checkbox', { name: new RegExp(probe, 'i') }).first()).toBeVisible({
      timeout: 4 * 60_000,
    })
  }
  for (const box of await dialog.getByRole('checkbox').all()) {
    if (!(await box.isChecked())) await box.check()
  }
  await expect(dialog.getByText(`${PDFS.length} selected`)).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: /create/i }).click()
  await expect(page.getByRole('link', { name: 'Compare', exact: true })).toBeVisible()

  // --- Apply the manifest's extra SDG tags (multi-pillar buzzwords) --------
  // Through the app's own keyed query registry — the same writes the
  // Keywords page makes when a researcher adds a tag.
  // A second SDG implies the corresponding Pillar tag too (Wedding Cake
  // mapping) — Compare's evidence reuse counts multi-tags on the list's
  // first declared axis, so tag both axes like a researcher would.
  const PILLAR_BY_SDG: Record<number, string> = {
    1: 'society', 2: 'society', 3: 'society', 4: 'society', 5: 'society',
    6: 'biosphere', 7: 'society', 8: 'economy', 9: 'economy', 10: 'economy',
    11: 'society', 12: 'economy', 13: 'biosphere', 14: 'biosphere',
    15: 'biosphere', 16: 'society', 17: 'partnership',
  }
  const tagged = await page.evaluate(async ({ extraTags, pillarBySdg }) => {
    const el = window.electron!
    const lenses = (await el.dbSelect('lenses.list', [])) as Array<{ id: string; name: string }>
    const sdgAxis = lenses.find((l) => l.name === 'SDG')
    const pillarAxis = lenses.find((l) => l.name === 'Pillar')
    if (!sdgAxis || !pillarAxis) return 'missing SDG/Pillar axis'
    const sdgValues = (await el.dbSelect('lenses.listValues', [sdgAxis.id])) as Array<{ id: string; value: string }>
    const pillarValues = (await el.dbSelect('lenses.listValues', [pillarAxis.id])) as Array<{ id: string; value: string }>
    const sdgValueByNum = new Map(sdgValues.map((v) => [v.value, v.id]))
    const pillarValueByKey = new Map(pillarValues.map((v) => [v.value, v.id]))
    const lists = (await el.dbSelect('keywordLists.list', [])) as Array<{ id: string; source: string | null }>
    const list = lists.find((l) => l.source === 'SDGs (Universities)')
    if (!list) return 'no seeded keyword list'
    const kws = (await el.dbSelect('keywords.listByList', [list.id])) as Array<{ id: string; text: string }>
    let applied = 0
    for (const [text, sdgs] of Object.entries(extraTags)) {
      if (!Array.isArray(sdgs)) continue
      const kw = kws.find((k) => k.text === text)
      if (!kw) continue
      for (const n of sdgs) {
        const sdgValueId = sdgValueByNum.get(String(n))
        const pillarValueId = pillarValueByKey.get(pillarBySdg[n])
        if (!sdgValueId || !pillarValueId) continue
        await el.dbRunKeyed('keywords.addTag', [kw.id, sdgAxis.id, sdgValueId])
        await el.dbRunKeyed('keywords.addTag', [kw.id, pillarAxis.id, pillarValueId])
        applied++
      }
    }
    return applied
  }, { extraTags: manifest.extra_sdg_tags, pillarBySdg: PILLAR_BY_SDG })
  expect(typeof tagged, `extra-tag setup failed: ${tagged}`).toBe('number')
  expect(tagged as number).toBeGreaterThanOrEqual(5)

  // --- Compare: manifest orderings + trends, straight off the data table ---
  await page.getByRole('link', { name: 'Compare', exact: true }).click()
  const rowsBySignal = new Map<string, CompareRow[]>()
  for (const [signal, option] of Object.entries(METRIC_OPTIONS)) {
    rowsBySignal.set(signal, await runCompare(page, option))
    await page.screenshot({ path: testInfo.outputPath(`compare-${signal}.png`), fullPage: true })
  }

  for (const o of manifest.expectations.orderings) {
    const rows = rowsBySignal.get(o.signal)
    if (!rows) continue // signals Compare doesn't chart 1:1 (counter_matches, pillars_covered)
    const higher = rowFor(rows, o.higher)
    const lower = rowFor(rows, o.lower)
    expect(
      higher.value,
      `${o.signal}: expected ${o.higher} (${higher.value}) > ${o.lower} (${lower.value}) — ${o.why}`
    ).toBeGreaterThan(lower.value)
  }

  for (const t of manifest.expectations.trends) {
    const rows = rowsBySignal.get(t.signal)
    if (!rows) continue
    const series = manifest.documents
      .filter((d) => d.company === t.company)
      .sort((a, b) => a.year - b.year)
      .map((d) => ({ year: d.year, value: rowFor(rows, d.id).value }))
    const label = series.map((s) => `${s.year}: ${s.value}`).join(', ')
    if (t.strict) {
      for (let i = 1; i < series.length; i++) {
        if (t.direction === 'rising') {
          expect(series[i].value, `${t.company} ${t.signal} (${label})`).toBeGreaterThan(series[i - 1].value)
        } else {
          expect(series[i].value, `${t.company} ${t.signal} (${label})`).toBeLessThan(series[i - 1].value)
        }
      }
    } else {
      const [first, last] = [series[0], series[series.length - 1]]
      if (t.direction === 'rising') {
        expect(last.value, `${t.company} ${t.signal} (${label})`).toBeGreaterThan(first.value)
      } else {
        expect(last.value, `${t.company} ${t.signal} (${label})`).toBeLessThan(first.value)
      }
    }
  }

  // --- Focus: the designed extremes should top their signal cards ----------
  await page.getByRole('link', { name: 'Focus', exact: true }).click()
  await page.getByRole('button', { name: /rank documents/i }).click()
  await expect(page.getByText('Per-signal extremes')).toBeVisible({ timeout: 60_000 })

  const extremeHigh = async (signalLabel: string) => {
    const card = page
      .locator('div.border.rounded-md', { has: page.getByText(signalLabel, { exact: true }) })
      .first()
    return (await card.locator('div.text-xs').first().innerText()).toLowerCase()
  }
  expect(await extremeHigh('Repetition')).toContain('bluegum grocers')
  expect(await extremeHigh('Evidence reuse')).toContain('veridia metals')
  expect(await extremeHigh('Diversity')).toContain('atlas university')

  // The greenwashing exemplar must surface in the notable ranking.
  const notable = page.locator('ol li')
  await expect(notable.first()).toBeVisible()
  const notableText = (await page.locator('ol').innerText()).toLowerCase()
  expect(notableText, 'Veridia (greenwash exemplar) missing from notable documents').toContain('veridia metals')

  await page.screenshot({ path: testInfo.outputPath('focus.png'), fullPage: true })
})
