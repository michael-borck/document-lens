import { defineConfig } from '@playwright/test'

/**
 * End-to-end acceptance suite. Drives the *built* Electron app through
 * Playwright's Electron driver (see e2e/fixtures.ts) — no browser download is
 * needed; it launches the app's own Electron binary.
 *
 * Run:  npm run test:e2e     (builds the renderer first, then runs e2e/)
 *
 * The smoke spec is backend-free and always runs. The happy-path spec needs the
 * document-analyser backend (a sibling checkout in dev) and skips itself when
 * the backend is not reachable, so CI without the ML stack still goes green.
 */
export default defineConfig({
  testDir: './e2e',
  // Electron launches + first-run seeding are slow; give each test room.
  timeout: 180_000,
  expect: { timeout: 20_000 },
  // One Electron app at a time — each test still gets its own throwaway profile.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
