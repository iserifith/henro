# Tasks: Ask Me Mode

**Input**: Design documents from `/specs/002-ask-me-mode/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md,
contracts/node-kind-model.md, contracts/context-menu-and-interactions.md,
contracts/question-generation-prompt.md, quickstart.md

**Tests**: This repository has no automated test runner configured (no Vitest/Jest, no `tests/`
directory, no CI workflow — confirmed in plan.md Technical Context, unchanged from spec-001). Per
the Task Generation Rules, test tasks are only included if explicitly requested; the spec does not
request one. This file uses the project's existing quality gates — `pnpm build` (`tsc -b && vite
build`) and `pnpm lint` (`eslint .`) — plus the manual scenarios in `quickstart.md` as the
verification step at the end of each user-story phase, identical to the convention established in
`specs/001-openai-endpoint-readable-canvas/tasks.md`.

**Organization**: Tasks are grouped by user story (US1=P1, US2=P2, US3=P3, US4=P4) per spec.md's
priorities, to enable independent implementation and testing of each story.

**Locked decisions carried through every task below** (plan.md, research.md — not reopened):
(1) answers are permanent canvas nodes, never transient prompt-steering text; (2) Ask Me is
triggered per-node from the context menu only — no global mode switch.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Which user story this task belongs to (US1/US2/US3/US4) — omitted for
  Setup/Foundational/Polish
- Every task includes the exact repo-relative file path(s) and, where the target already exists,
  the current line numbers it touches (read from the live tree at spec-writing time; re-locate by
  content if the file has since shifted)

## Path Conventions

Single-project client-only React app (no `frontend/`/`backend/` split, no `tests/` tree) — all
paths are under `src/` at the repository root, per plan.md's Project Structure. This feature adds
**no new component files** — `AnswerInput` lives inside `BubbleNode.tsx` alongside the existing
`SteerInput` (research.md R8).

**Out of scope for every task below** (per the governing instructions for this run): do not edit
`package.json`, `tsconfig*.json`, `vite.config.ts`, `eslint.config.js`, `index.html`, or any other
build/config file; do not modify `specs/001-openai-endpoint-readable-canvas/*`; do not modify any
`specs/002-ask-me-mode/*` file other than this one (`tasks.md`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish a clean, verified starting point before any source file is touched.

- [x] T001 Run `pnpm install`, then `pnpm build` (`tsc -b && vite build`) and `pnpm lint`
  (`eslint .`) from the repository root on the `002-ask-me-mode` branch, and confirm both pass with
  zero errors — establishing the pre-change baseline before any task below modifies source files.

**Checkpoint**: Baseline confirmed clean — implementation can begin.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared data-model and ephemeral-state additions every user story is built on top
of. **No user-story work should begin until this phase is complete.**

- [x] T002 In `src/store.ts`: export `export type NodeKind = 'idea' | 'question' | 'answer'`, and
  add `kind?: NodeKind` and `answerId?: string` to the existing `NodeData` type (`store.ts:36-46`).
  Do **not** add a `persist` `version` bump or `migrate()` function, and do **not** change
  `partialize` (`store.ts:968-976`) — it already persists the whole `nodes` map, so these two new
  optional fields round-trip through save/load with zero further code (data-model.md §1,
  research.md R1). Acceptance: `pnpm build` type-checks with the new fields present; every existing
  node-creation call site (`setSeed`, `expandNode`, `mergeNodes`, `addUserNode`, all still
  building `NodeData` object literals without `kind`/`answerId`) continues to compile unchanged
  because both fields are optional. (FR-013)

- [x] T003 In `src/store.ts`: add the ephemeral Ask Me / answer-input interaction state, mirroring
  the existing `steerPrompt`/`setSteerPrompt` shape (data-model.md §2):
  1. Add `askMePrompt: SteerPrompt | null` and `answeringQuestionId: string | null` to the
     `BrainstormStore` interface (near `steerPrompt`/`contextMenu`, `store.ts:109,113`), plus method
     signatures `setAskMePrompt: (prompt: SteerPrompt | null) => void`,
     `openAnswerInput: (questionId: string) => void`, `closeAnswerInput: () => void` (near
     `setSteerPrompt`/`openNodeContextMenu`, `store.ts:131,157-159`).
  2. Add `askMePrompt: null` and `answeringQuestionId: null` to the store's initial state object
     (near `steerPrompt: null`, `store.ts:296`).
  3. Implement `setAskMePrompt: (prompt) => set({ askMePrompt: prompt })`,
     `openAnswerInput: (questionId) => set({ answeringQuestionId: questionId })`,
     `closeAnswerInput: () => set({ answeringQuestionId: null })`, placed next to the existing
     `setSteerPrompt`/`openNodeContextMenu` implementations (`store.ts:454`, `932-936`).
  4. Add `askMePrompt: null` and `answeringQuestionId: null` to `freshEphemeralState()`
     (`store.ts:261-277`) alongside the existing `steerPrompt: null`, so undo/redo/project-switch
     resets both fields the same way every other transient UI field is reset.
  Acceptance: `pnpm build` passes; `freshEphemeralState()`'s returned object includes both new
  keys; no other existing field in the returned object is removed or reordered in a way that
  changes behavior. (data-model.md §2, depends on T002 only insofar as both are same-file edits —
  no type dependency)

**Checkpoint**: Foundation ready — `kind`/`answerId` exist on `NodeData`, and the two new ephemeral
interaction fields exist and reset correctly. User Story 1 can now begin.

---

## Phase 3: User Story 1 - Ask the board a question about a node (Priority: P1) 🎯 MVP

**Goal**: A user right-clicks any active node, picks "Ask Me," optionally types a lens, and 3–5
question-kind nodes — visually distinct from idea nodes, each covering a different dimension —
appear connected to the target node. Failures degrade gracefully (toast, no partial nodes). Because
this phase is the first point at which `kind: 'question'` nodes can exist on a real canvas, it also
carries the merge/compose exclusion guards (FR-019/FR-020) needed so shipping US1 alone never lets
a question node be merged or summarized — the MVP boundary is fully self-consistent without US2–4.

**Independent Test**: Right-click an active node, select "Ask Me," and confirm a small set of
question-styled nodes appears connected to the target node, distinguishable at a glance from
ordinary idea nodes — independent of whether any question is ever answered (spec.md US1
Independent Test).

### Implementation for User Story 1

- [x] T004 [P] [US1] In `src/lib/prompts.ts`: add, after the existing `CONTEXT_MAX_NODES` constant
  (`prompts.ts:18`), `export const DEFAULT_QUESTION_COUNT = 4`,
  `export const QUESTION_COUNT_MIN = 3`, `export const QUESTION_COUNT_MAX = 5`, and
  `export const QUESTION_DIMENSIONS: Array<(text: string) => string>` — the 5 dimension-templated
  fallback question functions (audience / failure-mode / cost / hidden-assumption / next-step)
  specified verbatim in `contracts/question-generation-prompt.md`'s "Synthetic fallback" section.
  Acceptance: `pnpm build` type-checks; no existing constant in the file is modified.

- [x] T005 [US1] In `src/lib/ai.ts`: add `export async function generateQuestions(text, directContext,
  widerContext, steer?, targetSteer?): Promise<string[]>`, placed as a sibling immediately after
  `generateBranches` (`ai.ts:124-193`), importing `DEFAULT_QUESTION_COUNT`, `QUESTION_COUNT_MIN`,
  `QUESTION_COUNT_MAX`, `QUESTION_DIMENSIONS` from `./prompts` (depends on T004). Implement per
  `contracts/question-generation-prompt.md`:
  - Same system/user message construction pattern as `generateBranches`
    (`ai.ts:131-153`: `targetLine`/`askStr`/`directStr`/`widerStr`), but the system message instructs
    the model to return ONLY a JSON array of strings and to generate probing questions naming the
    five example dimensions (audience, failure mode, cost, a hidden assumption, a next step), each
    question taking a **distinct** dimension from the others; request "between 3 and 5" questions
    (no user-configurable count, unlike `branchCount`).
  - Reuse `chat()` unchanged (same call shape as `generateBranches`'s call at `ai.ts:155-162`, with
    label `'questions'`).
  - Identical strip-code-fences → `JSON.parse` → newline-split fallback chain to `generateBranches`
    (`ai.ts:164-186`).
  - Question-count normalization: parsed length in `[3,5]` → use as-is; `>5` → slice to 5; `>=1` and
    `<3` → use as-is (no padding); `0` or fully unparseable → synthetic fallback
    `QUESTION_DIMENSIONS.slice(0, DEFAULT_QUESTION_COUNT).map(f => f(text))`.
  - This function never throws for a parse failure (only `chat()`'s existing network/auth/rate-limit
    errors propagate, unchanged — no new `AiErrorKind`).
  Acceptance: `pnpm build` passes; manual smoke check via `pnpm dev` + DevTools console
  (`VITE_HENRO_DEBUG=true`) shows a `[AI] questions` log group with a JSON-array system/user prompt
  naming the five dimensions.

- [x] T006 [P] [US1] In `src/index.css`: add a new color token to the existing `@theme` block
  (alongside `--color-ai: #FDA5D5` at `index.css:8`), e.g. `--color-question: <hex>` — pick a value
  visually distinct from both `--color-ai` (pink, used for AI idea/branch nodes) and
  `--color-select` (cyan, used for selection/merge highlight) so a question node's outline reads as
  its own category at a glance (research.md R9, SC-007). Acceptance: `pnpm build` passes (Tailwind
  v4 auto-generates the `outline-question` utility from the new `--color-question` token, no other
  config file edit needed — do not hand-edit any Tailwind config).

- [x] T007 [US1] In `src/components/ContextMenu.tsx`: extend the node-menu item construction
  (`ContextMenu.tsx:74-116`) per `contracts/context-menu-and-interactions.md`'s availability table:
  1. Add a new "Ask Me" item (`key: 'ask-me'`, `label: 'Ask Me'`,
     `onActivate: () => { setAskMePrompt({ nodeId, defaultValue: '' }); closeContextMenu() }`),
     placed immediately after "Steer / Lens" in the items array, for `idea`/`answer` nodes only.
     Pull `setAskMePrompt` from the store the same way `setSteerPrompt` is already pulled
     (`ContextMenu.tsx:18`).
  2. Make the entire item list kind-aware: when `(nodes[nodeId].kind ?? 'idea') === 'question'`,
     the items array must contain **only** "Delete" — no "Expand / Branch", no "Steer / Lens", no
     "Ask Me", no "Merge", regardless of `selectedNodeIds` (research.md R3). `idea` and `answer`
     nodes keep the full item list (Expand/Branch, Steer/Lens, Ask Me, conditionally Merge, Delete).
  3. Extend the existing Merge-item visibility condition (`ContextMenu.tsx:105`,
     `selectedNodeIds.length === 2 && selectedNodeIds.includes(nodeId)`) with
     `&& (nodes[nodeId].kind ?? 'idea') !== 'question' && (nodes[otherId].kind ?? 'idea') !==
     'question'` so Merge is never offered when either selected node is a question (FR-020,
     research.md R4 point 1) — this is redundant with point 2 for the `nodeId` itself but is the
     only place that also checks the *other* selected node's kind.
  Acceptance: right-clicking an active question node (once one exists, post-T008) shows only
  "Delete"; right-clicking an active idea/answer node shows the full list including "Ask Me";
  selecting a question node plus any other node never shows "Merge" on either. (FR-001, FR-003,
  FR-020; depends on T002, T003)

- [x] T008 [US1] In `src/store.ts`: add `askMeNode: (id: string, steer?: string) => Promise<void>`
  to the `BrainstormStore` interface and implement it, structurally parallel to `expandNode`
  (`store.ts:673-736`), placed directly after it:
  1. Guard: `nodes[id]` exists and `isLoading` is falsy (return otherwise).
  2. `set({ isLoading: id, askMePrompt: null })`.
  3. `const context = getContextNodes(state.nodes, state.connections, id)` (existing helper,
     unchanged, kind-agnostic — `store.ts:164-219`).
  4. `const questions = await generateQuestions(node.text, context.direct, context.wider, steer,
     node.steer)` (imported from `./lib/ai` alongside the existing `generateBranches` import,
     `store.ts:5`).
  5. Compute positions via the existing `computeChildPositions` (`store.ts:3`), same call shape as
     `expandNode`'s (`store.ts:691-700`), with `count = questions.length`.
  6. Build `NodeData[]` with `kind: 'question'`, `origin: 'ai'`, `parentId: id`,
     `answerId: undefined`, `steer: trimmedSteer || undefined`, `status: 'active'` — same shape
     `expandNode`'s `children` map produces (`store.ts:703-713`) plus `kind`/`answerId`.
  7. `set()` merges the new nodes into `s.nodes`, appends their ids to the target's `childIds`,
     pushes a history frame via `appendCapped`, clears `isLoading` — identical structure to
     `expandNode`'s success `set()` block (`store.ts:715-730`).
  8. On error (anything `chat()`/`generateQuestions` throws): `set({ isLoading: null })` +
     `toastError(err)` (existing helper, `store.ts:22-34`), same as `expandNode`'s catch block
     (`store.ts:731-735`) — no nodes are added on error.
  Acceptance: triggering Ask Me on a node with a valid key produces 3–5 new nodes with
  `kind: 'question'` as children of the target, `isLoading` clears, and a new `past` history frame
  exists (undo removes them); with an invalid key, no nodes are added and a toast appears.
  (FR-002, FR-005, FR-006; contracts/node-kind-model.md `askMeNode`; depends on T002, T003, T005)

- [x] T009 [US1] In `src/store.ts`: add the two remaining FR-019/FR-020 guards, in the same file as
  T008 (apply after it):
  1. In `compose()` (`store.ts:906-925`), change the `activeTexts` filter
     (`store.ts:910-912`) from `.filter((n) => n.status === 'active')` to
     `.filter((n) => n.status === 'active' && (n.kind ?? 'idea') !== 'question')` (FR-019 — answer
     nodes remain included, only question-node text is excluded from the compose summary input).
  2. In `mergeNodes(id1, id2)` (`store.ts:763-835`), add an early-return guard immediately after the
     existing `if (!node1 || !node2 || state.isLoading) return` line (`store.ts:767`):
     `if ((node1.kind ?? 'idea') === 'question' || (node2.kind ?? 'idea') === 'question') return` —
     defense-in-depth so a future third merge-trigger entry point can't bypass the UI-level checks
     (research.md R4 point 3).
  Acceptance: calling `compose()` with an active question node present never includes its `text` in
  the string passed to `composeAI`; calling `mergeNodes(questionId, otherId)` directly is a no-op
  (no `isLoading`/`mergeAnim` state change, no nodes touched). (FR-019, FR-020; depends on T002)

- [x] T010 [US1] In `src/components/BubbleNode.tsx`:
  1. In `findMergeCandidate` (`BubbleNode.tsx:130-144`), skip any candidate whose
     `(n.kind ?? 'idea') === 'question'` inside the `for...in` loop, and add an early return at the
     top of the callback when the *dragged* node itself (`useBrainstormStore.getState().nodes[id]`)
     is a question — `findMergeCandidate` must never report a match either way for a question node
     (research.md R4 point 2, FR-020).
  2. In the node-styling ternary (`BubbleNode.tsx:392-398`), add a `question`-kind branch that
     applies the new `outline-question` utility (from T006) instead of `outline-ai`: full-strength
     when `!node.answerId` (unanswered), reduced opacity (e.g. `outline-question/50`) when
     `node.answerId` is set (answered) — both still taking priority-order after the existing
     `isConnectionTarget || isMergeHighlight || isSelected` branch, same as `outline-ai` does today
     (research.md R9, FR-003, SC-007). `answer`-kind nodes need no new branch — they have
     `origin: 'user'`, which already falls through to no outline in the existing ternary.
  3. Mount a second `SteerInput` instance, gated on `askMePrompt?.nodeId === id`, alongside the
     existing `steerPrompt`-gated one (`BubbleNode.tsx:455-461`):
     ```tsx
     {askMePrompt?.nodeId === id && (
       <SteerInput
         defaultValue={askMePrompt.defaultValue}
         onSubmit={(value) => askMeNode(id, value)}
         onCancel={() => setAskMePrompt(null)}
       />
     )}
     ```
     Pull `askMePrompt`, `setAskMePrompt`, `askMeNode` from the store the same way
     `steerPrompt`/`setSteerPrompt`/`expandNode` are already pulled (`BubbleNode.tsx:16-18`). Do
     **not** change `SteerInput`'s own implementation (`BubbleNode.tsx:466-497`) — it is reused
     as-is (its blank-submit-still-submits and Escape/blur-cancels behavior already satisfy FR-005's
     "no lens supplied" branch).
  Acceptance: dragging any node near an active question node never highlights it as a merge target;
  an unanswered question node renders with the new outline at full strength, an answered one at
  reduced opacity, both distinct from `outline-ai`; right-clicking an idea node → "Ask Me" → typing
  a lens and pressing Enter calls `askMeNode(id, <lens text>)`. (FR-003, FR-004, FR-005, FR-020;
  depends on T006, T007, T008)

- [x] T011 [US1] Manually validate User Story 1 against `quickstart.md`'s "User Story 1" section,
  scenarios 1–7 (menu item presence/absence, question-set generation with distinct dimensions,
  visual distinction at a glance, context-awareness, no-menu-on-dismissed-node, graceful error
  toast with no partial nodes). Also spot-check FR-019/FR-020 from this phase's own guards: trigger
  Ask Me to produce an unanswered question node, then confirm (a) no "Merge" item appears when it
  and another node are both selected, and (b) triggering Compose with it present produces a summary
  that does not contain its literal question text. Re-run `pnpm build` and `pnpm lint` and confirm
  both still pass. (Depends on T004–T010.)

**Checkpoint**: User Story 1 is fully functional and independently shippable — this is the MVP
boundary (see Implementation Strategy below). No question node can yet be answered (US2), but none
of US1's own acceptance scenarios require answering, and the merge/compose guards mean shipping
here alone does not violate FR-019/FR-020.

---

## Phase 4: User Story 2 - Answer a question and mint a permanent node (Priority: P2)

**Goal**: Clicking/focusing an unanswered question node opens an inline answer input; submitting
non-blank text mints a permanent `answer`-kind child node, marks the question answered, and both
question and answer remain reachable and fully functional (answer nodes get Expand/Ask Me parity
with idea nodes).

**Independent Test**: Focus an unanswered question node, type text into its inline input, submit,
and confirm a new permanent node appears as a child of the question node containing exactly what
was typed — independent of whether more questions are later generated from the answer (spec.md US2
Independent Test).

### Implementation for User Story 2

- [x] T012 [US2] In `src/store.ts`: add `answerQuestion: (questionId: string, text: string) => void`
  to the `BrainstormStore` interface and implement it, placed directly after `askMeNode` (T008),
  parallel in spirit to `addUserNode` (`store.ts:837-865`) but synchronous (no AI call — FR-012,
  Constitution Principle III):
  1. Guard (no-op, no history frame, if any fail): `text.trim()` is non-empty; `nodes[questionId]`
     exists; `(nodes[questionId].kind ?? 'idea') === 'question'`; `nodes[questionId].answerId` is
     `undefined` (re-submitting through an already-answered question is a defensive no-op per
     contracts/node-kind-model.md's `answerQuestion` preconditions — the input isn't even rendered
     in that state per T013, but this guard is the backstop).
  2. Create one new `NodeData`: `kind: 'answer'`, `origin: 'user'`, `status: 'active'`,
     `parentId: questionId`, `text: text.trim()`, positioned via `computeChildPositions` with
     `count: 1` (same single-child call shape `expandNode` uses when `branches.length === 1`).
  3. `set()`: add the new node to `s.nodes`, append its id to the question's `childIds`, set the
     question's `answerId` to the new node's id, push a history frame via `appendCapped`, clear
     `answeringQuestionId`.
  **No changes to `dismissNode` (`store.ts:738-761`)**: its existing orphan-not-cascade logic
  already satisfies FR-018 for both directions (deleting an unanswered question: no answer exists
  yet, nothing to orphan; deleting an *answered* question: the answer node in its `childIds` is
  orphaned — `parentId: null` — not deleted, because `dismissNode` orphans children generically
  regardless of kind, research.md R6). Do not add any kind-specific branch to `dismissNode` in this
  task.
  Acceptance: submitting non-blank text via `answerQuestion` creates exactly one new `kind:
  'answer'` node, sets the question's `answerId`, and both survive a `pnpm build` type-check;
  submitting blank/whitespace text is a no-op (no node created, `answerId` still `undefined`, no
  new `past` frame); calling it a second time on an already-answered question is also a no-op.
  (FR-008, FR-009, FR-010, FR-012, FR-018; contracts/node-kind-model.md `answerQuestion`; depends on
  T002, T003)

- [x] T013 [US2] In `src/components/BubbleNode.tsx`:
  1. Add a new `AnswerInput` component, defined alongside `SteerInput` at the bottom of the file
     (after `SteerInput`, `BubbleNode.tsx:466-497`), modeled on `NodeInput.tsx`'s commit-on-blur
     semantics (research.md R8, `contracts/context-menu-and-interactions.md`'s `AnswerInput`
     contract) — **not** `SteerInput`'s cancel-on-blur semantics:
     ```ts
     function AnswerInput({ onSubmit, onCancel }: {
       onSubmit: (text: string) => void
       onCancel: () => void
     })
     ```
     - Local `text` state, `autoFocus` on the `<input>`.
     - Enter (form submit, `preventDefault`): if `text.trim()` non-empty, call
       `onSubmit(text.trim())`; else no-op (input stays open).
     - Escape: call `onCancel()` — input closes, typed text discarded, no node created.
     - Blur: if `text.trim()` non-empty, call `onSubmit(text.trim())`; else call `onCancel()` —
       either way the input closes.
  2. Mount it inside the node's outer `div`, gated on `answeringQuestionId === id` (same mount point
     as the `steerPrompt`-driven `SteerInput`, `BubbleNode.tsx:455-461`):
     ```tsx
     {answeringQuestionId === id && (
       <AnswerInput
         onSubmit={(text) => answerQuestion(id, text)}
         onCancel={() => closeAnswerInput()}
       />
     )}
     ```
     Pull `answeringQuestionId`, `answerQuestion`, `closeAnswerInput` from the store.
  3. In `handlePointerUp` (`BubbleNode.tsx:237-282`), add a kind-aware branch **before** the
     existing shift-click / second-press / plain-select branches (i.e. inside the
     `if (!hasMoved.current) { ... }` block, `BubbleNode.tsx:260-274`, checked after the
     `isShiftClick.current` case but before the `isSecondPress.current` case): if
     `(node.kind ?? 'idea') === 'question' && node.answerId === undefined`, call `openAnswerInput(id)`
     and `return` instead of falling through to `selectNode(id)`. Answered questions and all other
     kinds keep today's exact behavior (plain click → `selectNode(id)`), per
     `contracts/context-menu-and-interactions.md`'s click-routing table.
  Acceptance: clicking an unanswered question node opens `AnswerInput` (not `SidePanel`); typing
  text and pressing Enter creates the answer node and closes the input; typing only whitespace and
  pressing Enter or blurring does not create a node; Escape discards typed text with no node
  created; clicking an *answered* question node opens `SidePanel` as before (unchanged
  `selectNode` path); clicking an idea/answer node is completely unchanged. (FR-007, FR-009; depends
  on T010 — same file, sequential after it — and T012)

- [x] T014 [P] [US2] In `src/components/SidePanel.tsx`:
  1. Hide the existing bottom "Expand" button (`SidePanel.tsx:122-137`) when the selected node's
     `(kind ?? 'idea') === 'question'` — question nodes have no Expand action available
     (research.md R3). Leave the "Delete" button (`SidePanel.tsx:138-146`) unconditional, unchanged.
  2. Add a "View answer →" button, rendered when `(kind ?? 'idea') === 'question' && node.answerId`,
     `onClick={() => selectNode(node.answerId!)}`, placed below the existing body `<textarea>`
     (mirrors the "Re-branch with different lens" button's placement/style at
     `SidePanel.tsx:104-117` — same `self-start ... text-caption ... underline` classes). Satisfies
     Story 2 AC6 ("existing answer is reachable from it").
  3. Add an "Answers: `<question text>` →" button, rendered when
     `(kind ?? 'idea') === 'answer' && node.parentId && nodes[node.parentId]` (the `parent &&`
     guard — a legacy/orphaned answer must not crash on `selectNode(undefined)`), same
     placement/style pattern as (2).
  Do not modify the existing "Re-branch with different lens" button (`SidePanel.tsx:104-117`) or
  the `isAI` block's other content — out of contract scope for this feature.
  Acceptance: selecting an answered question node (via multi-select then `SidePanel`, since plain
  click on an *unanswered* question opens `AnswerInput` not `SidePanel` per T013) shows no Expand
  button and shows "View answer →"; clicking it selects the answer node; selecting an answer node
  shows "Answers: ... →" and clicking it selects the parent question. (FR-011 half — answer-node
  parity with idea nodes for Expand/Ask Me is already satisfied by T007's kind-aware filtering
  treating `answer` identically to `idea`, no SidePanel change needed for that half; Story 2 AC5,
  AC6; depends on T002 only — independent file from T012/T013, parallel-eligible)

- [x] T015 [US2] Manually validate User Story 2 against `quickstart.md`'s "User Story 2" section,
  scenarios 1–6 (inline input opens on unanswered question, submit mints exact-text child node,
  answered question shows muted outline and stays visible, blank submit is a no-op, answer node
  gets Expand/Ask Me parity, "View answer" affordance works). Also validate spec.md Edge Cases 1
  and 2 (delete an unanswered question — dismissed cleanly, no crash; delete an *answered* question
  — question dismissed, its answer node remains active and visible, now detached) using the
  existing Delete context-menu item, confirming no code change to `dismissNode` was required
  (T012's note). Re-run `pnpm build` and `pnpm lint` and confirm both still pass. (Depends on
  T012–T014.)

**Checkpoint**: User Stories 1 AND 2 both work independently and together — a user can generate
questions and answer them, with full provenance.

---

## Phase 5: User Story 3 - Open questions stay visible as unresolved (Priority: P3)

**Goal**: Unanswered question nodes persist across reload, keep participating in canvas
layout/physics like any node, are never auto-answered or auto-verdicted, and an answered question's
own text never re-enters generation as a new target.

**Independent Test**: Generate questions, leave at least one unanswered, reload the page, and
confirm the unanswered question node is still present, still shows as unanswered, and behaves like
a normal node in the canvas layout/physics — independent of any answering interaction (spec.md US3
Independent Test).

**No new implementation tasks are required for this phase.** Per research.md R1/R6/R11/R12, every
behavior US3 asks for already falls out of decisions made in Phase 2–4 with zero additional code:

- **Persistence (FR-017, SC-005)**: `kind`/`answerId` ride through the existing whole-`nodes`-map
  `partialize` (`store.ts:968-976`) untouched (T002) — no new localStorage key, no migration.
- **Never auto-hidden/auto-collapsed (FR-014, FR-004)**: nothing in T002–T014 adds a
  kind-conditional exclusion to `BubbleNode`'s rendering, `computeChildPositions`, drag/move
  handlers, or the physics-relevant subscription paths — question nodes flow through the exact same
  code every other node does except the two narrow, deliberate carve-outs already made (T007's
  context-menu item list, T013's click-routing for *unanswered* questions).
- **Never auto-verdicted (FR-015)**: no action added in T002–T014 assigns any keep/park/drop
  state to a question node — the only two ways a question node's state changes are user-initiated
  (`answerQuestion` from T012, `dismissNode` via Delete, both requiring explicit user action).
- **No question-about-question recursion (FR-016)**: structurally guaranteed by T007 — a question
  node's context menu offers only "Delete," so there is no code path where its own text can become
  the `text` argument to `askMeNode`/`generateQuestions` (research.md R3).

- [x] T016 [US3] Manually validate User Story 3 against `quickstart.md`'s "User Story 3" section,
  scenarios 1–5: generate several questions (T008), answer one (T012), leave at least one
  unanswered, reload the page (full browser refresh) and confirm every unanswered question node is
  still present/unanswered/connected; pan/zoom and trigger an unrelated Expand/Branch or Ask Me
  elsewhere and confirm the unanswered question keeps participating in layout/physics; leave a
  question untouched through several other AI actions and confirm it's never auto-answered or
  hidden; answer a question, then trigger Ask Me/Expand elsewhere, and confirm the answered
  question's own text never drives new generation (also verifiable structurally: its context menu
  has no Ask Me/Expand item to even trigger this from, per T007). Re-run `pnpm build` and `pnpm
  lint` and confirm both still pass. (Depends on T008, T012 existing and working — i.e. after
  Phases 3–4.)

**Checkpoint**: All three of US1–US3 are independently functional together — durable, persisted,
never-silently-resolved question nodes.

---

## Phase 6: User Story 4 - Apply a lens to Ask Me (Priority: P4)

**Goal**: A user-supplied lens/steer flows into question generation the same way it flows into
Expand/Branch; omitting it produces the default balanced question set.

**Independent Test**: Trigger Ask Me on a node with lens/steer text supplied (e.g. "as a skeptic")
and confirm the generated questions visibly reflect that framing; separately confirm omitting the
lens text still produces the default balanced question set (spec.md US4 Independent Test).

**No new implementation tasks are required for this phase.** Per research.md R7, the lens/steer
mechanism is not a bolt-on — it is the same `askMePrompt` + second-`SteerInput`-mount +
`askMeNode(id, steer)` code path built in Phase 3 (T008, T010): the inline input that appears on
"Ask Me" click is *always* present, empty by default, and Enter always calls `askMeNode(id, value)`
whether `value` is blank or lens text. `generateQuestions` (T005) already accepts and forwards
`steer` into the prompt exactly the way `generateBranches` does. There is nothing left to build;
this phase is validation-only, confirming Phase 3's implementation already satisfies FR-005.

- [x] T017 [US4] Manually validate User Story 4 against `quickstart.md`'s "User Story 4" section,
  scenarios 1–2: trigger "Ask Me," type a lens (e.g. "as a skeptic") before pressing Enter, and
  confirm the generated questions visibly reflect that framing; on a different, unrelated node,
  trigger "Ask Me" and press Enter immediately with no lens typed, and confirm the default balanced
  question set is produced, unaffected by the earlier lens. Re-run `pnpm build` and `pnpm lint` and
  confirm both still pass. (Depends on T008, T010 — Phase 3.)

**Checkpoint**: All four user stories are independently functional. Regardless of order, US1–US4 do
not interfere with one another.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final integration check once all four user stories are complete — the full spec.md
Edge Cases list plus every story's scenarios in one combined pass.

- [x] T018 Run the full `quickstart.md` end-to-end: all "User Story 1–4" sections plus the
  "Edge cases (from spec.md)" section (all 7 items — delete unanswered/answered question; delete
  the Ask Me target mid-generation, confirming parity with Expand/Branch's existing race handling
  per research.md R11; merge attempts on a question node via both context-menu and drag-to-merge;
  seeding a legacy `localStorage` project with `kind`-less nodes and confirming they render/behave
  as ordinary idea nodes; compose with question+answer nodes present, confirming zero raw question
  text in the summary; re-answering an already-answered question is a no-op through the normal UI
  path) — in one pass, with all four stories' changes present together. Finish with a final
  `pnpm build` + `pnpm lint` gate, confirming SC-001 through SC-007 all hold simultaneously.
  (Depends on T011, T015, T016, T017.)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories (T002/T003 are
  both in `src/store.ts`, the file every subsequent phase reads `NodeData.kind`/`answerId` and the
  new ephemeral fields from).
- **User Story 1 (Phase 3)**: Depends on Phase 2. No dependency on US2–4.
- **User Story 2 (Phase 4)**: Depends on Phase 2. Its `BubbleNode.tsx` task (T013) is sequenced
  after US1's `BubbleNode.tsx` task (T010) because they're the same file, but US2's *behavior* does
  not depend on US1's behavior — a question node must simply already exist (produced by US1) to
  exercise US2's independent test.
- **User Story 3 (Phase 5)**: Validation-only; depends on US1 (T008, to produce question nodes) and
  US2 (T012, to answer one) both being in place, since its test scenarios exercise both.
- **User Story 4 (Phase 6)**: Validation-only; depends on US1 (T008, T010) only.
- **Polish (Phase 7)**: Depends on all four user-story validation tasks (T011, T015, T016, T017).

### Within Each Phase

- **Foundational**: T002 → T003 (same file `store.ts`, sequential; no type dependency between
  them).
- **US1**: T004 → T005 (ai.ts depends on prompts.ts constants); T006 independent; T007 depends on
  T002/T003; T008 depends on T005, T002, T003; T009 depends on T002 and, same-file, is sequenced
  after T008; T010 depends on T006, T007, T008; T011 last (validation, depends on T004–T010).
- **US2**: T012 depends on T002/T003; T013 depends on T012 and, same-file, is sequenced after T010;
  T014 depends only on T002, independent file from T012/T013 (parallel-eligible); T015 last
  (validation, depends on T012–T014).
- **US3**: T016 only, depends on T008 and T012 already landing (Phases 3–4 complete).
- **US4**: T017 only, depends on T008 and T010 already landing (Phase 3 complete).
- **Polish**: T018 last, depends on T011, T015, T016, T017.

### Parallel Opportunities

- T004 (`prompts.ts`) and T006 (`index.css`) can run together — different files, no dependency
  between them.
- T014 (`SidePanel.tsx`) can run parallel to the T012→T013 chain (`store.ts`→`BubbleNode.tsx`) once
  T002 has landed — different file.
- Phases 5 and 6 (US3, US4) are both validation-only and can be run in either order, or by
  different people, once Phases 3–4 are done.

---

## Parallel Example: User Story 1

```bash
# These two can start together, right after Phase 2 (Foundational) lands:
Task: "Add DEFAULT_QUESTION_COUNT/QUESTION_DIMENSIONS etc. to src/lib/prompts.ts"   # T004
Task: "Add --color-question token to src/index.css"                                 # T006

# T005 (ai.ts generateQuestions) starts once T004 lands; T007 (ContextMenu.tsx) can start
# any time after Foundational, independent of T004/T005/T006.
```

## Parallel Example: User Story 2

```bash
# After T002 (Foundational) lands, this can run independently of the T012→T013 chain:
Task: "Hide Expand button + add View-answer/Answers-link in src/components/SidePanel.tsx"  # T014
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001).
2. Complete Phase 2: Foundational (T002–T003) — required before any story.
3. Complete Phase 3: User Story 1 (T004–T011).
4. **STOP and VALIDATE**: Run `quickstart.md`'s User Story 1 section (folded into T011). This is
   the MVP boundary — Ask Me's entry point (question generation, visual distinction, error
   handling) plus the merge/compose exclusion guards are all present and self-consistent; no
   FR is left half-satisfied by shipping here alone. Users cannot yet answer a question (US2), but
   nothing in US1's own acceptance scenarios requires that.
5. Deploy/demo if ready.

### Incremental Delivery

1. Setup + Foundational → Foundation ready (T001–T003).
2. Add User Story 1 (T004–T011) → validate independently (T011) → Deploy/Demo (MVP!).
3. Add User Story 2 (T012–T015) → validate independently (T015) → Deploy/Demo.
4. Add User Story 3 (T016, validation-only) → Deploy/Demo.
5. Add User Story 4 (T017, validation-only) → Deploy/Demo.
6. Run Phase 7 (T018) once all four are in.
7. Each story adds value without breaking the previous ones.

### Parallel Team Strategy

With multiple developers, after Phase 2:
- Developer A: User Story 1 (T004–T011).
- Developer B: waits for T010 to land (same-file dependency in `BubbleNode.tsx`), then takes User
  Story 2 (T012–T015) — T014 (`SidePanel.tsx`) can actually start immediately after Phase 2, ahead
  of T012/T013.
- User Stories 3 and 4 (T016, T017) are single validation tasks, picked up by whoever finishes
  first once Phases 3–4 land.

---

## Notes

- [P] tasks = different files, no dependency on an incomplete task.
- [US#] label maps each task to its user story for traceability back to spec.md.
- No automated test tasks are included — this repo has no test runner (plan.md Technical Context,
  unchanged from spec-001's assessment); each story's last task is a manual `quickstart.md`-scenario
  pass plus `pnpm build`/`pnpm lint`.
- Do not edit `package.json`, `tsconfig*.json`, `vite.config.ts`, `eslint.config.js`, `index.html`,
  or any other build/config file as part of any task above.
- Do not modify `specs/001-openai-endpoint-readable-canvas/*` or any `specs/002-ask-me-mode/*` file
  other than this `tasks.md`.
- Commit after each task or logical group.
- Stop at any checkpoint (end of Phase 3, 4, 5, or 6) to validate that story independently before
  continuing.
