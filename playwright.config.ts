import { defineConfig } from '@playwright/test'

/**
 * End-to-end acceptance suite. Runs the real renderer bundle in plain
 * Chromium against `vite preview`, with `window.electron` answered by a
 * Node-side host that stands in for the Tauri shell (see e2e/fixtures.ts).
 *
 * Run:  npm run test:e2e     (builds the renderer first, then runs e2e/)
 *
 * The smoke spec is backend-free and always runs. The happy-path and corpus
 * specs need the document-analyser backend (a sibling checkout in dev) and
 * skip themselves when the backend isn't reachable, so CI without the ML
 * stack still goes green.
 */
export default defineConfig({
  testDir: './e2e',
  // AppleDouble junk (._*) from the exFAT dev volume must not be picked up;
  // capture.spec.ts is a screenshot tool with its own config, not a gate.
  testIgnore: ['**/._*', 'e2e/capture.spec.ts'],
  // Backend-gated specs run real PDF extraction; give each test room.
  timeout: 180_000,
  expect: { timeout: 20_000 },
  // One app at a time: the backend port (8765) is fixed, and each test gets
  // its own throwaway in-memory database anyway.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  // Serves the built renderer (npm run test:e2e builds first). The origin is
  // on the backend's CORS allowlist (see spawn env in src-tauri/src/backend.rs).
  webServer: {
    command: 'npm run preview -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
