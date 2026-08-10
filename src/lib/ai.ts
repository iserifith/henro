import { DEFAULT_BRANCH_COUNT, DEFAULT_SYSTEM_PROMPT } from './prompts'
import { AiError } from './errors'
import { OPENROUTER_URL } from './config'

const RETRY_WALL_CLOCK_MS = 20_000
const NAMING_MODEL = 'anthropic/claude-haiku-4.5'
const DEBUG = import.meta.env.VITE_HENRO_DEBUG === 'true'

function getConfig() {
  const stored = localStorage.getItem('openrouter-config')
  let parsed: Record<string, unknown> = {}
  if (stored) {
    try {
      parsed = JSON.parse(stored)
    } catch {
      // intentionally empty — ignore malformed stored config
    }
  }
  const branchCountRaw = Number(parsed.branchCount)
  const systemPrompt =
    typeof parsed.systemPrompt === 'string' && parsed.systemPrompt.trim()
      ? parsed.systemPrompt
      : DEFAULT_SYSTEM_PROMPT
  const envKey = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined
  const effectiveBaseUrl =
    (parsed.baseUrl as string)?.trim() || OPENROUTER_URL
  const isOpenRouter = effectiveBaseUrl === OPENROUTER_URL
  return {
    apiKey: (parsed.apiKey as string) || envKey || '',
    baseUrl: effectiveBaseUrl,
    isOpenRouter,
    model: (parsed.model as string) || 'anthropic/claude-sonnet-4.5',
    branchCount:
      Number.isFinite(branchCountRaw) && branchCountRaw > 0
        ? Math.min(10, Math.floor(branchCountRaw))
        : DEFAULT_BRANCH_COUNT,
    systemPrompt,
  }
}

async function chat(
  messages: { role: string; content: string }[],
  modelOverride?: string,
  label = 'chat',
): Promise<string> {
  const { apiKey, model: configModel, baseUrl, isOpenRouter } = getConfig()
  const model = modelOverride || configModel

  if (!apiKey) {
    throw new AiError('no-key', 'API key not set.')
  }

  if (DEBUG) {
    console.groupCollapsed(`%c[AI] ${label}`, 'color:#CA372C;font-weight:500')
    console.log('model:', model)
    messages.forEach((m) =>
      console.log(`%c${m.role}:`, 'color:#888', `\n${m.content}`),
    )
  }

  const maxRetries = 3
  const startedAt = Date.now()

  try {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let res: Response
      try {
        res = await fetch(baseUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...(isOpenRouter
              ? {
                  'HTTP-Referer': window.location.origin,
                  'X-Title': 'Henro',
                }
              : {}),
          },
          body: JSON.stringify({ model, messages }),
        })
      } catch (err) {
        throw new AiError(
          'network',
          err instanceof Error ? err.message : 'Network request failed',
        )
      }

      if (res.status === 429 && attempt < maxRetries) {
        const wait = Math.pow(2, attempt + 1) * 1000 // 2s, 4s, 8s
        if (Date.now() - startedAt + wait > RETRY_WALL_CLOCK_MS) break
        await new Promise((r) => setTimeout(r, wait))
        continue
      }

      if (res.status === 401 || res.status === 403) {
        throw new AiError('auth', 'Invalid API key.', res.status)
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error('AI provider error', res.status, body)
        throw new AiError(
          'unknown',
          `AI provider error ${res.status}: ${body || res.statusText}`,
          res.status,
        )
      }

      const data = await res.json()
      const content = data.choices[0].message.content as string
      if (DEBUG) console.log('%cresponse:', 'color:#8FD9ED', `\n${content}`)
      return content
    }

    throw new AiError('rate-limit', 'Rate limited. Try again in a moment.', 429)
  } finally {
    if (DEBUG) console.groupEnd()
  }
}

export type ContextNode = { text: string; steer?: string }

