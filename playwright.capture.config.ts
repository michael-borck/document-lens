import { defineConfig } from '@playwright/test'
import base from './playwright.config'

/**
 * Screenshot-capture runs (npm run capture:help). Reuses the e2e harness but
 * matches only e2e/capture.spec.ts and gives it room: import + classification
 * + a full workflow walk over real PDFs can take a quarter of an hour.
 */
export default defineConfig({
  ...base,
  testMatch: /capture\.spec\.ts/,
  // The base config ignores capture.spec.ts for the gate; here it's the point.
  testIgnore: ['**/._*'],
  timeout: 30 * 60_000,
  retries: 0,
})
