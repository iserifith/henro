# Research: Ask Me Mode

Phase 0 output. Henro has no unresolved runtime/library unknowns for this feature — everything
needed already exists in the live codebase (`src/store.ts`, `src/lib/ai.ts`, `src/lib/prompts.ts`,
`src/components/ContextMenu.tsx`, `src/components/BubbleNode.tsx`, `src/components/NodeInput.tsx`).
This document instead resolves the *design* questions the spec deliberately left open (per
spec.md Assumptions: exact visual treatment, and several FR-vs-FR tensions that aren't fully
pinned by the spec text alone), grounded in the two locked decisions (answers are permanent
nodes; no global mode switch) and in reading the actual current implementation.

## R1 — Node kind storage: additive field, no version bump

**Decision**: Add an optional `kind?: 'idea' | 'question' | 'answer'` field to the existing
`NodeData` type (`src/store.ts:36-46`). Read it everywhere via a `kind ?? 'idea'` fallback rather
than writing a migration.

**Rationale**: `persist`'s `partialize` (`store.ts:968-976`) already includes the *entire*
`nodes: s.nodes` map, not a field allowlist within each node — so any new field on `NodeData`
automatically round-trips through save/load with zero `partialize` changes. Legacy projects
(FR-013) simply have `kind === undefined` on every node, which the `?? 'idea'` fallback treats as
`idea` everywhere kind is inspected (context menu, compose, merge, rendering). No `persist`
`version` bump or `migrate()` function is needed — this is a pure additive, backward-readable
shape change, same category of change as spec-001's `baseUrl?` addition to `OpenRouterConfig`.

**Alternatives considered**: A separate `questionNodes`/`answerNodes` side-table — rejected, it
would duplicate the existing single-source-of-truth `nodes` map and require its own persistence
wiring for no benefit; the discriminated-union-on-one-map approach is exactly what the spec's Key
Entities section describes ("every node MUST carry a kind discriminator").

## R2 — Question ↔ answer link: reuse parentId/childIds, add one explicit field

**Decision**: An answer node's link back to its question is the existing `parentId` field
(unchanged mechanism — identical to how AI branch children already link to their parent). A
question node's link to its answer is a new explicit `answerId?: string`, set once, on the
question node only.

