# Quickstart: Ask Me Mode

Manual validation guide for the four user stories in `spec.md`. This repo has no automated test
runner (see `plan.md` Technical Context) — these are the actual verification steps to run before
considering the feature done, in addition to the two automated gates (`pnpm build`, `pnpm lint`),
following the exact convention established in `specs/001-openai-endpoint-readable-canvas/quickstart.md`.

## Prerequisites

```bash
pnpm install
```

- A working OpenRouter (or configured OpenAI-compatible) API key already set up in Settings — Ask
  Me reuses the exact same `chat()` transport as Expand/Branch (see
  `contracts/question-generation-prompt.md`), so any endpoint/key that already works for Expand
  works here with no separate setup.
- At least one existing canvas with a few connected nodes, to exercise the context-aware
  generation and the surrounding-context scenarios below.

## Build & lint gates (run first, and again before calling the feature done)

```bash
pnpm build   # tsc -b && vite build — must pass with zero errors
pnpm lint    # eslint . — must report zero errors
```

## Run the app

```bash
pnpm dev
```

Open the printed local URL (typically `http://localhost:5173`).

---

## User Story 1 — Ask the board a question about a node (P1)

**Trace to contracts**: `contracts/context-menu-and-interactions.md` (menu availability),
`contracts/question-generation-prompt.md` (generation), `data-model.md` §1 (question node shape).

1. Right-click any active idea node. **Expect**: the menu shows "Expand / Branch", "Steer / Lens",
   **"Ask Me"**, "Delete" (plus "Merge" if 2 nodes are selected) — Ask Me sits alongside the
   existing items (Acceptance Scenario 1).
2. Click "Ask Me". **Expect**: an inline lens input appears at the node (same visual style as the
   Expand/Steer inline input), empty by default.
3. Press Enter without typing anything. **Expect**: after a brief load state (same shimmer/loading
   treatment Expand uses), 3–5 new nodes appear connected to the target node, each phrased as a
   distinct question (audience/failure-mode/cost/assumption/next-step-flavored, not near-duplicates
   of each other) (Acceptance Scenario 2).
4. Look at the new nodes without clicking them. **Expect**: they are visually distinguishable from
   ordinary idea/AI nodes at a glance — a different outline treatment (Acceptance Scenario 3,
   SC-007).
5. Build a small neighborhood first (a target node with a sibling or parent already on the
   canvas), then trigger Ask Me on it. **Expect**: the generated questions read as aware of that
   surrounding context (not generic, not repeating ground the sibling/parent already covers)
   (Acceptance Scenario 4).
6. Right-click a *dismissed* node (or select a node and delete it, then try to right-click where it
   was). **Expect**: no context menu appears at all (mirrors existing Expand/Steer behavior for
   inactive nodes) — no "Ask Me" item reachable (Acceptance Scenario 5).
7. Trigger Ask Me with an invalid API key or unreachable endpoint configured. **Expect**: the same
   class of toast error Expand/Branch produces on failure (e.g. "Invalid API key – edit in
   Settings." / "Network error – check your connection.") — no partial or malformed question nodes
   left on the canvas (Acceptance Scenario 6, FR-006).

## User Story 2 — Answer a question and mint a permanent node (P2)

**Trace to contracts**: `contracts/context-menu-and-interactions.md` (`AnswerInput` contract),
`contracts/node-kind-model.md` (`answerQuestion`).

1. Click/focus an unanswered question node from Story 1. **Expect**: an inline answer input opens
   directly at that node (not the `SidePanel`) (Acceptance Scenario 1).
2. Type some text and press Enter. **Expect**: a new node appears containing exactly the typed
   text, connected as a child of the question node; the input closes (Acceptance Scenario 2).
3. Look at the question node. **Expect**: it now reads/renders as answered (muted outline per
   `research.md` R9) and remains visible on the canvas — it is not removed (Acceptance Scenario 3).
4. Click a different unanswered question node, type only spaces, and press Enter (or click away).
   **Expect**: no new node is created; the question's unanswered state is unchanged (Acceptance
   Scenario 4, FR-009).
5. Right-click the answer node created in step 2. **Expect**: the menu offers Expand/Branch and Ask
   Me (same as an idea node) (Acceptance Scenario 5).
