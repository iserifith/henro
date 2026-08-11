# Contract: Node Kind Model

Defines the exact shape and invariants of the `kind`/`answerId` extension to `NodeData`
(`src/store.ts`) and the two new store actions that create question/answer nodes. Any
implementation must satisfy this contract; see `data-model.md` §1/§3 for the full field tables and
`research.md` R1/R2/R11/R12 for rationale.

## Type

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
  kind?: NodeKind
  answerId?: string
}
```

## Invariants

1. **Legacy default**: any node with `kind === undefined` MUST be treated identically to
   `kind === 'idea'` at every read site. No code path may throw, warn, or behave differently for
   `undefined` vs. `'idea'`.
2. **Kind is set once, at creation, and never changes**: no action in this feature (or any
   existing action) mutates an existing node's `kind`.
3. **`answerId` is exclusive to `kind === 'question'`**: it MUST be `undefined` on `idea`/`answer`
   nodes. It transitions `undefined → <id>` exactly once, on first answer; there is no
   "unanswer"/"re-answer" operation in this feature.
4. **`answerId`, once set, always resolves**: `nodes[question.answerId]` MUST exist in the `nodes`
   map (it may have `status: 'dismissed'` if later deleted independently — see data-model.md §1
   "Validation rules" — but the key is never removed from the map, consistent with Henro's
   never-hard-delete model, Constitution Principle IV).
5. **Answer node text is exact and immutable at creation**: `answerQuestion` MUST store
   `text.trim()` verbatim — no AI post-processing, truncation, or reformatting (FR-008, FR-012).
   The existing `updateNodeText` action MAY still be used afterward to edit it by hand (same as any
   other node), which is not a violation of FR-012 ("only user-typed text may become an answer
   node's content" — hand-editing is still user-typed).
6. **Question/answer nodes are full graph participants**: they use the same `position`, `size`,
   `parentId`/`childIds`, `status` fields as idea nodes and MUST flow through the same layout
   (`computeChildPositions`), physics/rendering (`BubbleNode`), and persistence path — no
   kind-specific exclusion from any of those systems (FR-004).

## `askMeNode(id: string, steer?: string): Promise<void>`

**Preconditions**: `nodes[id]` exists; `get().isLoading` is falsy.

**Effect on success**: for each generated question string, a new `NodeData` is added with:

```ts
{
  id: uid(),
  text: questionText,
  parentId: id,
  childIds: [],
  position: /* via computeChildPositions, same call shape as expandNode */,
  size: { w: 0, h: 0 },
  status: 'active',
  origin: 'ai',
  kind: 'question',
  answerId: undefined,
  steer: trimmedSteer || undefined,
}
```

The target node's `childIds` gains the new question ids. A history frame is pushed (undo/redo
covers this action like any other node-creating action).

**Effect on failure**: no nodes are added; `isLoading` is cleared; the same class of toast the
existing `expandNode` failure path produces is shown (`toastError(err)`, sourced from
`toastMessageForAiError`). No distinct "question generation failed" copy is required — FR-006 asks
for "the same class" of feedback, not new copy.

**Non-effect**: does not set `answeringQuestionId`, does not touch `compose`/`merge` state, does
not modify any node other than the target (`childIds`) and the newly created question nodes.

## `answerQuestion(questionId: string, text: string): void`

**Preconditions**: `nodes[questionId]` exists, has `(kind ?? 'idea') === 'question'`, and
`answerId === undefined`. `text.trim()` is non-empty.

If any precondition fails (including blank/whitespace-only `text` — FR-009), this is a no-op: no
node is created, `nodes[questionId]` is unchanged, no history frame is pushed.

**Effect on success**: exactly one new `NodeData` is added:

```ts
{
  id: uid(),
  text: text.trim(),
  parentId: questionId,
  childIds: [],
  position: /* via computeChildPositions, single-child call */,
  size: { w: 0, h: 0 },
  status: 'active',
  origin: 'user',
  kind: 'answer',
}
```

`nodes[questionId].answerId` is set to the new node's id. `nodes[questionId].childIds` gains the
new node's id. A history frame is pushed. `answeringQuestionId` is cleared.

## Interop guards this contract requires elsewhere

These are not part of the node-kind type itself but are invariants the rest of the codebase must
uphold once `kind` exists — see `data-model.md` §4 for the exact call sites:

- `compose()` MUST exclude `kind === 'question'` node text from its synthesized summary input
  (FR-019). `kind === 'answer'` text MUST be included (treated like idea text).
- `mergeNodes()`, the context-menu merge-item visibility check, and the drag-based
  `findMergeCandidate` MUST all independently reject any node with `kind === 'question'` as either
  merge participant (FR-020) — see research.md R4 for why all three sites need the guard.
- No action anywhere may auto-create, auto-modify, or auto-delete a question or answer node except
  the two actions defined in this contract, plus the pre-existing kind-agnostic `dismissNode`
  (FR-014, FR-015: no AI-assigned verdict of any kind on question nodes).
