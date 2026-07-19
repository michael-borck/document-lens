/**
 * AI provider client — renderer half of the BYOK fold (Tauri migration §3.2).
 *
 * The provider config, key storage, and LLM calls now live in the Python
 * backend (document-analyser, /ai/* routes) rather than the Electron main
 * process. This module is the renderer's HTTP client for those routes; it is
 * shell-agnostic (works under Electron and Tauri) and replaces the former
 * `window.electron.ai*` IPC surface. Raw keys only cross the authenticated
 * loopback connection, never the DOM.
 *
 * Requires the analysis backend to be running (see useBackendStatus) — unlike
 * the old in-process path, AI is now backend-dependent (an accepted tradeoff).
 */

import { getBackendUrl, getBackendToken } from '@/config/backend'
import type {
  AiProviderId,
  AiProvidersSnapshot,
  AiTestResult,
  AiChatResult,
  AiSaveInput,
  AiDraft,
} from '@/types/electron'

async function backendFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const [baseUrl, token] = await Promise.all([getBackendUrl(), getBackendToken()])
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Backend ${path} → ${res.status}${body ? `: ${body.slice(0, 300)}` : ''}`)
  }
  return res.json() as Promise<T>
}

const post = <T>(path: string, body?: unknown): Promise<T> =>
  backendFetch<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

export function getProviders(): Promise<AiProvidersSnapshot> {
  return backendFetch<AiProvidersSnapshot>('/ai/providers')
}

export function saveProvider(id: AiProviderId, input: AiSaveInput): Promise<AiProvidersSnapshot> {
  // `key: undefined` is dropped by JSON.stringify, so the backend leaves the
  // stored key untouched (matching the old IPC semantics); "" clears it.
  return post<AiProvidersSnapshot>(`/ai/providers/${id}`, input)
}

export function setActiveProvider(id: AiProviderId | null): Promise<AiProvidersSnapshot> {
  return post<AiProvidersSnapshot>('/ai/active', { id })
}

export async function revealKey(id: AiProviderId): Promise<string | null> {
  const { key } = await post<{ key: string | null }>(`/ai/reveal/${id}`)
  return key
}

/** Test connection == list models. Returns {ok,...} rather than throwing so the
 * Settings UI can show the provider/network error inline. A backend that is
 * unreachable also degrades to {ok:false}. */
export async function testConnection(id: AiProviderId, draft?: AiDraft): Promise<AiTestResult> {
  try {
    return await post<AiTestResult>(`/ai/test/${id}`, draft ?? {})
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function listModels(id: AiProviderId, draft?: AiDraft): Promise<AiTestResult> {
  try {
    return await post<AiTestResult>(`/ai/models/${id}`, draft ?? {})
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** One-shot chat via the active provider. Never throws — returns {ok:false,...}
 * on any provider/network/backend failure, matching the old aiChat contract. */
export async function chat(system: string, user: string, maxTokens = 1024): Promise<AiChatResult> {
  try {
    return await post<AiChatResult>('/ai/chat', { system, user, maxTokens })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