**Rationale**: FR-008 ("connected as a child of that question node") maps directly onto the
existing parent/child machinery `expandNode`/`addUserNode` already use — no new relationship type.
FR-010 additionally requires the question to "record a link to its answer node's identity"; this
could theoretically be derived by scanning `childIds` for a `kind === 'answer'` child, but an
explicit `answerId` is O(1) at render time (SidePanel's "View answer" affordance, R8) and is the
literal shape FR-010 describes, so it's written directly rather than derived.

**Alternatives considered**: Deriving "answered" as `childIds.some(c => nodes[c]?.kind === 'answer')`
— rejected as the primary mechanism because it re-scans on every render and doesn't give an O(1)
"jump to answer" id; kept `answerId` as the single source of truth and treated
`answered === !!answerId` as the derived boolean (no separate `answered: boolean` field, avoiding
a state that could drift out of sync with the id).

## R3 — Ask Me / Expand / Steer / Merge are NOT offered on question-kind nodes

**Decision**: The context menu offers only **Delete** for an active question node — no
Expand/Branch, no Steer/Lens, no Ask Me, no Merge. Idea and answer nodes keep today's full menu
(Expand/Branch, Steer/Lens, Delete, conditionally Merge) plus the new Ask Me item.

**Rationale**: This is the one place the spec text is ambiguous on its own (FR-001 literally says
"any active node" for the Ask Me item) but is fully pinned down by reading FR-015, FR-016, and
Story 2 AC5 together:
- FR-015: "the only fates available for a question node are user-initiated: answer it, leave it
  open (parked, i.e. no action), or delete it" — this is an exhaustive list. Triggering Expand or
  Ask Me on a question node isn't one of the three.
- FR-016: "An answered question node's own text MUST NOT be used as input context to generate
  further questions about itself (no question-about-question recursion)."
- Story 2 AC5 explicitly calls out that an **answer** node gets Expand/Branch-and-Ask-Me parity
  with idea nodes ("at minimum Expand/Branch and Ask Me") — the spec bothers to say this only for
  answer nodes, never for question nodes, which is a strong signal by omission.

Excluding Ask Me/Expand entirely from question nodes also means FR-016's recursion ban is
satisfied *structurally* — there is no code path where a question node's own text can become the
"target" of a new `generateBranches`/`generateQuestions` call — rather than needing a runtime
"is this node an answered question, skip it" check that could be forgotten or bypassed later.

**Alternatives considered**: Offer Ask Me on question nodes but suppress it only after they're
answered (literal FR-016 reading, "*answered* question node's own text") — rejected: it's more
code (a conditional inside the menu-building logic keyed on `answered`), it still allows the
"meta-question about an open question" case the feature name explicitly inverts away from
("questions about a *target node*", where a question is not a coherent target), and it contradicts
the Story 2 AC5 omission signal above. Simplicity (Constitution Principle VII) favors the
structural exclusion.

## R4 — Merge eligibility must be enforced at all three trigger points

**Decision**: FR-020 ("question nodes MUST NOT be offered or accepted as a merge source or
target") is enforced in three places, because Henro has two independent ways to initiate a merge:

1. `ContextMenu.tsx`'s merge-item visibility check (`selectedNodeIds.length === 2 && ...`) — add
   `&& (nodes[nodeId].kind ?? 'idea') !== 'question' && (nodes[otherId].kind ?? 'idea') !== 'question'`.
2. `BubbleNode.tsx`'s `findMergeCandidate` (the drag-to-merge proximity gesture, `BubbleNode.tsx:130-144`)
   — must skip candidates whose `kind === 'question'`, and must not even scan for a target if the
   *dragged* node itself is a question.
3. `mergeNodes` in `store.ts` itself — add an early-return guard (`if either node's kind is
   'question', return`) as defense-in-depth, so a future third entry point can't accidentally
   violate FR-020 by skipping the UI-level checks.

**Rationale**: The existing context-menu-only view of merge eligibility (as documented in
spec-001's data-model.md §3) is incomplete for this feature — spec-001 never had to consider a
node kind that's merge-ineligible, so it only gated merge at the menu layer. Ask Me introduces the
first node kind where merge must be blocked at the *action* layer too, since drag-to-merge bypasses
the context menu entirely.

## R5 — Compose exclusion is a single-line filter

**Decision**: `compose()` (`store.ts:906-925`) filters `activeTexts` to
`n.status === 'active' && (n.kind ?? 'idea') !== 'question'` (FR-019). Answer nodes remain
included (spec: "compose draws on idea and answer node text").

## R6 — Delete/orphan semantics need zero new code

**Decision**: No change to `dismissNode`'s logic. It already orphans (not cascades) children on
delete (`store.ts:738-761`), which is exactly FR-018's requirement for both directions (deleting a
question detaches — not deletes — a dependent answer; deleting an answered question leaves the
answer node alive and active). The existing implementation is kind-agnostic and already correct
for this feature.

**Follow-on note**: if a user later deletes an *answer* node independently (not addressed by any
FR — the spec only discusses deleting question nodes before/after being answered), the question
node's `answerId` is left pointing at a node that still exists in the `nodes` map with
`status: 'dismissed'` (Henro never hard-deletes — Constitution Principle IV). No dangling
reference, no crash; the question simply still reads as "answered" and its "View answer" link
still resolves (to a now-dismissed node, same as any other stale reference in this codebase). This
is the existing precedent (e.g. `node.parentId` can already point at a dismissed node today) —
new code is not needed to handle it safely.

## R7 — Ask Me's lens input reuses `SteerInput`, not a new component

**Decision**: Add a new ephemeral store field `askMePrompt: SteerPrompt | null` (identical shape
to the existing `steerPrompt`), plus `setAskMePrompt`. `BubbleNode.tsx` renders the existing
`SteerInput` component a second time, gated on `askMePrompt?.nodeId === id`, wired to a new
`askMeNode(id, value)` action instead of `expandNode`, with an empty `defaultValue` (there's no
sensible default "ask" phrase the way `'brainstorm ideas'` is a sensible default expand phrase)
and a distinct placeholder (e.g. `"ask about..."` vs `SteerInput`'s existing `"branch on..."`).
The context menu's new "Ask Me" item calls `setAskMePrompt({ nodeId, defaultValue: '' })` the same
way "Expand/Branch" calls `setSteerPrompt(...)` today.

**Rationale**: This satisfies FR-005 (lens text flows into question generation the same way it
flows into Expand/Branch) using the exact interaction rhythm the user already knows from Expand —
inline box appears, Enter submits (with or without typed lens text — blank text still submits and
produces the default balanced question set), Escape or blur cancels without generating anything.
No new input component, no new keyboard/focus/blur behavior to design or test.

**Alternatives considered**: Firing `askMeNode` immediately on menu click with no lens-entry step,
treating lens as a separate/advanced secondary action — rejected: it breaks the established
Expand/Steer rhythm (Principle VII: don't introduce a new interaction mode when a sibling one
already fits) and would need its own separate lens-entry affordance anyway for FR-005's "when
supplied" branch.

## R8 — The answer input is new, but small, and copies NodeInput's semantics, not SteerInput's

**Decision**: A new small component (`AnswerInput`, defined alongside `SteerInput` at the bottom
of `BubbleNode.tsx`) is rendered inline under an unanswered question's bubble (same visual
anchoring as `SteerInput`), but follows `NodeInput.tsx`'s *behavioral* contract, not
`SteerInput`'s:
- Enter (via form submit, `preventDefault`) → if trimmed text is non-empty, call
  `answerQuestion(questionId, text)`.
- `onBlur` → if trimmed text is non-empty, also commit (call `answerQuestion`); either way, close.
- Escape → close and discard typed text, no node created.
- Blank/whitespace-only submit (Enter or blur) → no node created, question's unanswered state
  unchanged (FR-009).

**Rationale**: FR-007 requires "the same inline-editing interaction pattern used elsewhere on the
canvas for entering node text" — that phrase describes `NodeInput.tsx` (whose job is literally
"enter node text" and whose `onBlur` commits non-blank text, `NodeInput.tsx:61-68`), not
`SteerInput` (whose job is entering transient steer/lens *prompt* text, and whose `onBlur` cancels,
`BubbleNode.tsx:492`). Answers are permanent node content (locked decision #1) — canceling
someone's typed answer on a stray blur would contradict that. Visually, though, the answer input
needs to be anchored to the question bubble (not screen-fixed at a canvas position the way
`NodeInput` is, since there's no "canvas position" concept for it — the position is simply "under
this node"), so it borrows `SteerInput`'s positioning/mount pattern.

## R9 — Visual distinction: new outline token, two sub-states

**Decision**: Question nodes get a new outline color token (name TBD at implementation time,
following the exact precedent of the existing `outline-ai` token used today for
`node.origin === 'ai'`, `BubbleNode.tsx:392-398`) instead of the `outline-ai`/no-outline ternary
idea/answer nodes use. Two sub-states, both still using the new token:
- **Unanswered**: full-strength outline (parallels how `outline-ai` renders today).
- **Answered**: same outline token at reduced opacity (e.g. `/50`), signaling "resolved but still
  present as provenance" without a second new token or a structural re-render.

Answer nodes need no new styling — they're `origin: 'user'`, which already renders with no special
outline in the current ternary (`BubbleNode.tsx:392-398`), satisfying FR-011's "behaves like an
idea node" requirement for free.

**Rationale**: Spec Assumptions explicitly leave "the exact visual treatment... left open to the
planning phase; only the behavioral contract... is fixed" — this resolves it to a concrete,
low-risk mechanism (one new CSS custom property + one conditional class swap, same shape as the
existing `outline-ai` mechanism) without prescribing a specific hex value, which belongs with
`src/index.css`'s existing `@theme` token definitions at implementation time.

## R10 — `generateQuestions()`: sibling function, identical fallback chain to `generateBranches`

**Decision**: Add `generateQuestions(text, directContext, widerContext, steer?, targetSteer?)` to
`src/lib/ai.ts`, structurally parallel to `generateBranches` (`ai.ts:124-193`) — same
system/user message construction pattern (direct context = already-taken ground, wider context =
background, steer = lens, targetSteer = the node's own prior steer), same
strip-code-fences → `JSON.parse` → newline-split fallback chain, requesting "between 3 and 5"
questions covering distinct dimensions (audience, failure mode, cost, hidden assumption, next
step — the exact five named in spec.md's own examples). Add `DEFAULT_QUESTION_COUNT = 4` and a
`QUESTION_DIMENSIONS` list of 5 canned, dimension-templated fallback questions to
`src/lib/prompts.ts`. If the response is fully unparseable, fall back to
`QUESTION_DIMENSIONS.slice(0, DEFAULT_QUESTION_COUNT)` templated against the target's text — never
surfacing raw/broken model output as a question (the "can't be parsed" edge case), exactly
mirroring `generateBranches`'s existing `Array.from(...)` synthetic-fallback behavior
(`ai.ts:189-192`).

**Rationale**: Parity is the point — FR-002 requires "the same context-aware prompting approach
used for Expand/Branch," and reusing the exact fallback shape means the parse-failure edge case is
satisfied by an already-proven pattern rather than new, untested error-handling logic.

## R11 — Race-condition handling: mirror `expandNode`'s existing behavior exactly, don't strengthen it

**Decision**: `askMeNode` is implemented with the same `set()` shape as `expandNode`
(`store.ts:673-736`) — no additional "is the target still active" re-check is added beyond what
`expandNode` already does (which is: none — a dismissed node's `childIds` can still be appended to
today, since `dismissNode` only orphans *at dismiss time*, not retroactively).

**Rationale**: The spec's edge case explicitly says the in-flight-generation behavior "mirrors the
existing race-condition handling for Expand/Branch" — i.e. parity is the requirement, not a new,
stronger guarantee Expand/Branch doesn't itself have. Adding new protection to `askMeNode` alone
would create an inconsistency (Ask Me behaves more safely than Expand for the identical race),
which is out of scope here and not what the edge case asks for.

## R12 — Legacy nodes: no special-case code beyond the `kind ?? 'idea'` accessor

**Decision**: Every read site that branches on node kind (context menu item list, compose filter,
merge-eligibility checks, `BubbleNode` styling, `SidePanel` answer/question affordances) uses the
same `(node.kind ?? 'idea')` expression. No dedicated "legacy node" code path, no migration script.

**Rationale**: FR-013 only requires legacy nodes to be *treated as* `idea` — since `idea` is also
the default/fallback branch of every kind-based conditional in this design (R3–R5, R9), the
fallback expression alone is sufficient; there's nothing else for a legacy node to opt into or out
of.
