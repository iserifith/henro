# Implementation Plan: Configurable Endpoint, Readable Node Detail, Context Menus

**Branch**: `001-openai-endpoint-readable-canvas` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-openai-endpoint-readable-canvas/spec.md`

## Summary

Three independent, additive changes to the existing client-only React canvas app:

- **Group A** — generalize `src/lib/ai.ts` / `src/lib/config.ts` from a hardcoded OpenRouter
  client into a configurable OpenAI-compatible chat-completions client, adding a `baseUrl` field
  to the existing `openrouter-config` localStorage record (default: the OpenRouter endpoint),
  conditionally attaching OpenRouter-only headers, and de-hardcoding "OpenRouter" from error/UI
  copy while keeping OpenRouter as the zero-effort default.
- **Group B** — restyle the existing `SidePanel` node-detail text (body, "Branched from" lineage,
  prompt line) from the small `text-body`/`text-ui` tokens (11–13px, 1.4 line-height) to the
  already-precedented `text-prose` token (15px, used today in the Compose modal) with taller line
  height, and ensure long text stays reachable via the panel's existing scroll container rather
  than clipping.
- **Group C** — add a new `ContextMenu` component plus `onContextMenu` wiring on `BubbleNode` and
  `Canvas`, backed by new ephemeral (non-persisted) state in `useBrainstormStore`, reusing
  existing store actions (`expandNode`/`setSteerPrompt`, `dismissNode`, `mergeNodes`,
  `addUserNode`, `compose`) so every menu action is a thin dispatch to code that already exists
  and is already tested by the current UI affordances.

All three groups are client-only, add no new runtime dependency, add no backend, and touch only
`src/`. No group depends on another; they can be implemented and reviewed independently per the
spec's "Independent Test" criteria.

## Technical Context

**Language/Version**: TypeScript ~6.0 (`tsc -b`, project references: `tsconfig.app.json` /
`tsconfig.node.json`), target `es2023`

**Primary Dependencies**: React 19.2, Zustand 5 (with `persist` middleware), Tailwind CSS 4
(`@tailwindcss/vite`, `@theme` tokens in `src/index.css`), Framer Motion 12, `react-markdown` 10.
No new dependency is introduced by this feature.

**Storage**: Browser `localStorage` only — the existing `openrouter-config` key (read/written via
`src/lib/config.ts`) and the existing Zustand-`persist`-backed `henro` / per-project keys (via
`src/lib/persistence.ts`). No IndexedDB, no cookies, no server-side storage.

**Testing**: No automated test runner is configured in this repository (no Vitest/Jest, no
`tests/` directory, no CI workflow). The project's existing quality gates are `pnpm build`
(`tsc -b && vite build`) and `pnpm lint` (ESLint via `eslint.config.js`); manual verification in
the browser is the existing practice for UI changes (see repo-wide agent guidance). This plan
follows that precedent — `quickstart.md` documents manual verification steps for each user story
plus the `pnpm build`/`pnpm lint` gates. Introducing a test framework is out of scope for this
feature (not requested by the spec, and would be a new dev dependency requiring its own
justification).

**Target Platform**: Static browser bundle (Vite build output), deployed to the public
`henro.space` static host and run locally via `pnpm dev`. No server runtime.

**Project Type**: Single-page client-only web application (no `frontend/`+`backend/` split — see
Project Structure below).

**Performance Goals**: No new performance requirement introduced. Group C's context menu must
open with no perceptible delay (consistent with existing Framer Motion `TRANSITION.snappy` used
elsewhere in the app for popovers). Group A must not add request overhead beyond one conditional
header check. Group B is pure CSS/layout and must not affect node-drag/pan frame rate (60fps
target already implied by `BubbleNode`'s `ResizeObserver`/`translate3d` optimizations).

**Constraints**: Must preserve 100% of existing `openrouter-config` data on read (FR-004). Must
never send the API key to any destination other than the currently configured base URL (FR-005,
Constitution Principle II). Must not regress marquee-select or node-drag behavior when adding
right-click handling (FR-019, SC-007). Must not introduce a new persisted localStorage key for
context-menu or panel-readability state — both are transient UI state.

**Scale/Scope**: Single feature branch touching an estimated 6–9 existing files
(`src/lib/config.ts`, `src/lib/ai.ts`, `src/lib/errors.ts`, `src/components/Settings.tsx`,
`src/components/WelcomeScreen.tsx`, `src/components/SidePanel.tsx`, `src/components/BubbleNode.tsx`,
`src/components/Canvas.tsx`, `src/store.ts`) plus one new component file
(`src/components/ContextMenu.tsx`). No new routes, no new pages, no new projects.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.0.0:

| Principle | Check | Result |
|---|---|---|
| I. Local-First, No Backend, No Accounts | All three groups are client-only; Group A adds a *user-chosen* remote endpoint but introduces no Henro-operated backend, database, or telemetry. | **PASS** |
| II. BYOK and Key Hygiene | FR-005/FR-006 keep the key in `localStorage` only, sent only to the configured base URL; no new credential store; the "new third-party inference endpoint" is the *user's own choice*, not one Henro adds on their behalf — this is the feature's explicit purpose (BYO *endpoint*, an extension of BYOK) and is spelled out in the spec (FR-001–FR-009), not a silent addition. | **PASS** (see note below) |
| III. User as Author, AI as Expander | No change to AI's role; Ask Me mode explicitly out of scope (spec Assumptions). | **PASS** |
| IV. Everything Is a Node; Provenance Preserved | Group C's delete action reuses existing `dismissNode` (soft-delete, recoverable via undo/orphaning — no new destructive path). No group deletes history. | **PASS** |
| V. Canvas Over Chat | Group B enlarges in-panel node text; it does not introduce a scrolling transcript or chat-style UI — it's still a single node's detail, canvas-anchored. Group C is a canvas-native affordance (right-click), not a chat pattern. | **PASS** |
| VI. Evidence-Gated, Bounded Work | Scope is locked to spec's 3 requirement groups; this plan does not expand scope. Implementation will not begin until plan + tasks + analyze gates pass (enforced by Development Workflow, not by this plan). | **PASS** |
| VII. Simplicity Over Feature Count | Group C's menu items are 1:1 with existing actions (expand/steer/delete/merge, add-node/compose) — no new interaction mode, just a new entry point to existing ones. | **PASS** |
| VIII. Static, Hostable Anywhere | No server code introduced; build remains `vite build` static output. | **PASS** |

**Note on Principle II**: The constitution's literal text says "No feature may introduce a new
credential store, a new third-party inference endpoint, or any new destination for the user's key
without an explicit constitution amendment." Group A's entire purpose is to let the user *point
their existing key at a destination of their choosing* — this is a generalization of BYOK, not a
Henro-initiated new destination. Because this is plausibly a literal-text violation despite being
constitution-compliant in spirit (Principle II's rationale is "leaking or relaying the key defeats
the local-first model," which this feature does not do — the key still goes only to a destination
the user themselves typed in), it is recorded in Complexity Tracking below for explicit
justification rather than silently assumed compliant.

**Gate result: PASS with one documented justification (see Complexity Tracking).**

### Post-Design Re-check (after Phase 1: research.md, data-model.md, contracts/, quickstart.md)

Re-evaluated after data-model.md and contracts/ were written, to confirm the concrete design
(not just the spec-level intent) still holds:

| Principle | Post-design check | Result |
|---|---|---|
| I. Local-First, No Backend, No Accounts | data-model.md confirms no new storage mechanism beyond existing `localStorage` (`openrouter-config` extended in place); `contracts/endpoint-config.md` confirms Henro itself still runs no server — the configured base URL is a client-side `fetch` target the user supplies, same shape as the existing OpenRouter call. | **PASS** |
| II. BYOK and Key Hygiene | `contracts/endpoint-config.md`'s header table confirms the key is sent only in the `Authorization` header of the single request to the single configured `baseUrl` — no key logging, no second destination, no new credential store. Justification in Complexity Tracking stands unchanged by design detail. | **PASS (justified)** |
| III. User as Author, AI as Expander | No design artifact introduces AI-authored judgments; context-menu actions (contracts/context-menu-actions.md) are 1:1 dispatches to existing expand/steer/merge/delete, all user-initiated. | **PASS** |
| IV. Everything Is a Node; Provenance Preserved | `contracts/context-menu-actions.md` confirms Delete dispatches the existing `dismissNode` (soft-delete/orphan, not hard-delete); Merge dispatches existing `mergeNodes` (unchanged history semantics). No new destructive path designed. | **PASS** |
| V. Canvas Over Chat | data-model.md §2 confirms Group B is styling-only on the existing single-node detail view — no transcript/log UI introduced. Context menu is anchored to canvas coordinates (data-model.md §3), not a chat surface. | **PASS** |
| VI. Evidence-Gated, Bounded Work | research.md/data-model.md/contracts introduce zero scope beyond the three requirement groups; R8 explicitly declines a drive-by tsconfig fix to stay bounded. | **PASS** |
| VII. Simplicity Over Feature Count | contracts/context-menu-actions.md's action table shows every menu item maps to a pre-existing store action — no new interaction mode designed, only new entry points. | **PASS** |
| VIII. Static, Hostable Anywhere | No design artifact introduces a build/runtime server requirement; `pnpm build` output shape is unaffected. | **PASS** |

**Post-design gate result: PASS.** No new violations were introduced by the concrete design; the
single pre-existing justification (Principle II literal text vs. spec intent) is unchanged and
remains recorded in Complexity Tracking below.

## Project Structure

### Documentation (this feature)

```text
specs/001-openai-endpoint-readable-canvas/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
│   ├── endpoint-config.md
│   └── context-menu-actions.md
├── checklists/
│   └── requirements.md
└── tasks.md              # Phase 2 output (/speckit-tasks command — NOT created by this run)
```

### Source Code (repository root)

Henro is a single-project client-only React app — no `frontend/`+`backend/` split, no separate
`tests/` tree (none exists in the repo today). This feature adds one new file and modifies
existing files in place, all under `src/`.

```text
src/
├── components/
│   ├── BubbleNode.tsx        # MODIFY: add onContextMenu handler (Group C)
│   ├── Canvas.tsx            # MODIFY: add onContextMenu handler for empty-canvas menu (Group C)
│   ├── ContextMenu.tsx       # NEW: shared node/canvas context menu component (Group C)
│   ├── SidePanel.tsx         # MODIFY: readable typography + scroll affordance (Group B)
│   ├── Settings.tsx          # MODIFY: base URL field, generic copy (Group A)
│   └── WelcomeScreen.tsx     # MODIFY: generic first-run copy (Group A)
├── lib/
│   ├── ai.ts                 # MODIFY: configurable base URL, conditional OpenRouter headers (Group A)
│   ├── config.ts             # MODIFY: baseUrl field + migration/default logic (Group A)
│   └── errors.ts             # MODIFY: de-hardcode "OpenRouter" from error copy (Group A)
├── store.ts                  # MODIFY: add contextMenu ephemeral state + actions (Group C)
└── App.tsx                   # MODIFY: mount <ContextMenu /> once at app root (Group C, T021)
```

**Structure Decision**: Single-project structure (Option 1, trimmed to actual repo layout — no
`models/`/`services/`/`cli/`/`lib/` split beyond what already exists). This matches the existing
codebase convention of `src/components/` (UI) + `src/lib/` (framework-agnostic logic) +
`src/store.ts` (single Zustand store). No new top-level directory is introduced.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Principle II literal text ("no new third-party inference endpoint... without an explicit constitution amendment") | The feature's entire value (spec User Story 1) is letting a user redirect their own BYOK key to any OpenAI-compatible endpoint of their choosing — self-hosted servers, other aggregators. This is a direct, spec-mandated requirement (FR-001–FR-009), not an incidental addition. The rationale behind Principle II ("leaking or relaying the key defeats the local-first model") is preserved: the key is still sent only to a single destination, one the user explicitly typed themselves, never auto-selected or defaulted to a new Henro-chosen third party. OpenRouter remains the zero-effort default (FR-002) so users who touch nothing are unaffected. | Keeping the hardcoded OpenRouter-only client would satisfy the literal constitution text but directly contradicts the accepted spec (User Story 1, P1 priority) and would make Group A undeliverable; the spec itself is the record of product intent that supersedes the literal (not spirit) reading here. Recorded per Governance §"Every plan and PR MUST be checked... a principle violation MUST be justified in writing" — flagging for explicit sign-off rather than silently proceeding. |
| Technical Constraints "TypeScript strict" vs pre-existing repo state | The constitution's Technical Constraints state TypeScript strict, but `tsconfig.app.json`/`tsconfig.node.json` do not set `"strict": true` — a pre-existing gap that predates this feature (research.md R8, verified by reading the tsconfigs). This feature does not worsen it, and task wording forbids editing tsconfigs (out of scope per R8). Recorded here so the constitution check is honest about as-built state rather than silently passing. | Enabling `strict` repo-wide would be a drive-by fix violating bounded-work Principle VI and the task-level "do not edit tsconfig" constraint; it belongs in its own scoped feature with its own risk assessment, not folded into an endpoint/UX feature. Recommend a constitution-followup decision: either amend the constraint to "strict for new files" or schedule a dedicated strictness feature. |
