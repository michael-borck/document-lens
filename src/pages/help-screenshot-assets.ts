/**
 * Resolve captured screenshot files (docs/screenshots/*.png) to URLs the
 * renderer can display. Vite-specific: `import.meta.glob` is rewritten at
 * build time. The manual exporter bundles this module with esbuild, where
 * `import.meta.glob` doesn't exist — the try/catch makes that a clean no-op
 * (the exporter embeds images by file path itself and never needs URLs).
 */

let modules: Record<string, string> = {}
try {
  modules = import.meta.glob('../../docs/screenshots/*.png', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>
} catch {
  modules = {}
}

/** file name (e.g. "coverage.png") → servable URL. Empty outside Vite. */
export const SCREENSHOT_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(modules).map(([p, url]) => [p.split('/').pop() ?? p, url])
)
