/**
 * Backend Configuration
 * 
 * Single source of truth for backend URL configuration.
 * All components should use this module instead of hardcoding URLs.
 */

// Backend configuration - single values, no dev/prod distinction
export const BACKEND_PORT = 8765
export const BACKEND_HOST = '127.0.0.1'
export const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`

/**
 * Get the default backend URL
 */
export function getDefaultBackendUrl(): string {
  return BACKEND_URL
}

/**
 * Get the backend URL from Electron (if available) or fall back to default
 */
export async function getBackendUrl(): Promise<string> {
  try {
    if (window.electron) {
      const url = await window.electron.getBackendUrl()
      console.log('[Config] Backend URL from Electron:', url)
      return url
    }
  } catch (error) {
    console.warn('[Config] Could not get backend URL from Electron:', error)
  }
  
  console.log('[Config] Using default backend URL:', BACKEND_URL)
  return BACKEND_URL
}

/**
 * Validate a backend URL format
 */
export function isValidBackendUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
