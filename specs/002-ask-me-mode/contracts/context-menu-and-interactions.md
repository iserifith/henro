# Contract: Context Menu Items & Node Interactions per Kind

Extends spec-001's `contracts/context-menu-actions.md` pattern (action → store-call mapping) for
the three node kinds this feature introduces. Every menu item and click/focus behavior below is
either unchanged from spec-001 or newly defined here; nothing in spec-001's existing contract for
`idea`-kind nodes changes.

## Context menu item availability by kind

`ContextMenu.tsx`'s node-menu item list (`ContextMenu.tsx:74-116`), extended:

| Menu item | `idea` node | `question` node | `answer` node |
|---|---|---|---|
| Expand / Branch | offered (unchanged) | **not offered** | offered (same as idea) |
| Steer / Lens | offered (unchanged) | **not offered** | offered (same as idea) |
| **Ask Me** (new) | **offered** | **not offered** | **offered** |
| Merge | offered iff `selectedNodeIds.length === 2 && includes(nodeId)` (unchanged) | **never offered**, regardless of selection | offered under the same condition as idea |
| Delete | offered (unchanged) | offered (unchanged) | offered (unchanged) |

All availability is computed from `(nodes[nodeId].kind ?? 'idea')`, evaluated at render time — no
change to the `nodeActive` gate (`ContextMenu.tsx:77`, dismissed nodes still get no menu at all,
mirroring existing behavior, FR-001 second half).

**Rationale for the question-node column**: research.md R3. This is a deliberate reading of
FR-001 ("any active node") in light of FR-015/FR-016/Story-2-AC5, not an oversight — see
research.md for the full argument.

### New menu item: "Ask Me"

```ts
{
  key: 'ask-me',
  label: 'Ask Me',
  onActivate: () => {
    setAskMePrompt({ nodeId, defaultValue: '' })
    closeContextMenu()
  },
}
```

Placed immediately after "Steer / Lens" in the item list (before Merge/Delete), for idea and
answer nodes only.

## Node click/focus routing (`BubbleNode.tsx`'s `handlePointerUp`, extended)

`handlePointerUp` (`BubbleNode.tsx:237-282`) currently branches, on a non-dragged click, into:
shift-click → `toggleNodeSelected`; second-press (double-click window) → open `steerPrompt`;
otherwise → `selectNode`. This is extended with a kind-aware branch, evaluated **before** the
existing shift/second-press/select branches:

```
if not dragged, not shift-click, not second-press:
  if (node.kind ?? 'idea') === 'question' and node.answerId === undefined:
    openAnswerInput(id)          // NEW — instead of selectNode(id)
    return
  # else: existing behavior unchanged (selectNode(id) on plain click)
```