6. Select the answered question node from step 2/3 (e.g. via shift-click then the `SidePanel`, or
   however it's reachable outside its own click-to-answer routing). **Expect**: a "View answer"
   affordance is present and clicking it selects/reveals the answer node (Acceptance Scenario 6).

## User Story 3 — Open questions stay visible as unresolved (P3)

**Trace to contracts**: `data-model.md` §1 (persistence — no `partialize` change needed),
`contracts/node-kind-model.md` (invariant 6).

1. Generate several questions (Story 1), answer one, leave at least one unanswered.
2. Reload the page (full browser refresh, not SPA navigation). **Expect**: every unanswered
   question node is still present, still visually marked unanswered, still connected to its target
   node (Acceptance Scenario 1, SC-003/SC-005).
3. Pan and zoom the canvas, and trigger an unrelated Expand/Branch or Ask Me elsewhere on the
   board. **Expect**: the unanswered question node keeps participating in layout/physics exactly
   like an idea node — dragging near it, connecting to it, etc. all work; it's never auto-hidden
   or auto-collapsed (Acceptance Scenario 2, FR-004).
4. Leave an unanswered question untouched through several other AI actions elsewhere on the board.
   **Expect**: it never gets auto-answered and never disappears — its only fates remain
   answer/leave-open/delete (Acceptance Scenario 3, FR-015).
5. Answer a question, then trigger Ask Me or Expand elsewhere on the board (on an unrelated node).
   **Expect**: nothing about the *answered* question node's own text shows up driving new question
   generation about itself — no visible "question about a question" chain (Acceptance Scenario 4,
   FR-016; also verifiable structurally per `research.md` R3 — the answered question node's own
   context menu has no Ask Me/Expand item to even trigger this from).

## User Story 4 — Apply a lens to Ask Me (P4)

**Trace to contracts**: `contracts/context-menu-and-interactions.md` (`SteerInput` reuse for
`askMePrompt`), `contracts/question-generation-prompt.md` (lens → prompt).

1. Right-click a node, choose "Ask Me", and type a lens (e.g. "as a skeptic") into the inline input
   before pressing Enter. **Expect**: the generated questions visibly reflect that framing (more
   pointed/critical in tone for "as a skeptic") (Acceptance Scenario 1).
2. On a different, unrelated node, trigger "Ask Me" and press Enter immediately with no lens typed
   (after having used a lens on a prior, different node in step 1). **Expect**: the default
   balanced question set is produced, unaffected by the earlier lens (Acceptance Scenario 2).

## Edge cases (from spec.md)

1. **Delete an unanswered question node**: right-click → Delete. **Expect**: node is dismissed; any
   node referencing it as parent (none, for a leaf question) is unaffected; no crash.
2. **Delete an answered question node**: right-click the question (not the answer) → Delete.
   **Expect**: question node is dismissed; its answer node remains active and visible, now
   detached (no visible parent line to the deleted question).
3. **Delete/change the target mid-generation**: trigger Ask Me on a node, then quickly delete that
   same node before generation completes. **Expect**: no crash; behavior mirrors what happens if
   you do the same thing to an in-flight Expand/Branch today (research.md R11 — deliberate parity,
   not new protection).
4. **Merge attempts involving a question node**: select a question node and an idea node (or two
   question nodes), right-click one. **Expect**: no "Merge" item appears. Also try dragging a node
   into close proximity of a question node (the drag-to-merge gesture). **Expect**: no merge
   highlight/trigger occurs.
5. **Legacy project**: seed `localStorage` with a project created by a build predating this
   feature (any node with no `kind` field, e.g. reuse spec-001's quickstart seeding pattern with
   plain idea nodes), reload. **Expect**: every node renders and behaves as an ordinary idea node —
   full context menu, no stray "question" styling.
6. **Compose with question/answer nodes present**: with at least one question and one answered
   question (answer node) on the board, plus 1+ idea nodes, trigger Compose (FAB or context menu).
   **Expect**: the resulting summary draws on idea and answer text; skim it for literal question
   text from any unanswered question node — it should not appear as summarized content
   (Acceptance Scenario / FR-019, SC-006).
7. **Re-answering an already-answered question**: after Story 2 step 2, try to click the same
   question node again. **Expect**: it no longer opens `AnswerInput` (it now routes to `selectNode`/
   `SidePanel` per the answered-question row of the click-routing table in
   `contracts/context-menu-and-interactions.md`) — no way to create a second answer node for the
   same question through the normal UI path.

---

## Done criteria for this quickstart

- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes
- [ ] All User Story 1 scenarios verified (1–7)
- [ ] All User Story 2 scenarios verified (1–6)
- [ ] All User Story 3 scenarios verified (1–5)
- [ ] All User Story 4 scenarios verified (1–2)
- [ ] All edge cases verified (1–7)
