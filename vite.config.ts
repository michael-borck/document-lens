import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'

// Coexistence switch: the Tauri CLI sets TAURI_ENV_* for its before-commands
// (beforeDevCommand / beforeBuildCommand). When present, we build the pure
// frontend and skip the Electron plugin entirely so `npm run dev`/`build:vite`
// double as Tauri's frontend build. Without it, behaviour is unchanged — the
// Electron main/preload are built alongside the renderer as before.
const isTauri = !!process.env.TAURI_ENV_PLATFORM

const electronPlugins = isTauri
  ? []
  : [
      electron([
        {
          entry: 'electron/main.ts',
          vite: {
            build: {
              outDir: 'dist-electron',
              rollupOptions: {
                external: ['better-sqlite3']
              }
            }
          }
        },
        {
          entry: 'electron/preload.ts',
          onstart(options) {
            options.reload()
          },
          vite: {
            build: {
              outDir: 'dist-electron'
            }
          }
        }
      ]),
      renderer()
    ]

export default defineConfig({
  plugins: [react(), ...electronPlugins],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  // Tauri expects a fixed dev-server port (see devUrl in tauri.conf.json) and
  // clearer errors. These only take effect under the Tauri CLI.
  clearScreen: false,
  server: isTauri
    ? { port: 5173, strictPort: true }
    : undefined,
  build: {
    outDir: 'dist'
  }
})