| Node state | Plain click/focus | Second-press (double-click window) | Shift-click |
|---|---|---|---|
| `idea` / `answer` | `selectNode(id)` (unchanged — opens `SidePanel`) | opens `steerPrompt` (unchanged) | `toggleNodeSelected(id)` (unchanged) |
| `question`, unanswered | **`openAnswerInput(id)`** (NEW — opens inline `AnswerInput`, does *not* open `SidePanel`) | n/a (question nodes have no Expand/Steer, so second-press has nothing to open — falls through to plain-click behavior, i.e. also opens `AnswerInput`) | `toggleNodeSelected(id)` (unchanged — a question node can still be shift-selected, e.g. for future multi-node operations, even though it can't be a merge participant) |
| `question`, answered | `selectNode(id)` (same as idea — opens `SidePanel`, which shows the "View answer" affordance, see below) | n/a (no Ask Me/Expand available) | `toggleNodeSelected(id)` (unchanged) |

This satisfies FR-007 ("focusing or clicking an unanswered question node MUST expose an inline
answer input") as the *primary* interaction for unanswered questions, while answered questions
revert to normal idea-like selection behavior so their content/provenance is reviewable in the
existing `SidePanel` (Story 2 AC6).

## `AnswerInput` component contract

New component, defined alongside the existing `SteerInput` in `BubbleNode.tsx`, rendered when
`answeringQuestionId === id`:

```ts
function AnswerInput({
  onSubmit,   // (text: string) => void — only called with non-blank trimmed text
  onCancel,   // () => void
}: {
  onSubmit: (text: string) => void
  onCancel: () => void
})
```

Behavior (research.md R8 — modeled on `NodeInput.tsx`'s commit-on-blur semantics, not
`SteerInput`'s cancel-on-blur semantics):

| Event | Behavior |
|---|---|
| Enter (form submit, `preventDefault`) | if `text.trim()` non-empty: `onSubmit(text.trim())`; else: no-op, input stays open |
| Escape | `onCancel()` — input closes, typed text discarded, no node created |
| Blur (click away) | if `text.trim()` non-empty: `onSubmit(text.trim())`; else: `onCancel()` — either way the input closes |
| Mount | `autoFocus` |

Visual anchoring: rendered inside the node's outer `div` (same mount point as the existing
`steerPrompt`-driven `SteerInput`, `BubbleNode.tsx:455-461`), appearing below the bubble — not a
screen-fixed floating form the way `NodeInput.tsx` is (that component has no "anchor node," this
one always does).

Wiring in `BubbleNode.tsx`:

```tsx
{answeringQuestionId === id && (
  <AnswerInput
    onSubmit={(text) => answerQuestion(id, text)}
    onCancel={() => closeAnswerInput()}
  />
)}
```

## `SteerInput` reuse for Ask Me's lens entry

The existing `SteerInput` component (`BubbleNode.tsx:466-497`) is reused unchanged in behavior,
mounted a second time per node:

```tsx
{askMePrompt?.nodeId === id && (
  <SteerInput
    defaultValue={askMePrompt.defaultValue}   // '' — no default "ask" phrase
    onSubmit={(value) => askMeNode(id, value)}
    onCancel={() => setAskMePrompt(null)}
  />
)}
```

Its existing Enter-submits/Escape-or-blur-cancels behavior (`BubbleNode.tsx:483-492`) is unchanged
— submitting with blank text still calls `askMeNode(id, '')`, which is a valid call (FR-005's "no
lens supplied" branch — `generateQuestions` treats an empty/whitespace `steer` as absent, same as
`generateBranches` already does via `steer?.trim()`).

If both `SteerInput` (from `steerPrompt`) and this `SteerInput` (from `askMePrompt`) were
somehow open for the same node simultaneously, they'd render as two stacked inputs — this cannot
happen in practice because the context menu closes on any item click and only one menu item can be
activated at a time (research.md notes this isn't independently guarded, matching how `steerPrompt`
itself has no exclusivity guard against other ephemeral state today).

## `SidePanel.tsx` additions (read-only provenance surfacing)

No new component, additive JSX only, gated on the selected node's kind:

| Selected node kind | Addition |
|---|---|
| `question`, answered | A "View answer →" button below the existing body text, `onClick={() => selectNode(node.answerId!)}` (mirrors the existing "Re-branch with different lens" button's placement/style, `SidePanel.tsx:104-117`). Satisfies Story 2 AC6 ("existing answer is reachable from it"). |
| `answer` | A "Answers: <question text> →" button, `onClick={() => selectNode(node.parentId!)}`, same placement/style pattern. |
| `question`, unanswered | No addition — `SidePanel` is not the primary surface for unanswered questions (they're answered via `AnswerInput`, not via `SidePanel`); `SidePanel` may still be reached by selecting one via `toggleNodeSelected`/multi-select, in which case it renders with today's generic body-text view and no Expand/Ask-Me buttons (since neither is offered for question nodes — the panel's existing "Expand" button, `SidePanel.tsx:122-137`, must also be hidden for `kind === 'question'`). |

## Keyboard/dismissal parity (unchanged)

Everything in spec-001's `contracts/context-menu-actions.md` regarding Esc-to-close,
outside-pointerdown-to-close, arrow-key navigation between menu items, and retargeting-on-new-
right-click (`ContextMenu.tsx:28-69`) applies unchanged — the item *list* differs by kind (table
above), but the menu container's interaction shell is untouched by this feature.
