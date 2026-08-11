# Contract: Question Generation (`generateQuestions`)

Defines the `src/lib/ai.ts` function `askMeNode` calls, sibling to the existing `generateBranches`
(`ai.ts:124-193`), and the `src/lib/prompts.ts` constants it depends on. Reuses the existing
`chat()` transport (`ai.ts:41-120`) unchanged — same retry/backoff, same error mapping to
`AiError`, same `getConfig()`-sourced model/base-URL/system-prompt. No new request/response
transport contract; this document covers only the message-construction and parsing layer that
differs from `generateBranches`.

## Signature

```ts
export async function generateQuestions(
  text: string,
  directContext: ContextNode[],
  widerContext: ContextNode[],
  steer?: string,
  targetSteer?: string,
): Promise<string[]>
```

Identical parameter shape to `generateBranches` — `text` is the target node's text, `directContext`/
`widerContext` come from the same `getContextNodes` BFS `askMeNode` already computes, `steer` is
the lens supplied at trigger time (FR-005), `targetSteer` is the target node's own prior `steer`
(same role as `generateBranches`'s `targetSteer` param).

## Prompt construction

Mirrors `generateBranches`'s message shape (`ai.ts:139-153`) with question-specific framing:

- **System message**: existing `systemPrompt` (from `getConfig()`, unchanged — same
  practical/ambitious/critical preset or custom prompt the user has configured) followed by an
  instruction to return ONLY a JSON array of strings, and to generate probing questions —
  explicitly naming the five example dimensions from spec.md ("audience, failure mode, cost, a
  hidden assumption, a next step") as the kind of angles to draw from, with an instruction that
  each question must take a **distinct** dimension/angle from the others (FR-002: "producing
  questions that span distinct dimensions... rather than near-duplicates").
- **User message**: same `targetLine`/`askStr`/`directStr`/`widerStr` composition pattern as
  `generateBranches` (`ai.ts:135-153`) — target node text, its own prior steer (if any), the
  trigger-time lens (if any, via `askStr`), direct context ("already-taken ground... do not
  restate"), wider context ("background... do not repeat"). Same anti-repetition framing
  `generateBranches` already uses applies to questions too — an Ask Me on a node that already has
  sibling questions covering "cost" shouldn't ask about cost again.
- Requests "between 3 and 5" questions (not a fixed count baked into the prompt the way
  `branchCount` is user-configurable for `generateBranches` — spec Assumptions explicitly rule out
  a user-configurable question count for this feature).

## Response parsing

Identical fallback chain to `generateBranches` (`ai.ts:164-192`):

1. Strip Markdown code fences (\`\`\`json ... \`\`\`).
2. `JSON.parse` the result; if it's an array with `length >= 1`, use it (each item coerced to
   `String`).
3. If `JSON.parse` throws: fall back to newline-splitting, stripping numbering
   (`^\d+[.)]\s*`) and stray quote/bracket punctuation — same regex `generateBranches` uses.
4. If nothing usable comes out of either path: return a synthetic fallback (below) rather than
   surfacing raw/broken text (the spec's explicit "can't be parsed" edge case).

### Question count normalization

Unlike `generateBranches` (which trusts the user-configured `branchCount` as the count to slice
to), `generateQuestions` has no user-configured count. After parsing:

- If the parsed array length is within `[QUESTION_COUNT_MIN, QUESTION_COUNT_MAX]` (3–5), use it
  as-is.
- If longer than 5, slice to 5.
- If shorter than 3 but `>= 1`, use what was returned as-is (a smaller-than-ideal but still
  legitimate set of questions is preferable to padding with synthetic filler that would dilute the
  "distinct dimensions" requirement).
- If the array is empty or parsing fully failed (step 4 above), use the synthetic fallback.

### Synthetic fallback (parse failure only — not an error path)

```ts
export const QUESTION_DIMENSIONS = [
  (text: string) => `Who is this really for — who is the intended audience of "${text}"?`,
  (text: string) => `What's the most likely way "${text}" fails or falls short?`,
  (text: string) => `What would this cost — in time, money, or effort?`,
  (text: string) => `What assumption is "${text}" resting on that hasn't been tested?`,
  (text: string) => `What's the very next concrete step to move "${text}" forward?`,
]
```

Fallback returns `QUESTION_DIMENSIONS.slice(0, DEFAULT_QUESTION_COUNT).map(f => f(text))` — a
deterministic, always-available set of 4 dimension-templated questions. This path never throws and
never leaves a partial/malformed node on the canvas (`askMeNode` only creates nodes from the
resolved string array, whichever path produced it) — satisfies FR-006's parse-failure clause
without a distinct error toast (this is graceful content degradation, not a provider/network/auth
error; those still throw `AiError` from `chat()` and propagate to `askMeNode`'s catch block
unchanged).

## New `prompts.ts` constants

```ts
export const DEFAULT_QUESTION_COUNT = 4
export const QUESTION_COUNT_MIN = 3
export const QUESTION_COUNT_MAX = 5
export const QUESTION_DIMENSIONS: Array<(text: string) => string> = [ /* see above */ ]
```

Added alongside the existing `DEFAULT_BRANCH_COUNT`/`CONTEXT_MAX_DEPTH`/`CONTEXT_MAX_NODES`
constants (`prompts.ts:15-18`) — no change to any existing constant or preset.

## Error handling (unchanged transport contract)

`generateQuestions` calls the same `chat()` used by every other AI function in `ai.ts`. All of
`chat()`'s existing error paths — no API key (`AiError('no-key')`), 401/403
(`AiError('auth')`), 429 with retry/backoff then `AiError('rate-limit')`, network failure
(`AiError('network')`), other non-OK status (`AiError('unknown')`) — apply unchanged and propagate
to `askMeNode`'s catch block, which calls the existing `toastError()` (same function
`expandNode`/`mergeNodes`/`compose` already use). No new `AiErrorKind` is introduced by this
feature.
