# Tasks: Configurable Endpoint, Readable Node Detail, Context Menus

**Input**: Design documents from `/specs/001-openai-endpoint-readable-canvas/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/endpoint-config.md, contracts/context-menu-actions.md, quickstart.md

**Tests**: This repository has no automated test runner configured (no Vitest/Jest, no `tests/` directory — confirmed in plan.md Technical Context and research.md R8). Per the Task Generation Rules, test tasks are only included if explicitly requested; the spec does not request one, so this file uses the project's existing quality gates (`pnpm build`, `pnpm lint`) plus the manual scenarios in `quickstart.md` as the verification step at the end of each user-story phase, instead of automated test tasks.

**Organization**: Tasks are grouped by user story (US1 = P1, US2 = P2, US3 = P3) to enable independent implementation and testing of each story, per spec.md's priorities.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Which user story this task belongs to (US1/US2/US3) — omitted for Setup/Foundational/Polish
- Every task includes the exact repo-relative file path(s) it touches

## Path Conventions

Single-project client-only React app (no `frontend/`/`backend/` split, no `tests/` tree) — all paths are under `src/` at the repository root, per plan.md's Project Structure.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish a clean, verified starting point. No new dependency is introduced by this feature (plan.md Technical Context), so setup is verification-only — no source files are created or modified in this phase.

- [ ] T001 Run `pnpm install`, then `pnpm build` (`tsc -b && vite build`) and `pnpm lint` (`eslint .`) from the repository root on the `001-openai-endpoint-readable-canvas` branch, and confirm both pass with zero errors, establishing the pre-change baseline before any task below modifies source files.

**Checkpoint**: Baseline confirmed clean — implementation can begin.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented.

**No foundational tasks are required for this feature.** Per plan.md ("All three groups ... touch only `src/`. No group depends on another") and the Project Structure table, the three groups touch fully disjoint file sets with no shared entities or shared blocking infrastructure:

- Group A (US1): `src/lib/config.ts`, `src/lib/ai.ts`, `src/lib/errors.ts`, `src/components/Settings.tsx`, `src/components/WelcomeScreen.tsx`
- Group B (US2): `src/components/SidePanel.tsx` only
- Group C (US3): `src/store.ts`, `src/components/ContextMenu.tsx` (new), `src/components/BubbleNode.tsx`, `src/components/Canvas.tsx`, `src/App.tsx`

There is no file two stories both need to modify, so there is nothing to sequence ahead of time. Proceed directly to Phase 3.

**Checkpoint**: Foundation ready — all three user stories can start immediately, in any order or in parallel.

---

## Phase 3: User Story 1 - Bring your own OpenAI-compatible endpoint (Priority: P1) 🎯 MVP

**Goal**: Generalize the hardcoded OpenRouter chat-completions client into a configurable OpenAI-compatible client — user-supplied base URL/key/model, OpenRouter as the zero-effort default, OpenRouter-only headers gated to the OpenRouter endpoint, generic error copy, 100% preservation of existing saved config.

**Independent Test**: Open Settings, change base URL/key/model to a second OpenAI-compatible endpoint, trigger Expand, and confirm (via DevTools Network tab) the request goes to the new endpoint with the configured key and without `HTTP-Referer`/`X-Title` headers — independent of any Group B/C change. (spec.md "Independent Test", quickstart.md Group A.)

### Implementation for User Story 1

- [ ] T002 [P] [US1] In `src/lib/config.ts`: add `baseUrl?: string` to the `OpenRouterConfig` type, export an `OPENROUTER_URL` constant (`'https://openrouter.ai/api/v1/chat/completions'`, the single source of truth so `src/lib/ai.ts` and `src/components/Settings.tsx` never duplicate it — see research.md R3's drift concern), and export an `isValidBaseUrl(candidate: string): boolean` helper that returns `true` only when `new URL(candidate)` does not throw and `protocol` is `http:` or `https:` (data-model.md §1, research.md R1–R2).

- [ ] T003 [US1] In `src/lib/config.ts`'s `writeConfig()` (config.ts:28-32): when `next.baseUrl` is present, normalize it via `isValidBaseUrl()` before merging — write the trimmed value if valid, otherwise write `undefined` (removed from the merged object, not stored as `''`), so `readConfig()` never needs to re-validate on read (data-model.md "Validation rules" and "State transitions"; depends on T002, same file).

- [ ] T004 [US1] In `src/lib/ai.ts`'s `getConfig()` (ai.ts:9-32): import `OPENROUTER_URL` from `src/lib/config.ts` (remove the local `const OPENROUTER_URL` at ai.ts:4), read `parsed.baseUrl`, and return `effectiveBaseUrl = (parsed.baseUrl as string)?.trim() || OPENROUTER_URL` and `isOpenRouter = effectiveBaseUrl === OPENROUTER_URL` alongside the existing returned fields (data-model.md "Derived value: effective provider identity", research.md R1, R3; depends on T002).

- [ ] T005 [US1] In `src/lib/ai.ts`'s `chat()` (ai.ts:34-109): replace the hardcoded `fetch(OPENROUTER_URL, ...)` (ai.ts:61) with `fetch(effectiveBaseUrl, ...)` using the value from `getConfig()`, and conditionally spread `'HTTP-Referer': window.location.origin` / `'X-Title': 'Henro'` into the request headers only when `isOpenRouter` is true, omitting them entirely otherwise (contracts/endpoint-config.md Headers table, FR-008, Acceptance Scenarios 5–6; depends on T004, same file).

- [ ] T006 [US1] In `src/lib/ai.ts`'s `chat()` (ai.ts:34-109): reword the two hardcoded "OpenRouter" strings — the `no-key` throw at ai.ts:43 (`'OpenRouter API key not set.'` → `'API key not set.'`) and the `unknown`-kind throw at ai.ts:92-96 (`` `OpenRouter error ${res.status}: ${body}` `` → `` `AI provider error ${res.status}: ${body}` ``, and the matching `console.error('OpenRouter error', ...)` at ai.ts:91 → a generic label) — per contracts/endpoint-config.md's error table and research.md R4 (FR-007; depends on T005, same file).

- [ ] T007 [P] [US1] In `src/lib/errors.ts`'s `toastMessageForAiError()` (errors.ts:20-36): reword the `no-key` case's message at errors.ts:24 (`'Add your OpenRouter key in Settings to start.'` → `'Add your API key in Settings to start.'`) per contracts/endpoint-config.md's error table (FR-007). Independent of T002–T006 (different file).

- [ ] T008 [US1] In `src/components/Settings.tsx`: add a `baseUrl` state field (initialized from `readConfig().baseUrl` in the existing `useEffect` at Settings.tsx:25-36, falling back to `OPENROUTER_URL` imported from `src/lib/config.ts` for display), render a new "Base URL" text input between the API key input (Settings.tsx:149-160) and the "Model" label (Settings.tsx:162) showing that resolved value, include `baseUrl` in the `writeConfig({...})` call inside `saveConfig()` (Settings.tsx:38-41), and show a lightweight inline validation hint (non-blocking) when the typed value fails `isValidBaseUrl()` from `src/lib/config.ts` (FR-001, FR-002; depends on T002).

- [ ] T009 [US1] In `src/components/Settings.tsx`: reword the "OpenRouter API Key" label (Settings.tsx:139) to a generic label (e.g. "API Key") while keeping the existing "Get a key →" link to `https://openrouter.ai/keys` as the suggested default path (FR-009; depends on T008, same file).

