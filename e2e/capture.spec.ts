/**
 * Help-screenshot capture (docs/screenshots/) — a Playwright "spec" run via
 * playwright.capture.config.ts, NOT part of the e2e gate.
 *
 * Boots the real renderer against the Node host harness (see fixtures.ts),
 * creates a sample project through the actual first-run wizard, imports the
 * PDFs from samples/, runs each workflow, and writes one PNG per help topic.
 *
 * Usage:  npm run capture:help   (builds the renderer, then captures)
 *
 * Every step is best-effort: a failed screen logs and is skipped so one flaky
 * workflow doesn't sink the whole capture. Without the backend (sibling
 * document-analyser checkout), import/classification are skipped and the
 * workflows are captured in their honest empty states.
 */
import { test, bootWithBackend, ROOT } from './fixtures'
import { mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'

const OUT = path.join(ROOT, 'docs', 'screenshots')
const SAMPLES = [
  path.join(ROOT, 'samples', '2023-Annual-Report.pdf'),
  path.join(ROOT, 'samples', '2024-annual-report.pdf'),
]
// The bundled samples are corporate annual reports (Wesfarmers 2023,
// Rio Tinto 2024) — name the demo project accordingly.
const PROJECT_NAME = 'Corporate Annual Reports'

// Workflows to capture: tab label → { id, run? } (run: click the analyse
// button and wait before shooting).
const WORKFLOWS = [
  { tab: 'Overview', id: 'overview' },
  { tab: 'Setup', id: 'setup' },
  { tab: 'Coverage', id: 'coverage', run: true },
  { tab: 'Map', id: 'map', run: true },
  { tab: 'Read', id: 'read' },
  { tab: 'Discover', id: 'discover', run: true },
  { tab: 'Score', id: 'score', run: true },
  { tab: 'Track', id: 'track', run: true },
  { tab: 'Compare', id: 'compare', run: true },
  { tab: 'Audit', id: 'audit', run: true },
  { tab: 'Gap', id: 'gap', run: true },
]

const log = (...args: unknown[]) => console.log('[capture]', ...args)
const firstLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0]

test('capture help screenshots', async ({ host, page }) => {
  mkdirSync(OUT, { recursive: true })

  const hasBackend = await bootWithBackend(page, host)
  log(hasBackend ? 'backend ready' : 'no backend — import/classification will be skipped')

  // The open dialog returns the sample PDFs for the rest of the run.
  host.mockOpenFileDialog(SAMPLES)

  const shot = async (id: string, extraWait = 800) => {
    await page.waitForTimeout(extraWait)
    await page.screenshot({ path: path.join(OUT, `${id}.png`) })
    log('shot:', id)
  }

  // --- First-run wizard (fresh in-memory DB guarantees the empty state) ---
  await page.getByRole('button', { name: /create your first project/i }).click()
  await page.waitForTimeout(600)
  await shot('wizard', 300)
  await page
    .getByPlaceholder(/SDG Reports/i)
    .or(page.locator('input').first())
    .first()
    .fill(PROJECT_NAME)
  await page.getByRole('button', { name: /next|continue/i }).click()
  await page.waitForTimeout(600)

  // Step 2: import the sample PDFs (stubbed dialog). "N selected" is the
  // completion signal.
  if (hasBackend) {
    try {
      await page
        .getByRole('button', { name: /import new documents/i })
        .first()
        .click({ timeout: 5000 })
      log('importing samples (waits for backend extraction)…')
      await page.locator(`text=${SAMPLES.length} selected`).waitFor({ timeout: 5 * 60_000 })
      log('samples imported')
    } catch (e) {
      log('import skipped:', firstLine(e))
    }
  }
  await page
    .getByRole('button', { name: /next|continue/i })
    .click({ timeout: 3000 })
    .catch(() => {})
  await page.waitForTimeout(600)
  await page
    .getByRole('button', { name: /create|finish|done|start/i })
    .first()
    .click({ timeout: 3000 })
    .catch(() => {})
  await page.waitForTimeout(2500)

  // --- Setup: run Function classification so Map's two-axis view has data.
  if (hasBackend) {
    try {
      await page.getByRole('link', { name: 'Setup', exact: true }).click({ timeout: 3000 })
      const classify = page.getByRole('button', { name: /classify documents|re-classify/i }).first()
      if (await classify.count()) {
        log('running Function classification (can take a few minutes)…')
        await classify.scrollIntoViewIfNeeded()
        await classify.click({ timeout: 10_000 })
        // Give the UI a moment to enter the busy state before polling.
        await page.waitForTimeout(3000)
        const deadline = Date.now() + 6 * 60_000
        while (Date.now() < deadline) {
          await page.waitForTimeout(5000)
          const busy = await page
            .locator('text=/classifying|running/i')
            .count()
            .catch(() => 0)
          if (!busy) break
        }
        log('classification done')
      }
    } catch (e) {
      log('classification skipped:', firstLine(e))
    }
  }

  // --- Walk every workflow ---
  for (const { tab, id, run } of WORKFLOWS) {
    try {
      await page.getByRole('link', { name: tab, exact: true }).click({ timeout: 4000 })
      await page.waitForTimeout(1000)
      if (run) {
        const runBtn = page.getByRole('button', { name: /\b(run|re-run|analyse|analyze)\b/i }).first()
        if (await runBtn.count().catch(() => 0)) {
          await runBtn.click({ timeout: 2500 }).catch(() => {})
          // Wait for the busy state to clear (spinner / running text).
          const deadline = Date.now() + 3 * 60_000
          while (Date.now() < deadline) {
            await page.waitForTimeout(2500)
            const busy = await page
              .locator('text=/running|computing|analysing|analyzing/i')
              .count()
              .catch(() => 0)
            if (!busy) break
          }
        }
      }
      await shot(id)
    } catch (e) {
      log(`SKIPPED ${id}:`, firstLine(e))
    }
  }

  // --- Keywords page (global nav — last, so we don't lose the project
  //     workspace context during the workflow walk above). Expand the first
  //     keyword to show the synonyms/exclusions/antonyms sub-sections.
  try {
    await page.getByRole('link', { name: 'Keywords', exact: true }).click({ timeout: 4000 })
    await page.waitForTimeout(1000)
    const expandBtn = page.locator('button[title="Show synonyms & exclusions"]').first()
    if (await expandBtn.count().catch(() => 0)) {
      await expandBtn.click({ timeout: 2000 })
      await page.waitForTimeout(600)
    }
    await shot('keywords')
  } catch (e) {
    log('SKIPPED keywords:', firstLine(e))
  }

  log('captured files:', readdirSync(OUT).filter((f) => f.endsWith('.png')).join(', '))
})
