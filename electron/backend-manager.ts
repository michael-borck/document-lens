import { spawn, execFile, ChildProcess } from 'child_process'
import { app } from 'electron'
import { EventEmitter } from 'events'
import path from 'path'
import fs from 'fs'
import http from 'http'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

// Backend configuration constants - single source of truth
export const BACKEND_PORT = 8765
export const BACKEND_HOST = '127.0.0.1'
export const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`

/**
 * Phase lifecycle for the backend:
 *   not-started — no attempt yet (initial / dev without auto-start)
 *   starting    — spawn issued, waiting for first successful /health
 *   ready       — /health has returned 200 at least once and is still healthy
 *   unreachable — periodic health check failing (could be transient)
 *   crashed     — child process exited unexpectedly (prod) or spawn failed
 */
export type BackendPhase =
  | 'not-started'
  | 'starting'
  | 'ready'
  | 'unreachable'
  | 'crashed'

export interface BackendStatus {
  phase: BackendPhase
  running: boolean
  url: string | null
  pid?: number
  mode: 'embedded' | 'dev-auto'
  lastError?: string
  startedAt?: number
}

export class BackendManager extends EventEmitter {
  private process: ChildProcess | null = null
  private port: number = BACKEND_PORT
  private host: string = BACKEND_HOST
  private startupTimeout: number = 180000
  private healthCheckInterval: NodeJS.Timeout | null = null
  private phase: BackendPhase = 'not-started'
  private mode: 'embedded' | 'dev-auto' = 'embedded'
  private lastError: string | undefined
  private startedAt: number | undefined
  /**
   * How many auto-restart attempts have been made since the last
   * successful start. Reset to 0 each time the backend becomes ready.
   * Capped at MAX_RESTART_ATTEMPTS to avoid spin loops.
   */
  private restartAttempts: number = 0
  private restartTimer: NodeJS.Timeout | null = null
  private static readonly MAX_RESTART_ATTEMPTS = 3
  private static readonly RESTART_BACKOFF_MS = 2000

  /**
   * Per-launch bearer token. Passed to the spawned backend via
   * DOCUMENT_ANALYSER_AUTH_TOKEN; the backend's lens-contract add_auth then
   * requires it on every request except /health and /manifest. Undefined =>
   * no token passed (backend stays unauthenticated, e.g. older builds).
   */
  private readonly authToken: string | undefined

  constructor(authToken?: string) {
    super()
    this.authToken = authToken
  }

  /** Env entries shared by both spawn paths (embedded + dev-auto). */
  private backendEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      DOCUMENT_ANALYSER_PORT: String(this.port),
      DOCUMENT_ANALYSER_HOST: this.host,
      DOCUMENT_ANALYSER_MODE: 'desktop',
      ...(this.authToken ? { DOCUMENT_ANALYSER_AUTH_TOKEN: this.authToken } : {}),
    }
  }

  /** Locate the Python dev backend repo (sibling directory) */
  private findDevBackendRepo(): string | null {
    const candidates = [
      path.resolve(app.getAppPath(), '..', 'document-analyser'),
      path.resolve(process.cwd(), '..', 'document-analyser'),
    ]
    for (const candidate of candidates) {
      // The FastAPI app moved from main.py to the api package in document-analyser
      // 0.5.0 (launched as document_analyser.api:app).
      if (fs.existsSync(path.join(candidate, 'document_analyser', 'api', '__init__.py'))) {
        return candidate
      }
    }
    return null
  }

  /** Path to the packaged backend executable (production only) */
  private getBackendPath(): string {
    if (!app.isPackaged) return ''

    const platform = process.platform
    const ext = platform === 'win32' ? '.exe' : ''
    const backendName = `document-lens-api${ext}`
    const resourcesPath = process.resourcesPath

    console.log('[Backend] resourcesPath:', resourcesPath)
    const backendPath = path.join(resourcesPath, 'backend', backendName)
    if (fs.existsSync(backendPath)) return backendPath

    const unpackedPath = path.join(resourcesPath, 'app.asar.unpacked', 'backend', backendName)
    if (fs.existsSync(unpackedPath)) return unpackedPath

    throw new Error(`Backend executable not found at: ${backendPath}`)
  }

  private setPhase(phase: BackendPhase, error?: string): void {
    if (this.phase === phase && this.lastError === error) return
    this.phase = phase
    this.lastError = error
    console.log(`[Backend] phase → ${phase}${error ? ` (${error})` : ''}`)
    this.emit('phase-changed', this.getStatus())
  }

  /**
   * Start the backend.
   *   Production: spawn the bundled PyInstaller executable.
   *   Development: spawn uvicorn from a sibling ../document-analyser
   *   checkout (always — never adopt an externally-started backend,
   *   since that produces brittle behaviour when the external process
   *   dies. Users always run with the embedded backend; developers
   *   always run with the spawned dev-auto backend).
   */
  async start(): Promise<void> {
    this.startedAt = Date.now()

    // A backend from a PREVIOUS session may still hold the port (the app
    // crashed, was force-quit, or the PyInstaller bootloader stranded its
    // child). It answers /health (unauthenticated) but rejects this
    // session's token on every real request — the worst failure mode,
    // because everything LOOKS ready while imports fail "Unauthorized".
    // Per ADR-0002 we never adopt an external backend: identify it, kill
    // it, and spawn our own.
    try {
      await this.reclaimStalePort()
    } catch (error) {
      this.setPhase('crashed', error instanceof Error ? error.message : String(error))
      return
    }

    if (app.isPackaged) {
      this.mode = 'embedded'
      return this.startEmbedded()
    }

    const devRepo = this.findDevBackendRepo()
    if (devRepo) {
      this.mode = 'dev-auto'
      return this.startDevAuto(devRepo)
    }

    // Dev mode but no sibling repo found. This is a developer setup
    // error (production users always have the embedded backend bundled
    // in the app); fail loudly rather than try to silently adopt some
    // unrelated process that happens to answer on :8765.
    this.mode = 'dev-auto'
    console.error(
      `[Backend] Dev mode but ../document-analyser sibling repo not found. ` +
      `Backend will not be available. Clone document-analyser as a sibling ` +
      `directory or build the app for production to use the embedded backend.`
    )
    this.setPhase('crashed', 'Dev backend repo not found at ../document-analyser')
  }

  /**
   * If something already answers on our port, it can only be a stale
   * backend from a previous session (we haven't spawned ours yet, and we
   * never adopt): verify it's a document-analyser via the unauthenticated
   * /manifest, then kill whatever owns the port and wait for it to fall
   * silent. An unknown service on the port is a hard error — killing a
   * stranger's process is worse than failing loudly.
   */
  private async reclaimStalePort(): Promise<void> {
    const answering = await this.healthCheck().then(() => true, () => false)
    if (!answering) return

    const manifest = await this.fetchJson('/manifest').catch(() => null)
    const name = String(
      (manifest as { name?: string; service?: string } | null)?.name ??
      (manifest as { service?: string } | null)?.service ?? ''
    )
    if (!/document|analyser|analyzer|lens/i.test(name)) {
      throw new Error(
        `Port ${this.port} is in use by an unknown service (${name || 'no manifest'}). ` +
        `Close it and restart the app.`
      )
    }

    console.warn(`[Backend] Stale backend "${name}" found on :${this.port} — reclaiming the port`)
    await this.killPortListeners()

    // Wait until the port actually stops answering (up to ~10s).
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      const still = await this.healthCheck().then(() => true, () => false)
      if (!still) {
        console.log('[Backend] Port reclaimed')
        return
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error(
      `A previous analysis backend on port ${this.port} would not shut down. ` +
      `Kill the "document-lens-api" process manually and restart the app.`
    )
  }

  /** Kill every process listening on our port (lsof on POSIX, netstat on Windows). */
  private async killPortListeners(): Promise<void> {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('netstat', ['-ano']).catch(() => ({ stdout: '' }))
      const pids = new Set<string>()
      for (const line of stdout.split('\n')) {
        if (line.includes(`:${this.port}`) && /LISTENING/i.test(line)) {
          const pid = line.trim().split(/\s+/).pop()
          if (pid && pid !== '0') pids.add(pid)
        }
      }
      for (const pid of pids) {
        await execFileAsync('taskkill', ['/pid', pid, '/T', '/F']).catch(() => {})
      }
      return
    }
    const { stdout } = await execFileAsync('lsof', ['-ti', `tcp:${this.port}`]).catch(() => ({ stdout: '' }))
    const pids = stdout.split('\n').map((s) => s.trim()).filter(Boolean)
    for (const pid of pids) {
      try { process.kill(Number(pid), 'SIGTERM') } catch { /* already gone */ }
    }
    // Escalate stragglers after a grace period.
    if (pids.length > 0) {
      await new Promise((r) => setTimeout(r, 3000))
      for (const pid of pids) {
        try { process.kill(Number(pid), 'SIGKILL') } catch { /* already gone */ }
      }
    }
  }

  private async startEmbedded(): Promise<void> {
    const backendPath = this.getBackendPath()
    console.log('[Backend] Starting embedded backend from:', backendPath)

    if (process.platform !== 'win32') {
      try { fs.chmodSync(backendPath, '755') } catch { /* ignore */ }
    }

    this.setPhase('starting')
    // detached on POSIX: the child leads its own process group, so stop()
    // can kill the WHOLE tree (PyInstaller bootloader + the server it
    // re-execs) with one group signal instead of stranding the grandchild.
    this.process = spawn(backendPath, ['--port', String(this.port), '--host', this.host], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      env: this.backendEnv()
    })

    this.wireChildProcess()

    try {
      await this.waitForReady()
      this.setPhase('ready')
      this.restartAttempts = 0
      this.startHealthCheck()
    } catch (error) {
      this.setPhase('crashed', error instanceof Error ? error.message : String(error))
      this.scheduleRestart()
      throw error
    }
  }

  private async startDevAuto(repoPath: string): Promise<void> {
    // No "adopt existing healthy backend" probe — adoption isn't a
    // supported workflow (users are always on the embedded backend),
    // and adopting a process we don't own means we can't restart it
    // when it dies.
    //
    // If something else is already on :8765 the spawn below will fail;
    // that's the right outcome, not silently adopting an unknown
    // process.
    console.log('[Backend] Dev auto-start from:', repoPath)

    // Prefer the repo's .venv python; fall back to `uv run` or system python3
    const venvPython = path.join(repoPath, '.venv', 'bin', 'python')
    const venvPythonWin = path.join(repoPath, '.venv', 'Scripts', 'python.exe')

    let command: string
    let args: string[]

    if (fs.existsSync(venvPython)) {
      command = venvPython
      args = ['-m', 'uvicorn', 'document_analyser.api:app', '--host', this.host, '--port', String(this.port)]
    } else if (fs.existsSync(venvPythonWin)) {
      command = venvPythonWin
      args = ['-m', 'uvicorn', 'document_analyser.api:app', '--host', this.host, '--port', String(this.port)]
    } else {
      // Try `uv run` — assumes uv is on PATH
      command = 'uv'
      args = ['run', 'uvicorn', 'document_analyser.api:app', '--host', this.host, '--port', String(this.port)]
    }

    this.setPhase('starting')

    try {
      this.process = spawn(command, args, {
        cwd: repoPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        env: { ...this.backendEnv(), PYTHONUNBUFFERED: '1' }
      })
    } catch (error) {
      this.setPhase('crashed', `Failed to spawn: ${error instanceof Error ? error.message : String(error)}`)
      return
    }

    this.wireChildProcess()

    try {
      await this.waitForReady()
      this.setPhase('ready')
      this.restartAttempts = 0
      this.startHealthCheck()
    } catch (error) {
      this.setPhase('crashed', error instanceof Error ? error.message : String(error))
      this.scheduleRestart()
      // Don't throw — dev mode should keep the UI usable
    }
  }

  /**
   * After an unexpected crash, attempt to restart the backend with a
   * short backoff. Caps at MAX_RESTART_ATTEMPTS so a wedged backend
   * doesn't spin forever — after that, the UI shows 'crashed' and the
   * user can quit + relaunch the app.
   */
  private scheduleRestart(): void {
    if (this.restartTimer) return
    if (this.restartAttempts >= BackendManager.MAX_RESTART_ATTEMPTS) {
      console.error(
        `[Backend] Reached max restart attempts (${BackendManager.MAX_RESTART_ATTEMPTS}); giving up. ` +
        `Quit and relaunch the app to try again.`
      )
      return
    }
    this.restartAttempts++
    const delay = BackendManager.RESTART_BACKOFF_MS * this.restartAttempts
    console.log(
      `[Backend] Scheduling restart attempt ${this.restartAttempts}/${BackendManager.MAX_RESTART_ATTEMPTS} ` +
      `in ${delay}ms`
    )
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      this.start().catch((err) => {
        console.error('[Backend] Restart attempt failed:', err)
      })
    }, delay)
  }

  private wireChildProcess(): void {
    this.process?.stdout?.on('data', (data) => {
      console.log('[Backend]', data.toString().trim())
    })
    this.process?.stderr?.on('data', (data) => {
      console.error('[Backend Error]', data.toString().trim())
    })
    this.process?.on('exit', (code, signal) => {
      console.log(`[Backend] exited code=${code} signal=${signal}`)
      const wasRunning = this.phase === 'ready' || this.phase === 'starting'
      this.process = null
      if (wasRunning) {
        this.setPhase('crashed', `Process exited (code ${code ?? 'null'})`)
        this.scheduleRestart()
      }
    })
    this.process?.on('error', (error) => {
      console.error('[Backend] spawn error:', error)
      this.process = null
      this.setPhase('crashed', error.message)
      this.scheduleRestart()
    })
  }

  /** Probe until the backend verifiably answers or timeout elapses */
  private probeUntilReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now()
      const check = () => {
        this.verifiedHealthCheck()
          .then(() => {
            console.log('[Backend] ready')
            this.setPhase('ready')
            resolve()
          })
          .catch((error) => {
            if (Date.now() - startTime > this.startupTimeout) {
              reject(new Error(`Backend startup timeout (${error instanceof Error ? error.message : error})`))
              return
            }
            setTimeout(check, 500)
          })
      }
      setTimeout(check, 500)
    })
  }

  private waitForReady(): Promise<void> {
    return this.probeUntilReady()
  }

  /** GET a path with an optional bearer token; resolve with the status code. */
  private request(path: string, withToken: boolean): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: this.host,
        port: this.port,
        path,
        method: 'GET',
        timeout: 5000,
        headers: withToken && this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {},
      }, (res) => {
        let body = ''
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      })
      req.on('error', (error) => reject(error))
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Request timeout'))
      })
      req.end()
    })
  }

  private async fetchJson(path: string): Promise<unknown> {
    const { status, body } = await this.request(path, false)
    if (status !== 200) throw new Error(`GET ${path} → ${status}`)
    return JSON.parse(body)
  }

  private async healthCheck(): Promise<boolean> {
    const { status } = await this.request('/health', false)
    if (status !== 200) throw new Error(`Health check failed with status ${status}`)
    return true
  }

  /**
   * "Ready" must mean OUR backend, not just A backend: /health is
   * unauthenticated, so a stale server from a previous session passes it
   * while rejecting every real request. When a session token exists, also
   * require an authenticated request (GET /) to succeed.
   */
  private async verifiedHealthCheck(): Promise<boolean> {
    await this.healthCheck()
    if (!this.authToken) return true
    const { status } = await this.request('/', true)
    if (status === 401 || status === 403) {
      throw new Error(
        'Backend rejected this session\'s token — a stale backend from a ' +
        'previous session is holding the port. Restart the analysis engine.'
      )
    }
    if (status !== 200) throw new Error(`Auth probe failed with status ${status}`)
    return true
  }

  private startHealthCheck(): void {
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval)
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.verifiedHealthCheck()
        if (this.phase !== 'ready') this.setPhase('ready')
      } catch (error) {
        // Only downgrade if we previously thought we were ready
        if (this.phase === 'ready') {
          this.setPhase('unreachable', error instanceof Error ? error.message : String(error))
        }
      }
    }, 5000)
  }

  async stop(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }

    if (!this.process) {
      this.setPhase('not-started')
      return
    }

    console.log('[Backend] stopping...')

    return new Promise((resolve) => {
      if (!this.process) {
        resolve()
        return
      }

      this.process.once('exit', () => {
        this.process = null
        console.log('[Backend] stopped')
        resolve()
      })

      // Kill the whole process TREE, not just the direct child: the
      // PyInstaller bootloader re-execs the real server as its own child,
      // and signalling only the bootloader can strand that grandchild on
      // the port (the "Unauthorized after relaunch" orphan).
      this.killTree('SIGTERM')

      setTimeout(() => {
        if (this.process) {
          console.log('[Backend] force killing')
          this.killTree('SIGKILL')
        }
      }, 5000)
    })
  }

  /** Signal the child's whole process group (POSIX) / tree (Windows). */
  private killTree(signal: 'SIGTERM' | 'SIGKILL'): void {
    const pid = this.process?.pid
    if (!pid) return
    if (process.platform === 'win32') {
      execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {})
      return
    }
    try {
      // Negative pid = the process group (child was spawned detached, so
      // it leads its own group containing bootloader + server).
      process.kill(-pid, signal)
    } catch {
      try { this.process?.kill(signal) } catch { /* already gone */ }
    }
  }

  /**
   * Manual restart from the UI (Settings → Backend). Resets the auto-
   * restart attempt counter and cancels any pending backoff timer so a
   * user-initiated restart always gets a fresh start — even after the
   * automatic restart cap (MAX_RESTART_ATTEMPTS) has been exhausted, which
   * is exactly the state where a manual restart is the only recovery.
   */
  async restart(): Promise<void> {
    console.log('[Backend] manual restart requested')
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    this.restartAttempts = 0
    await this.stop()
    await this.start()
  }

  getUrl(): string {
    return `http://${this.host}:${this.port}`
  }

  getStatus(): BackendStatus {
    return {
      phase: this.phase,
      running: this.phase === 'ready',
      url: this.getUrl(),
      pid: this.process?.pid,
      mode: this.mode,
      lastError: this.lastError,
      startedAt: this.startedAt,
    }
  }

  async isRunning(): Promise<boolean> {
    try {
      await this.healthCheck()
      return true
    } catch {
      return false
    }
  }
}