- [ ] T010 [P] [US1] In `src/components/WelcomeScreen.tsx`: reword the "Paste your OpenRouter API key to start brainstorming..." copy (WelcomeScreen.tsx:46-58) so it acknowledges other OpenAI-compatible endpoints are supported (configurable later in Settings) while keeping OpenRouter as the zero-friction first-run default — do not add a base URL field to Welcome itself (data-model.md §1 Relationships: "`baseUrl` untouched by Welcome"). Independent of T008/T009 (different file).

- [ ] T011 [US1] Manually validate User Story 1 against `quickstart.md` Group A scenarios 1 (fresh-install default preset), 2 (legacy-config preservation via the seeded `localStorage` snippet), 3–5 (custom-endpoint round trip — verify request URL, `Authorization` header, and absence/presence of `HTTP-Referer`/`X-Title` in DevTools Network tab), 4 (generic error copy contains no "OpenRouter"), and 7 (no-key guidance). Re-run `pnpm build` and `pnpm lint` and confirm both still pass. (Depends on T002–T010.)

**Checkpoint**: User Story 1 is fully functional and independently testable/deployable (MVP boundary — see Implementation Strategy below).

---

## Phase 4: User Story 2 - Read a node's full detail comfortably (Priority: P2)

**Goal**: Restyle the `SidePanel` node-detail text (body, "Branched from" lineage, prompt line) to the existing `text-prose`/`leading-[1.7]` tokens, keeping the existing scroll container as the reachability affordance for long text.

