# Data Model: Ask Me Mode

Henro has no database — "data model" means the client-side TypeScript types on
`useBrainstormStore` and what (de)serializes through the existing `henro` localStorage record via
`persist`. This document extends `src/store.ts`'s existing shapes; see research.md for why each
choice was made.

## 1. Node Kind (discriminator on the existing `NodeData`)

Extends the existing `NodeData` type (`src/store.ts:36-46`) — no new top-level entity, no new
localStorage key. `partialize` (`store.ts:968-976`) already persists the whole `nodes` map, so
these new fields require no `partialize` change (research.md R1).

```ts
export type NodeKind = 'idea' | 'question' | 'answer'

export type NodeData = {
  id: string
  text: string
  parentId: string | null
  childIds: string[]
  position: Position
  size: { w: number; h: number }
  status: 'active' | 'dismissed'
  origin: 'user' | 'ai'
  steer?: string
  kind?: NodeKind        // NEW — optional; absent = legacy node, treated as 'idea'
  answerId?: string      // NEW — question nodes only; set once an answer node exists
}
```

### Fields

| Field | Type | Required? | Default when absent | Notes |
|---|---|---|---|---|
| `kind` | `NodeKind \| undefined` | Optional | `'idea'` (FR-013) | Read everywhere via `node.kind ?? 'idea'`. Never written as `'idea'` explicitly for legacy nodes — they simply stay absent; only newly created question/answer nodes ever get an explicit `kind`. |
| `answerId` | `string \| undefined` | Optional; meaningful only when `kind === 'question'` | `undefined` (unanswered) | Set exactly once, by `answerQuestion`, the first time a question is answered (FR-010). Never cleared by any action in this feature (no "unanswer" operation exists). |

### Derived values (not stored)

```ts
const effectiveKind = (n: NodeData): NodeKind => n.kind ?? 'idea'
const isAnswered = (n: NodeData): boolean => effectiveKind(n) === 'question' && !!n.answerId
```

### Validation rules

- `kind`, when present, is always one of the three literal values — set only by this feature's own
  node-creation code (`askMeNode`, `answerQuestion`), never by user input or AI output text.
- `answerId`, when present, always refers to a node that exists in `nodes` (it is set at the same
  moment the answer node is created, in the same `set()` call) — it may later point at a
  `status: 'dismissed'` node if the user deletes the answer independently; this is expected and
  handled with no special-case code (research.md R6).

### State transitions

