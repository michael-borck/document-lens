/**
 * BYOK (bring-your-own-key) AI provider store + client — main process only.
 *
 * All LLM calls run here, in Node, for two reasons: (a) CORS — Anthropic /
 * OpenAI / Gemini block browser-origin requests; (b) key safety — raw keys
 * never enter the renderer/DOM, so XSS from an imported document can't read
 * them. Keys are encrypted at rest with Electron `safeStorage` (OS keychain).
 *
 * Seven providers collapse into three API "shapes": anthropic (Messages),
 * openai (Chat Completions — also covers Grok, OpenAI-compatible, and both
 * Ollama modes), and gemini (Google GenAI).
 */
import { app, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'

export type ApiShape = 'anthropic' | 'openai' | 'gemini'
export type ProviderId =
  | 'anthropic' | 'openai' | 'gemini' | 'grok'
  | 'openai-compat' | 'ollama' | 'ollama-bearer'

export interface ProviderPreset {
  id: ProviderId
  label: string
  shape: ApiShape
  defaultBaseUrl: string
  /** Whether a key is required (Ollama has none; compat is optional). */
  keyMode: 'required' | 'optional' | 'none'
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'anthropic', label: 'Anthropic', shape: 'anthropic', defaultBaseUrl: 'https://api.anthropic.com', keyMode: 'required' },
  { id: 'openai', label: 'OpenAI', shape: 'openai', defaultBaseUrl: 'https://api.openai.com/v1', keyMode: 'required' },
  { id: 'gemini', label: 'Google Gemini', shape: 'gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta', keyMode: 'required' },
  { id: 'grok', label: 'Grok (xAI)', shape: 'openai', defaultBaseUrl: 'https://api.x.ai/v1', keyMode: 'required' },
  { id: 'openai-compat', label: 'OpenAI-compatible', shape: 'openai', defaultBaseUrl: '', keyMode: 'optional' },
  { id: 'ollama', label: 'Ollama (local)', shape: 'openai', defaultBaseUrl: 'http://localhost:11434/v1', keyMode: 'none' },
  { id: 'ollama-bearer', label: 'Ollama + Bearer', shape: 'openai', defaultBaseUrl: 'http://localhost:11434/v1', keyMode: 'required' },
]

function presetFor(id: ProviderId): ProviderPreset {
  const p = PROVIDER_PRESETS.find((x) => x.id === id)
  if (!p) throw new Error(`Unknown AI provider: ${id}`)
  return p
}

// --- Persistence -----------------------------------------------------------

interface StoredProvider {
  baseUrl: string
  model: string | null
  /** Encrypted key blob ("enc:"<base64> when OS-encrypted, "plain:"… otherwise). */
  key: string | null
}
interface AiConfig {
  active: ProviderId | null
  providers: Partial<Record<ProviderId, StoredProvider>>
}

function configPath(): string {
  return path.join(app.getPath('userData'), 'ai-providers.json')
}

function loadConfig(): AiConfig {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8')
    const parsed = JSON.parse(raw) as AiConfig
    return { active: parsed.active ?? null, providers: parsed.providers ?? {} }
  } catch {
    return { active: null, providers: {} }
  }
}

function saveConfig(config: AiConfig): void {
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8')
}

function encryptKey(plain: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return `enc:${safeStorage.encryptString(plain).toString('base64')}`
  }
  // OS keychain unavailable (e.g. a Linux box with no keyring). We still store
  // it, but flag encryptionAvailable=false so the UI can warn.
  return `plain:${Buffer.from(plain, 'utf8').toString('base64')}`
}

function decryptKey(stored: string | null): string | null {
  if (!stored) return null
  if (stored.startsWith('enc:')) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
    } catch {
      return null
    }
  }
  if (stored.startsWith('plain:')) return Buffer.from(stored.slice(6), 'base64').toString('utf8')
  return null
}

// --- Public shape returned to the renderer (never includes the raw key) ----

export interface ProviderView {
  id: ProviderId
  label: string
  shape: ApiShape
  keyMode: ProviderPreset['keyMode']
  baseUrl: string
  model: string | null
  hasKey: boolean
}

export interface ProvidersSnapshot {
  active: ProviderId | null
  encryptionAvailable: boolean
  providers: ProviderView[]
}

export function getProviders(): ProvidersSnapshot {
  const config = loadConfig()
  return {
    active: config.active,
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    providers: PROVIDER_PRESETS.map((preset) => {
      const stored = config.providers[preset.id]
      return {
        id: preset.id,
        label: preset.label,
        shape: preset.shape,
        keyMode: preset.keyMode,
        baseUrl: stored?.baseUrl || preset.defaultBaseUrl,
        model: stored?.model ?? null,
        hasKey: Boolean(stored?.key),
      }
    }),
  }
}

/**
 * Save a provider's settings. `key === undefined` leaves the stored key
 * untouched; `key === ''` clears it; a non-empty string replaces it.
 */