**Independent Test**: Select a node with long, multi-paragraph AI-generated text and confirm every line is readable (font size, line height, contrast) and the full text is reachable via the panel's scroll container, without needing any endpoint or context-menu change. (spec.md "Independent Test", quickstart.md Group B.)

### Implementation for User Story 2

- [ ] T012 [US2] In `src/components/SidePanel.tsx`: change the body `<textarea>`'s classes (SidePanel.tsx:83) from `text-ui font-medium ... leading-[1.4]` to `text-prose font-medium ... leading-[1.7]`, keeping the existing `max-h-[50vh] overflow-y-auto` scroll container unchanged as the reachability mechanism for long text (FR-010, FR-012; research.md R5).

- [ ] T013 [US2] In `src/components/SidePanel.tsx`: change the "Branched from" lineage `<p>` (SidePanel.tsx:91-96) and the "Prompt:" line `<p>` (SidePanel.tsx:97-103) from `text-body leading-[1.5]` to `text-prose leading-[1.7]` (FR-011; depends on T012, same file).

- [ ] T014 [US2] Manually validate User Story 2 against `quickstart.md` Group B scenarios 1–2 (legibility of body text + visible/legible "Branched from"/"Prompt" lines on an AI-generated node with a parent) and 3–4 (paste several paragraphs into a node, confirm scroll reaches every word with no mid-word/mid-sentence clipping at the scroll boundary). Re-run `pnpm build` and `pnpm lint` and confirm both still pass. (Depends on T012, T013.)

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 3 - Act on nodes and canvas via right-click (Priority: P3)

**Goal**: Add a shared `ContextMenu` component driven by new ephemeral store state, wired to `onContextMenu` on `BubbleNode` and `Canvas`, dispatching only to existing store actions (`setSteerPrompt`, `dismissNode`, `mergeNodes`, `setPendingNodePosition`, `compose`) — no new action logic.

**Independent Test**: Right-click a node and confirm the expected action menu appears with each action performing the same effect as its existing button/UI equivalent; separately right-click empty canvas and confirm the canvas menu appears — independent of any Group A/B change. (spec.md "Independent Test", quickstart.md Group C.)

### Implementation for User Story 3

- [ ] T015 [US3] In `src/store.ts`: add the `ContextMenuState` type (`{ kind: 'node'; nodeId: string; x: number; y: number } | { kind: 'canvas'; canvasPos: Position; x: number; y: number } | null`), add `contextMenu: ContextMenuState` plus `openNodeContextMenu(nodeId, x, y)`, `openCanvasContextMenu(canvasPos, x, y)`, and `closeContextMenu()` to the `BrainstormStore` interface (near store.ts:78-142) and their implementations (each a plain `set({ contextMenu: ... })` call, so a second `onContextMenu` firing simply overwrites the state — satisfying FR-020 with no extra coordination code), and confirm `contextMenu` is **not** added to the `persist` middleware's `partialize` selector (store.ts:941-949), since it is ephemeral UI state (data-model.md §3, research.md R6).

- [ ] T016 [P] [US3] In `src/components/BubbleNode.tsx`: add an `e.button === 2` early-return guard to `handlePointerDown` (alongside the existing `e.button === 1` check at BubbleNode.tsx:151-152) so a right-button press never sets `isDragging.current`/starts a connection-drag, and add an `onContextMenu` handler on the outer node `<div>` (BubbleNode.tsx:366-374) that calls `e.preventDefault()` then `openNodeContextMenu(id, e.clientX, e.clientY)` (FR-019, contracts/context-menu-actions.md Trigger contract; depends on T015 for the action, different file from T017 so parallel-eligible with it).

- [ ] T017 [P] [US3] In `src/components/Canvas.tsx`: add an `e.button === 2` early-return guard to `handlePointerDown` (alongside the existing `e.button === 1` check at Canvas.tsx:86-96) so a right-button press never starts marquee selection, and add an `onContextMenu` handler on the container `<div>` (Canvas.tsx:174-182), guarded by `e.target === e.currentTarget` (same target-equality check `handlePointerDown`/`handleDoubleClick` already use, Canvas.tsx:97,166), that calls `e.preventDefault()` then `openCanvasContextMenu(screenToCanvas(e.clientX, e.clientY), e.clientX, e.clientY)` (FR-019, contracts/context-menu-actions.md Trigger contract; depends on T015, different file from T016 so parallel-eligible with it).

