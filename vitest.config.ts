import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    // Services run in node (node:sqlite-backed DbDriver); hook/component tests
    // (*.test.tsx) need a DOM, so route those to jsdom.
    environment: 'node',
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // text = CI log summary; lcov = artifact / external tools; html = local browsing.
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      // Honest denominator: measure real logic, not tests, type decls, or the
      // renderer entry point. No thresholds — coverage is a signal here, not a gate.
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/_shared/test-db.ts',
        'src/types/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
    },
  },
})
