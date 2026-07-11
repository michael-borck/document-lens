/**
 * Backend-free acceptance smoke test.
 *
 * Proves the whole app shell wires up on a clean machine: Electron main +
 * preload + IPC + SQLite init + the React renderer + the first-run seed, and
 * that a user can create a project through the wizard end-to-end. None of this
 * needs the analysis backend, so it always runs (and guards the "app boots and
 * a project can be created" invariant on every change).
 */
import { test, expect } from './fixtures'

test('boots to the Projects page with the first-run empty state', async ({ page }) => {
  // If the renderer, preload bridge, and SQLite seed all succeeded, the empty
  // Projects page offers to create the first project.
  await expect(page.getByRole('button', { name: /create your first project/i })).toBeVisible()
})

test('creates a project through the three-step wizard and lands on the workspace', async ({
  page,
}, testInfo) => {
  await page.getByRole('button', { name: /create your first project/i }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // Step 1 — name the project (sustainability defaults are pre-selected).
  await page.getByPlaceholder(/SDG Reports/i).fill('E2E Smoke Project')
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 2 — skip document import (backend-free; import is exercised in the
  // gated happy-path spec).
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 3 — accept the seeded defaults and create.
  await page.getByRole('button', { name: /create/i }).click()

  // Landed on the project workspace — the Setup tab is present.
  await expect(page.getByRole('link', { name: 'Setup', exact: true })).toBeVisible()
  await expect(page.getByText('E2E Smoke Project')).toBeVisible()

  await page.screenshot({ path: testInfo.outputPath('workspace.png') })
})