| Node | From | Event | To |
|---|---|---|---|
| Question node | *(doesn't exist)* | `askMeNode` resolves | `kind: 'question'`, `answerId: undefined`, `status: 'active'`, `origin: 'ai'`, `parentId: <target node id>` |
| Question node | `answerId: undefined` | User submits non-blank text via its `AnswerInput` | `answerId: <new answer node id>` (question otherwise unchanged; still `status: 'active'`) |
| Question node | any | User deletes it (context menu → Delete) | `status: 'dismissed'`, `childIds: []`; any answer node is orphaned (`parentId: null`), not deleted (FR-018) |
| Answer node | *(doesn't exist)* | `answerQuestion` runs | `kind: 'answer'`, `origin: 'user'`, `status: 'active'`, `parentId: <question node id>`, `text: <exact submitted text>` |
| Idea node (legacy or new) | n/a | n/a | `kind` stays `undefined`/absent unless explicitly created as `'idea'` — this feature never writes `kind: 'idea'` explicitly, it only ever omits the field, which is behaviorally identical (R12) |

### Relationships

- Read by: `ContextMenu.tsx` (item availability per kind, R3/R4), `BubbleNode.tsx` (click/focus
  routing per kind, styling per kind, R9), `SidePanel.tsx` (answered-question "View answer" /
  answer-node "back to question" affordances), `store.ts`'s `compose()` (R5) and `mergeNodes()`/
  `findMergeCandidate` (R4).
- Written by: `askMeNode` (new question nodes), `answerQuestion` (new answer nodes + the
  originating question's `answerId`).
- Lineage (`parentId`/`childIds`) is the same mechanism idea/AI-branch nodes already use — a
  question node is just a child of its target node; an answer node is just a child of its
  question node. No new graph structure.

## 2. Ephemeral Ask Me interaction state (not persisted)

Two new fields on `BrainstormStore`, in the same ephemeral bucket as the existing `steerPrompt`
and `contextMenu` (excluded from persistence because `partialize` is an allowlist that never names
them — see `store.ts:968-976` — no code change needed to keep them out of localStorage).

```ts
export type SteerPrompt = {          // EXISTING type, reused as-is for askMePrompt
  nodeId: string
  defaultValue: string
}

// Added to BrainstormStore:
askMePrompt: SteerPrompt | null            // NEW — mirrors steerPrompt's shape/lifecycle
setAskMePrompt: (prompt: SteerPrompt | null) => void   // NEW

answeringQuestionId: string | null         // NEW — which question's AnswerInput is open, if any
openAnswerInput: (questionId: string) => void   // NEW
closeAnswerInput: () => void                    // NEW
```

### Fields

| Field | Type | Notes |
|---|---|---|
| `askMePrompt` | `SteerPrompt \| null` | Set by the context menu's "Ask Me" item (`setAskMePrompt({ nodeId, defaultValue: '' })`); cleared on submit or cancel. Mutually exclusive in practice with `steerPrompt` being open for the same node (both render `SteerInput`, gated on their own `nodeId` match), but nothing enforces exclusivity — matches how `steerPrompt` itself isn't guarded against other ephemeral state today. |
| `answeringQuestionId` | `string \| undefined` \| `null` | Which question node's inline `AnswerInput` is currently open. `null` when none. Set by clicking/focusing an unanswered question node (FR-007); cleared on submit, cancel (Escape), or blur-without-text. |

### State transitions

| From | Event | To |
|---|---|---|
| `askMePrompt: null` | Context menu "Ask Me" clicked on an active idea/answer node | `{ nodeId, defaultValue: '' }` |
| `askMePrompt: {...}` | Enter pressed in the input (any text, including blank) | `askMeNode(nodeId, value)` called, then `null` |
| `askMePrompt: {...}` | Escape or blur | `null`, no generation triggered |
| `answeringQuestionId: null` | Plain click/focus on an active, unanswered question node | `<that question's id>` |
| `answeringQuestionId: <id>` | Enter or blur with non-blank trimmed text | `answerQuestion(id, text)` called, then `null` |
| `answeringQuestionId: <id>` | Escape, or blur with blank/whitespace-only text | `null`, no node created, question's `answerId` unchanged (FR-009) |

### Relationships

- `askMePrompt` rendered by: `BubbleNode.tsx` (new `SteerInput` instance parallel to the existing
  `steerPrompt`-driven one), written by: `ContextMenu.tsx`'s new "Ask Me" item.
- `answeringQuestionId` rendered by: `BubbleNode.tsx` (new `AnswerInput` component), written by:
  `BubbleNode.tsx`'s own click handler (for open) and the `AnswerInput` component itself (for
  close).
- Both fields are added to `freshEphemeralState()` (`store.ts:261-277`) alongside `steerPrompt`,
  so undo/redo/project-switch resets them the same way every other transient UI field is reset.

## 3. Store actions

```ts
askMeNode: (id: string, steer?: string) => Promise<void>
answerQuestion: (questionId: string, text: string) => void
```

### `askMeNode(id, steer?)`

Structurally parallel to the existing `expandNode(id, steer?)` (`store.ts:673-736`):

1. Guard: node must exist and `isLoading` must be falsy (same as `expandNode`).
2. `set({ isLoading: id, askMePrompt: null })`.
3. Gather context via the existing `getContextNodes` (unchanged — kind-agnostic, same BFS used by
   Expand today; question/answer node text can appear as direct/wider context exactly like idea
   node text does, R3 makes this safe against recursion structurally, not via a context filter).
4. Call `generateQuestions(node.text, context.direct, context.wider, steer, node.steer)`
   (see `contracts/question-generation-prompt.md`).
5. Compute positions via the existing `computeChildPositions` (unchanged), `count = questions.length`.
6. Build new `NodeData[]` with `kind: 'question'`, `origin: 'ai'`, `parentId: id`,
   `answerId: undefined`, `steer: trimmedSteer || undefined` — same shape `expandNode` uses for its
   children, plus the new `kind` field.
7. `set()` merges the new nodes into `s.nodes`, appends their ids to the target's `childIds`, pushes
   history, clears `isLoading` — identical structure to `expandNode`'s success path.
8. On error (network/auth/rate-limit — anything `chat()` throws): `set({ isLoading: null })` +
   `toastError(err)`, same as `expandNode`'s catch block (FR-006). No nodes are added on error —
   node creation only happens after `generateQuestions` resolves.

### `answerQuestion(questionId, text)`

Synchronous (no AI call), parallel in spirit to `addUserNode` (`store.ts:837-865`):

1. Guard: `text.trim()` must be non-empty; the target node must exist, have
   `(kind ?? 'idea') === 'question'`, and not already have an `answerId` (re-submitting through an
   already-answered question's input is a no-op per the spec's own edge case — though per R8/FR-007
   the input isn't even rendered once `answerId` is set, this guard is the defensive backstop).
2. Create a new node: `kind: 'answer'`, `origin: 'user'`, `status: 'active'`, `parentId: questionId`,
   `text: text.trim()`, positioned via the existing `computeChildPositions` (single child, so this
   is just "one position near the question node," same call shape `expandNode` uses for
   `branches.length === 1`).
3. `set()`: add the new node, append its id to the question's `childIds`, set the question's
   `answerId` to the new node's id, push history, clear `answeringQuestionId`.

No error path — this action never talks to the network (Constitution Principle III: the AI never
authors answer content; FR-012).

## 4. Interop changes to existing actions

| Existing action | Change | FR |
|---|---|---|
| `compose()` (`store.ts:906-925`) | `activeTexts` filter gains `&& (n.kind ?? 'idea') !== 'question'` | FR-019 |
| `mergeNodes(id1, id2)` (`store.ts:763-835`) | Early-return guard if either node's `(kind ?? 'idea') === 'question'` | FR-020 |
| `ContextMenu.tsx` merge-item visibility (`ContextMenu.tsx:105`) | Additional condition: neither selected node's kind is `'question'` | FR-020 |
| `BubbleNode.tsx`'s `findMergeCandidate` (`BubbleNode.tsx:130-144`) | Skip candidates with `kind === 'question'`; skip entirely if the dragged node itself is a question | FR-020 |
| `dismissNode(id)` (`store.ts:738-761`) | **No change** — existing orphan-not-cascade logic already satisfies FR-018 (research.md R6) | FR-018 |
| `getContextNodes` (`store.ts:164-219`) | **No change** — kind-agnostic BFS, unaffected by this feature (research.md R3) | — |

See `contracts/node-kind-model.md` for the full per-field contract and
`contracts/context-menu-and-interactions.md` for the UI-level contract these actions are wired to.
