import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Pure frontend build — the desktop shell is Tauri (src-tauri/). The Tauri CLI
// runs this via beforeDevCommand/beforeBuildCommand (see src-tauri/tauri.conf.json).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  // Tauri expects a fixed dev-server port (matches devUrl in tauri.conf.json).
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist'
  }
})
