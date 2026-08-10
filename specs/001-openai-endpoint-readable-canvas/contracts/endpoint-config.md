# Contract: OpenAI-Compatible Endpoint Request

Henro is a client-only app with no backend of its own; the "external interface" this feature
exposes is the outbound HTTP contract Henro speaks to whatever base URL the user configures. This
document is the contract a self-hosted/third-party OpenAI-compatible server must satisfy for
Henro to work against it, and the contract Henro's own code (`src/lib/ai.ts`) commits to on the
request side. It supersedes nothing about OpenRouter today — it generalizes the existing
OpenRouter-only request shape (unchanged) to any target base URL.

## Endpoint

```
POST {baseUrl}
```

Where `{baseUrl}` is:
- The user-configured `baseUrl` from `openrouter-config` in localStorage, if present and valid
  (see data-model.md §1 Validation rules), **or**
- `https://openrouter.ai/api/v1/chat/completions` (the fixed default) otherwise.

Henro does **not** append or infer any path segments — the configured value is used verbatim as
the full request URL. A user pointing at a self-hosted server MUST supply the complete path
(e.g., `http://localhost:11434/v1/chat/completions`), matching the spec's scope: "'OpenAI-
compatible' is scoped to the chat-completions request/response shape Henro already sends and
parses" (spec Assumptions).

## Request

### Headers

| Header | Always sent? | Value |
|---|---|---|
| `Authorization` | Yes | `Bearer {apiKey}` — the configured or dev-env-fallback key |
| `Content-Type` | Yes | `application/json` |
| `HTTP-Referer` | **Only when `baseUrl` resolves to the OpenRouter default** | `window.location.origin` |
| `X-Title` | **Only when `baseUrl` resolves to the OpenRouter default** | `'Henro'` |

Per FR-008 / research.md R3, the last two headers are OpenRouter-specific app-identification
headers and MUST be omitted for any non-OpenRouter `baseUrl`, so no app-identifying metadata is
sent to a third-party endpoint the user configured without asking for it.

### Body

Unchanged JSON shape (this feature does not modify the request payload contract, only its
destination and headers):

```json
{
  "model": "string",
  "messages": [
    { "role": "system" | "user" | "assistant", "content": "string" }
  ]
}
```

Callers within Henro (`generateBranches`, `mergeIdeas`, `compose`, `generateProjectName` in
`src/lib/ai.ts`) are unchanged by this feature — they all funnel through the same internal
`chat()` function, which is the only place the base URL / headers logic changes.

## Response — success path

Henro expects, and only reads:

```json
{
  "choices": [
    { "message": { "content": "string" } }
  ]
}
```

`data.choices[0].message.content` is the only field accessed (`src/lib/ai.ts:100`). Any
additional fields in a compatible server's response are ignored. This is unchanged by this
feature — it is the existing OpenAI-compatible chat-completions response shape, now just also
expected from non-OpenRouter servers.

## Response — error paths (client behavior contract)

| Condition | Henro behavior | User-visible copy (post-feature, FR-007) |
|---|---|---|
| `fetch()` throws (DNS, connection refused, CORS, offline) | `AiError('network', ...)` | "Network error – check your connection." (unchanged — already generic) |
| HTTP 401 or 403 | `AiError('auth', ...)`, no retry | "Invalid API key – edit in Settings." (unchanged — already generic) |
| HTTP 429 | Retry with exponential backoff (2s/4s/8s), capped at 3 attempts / 20s wall clock, then `AiError('rate-limit', ...)` | "Rate limited, try again in a moment." (unchanged — already generic) |
| Any other non-2xx | `AiError('unknown', ...)` with the response body/status in the error message | Message must not hardcode "OpenRouter" (**changed by this feature** — currently reads `` `OpenRouter error ${status}: ${body}` ``; must become provider-generic, e.g. `` `AI provider error ${status}: ${body}` ``) |
| No API key configured, no dev-env fallback | `AiError('no-key', ...)`, no request sent | "Add your API key in Settings to start." (**changed by this feature** — currently says "OpenRouter key") |

A non-OpenRouter server that returns a differently-shaped error body (per spec Edge Cases: "the
configured endpoint's error response doesn't match OpenRouter's shape") is still handled by this
same table — Henro branches only on HTTP status code, never on parsing the error body's shape, so
a non-standard error body degrades to the generic `res.statusText` fallback
(`` body || res.statusText ``, `src/lib/ai.ts:94`) rather than crashing.

## Non-goals (explicitly out of scope, per spec Assumptions)

- Streaming responses (SSE / chunked) — Henro only ever does a single non-streaming `fetch` + full
  JSON body read.
- Multiple saved endpoint profiles — one active configuration at a time.
- Fetching an available-models list from the endpoint — `model` remains a free-text field.
