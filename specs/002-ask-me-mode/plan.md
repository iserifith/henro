# Implementation Plan: Ask Me Mode

**Branch**: `002-ask-me-mode` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-ask-me-mode/spec.md`

## Summary

Ask Me inverts the existing Explore/Expand loop on a per-node basis: instead of generating idea
children, a new "Ask Me" context-menu item generates 3–5 probing question children (audience,
failure mode, cost, assumption, next step) about the target node. Answering a question through a
new inline input mints a permanent, first-class `answer` node — never transient prompt text.

The whole feature is additive to the existing single Zustand store and reuses, rather than
replaces, every piece of machinery spec-001 already built or documented: the `ContextMenu`
component gets one new item, `ai.ts` gets one new sibling function to `generateBranches`
(`generateQuestions`), the existing `SteerInput` component is reused unchanged for Ask Me's
optional lens, a new small `AnswerInput` component (modeled on `NodeInput.tsx`'s commit-on-blur
semantics) handles answering, and `NodeData` gains two optional fields (`kind`, `answerId`) that
ride through the existing `persist`/`partialize` setup with zero storage-layer changes. No new
component files, no new localStorage keys, no new runtime dependency, no backend.

Two locked decisions constrain the whole design and are not reopened by this plan: (1) answers are
permanent canvas nodes, never transient prompt-steering text; (2) Ask Me is chosen per-node from
the context menu only — there is no global mode switch. See `research.md` for the design decisions
this plan *does* make (mainly: which context-menu items are available on which node kind, and how
the two new inline inputs map onto the two existing inline-input patterns in the codebase).

## Technical Context

**Language/Version**: TypeScript ~6.0.2 (`tsc -b`, project references: `tsconfig.app.json` /
`tsconfig.node.json`), target `es2023`. Unchanged from spec-001.

**Primary Dependencies**: React 19.2, Zustand 5 (with `persist` middleware), Tailwind CSS 4
(`@tailwindcss/vite`, `@theme` tokens in `src/index.css`), Framer Motion 12. No new dependency is
introduced by this feature — it reuses the existing `chat()`/`fetch` transport in `src/lib/ai.ts`,
the existing `ContextMenu`/`BubbleNode`/`NodeInput` components, and the existing `AiError`/toast
error plumbing.

**Storage**: Browser `localStorage` only — the existing `henro` Zustand-`persist`-backed,
per-project key (`src/lib/persistence.ts`). No new localStorage key. `NodeData`'s two new optional
fields (`kind`, `answerId`) ride through the existing `partialize`'s whole-`nodes`-map inclusion
(`store.ts:968-976`) with no `partialize` change and no `persist` version bump (see research.md
R1 — purely additive, backward-readable shape change).

**Testing**: No automated test runner is configured in this repository (no Vitest/Jest, no
`tests/` directory, no CI workflow) — unchanged from spec-001's assessment. This plan follows the
same precedent: the quality gates are `pnpm build` (`tsc -b && vite build`) and `pnpm lint`
(ESLint via `eslint.config.js`), plus manual verification documented in `quickstart.md`.
Introducing a test framework is out of scope (not requested by the spec, would be a new dev
dependency requiring its own justification).

**Target Platform**: Static browser bundle (Vite build output), deployed to the public
`henro.space` static host and run locally via `pnpm dev`. No server runtime. Unchanged.

**Project Type**: Single-page client-only web application (no `frontend/`+`backend/` split).
Unchanged.

**Performance Goals**: No new performance requirement. Question generation is a single
request/response round-trip identical in cost/shape to Expand/Branch's `generateBranches` call
(same `chat()` transport, same retry/backoff). New nodes (3–5 per Ask Me trigger, 1 per answer)
flow through the same `computeChildPositions`/`BubbleNode` rendering path already proven to handle
Expand/Branch's node counts — no new scale concern.

**Constraints**: Must not attach generated question nodes to a target that's been deleted or gone
inactive mid-request any *more* safely than Expand/Branch already handles that race (research.md
R11 — deliberate parity, not a new/stronger guarantee). Must never let AI-generated text become an
answer node's content (FR-012, Constitution Principle III). Must not introduce a new persisted
localStorage key. Must not change Explore/Expand's own existing behavior for `idea`-kind nodes
(spec Assumptions).

**Scale/Scope**: Single feature branch touching an estimated 5 existing files — `src/store.ts`
(node kind fields, two new actions, ephemeral Ask Me/answer-input state, compose/merge guards),
`src/lib/ai.ts` (`generateQuestions`), `src/lib/prompts.ts` (question-count/dimension constants),
`src/components/ContextMenu.tsx` (Ask Me item, kind-aware item filtering), `src/components/
BubbleNode.tsx` (kind-aware click routing, new `AnswerInput` component, second `SteerInput`
mount, question-node styling). `src/components/SidePanel.tsx` gets small additive JSX (view-answer
/ back-to-question links, hide Expand for question nodes). No new component files, no new routes,
no new top-level directories.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.0.0:

| Principle | Check | Result |
|---|---|---|
| I. Local-First, No Backend, No Accounts | No new backend, database, or telemetry. Question generation reuses the existing user-configured, user-owned AI endpoint. | **PASS** |
| II. BYOK and Key Hygiene | No new credential store, no new destination for the key — `generateQuestions` calls the same `chat()` function every other AI action already uses, sent to the same user-configured `baseUrl`. | **PASS** |
| III. User as Author, AI as Expander | This is the principle's own named example ("Features where the AI asks questions (e.g., Ask Me mode) MUST treat the user's answers as first-class canvas content"). FR-012 forbids AI-authored answer content; FR-015 forbids any AI verdict on question nodes. Locked decision #1 (answers are permanent nodes) directly implements this. | **PASS** |
| IV. Everything Is a Node; Provenance Preserved | Questions and answers are both nodes with visible lineage (parentId/childIds, `answerId`). Deleting a question orphans (not deletes) its answer (FR-018) — reuses the existing `dismissNode` orphan-not-cascade logic unchanged (research.md R6). No silent history loss. | **PASS** |
| V. Canvas Over Chat | Questions and answers are spatial canvas nodes participating in the same layout/physics as idea nodes (FR-004) — not a chat transcript. The inline `AnswerInput`/`SteerInput` reuse are canvas-anchored, momentary UI, not a scrolling log. | **PASS** |
| VI. Evidence-Gated, Bounded Work | Scope is locked to the spec's 4 user stories / 22 FRs; this plan does not expand scope (e.g., explicitly declines a user-configurable question count per spec Assumptions). Implementation will not begin until plan + (tasks + analyze, out of scope for this run) gates pass. | **PASS** |
| VII. Simplicity Over Feature Count | Ask Me is a genuine sibling to Expand/Merge/Compose — a new node kind and a new context-menu action, not a bolt-on UI layer: it's integrated into the store's persistence, undo/redo, compose/merge exclusion rules, and rendering exactly like the existing modes (research.md R3–R5 make the integration points explicit rather than leaving them as UI-only afterthoughts). | **PASS** |
| VIII. Static, Hostable Anywhere | No server code introduced; `pnpm build` output shape unaffected. | **PASS** |

**Gate result: PASS, no violations, no justification needed.**

### Post-Design Re-check (after Phase 1: research.md, data-model.md, contracts/, quickstart.md)

| Principle | Post-design check | Result |
|---|---|---|
| I. Local-First, No Backend, No Accounts | `data-model.md` confirms no new storage mechanism — `kind`/`answerId` ride through the existing whole-`nodes`-map `partialize` entry; `contracts/question-generation-prompt.md` confirms `generateQuestions` reuses `chat()`'s existing transport verbatim. | **PASS** |
| II. BYOK and Key Hygiene | `contracts/question-generation-prompt.md`'s "Error handling" section confirms zero new `AiErrorKind`, zero new request/header/key-handling logic — 100% inherited from the existing `chat()` implementation. | **PASS** |
| III. User as Author, AI as Expander | `contracts/node-kind-model.md` invariant 5 pins down that `answerQuestion` stores `text.trim()` verbatim with no AI involvement whatsoever (the action is fully synchronous, no network call) — the strongest possible enforcement of FR-012. `research.md` R3 shows the design goes further than the letter of FR-016 by removing the Ask Me/Expand menu items from question nodes entirely, so the "no AI verdict, no question-about-question recursion" guarantee is structural, not a runtime check that could be forgotten. | **PASS** |
| IV. Everything Is a Node; Provenance Preserved | `research.md` R6 confirms the existing `dismissNode` orphan-not-cascade logic already satisfies FR-018 with zero new code — no new destructive path was designed. `data-model.md` §1 "Validation rules" explicitly addresses the one under-specified edge case (deleting an answer independently of its question) and resolves it via Henro's existing never-hard-delete precedent, not a new mechanism. | **PASS** |
| V. Canvas Over Chat | `contracts/context-menu-and-interactions.md`'s `AnswerInput`/`SteerInput` contracts are both node-anchored inline inputs, not a transcript surface — confirmed no new full-screen or scrolling-log component was introduced anywhere in the design. | **PASS** |
| VI. Evidence-Gated, Bounded Work | `research.md`'s 12 decisions all cite specific FRs/ACs from `spec.md`; none introduce scope beyond what the spec's 4 user stories require. `quickstart.md`'s scenario list is a 1:1 trace of every Acceptance Scenario and Edge Case in `spec.md` — no invented scenarios. | **PASS** |
| VII. Simplicity Over Feature Count | `data-model.md` §3/§4 shows the two new store actions (`askMeNode`, `answerQuestion`) are structurally parallel to existing actions (`expandNode`, `addUserNode`) rather than a parallel, divergent subsystem; `research.md` R7/R8 show both new inline inputs reuse an *existing* component (`SteerInput`) or closely follow an existing one's exact behavioral contract (`NodeInput`), rather than inventing new interaction patterns. | **PASS** |
| VIII. Static, Hostable Anywhere | No design artifact introduces a build/runtime server requirement. | **PASS** |

**Post-design gate result: PASS.** No new violations were introduced by the concrete design; no
entries are needed in Complexity Tracking below.

## Project Structure

### Documentation (this feature)

```text
specs/002-ask-me-mode/
├── plan.md                              # This file (/speckit-plan command output)
├── research.md                          # Phase 0 output
├── data-model.md                        # Phase 1 output
├── quickstart.md                        # Phase 1 output
├── contracts/                           # Phase 1 output
│   ├── node-kind-model.md
│   ├── context-menu-and-interactions.md
│   └── question-generation-prompt.md
├── checklists/
│   └── requirements.md
└── tasks.md                             # Phase 2 output (/speckit-tasks — NOT created by this run)
```

### Source Code (repository root)

Henro is a single-project client-only React app — no `frontend/`+`backend/` split, no separate
`tests/` tree. This feature modifies existing files in place; it adds no new component files
(the new `AnswerInput` component lives inside `BubbleNode.tsx` alongside the existing `SteerInput`,
per research.md R8).

```text
src/
├── components/
│   ├── ContextMenu.tsx        # MODIFY: "Ask Me" item, kind-aware item filtering (question nodes get Delete only)
│   ├── BubbleNode.tsx         # MODIFY: kind-aware click routing, new AnswerInput component, second SteerInput mount (askMePrompt), question-node styling
│   ├── SidePanel.tsx          # MODIFY: view-answer / back-to-question links, hide Expand button for question nodes
│   └── NodeInput.tsx          # REFERENCE ONLY — not modified; AnswerInput's commit-on-blur/Enter/Escape contract is modeled on this file's existing pattern (research.md R8), but the file itself is untouched
├── lib/
│   ├── ai.ts                  # MODIFY: add generateQuestions(), sibling to generateBranches()
│   └── prompts.ts             # MODIFY: add DEFAULT_QUESTION_COUNT / QUESTION_COUNT_MIN / QUESTION_COUNT_MAX / QUESTION_DIMENSIONS
└── store.ts                   # MODIFY: NodeData.kind/answerId fields, askMeNode/answerQuestion actions, askMePrompt/answeringQuestionId ephemeral state (+ freshEphemeralState), compose()/mergeNodes() kind guards
```

**Structure Decision**: Single-project structure, identical to spec-001's (Option 1, trimmed to
actual repo layout). No new top-level directory, no new component file — every change is additive
to a file this feature's design already grounds in the live codebase (see Technical Context /
Scope above and each `contracts/*.md` file for the exact per-file contract).

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

*(No entries — both the pre- and post-design Constitution Check gates passed with no violations.)*
