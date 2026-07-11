/**
 * Full happy-path acceptance test: import real PDFs through the backend.
 *
 * This is the flow the DSR paper's §7.1 naturalistic evaluation rests on. It
 * needs the document-analyser backend (a sibling checkout in dev, the bundled
 * PyInstaller binary in prod) for PDF extraction, so it SKIPS itself when the
 * backend isn't reachable — CI without the ML stack stays green, and it runs for
 * real wherever the backend is up.
 *
 * The native file-open dialog is mocked (as in scripts/capture-help-
 * screenshots.mjs) so import picks the bundled sample PDFs headlessly.
 *
 * HARD assertions cover import → extraction → docs attached to the project (a
 * full renderer ↔ main ↔ backend ↔ SQLite round-trip). Function classification
 * and scoring are embedding-heavy and take minutes over full annual reports, so
 * they're exercised BEST-EFFORT (clicked + screenshotted) rather than gated on —
 * an automated acceptance guard shouldn't hinge on a multi-minute CPU run.
 */
import { test, expect, waitForBackendReady, ROOT } from './fixtures'
import path from 'node:path'

const SAMPLES = [
  path.join(ROOT, 'samples', '2023-Annual-Report.pdf'),
  path.join(ROOT, 'samples', '2024-annual-report.pdf'),
]

test('imports sample PDFs into a project via the backend, then reaches the workspace', async ({
  app,
  page,
}, testInfo) => {
  test.slow() // PDF extraction is minutes, not seconds.

  const ready = await waitForBackendReady(page, 150_000)
  test.skip(!ready, 'analysis backend not reachable (no sibling document-analyser) — skipping')

  // Mock the native open dialog to return the sample PDFs.
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths })
    dialog.showOpenDialogSync = () => paths
  }, SAMPLES)

  // --- Wizard: name → import samples → select → finish --------------------
  await page.getByRole('button', { name: /create your first project/i }).click()
  await page.getByPlaceholder(/SDG Reports/i).fill('E2E Happy Path')
  await page.getByRole('button', { name: 'Next' }).click()

  const dialog = page.getByRole('dialog')
  await page.getByRole('button', { name: /import new documents/i }).first().click()

  // Extraction is done when the imported docs appear as selectable rows.
  await expect(dialog.getByRole('checkbox', { name: /2023-Annual-Report/i })).toBeVisible({
    timeout: 5 * 60_000,
  })

  // Imported docs are listed but not auto-selected — select them for the project.
  for (const box of await dialog.getByRole('checkbox').all()) {
    if (!(await box.isChecked())) await box.check()
  }
  await expect(dialog.getByText(`${SAMPLES.length} selected`)).toBeVisible()

  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: /create/i }).click()

  // --- Workspace: the project was created and we landed on Setup ----------
  await expect(page.getByRole('link', { name: 'Setup', exact: true })).toBeVisible()
  await expect(page.getByText('E2E Happy Path')).toBeVisible()

  // --- Best-effort deeper flow (classification + score are CPU-bound; not
  //     asserted, but attempted + captured so a good run screenshots them). --
  try {
    await page.getByRole('link', { name: 'Setup', exact: true }).click()
    const classify = page.getByRole('button', { name: /classify documents|re-classify/i }).first()
    if (await classify.count()) {
      await classify.scrollIntoViewIfNeeded()
      await classify.click({ timeout: 10_000 })
      await page.waitForTimeout(5000) // let it kick off; don't block on completion
    }
  } catch {
    /* classification is best-effort */
  }
  try {
    await page.getByRole('link', { name: 'Score', exact: true }).click({ timeout: 5000 })
    await page.waitForTimeout(2000)
  } catch {
    /* score view is best-effort */
  }

  await page.screenshot({ path: testInfo.outputPath('workspace.png'), fullPage: true })
})
