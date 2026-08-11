import { useSyncExternalStore } from 'react'

export const CONFIG_KEY = 'openrouter-config'

/** The default OpenRouter chat-completions endpoint — single source of truth
 * shared by ai.ts (request target) and Settings.tsx (display fallback). */
export const OPENROUTER_URL =
  'https://openrouter.ai/api/v1/chat/completions'

/** Default chat model when the user hasn't configured one — single source of
 * truth shared by ai.ts (request payload), Settings.tsx, WelcomeScreen.tsx. */
export const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.5'

export type OpenRouterConfig = {
  apiKey: string
  baseUrl?: string
  model?: string
  branchCount?: number
  systemPrompt?: string
}

const ENV_API_KEY =
  (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined) || ''

export function readConfig(): OpenRouterConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return { apiKey: ENV_API_KEY }
    const parsed = JSON.parse(raw) as Partial<OpenRouterConfig>
    return { ...parsed, apiKey: parsed.apiKey || ENV_API_KEY }
  } catch {
    return { apiKey: ENV_API_KEY }
  }
}

const listeners = new Set<() => void>()

export function writeConfig(next: Partial<OpenRouterConfig>) {
  // Normalize baseUrl before merging: keep the trimmed value only when it
  // passes isValidBaseUrl(); an invalid/empty candidate becomes `undefined`
  // (removed from the merged object, never stored as '') so readConfig()
  // never has to re-validate on read.
  const normalized: Partial<OpenRouterConfig> = { ...next }
  if ('baseUrl' in normalized) {
    const candidate =
      typeof normalized.baseUrl === 'string' ? normalized.baseUrl.trim() : ''
    normalized.baseUrl =
      candidate && isValidBaseUrl(candidate) ? candidate : undefined
  }
  const merged = { ...readConfig(), ...normalized }
  localStorage.setItem(CONFIG_KEY, JSON.stringify(merged))
  listeners.forEach((cb) => cb())
}

/** True only when `candidate` parses via `new URL()` and uses http(s):. */
export function isValidBaseUrl(candidate: string): boolean {
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Loose shape check for OpenRouter keys — they're `sk-or-...` followed by
 * a long base64/hex blob. Lenient on purpose: we only want to catch obvious
 * mistakes (random words, half-pasted strings), not gatekeep real keys. */
export function looksLikeOpenRouterKey(key: string): boolean {
  return /^sk-or-[a-zA-Z0-9_-]{20,}$/.test(key.trim())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  // Cross-tab updates: localStorage 'storage' event fires in *other* tabs.
  const onStorage = (e: StorageEvent) => {
    if (e.key === CONFIG_KEY) cb()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

function getSnapshot() {
  return readConfig().apiKey.trim().length > 0
}

export function useHasApiKey() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
