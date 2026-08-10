export type AiErrorKind =
  | 'no-key'
  | 'auth'
  | 'rate-limit'
  | 'network'
  | 'unknown'

export class AiError extends Error {
  kind: AiErrorKind
  status?: number

  constructor(kind: AiErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'AiError'
    this.kind = kind
    this.status = status
  }
}

export function toastMessageForAiError(err: unknown): string {
  if (err instanceof AiError) {
    switch (err.kind) {
      case 'no-key':
        return 'Add your API key in Settings to start.'
      case 'auth':
        return 'Invalid API key – edit in Settings.'
      case 'rate-limit':
        return 'Rate limited, try again in a moment.'
      case 'network':
        return 'Network error – check your connection.'
      default:
        return err.message || 'Something went wrong.'
    }
  }
  return err instanceof Error ? err.message : 'Something went wrong.'
}
