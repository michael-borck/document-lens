/**
 * Shared Playwright fixtures for the post-Tauri e2e suite.
 *
 * There is no Electron main process to drive anymore, so each test runs the
 * real renderer bundle in plain Chromium (served by `vite preview`) with
 * `window.electron` answered by a Node-side host (harness/node-host.ts) that
 * stands in for the Rust shell: a throwaway :memory: SQLite database built
 * from the real schema, the real keyed Query Registry, real filesystem
 * reads for import, stubbed native dialogs, and — for backend-gated specs —
 * a real document-analyser uvicorn spawned from the sibling checkout.
 *
 * Per-test isolation is the fresh in-memory DB (the old suite's throwaway
 * DOCLENS_USER_DATA profile equivalent): the app's own first-run seed runs
 * against it on boot, through the same registry writes production makes.
 */
import { test as base, expect, type Page } from '@playwright/test'
import { NodeHost } from './harness/node-host'
import { installE2eBridge } from './harness/page-bridge'

// Playwright runs from the repo root (where playwright.config.ts lives).
export const ROOT = process.cwd()

type Fixtures = {
  /** The Node-side main-process double (db, fs, dialogs, backend). */
  host: NodeHost
  /** Chromium page with the app already booted (bridge installed). */
  page: Page
}

export const test = base.extend<Fixtures>({
  host: async ({}, use) => {
    const host = new NodeHost()
    await use(host)
    await host.close()
  },

  page: async ({ context, host }, use) => {
    await context.exposeFunction('__e2eDispatch', (method: string, args: unknown[]) =>
      host.dispatch(method, args),
    )
    await context.addInitScript(installE2eBridge)
    const page = await context.newPage()
    await page.setViewportSize({ width: 1280, height: 820 })
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  },
})

export { expect }

/**
 * Poll the backend status until it reports `ready`. Returns false on timeout
 * so a caller can `test.skip()` when the analysis backend isn't reachable.
 */
export async function waitForBackendReady(page: Page, timeoutMs = 30_000): Promise<boolean> {
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

/**
 * Bring up the real analysis backend (sibling document-analyser checkout)
 * and remount the app on top of it, so components that gate on backend
 * status at mount see `ready`. Returns false — callers test.skip() — when
 * no backend is available. Mirrors the old suite's app-launched backend.
 */
export async function bootWithBackend(page: Page, host: NodeHost): Promise<boolean> {
  const ok = await host.ensureBackend()
  if (!ok) return false
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  return waitForBackendReady(page)
}
