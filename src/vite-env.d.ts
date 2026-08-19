/// <reference types="vite/client" />

/** App version injected at build time from package.json (vite `define`). */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