export async function generateBranches(
  text: string,
  directContext: ContextNode[],
  widerContext: ContextNode[],
  steer?: string,
  targetSteer?: string,
): Promise<string[]> {
  const { branchCount, systemPrompt } = getConfig()

  const trimmedSteer = steer?.trim()
  const trimmedTargetSteer = targetSteer?.trim()
  const askStr = trimmedSteer ? `\nAsk: ${trimmedSteer}` : ''
  const targetLine = trimmedTargetSteer
    ? `Target to branch from: "${text}" (created under ask: "${trimmedTargetSteer}")`
    : `Target to branch from: "${text}"`
  const formatNode = (n: ContextNode) => {
    const s = n.steer?.trim()
    return s ? `- ${n.text} (under ask: "${s}")` : `- ${n.text}`
  }
  const directStr =
    directContext.length > 0
      ? `\n\nDirectly connected to the target (parent/siblings/linked — already-taken ground; use only to understand the neighborhood, do not restate, rename, or re-skin these):\n${directContext.map(formatNode).join('\n')}`
      : ''
  const widerStr =
    widerContext.length > 0
      ? `\n\nWider context (background — do not repeat, do not branch from these):\n${widerContext.map(formatNode).join('\n')}`
      : ''

  const system = `${systemPrompt}\n\nReturn ONLY a JSON array of ${branchCount} strings. No markdown, no explanation.`
  const user = `${targetLine}${askStr}${directStr}${widerStr}\n\nReturn ${branchCount} items as a JSON array of strings. Each item must advance the target's substance — addressing the ask, following where it points, or exploring what it implies. Treat every listed context item (direct and wider) as already-taken ground: no restating, renaming, or re-skinning their analogies, mechanisms, or names. When generating multiple, each must take a different angle from the others. Match the register of the surrounding content; the target sets the substance.`

  const raw = await chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    undefined,
    'branches',
  )

  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?\s*```\s*$/, '')
    .trim()

  try {
    const parsed = JSON.parse(stripped)
    if (Array.isArray(parsed) && parsed.length >= 1) {
      return parsed.slice(0, branchCount).map(String)
    }
  } catch {
    // Fallback: split by newlines, strip numbering and stray quotes/brackets
    const lines = stripped
      .split('\n')
      .map((l) =>
        l
          .replace(/^\d+[.)]\s*/, '')
          .replace(/^[\s"'[,]+|[\s"',]+$/g, '')
          .trim(),
      )
      .filter(Boolean)
    if (lines.length >= 1) return lines.slice(0, branchCount)
  }

  return Array.from(
    { length: branchCount },
    (_, i) => `${text} — variation ${String.fromCharCode(65 + i)}`,
  )
}

export async function mergeIdeas(a: string, b: string): Promise<string> {
  return chat(
    [
      {
        role: 'system',
        content:
          'You merge two ideas into one concise synthesis. Return ONLY the merged idea, 1-2 sentences max.',
      },
      {
        role: 'user',
        content: `Merge these ideas:\n1. ${a}\n2. ${b}`,
      },
    ],
    undefined,
    'merge',
  )
}

export async function compose(texts: string[]): Promise<string> {
  return chat(
    [
      {
        role: 'system',
        content:
          'You synthesize multiple brainstorm ideas into a coherent summary. Be concise but comprehensive.',
      },
      {
        role: 'user',
        content: `Synthesize these brainstorm ideas into a coherent summary:\n\n${texts.map((t, i) => `${i + 1}. ${t}`).join('\n')}`,
      },
    ],
    undefined,
    'compose',
  )
}

export async function generateProjectName(seed: string): Promise<string> {
  const raw = await chat(
    [
      {
        role: 'system',
        content:
          'You name brainstorm projects. Given a seed idea, reply with a 2-4 word title in Title Case. No quotes, no trailing punctuation, no explanation. Output only the title.',
      },
      {
        role: 'user',
        content: `Seed: ${seed}`,
      },
    ],
    NAMING_MODEL,
    'project-name',
  )

  return raw
    .trim()
    .replace(/^["'`*_]+|["'`*_.!?,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .split(/\s+/)
    .slice(0, 6)
    .join(' ')
    .slice(0, 48)
}
