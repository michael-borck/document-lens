/**
 * Shared Playwright fixtures for the Electron e2e suite.
 *
 * Each test gets a freshly-launched app in a throwaway `DOCLENS_USER_DATA`
 * profile (a temp dir) so the first-run seed runs clean and the developer's
 * real SQLite database is never touched. The app is launched exactly the way
 * scripts/capture-help-screenshots.mjs launches it — `electron .` from the repo
 * root, non-packaged, which loads the built dist/ renderer.
 */
import { test as base, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Playwright runs from the repo root (where playwright.config.ts lives), so
// cwd is the project root. Avoid import.meta — the package is CommonJS.
export const ROOT = process.cwd()

type Fixtures = {
  /** Throwaway userData profile directory for this test. */
  profileDir: string
  /** The launched Electron application. */
  app: ElectronApplication
  /** The main window, already loaded. */
  page: Page
}

export const test = base.extend<Fixtures>({
  profileDir: async ({}, use) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'doclens-e2e-'))
    await use(dir)
    rmSync(dir, { recursive: true, force: true })
  },

  app: async ({ profileDir }, use) => {
    const app = await electron.launch({
      args: ['.'],
      cwd: ROOT,
      env: { ...process.env, DOCLENS_USER_DATA: profileDir },
    })
    await use(app)
    await app.close().catch(() => {})
  },

  page: async ({ app }, use) => {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1280, height: 820 })
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  },
})

export { expect }

/**
 * Poll the backend health until it reports `ready`. Returns false on timeout so
 * a caller can `test.skip()` when the analysis backend isn't reachable.
 */
export async function waitForBackendReady(page: Page, timeoutMs = 120_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const phase = await page
      .evaluate(() => window.electron?.getBackendStatus?.().then((s) => s.phase))
      .catch(() => 'unknown')
    if (phase === 'ready') return true
    await page.waitForTimeout(2000)
  }
  return false
}