- [ ] T018 [US3] Create `src/components/ContextMenu.tsx`: read `contextMenu`, `nodes`, and `selectedNodeIds` from `useBrainstormStore`; render nothing when `contextMenu` is `null`; absolutely position the menu at `(contextMenu.x, contextMenu.y)` with a Framer Motion fade/scale using `TRANSITION.snappy` (matching the `ai-panel` popover pattern at `Settings.tsx:128-136`); for `kind: 'node'` (resolving the node via `nodes[contextMenu.nodeId]`, and rendering nothing if it's not `status === 'active'`), render menu items per contracts/context-menu-actions.md's node-target table — Expand/Branch and Steer/Lens both dispatching `setSteerPrompt({ nodeId, defaultValue: 'brainstorm ideas' })`, Delete dispatching `dismissNode(nodeId)`, and Merge (only when `selectedNodeIds.length === 2 && selectedNodeIds.includes(nodeId)`) dispatching `mergeNodes(nodeId, otherId)` where `otherId = selectedNodeIds.find(id => id !== nodeId)!`; for `kind: 'canvas'`, render "Add seed/node here" dispatching `setPendingNodePosition(contextMenu.canvasPos)` and "Compose board" dispatching `compose()` (disabled/no-op-with-feedback when active node count `< 2`, mirroring `ComposeButton.tsx:47`'s `canCompose` gate); every item dispatch is followed by `closeContextMenu()` (data-model.md §3, contracts/context-menu-actions.md Menu contracts; depends on T015).

- [ ] T019 [US3] In `src/components/ContextMenu.tsx`: add dismissal — an `Escape` keydown listener and an outside-`pointerdown` listener (mirroring the exact ref-based pattern in `src/components/Settings.tsx:65-76`) that both call `closeContextMenu()` with no action performed (FR-017, contracts/context-menu-actions.md Dismissal contract; depends on T018, same file).

- [ ] T020 [US3] In `src/components/ContextMenu.tsx`: add keyboard operability — on open, move focus to the first `role="menuitem"` element inside the `role="menu"` container; `ArrowDown`/`ArrowUp` move focus among items, wrapping at the ends; `Enter`/`Space` activates the focused item (same effect as a click) (FR-018, contracts/context-menu-actions.md Keyboard operability contract; depends on T019, same file).

- [ ] T021 [P] [US3] In `src/App.tsx`: import and mount `<ContextMenu />` once inside the Canvas-state branch's root container, as a sibling immediately after `<SidePanel />` (the same conditional subtree that already mounts `<Settings />`, `<SidePanel />`, and `<ComposeButton />` — the menu only exists when a board is open) (research.md R6; depends on T018 — the component existing and rendering node/canvas menus — but not on T019/T020, so parallel-eligible with them).

- [ ] T022 [US3] Manually validate User Story 3 against `quickstart.md` Group C scenarios 1 (node menu: right-click shows Expand/Branch, Steer/Lens, Delete; native browser menu does not appear; Delete dismisses the node), 2 (shift-select two nodes, right-click one, confirm Merge appears and works), 3 (right-click empty canvas shows "Add seed/node here" and "Compose board"), 4–5 (Esc and outside-click dismiss with no action; ArrowDown+Enter activates the focused item), 6 (right-click-and-drag on canvas and on a node opens only the menu, no marquee/no node drag; left-button marquee/drag still work — SC-007 regression check), and 7 (right-clicking a second node/location retargets the menu, never leaves two open). Re-run `pnpm build` and `pnpm lint` and confirm both still pass. (Depends on T015–T021.)

**Checkpoint**: All three user stories are independently functional. Regardless of implementation order, US1/US2/US3 do not interfere with one another (disjoint file sets, per Phase 2).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final integration check once all desired user stories are complete.

- [ ] T023 Run the full `quickstart.md` end-to-end (all Group A + Group B + Group C scenarios, in one pass, with all three stories' changes present together) and a final `pnpm build` + `pnpm lint` gate, confirming SC-001 through SC-007 all hold simultaneously. (Depends on T011, T014, T022.)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: No tasks (see Phase 2 note) — does not block anything beyond Setup.
- **User Stories (Phase 3–5)**: Each depends only on Phase 1 completing. US1, US2, and US3 touch disjoint file sets (Phase 2 note) and can proceed in parallel, or sequentially in priority order (P1 → P2 → P3) if worked by one person.
- **Polish (Phase 6)**: Depends on all three user-story phases' validation tasks (T011, T014, T022).

### User Story Dependencies

- **User Story 1 (P1)**: No dependency on US2 or US3.
- **User Story 2 (P2)**: No dependency on US1 or US3.
- **User Story 3 (P3)**: No dependency on US1 or US2.

### Within Each User Story

- **US1**: T002 → T003; T002 → T004 → T005 → T006 (all `ai.ts`/`config.ts`, sequential within each file); T007 independent; T002 → T008 → T009 (`Settings.tsx`, sequential); T010 independent; T011 last (validation).
- **US2**: T012 → T013 (same file, sequential); T014 last (validation).
- **US3**: T015 first (store); T016 and T017 depend on T015 but not on each other (parallel); T018 depends on T015; T019 → T020 (same file as T018, sequential after it); T021 depends on T018 (parallel with T019/T020); T022 last (validation, depends on everything in the story).

### Parallel Opportunities

- All three user-story phases (3, 4, 5) can be staffed and worked in parallel once Setup (Phase 1) is done.
- Within US1: T002 and T007 can start together; T010 can run parallel to the T008→T009 chain.
- Within US3: T016 and T017 can run together once T015 lands; T021 can run parallel to T019→T020 once T018 lands.

---

## Parallel Example: User Story 1

```bash
# After T002 lands, these can run together:
Task: "De-hardcode OpenRouter copy in toastMessageForAiError() in src/lib/errors.ts"          # T007
Task: "Add Base URL field + validation to src/components/Settings.tsx"                         # T008 (then T009)
Task: "Reword first-run copy in src/components/WelcomeScreen.tsx"                               # T010
```

## Parallel Example: User Story 3

```bash
# After T015 (store) lands, these can run together:
Task: "Add right-click guard + onContextMenu wiring in src/components/BubbleNode.tsx"  # T016
Task: "Add right-click guard + onContextMenu wiring in src/components/Canvas.tsx"      # T017

# After T018 (ContextMenu.tsx base render) lands, these can run together:
Task: "Mount <ContextMenu /> in src/App.tsx"                                            # T021
Task: "Add dismissal to src/components/ContextMenu.tsx" → "Add keyboard nav" (sequential, same file)  # T019 → T020
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001).
2. Complete Phase 2: Foundational — no tasks, nothing to do.
3. Complete Phase 3: User Story 1 (T002–T011).
4. **STOP and VALIDATE**: Run `quickstart.md` Group A scenarios (already folded into T011). This is the MVP boundary per spec.md's priority ordering — US1 removes the hardcoded OpenRouter dependency, the most structural and highest-risk change, and is independently shippable with no Group B/C code present.
5. Deploy/demo if ready.

### Incremental Delivery

1. Setup → Foundation ready (no foundational work needed).
2. Add User Story 1 (T002–T011) → validate independently (T011) → Deploy/Demo (MVP!).
3. Add User Story 2 (T012–T014) → validate independently (T014) → Deploy/Demo.
4. Add User Story 3 (T015–T022) → validate independently (T022) → Deploy/Demo.
5. Run Phase 6 (T023) once all three are in.
6. Each story adds value without breaking the previous ones — confirmed by their disjoint file sets (Phase 2 note).

### Parallel Team Strategy

With multiple developers, after Phase 1:
- Developer A: User Story 1 (T002–T011).
- Developer B: User Story 2 (T012–T014).
- Developer C: User Story 3 (T015–T022).

No merge conflicts are expected between stories (disjoint file sets); Phase 6 (T023) runs once all three land.

---

## Notes

- [P] tasks = different files, no dependency on an incomplete task.
- [US#] label maps each task to its user story for traceability back to spec.md.
- No automated test tasks are included — this repo has no test runner (research.md R8); each story's last task is a manual `quickstart.md`-scenario pass plus `pnpm build`/`pnpm lint`.
- Do not edit `tsconfig*.json`, `package.json`, or other build config as part of any task above — out of scope per research.md R8 and the task's own constraints.
- Commit after each task or logical group.
- Stop at any checkpoint (end of Phase 3, 4, or 5) to validate that story independently before continuing.