export function saveProvider(
  id: ProviderId,
  input: { baseUrl: string; model: string | null; key?: string }
): ProvidersSnapshot {
  presetFor(id) // validate
  const config = loadConfig()
  const prev = config.providers[id]
  let key = prev?.key ?? null
  if (input.key !== undefined) {
    key = input.key === '' ? null : encryptKey(input.key)
  }
  config.providers[id] = { baseUrl: input.baseUrl, model: input.model, key }
  saveConfig(config)
  return getProviders()
}

export function setActiveProvider(id: ProviderId | null): ProvidersSnapshot {
  const config = loadConfig()
  config.active = id
  saveConfig(config)
  return getProviders()
}

/** Reveal the decrypted key for the Show toggle (main → renderer, on demand). */
export function revealKey(id: ProviderId): string | null {
  return decryptKey(loadConfig().providers[id]?.key ?? null)
}

// --- Network: list models / test connection --------------------------------

interface ResolvedProvider {
  shape: ApiShape
  baseUrl: string
  key: string | null
}

function resolve(id: ProviderId): ResolvedProvider {
  const preset = presetFor(id)
  const stored = loadConfig().providers[id]
  return {
    shape: preset.shape,
    baseUrl: (stored?.baseUrl || preset.defaultBaseUrl).replace(/\/+$/, ''),
    key: decryptKey(stored?.key ?? null),
  }
}

async function fetchModels(p: ResolvedProvider): Promise<string[]> {
  if (p.shape === 'anthropic') {
    const res = await fetch(`${p.baseUrl}/v1/models`, {
      headers: { 'x-api-key': p.key ?? '', 'anthropic-version': '2023-06-01' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    const j = (await res.json()) as { data?: Array<{ id: string }> }
    return (j.data ?? []).map((m) => m.id)
  }
  if (p.shape === 'gemini') {
    const res = await fetch(`${p.baseUrl}/models?key=${encodeURIComponent(p.key ?? '')}`)
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    const j = (await res.json()) as { models?: Array<{ name: string }> }
    return (j.models ?? []).map((m) => m.name.replace(/^models\//, ''))
  }
  // openai shape (OpenAI, Grok, compat, Ollama)
  const res = await fetch(`${p.baseUrl}/models`, {
    headers: p.key ? { Authorization: `Bearer ${p.key}` } : {},
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  const j = (await res.json()) as { data?: Array<{ id: string }> }
  return (j.data ?? []).map((m) => m.id)
}

export interface TestResult {
  ok: boolean
  models?: string[]
  error?: string
}

/**
 * Test connection = list models. One request that proves reachability AND key
 * validity. Uses the given draft (unsaved) settings if provided, else the
 * stored config — so the user can test before saving.
 */
export async function testConnection(
  id: ProviderId,
  draft?: { baseUrl: string; key?: string }
): Promise<TestResult> {
  try {
    const base = resolve(id)
    const p: ResolvedProvider = {
      shape: base.shape,
      baseUrl: (draft?.baseUrl || base.baseUrl).replace(/\/+$/, ''),
      key: draft?.key !== undefined ? (draft.key || null) : base.key,
    }
    const models = await fetchModels(p)
    return { ok: true, models }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function listModels(
  id: ProviderId,
  draft?: { baseUrl: string; key?: string }
): Promise<TestResult> {
  return testConnection(id, draft)
}

// --- Chat completion (used by the AI-observation features) ------------------

export interface ChatResult {
  ok: boolean
  text?: string
  /** Which provider/model answered (for the "AI-generated" attribution). */
  provider?: string
  model?: string
  error?: string
}

async function callChat(
  p: ResolvedProvider,
  model: string,
  system: string,
  user: string,
  maxTokens: number
): Promise<string> {
  const errBody = async (res: Response) => `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`

  if (p.shape === 'anthropic') {
    const res = await fetch(`${p.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': p.key ?? '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    })
    if (!res.ok) throw new Error(await errBody(res))
    const j = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
    return (j.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n').trim()
  }

  if (p.shape === 'gemini') {
    const res = await fetch(
      `${p.baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(p.key ?? '')}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
        }),
      }
    )
    if (!res.ok) throw new Error(await errBody(res))
    const j = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    return (j.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? '').join('').trim()
  }

  // openai shape (OpenAI, Grok, compat, Ollama)
  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { ...(p.key ? { Authorization: `Bearer ${p.key}` } : {}), 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!res.ok) throw new Error(await errBody(res))
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return (j.choices?.[0]?.message?.content ?? '').trim()
}

/** One-shot chat via the ACTIVE provider + its selected model. */
export async function chat(system: string, user: string, maxTokens = 1024): Promise<ChatResult> {
  try {
    const config = loadConfig()
    const activeId = config.active
    if (!activeId) return { ok: false, error: 'No active AI provider. Configure one in Settings → AI provider.' }
    const preset = presetFor(activeId)
    const model = config.providers[activeId]?.model
    if (!model) return { ok: false, error: `No model selected for ${preset.label}. Set one in Settings.` }
    const text = await callChat(resolve(activeId), model, system, user, maxTokens)
    if (!text) return { ok: false, error: 'The model returned an empty response.' }
    return { ok: true, text, provider: preset.label, model }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
