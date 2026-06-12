/**
 * Capture documentation screenshots by driving the built app.
 *
 * Launches the real Electron app (playwright-core _electron) in a throwaway
 * profile (DOCLENS_USER_DATA), creates a sample project through the actual
 * first-run wizard, imports the PDFs from samples/, runs each workflow, and
 * writes one PNG per help topic to docs/screenshots/.
 *
 * Usage:
 *   npm run build:vite        # the script drives the built app
 *   npm run capture:help
 *
 * Notes:
 * - Needs the document-analyser backend reachable (dev mode spawns the
 *   sibling checkout automatically) for import + classification; workflows
 *   that can't produce data are still captured in their honest empty state.
 * - Every step is best-effort: a failed screen logs and is skipped so one
 *   flaky workflow doesn't sink the whole capture.
 */

import { _electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
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

const log = (...args) => console.log('[capture]', ...args)

async function main() {
  mkdirSync(OUT, { recursive: true })
  const profile = mkdtempSync(path.join(tmpdir(), 'doclens-capture-'))
  log('throwaway profile:', profile)

  const app = await _electron.launch({
    args: ['.'],
    cwd: ROOT,
    env: { ...process.env, DOCLENS_USER_DATA: profile },
  })

  try {
    // Mock the native open dialog so document import picks the sample PDFs.
    await app.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths })
      dialog.showOpenDialogSync = () => paths
    }, SAMPLES)

    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1280, height: 820 })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000) // seeding

    // Import + classification need the analysis backend — wait for it.
    log('waiting for the analysis backend…')
    {
      const deadline = Date.now() + 4 * 60_000
      let phase = 'unknown'
      while (Date.now() < deadline) {
        phase = await page
          .evaluate(() => window.electron?.getBackendStatus?.().then((s) => s.phase))
          .catch(() => 'unknown')
        if (phase === 'ready') break
        await page.waitForTimeout(2000)
      }
      log('backend phase:', phase)
    }

    const shot = async (id, extraWait = 800) => {
      await page.waitForTimeout(extraWait)
      await page.screenshot({ path: path.join(OUT, `${id}.png`) })
      log('shot:', id)
    }

    // --- First-run wizard (fresh profile guarantees the empty state) ---
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

    // Step 2: import the sample PDFs (mocked dialog). The wizard auto-selects
    // imported docs, so "N selected" is the completion signal.
    try {
      await page
        .getByRole('button', { name: /import new documents/i })
        .first()
        .click({ timeout: 5000 })
      log('importing samples (waits for backend extraction)…')
      await page
        .locator(`text=${SAMPLES.length} selected`)
        .waitFor({ timeout: 5 * 60_000 })
      log('samples imported')
    } catch (e) {
      log('import skipped:', e.message.split('\n')[0])
    }
    await page.getByRole('button', { name: /next|continue/i }).click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(600)
    await page
      .getByRole('button', { name: /create|finish|done|start/i })
      .first()
      .click({ timeout: 3000 })
      .catch(() => {})
    await page.waitForTimeout(2500)

    // --- Setup: run Function classification so Map's two-axis view has data.
    try {
      await page.getByRole('link', { name: 'Setup', exact: true }).click({ timeout: 3000 })
      const classify = page.getByRole('button', { name: /classify documents|re-classify/i }).first()
      if (await classify.count()) {
        log('running Function classification (can take a few minutes)…')
        await classify.scrollIntoViewIfNeeded()
        await classify.click({ timeout: 10_000 })
        const deadline = Date.now() + 6 * 60_000
        while (Date.now() < deadline) {
          await page.waitForTimeout(5000)
          const busy = await page
            .locator('text=/classifying|running/i')
            .count()
            .catch(() => 0)
          if (!busy) break
        }
      }
    } catch (e) {
      log('classification skipped:', e.message.split('\n')[0])
    }

    // --- Walk every workflow ---
    for (const { tab, id, run } of WORKFLOWS) {
      try {
        await page.getByRole('link', { name: tab, exact: true }).click({ timeout: 4000 })
        await page.waitForTimeout(1000)
        if (run) {
          const runBtn = page
            .getByRole('button', { name: /\b(run|re-run|analyse|analyze)\b/i })
            .first()
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
        log(`SKIPPED ${id}:`, e.message.split('\n')[0])
      }
    }

    log('captured files:', readdirSync(OUT).filter((f) => f.endsWith('.png')).join(', '))
  } finally {
    await app.close().catch(() => {})
    rmSync(profile, { recursive: true, force: true })
    log('profile cleaned up')
  }
}

main().catch((e) => {
  console.error('[capture] FAILED:', e)
  process.exit(1)
})
