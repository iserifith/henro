# Feature Specification: Ask Me Mode

**Feature Branch**: `002-ask-me-mode`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Ask Me mode — inverts the Explore loop. Triggered per-node from the node context menu, the AI generates a small set of probing questions about the target node instead of sub-ideas. The user answers inline, and each submitted answer mints as a permanent child node of its question node, with full lineage. Locked decisions: (1) answers are permanent canvas nodes, never transient prompt-steering text; (2) mode is chosen per-node from the context menu — there is no global mode switch."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ask the board a question about a node (Priority: P1)

A user has a node on the canvas they want to stress-test rather than expand. They right-click it, choose "Ask Me" from the context menu (next to Expand/Branch and Steer/Lens), and the AI generates a small set of probing questions — about audience, failure mode, cost, a hidden assumption, a next step, etc. — that appear as new, visually distinct nodes connected to the target.

**Why this priority**: This is the entry point for the entire feature. Without question generation working, there is nothing to answer and no inversion of the Explore loop — every other story depends on this one.

**Independent Test**: Can be fully tested by right-clicking an active node, selecting "Ask Me," and confirming a small set of question-styled nodes appears, connected to the target node, distinguishable at a glance from ordinary idea nodes — independent of whether any question is ever answered.

**Acceptance Scenarios**:

1. **Given** an active node on the canvas, **When** the user right-clicks it, **Then** the context menu shows an "Ask Me" item alongside Expand/Branch and Steer/Lens.
2. **Given** the user selects "Ask Me" on a target node, **When** generation completes, **Then** a small set of question nodes (by default 3–5) appears connected to the target node, each covering a distinct dimension (e.g., audience, failure mode, cost, assumption, next step) rather than restating the same concern.
3. **Given** question nodes have appeared, **When** the user looks at the canvas, **Then** question nodes are visually distinguishable from idea nodes (e.g., different styling), so the user can tell at a glance which nodes are open questions.
4. **Given** the target node already has sibling or ancestor context on the canvas, **When** questions are generated, **Then** the questions reflect awareness of that surrounding context rather than being generic or repeating ground already covered by existing nodes.
5. **Given** a dismissed (deleted) node, **When** the user attempts to right-click it, **Then** no "Ask Me" item is offered (mirrors the existing behavior for Expand/Branch and Steer/Lens on inactive nodes).
6. **Given** question generation fails (provider/auth/network error), **When** the failure occurs, **Then** the user sees the same class of legible, non-crashing error feedback used for a failed Expand/Branch, and no partial or corrupted question nodes are left on the canvas.

---

### User Story 2 - Answer a question and mint a permanent node (Priority: P2)

A user reads a question node and wants to actually answer it. They click/focus the question node, an inline input appears, they type their answer and submit it. Their answer becomes a real, permanent node on the canvas — a child of the question — not text that gets fed silently into a prompt and discarded.

**Why this priority**: This is the feature's core product decision — answers are first-class, permanent, authored content. It's the payoff of Story 1 and the thing that makes Ask Me distinct from just another framing of Expand.

**Independent Test**: Can be fully tested by focusing an unanswered question node, typing text into the inline input it exposes, submitting, and confirming a new permanent node appears as a child of the question node containing exactly what was typed — independent of whether more questions are later generated from the answer.

**Acceptance Scenarios**:

1. **Given** an unanswered question node, **When** the user clicks or focuses it, **Then** an inline answer input appears at that node, using the same inline-editing interaction pattern used elsewhere on the canvas for entering node text.
2. **Given** the inline answer input is open with non-empty text, **When** the user submits it, **Then** a new node is created containing exactly the submitted text, connected as a child of the question node, and the input closes.
3. **Given** an answer has just been submitted, **When** the user looks at the originating question node, **Then** it is marked as answered and shows a link/reference to its answer node, but the question node itself remains visible on the canvas rather than being removed.
4. **Given** the user submits only blank/whitespace text into the answer input, **When** they submit, **Then** no answer node is created and the question node's unanswered state is unchanged.
5. **Given** an answer node now exists, **When** the user right-clicks that answer node, **Then** it offers the same actions available to an ordinary idea node (at minimum Expand/Branch and Ask Me), so the user can continue branching or questioning from their own answer.
6. **Given** an already-answered question node, **When** the user reopens or reviews it, **Then** its existing answer is reachable from it (not hidden), preserving the question → answer lineage as a permanent record.

---

### User Story 3 - Open questions stay visible as unresolved (Priority: P3)

A user generates several questions across a session but doesn't answer all of them right away. Days later they reload the project and the unanswered questions are still there on the canvas, still visibly open — the field itself shows them what they haven't thought through yet, rather than the questions disappearing or silently resolving themselves.

**Why this priority**: This is what makes Ask Me a durable planning tool rather than a one-off Q&A popup. It depends on Stories 1–2 existing but is independently valuable and testable on its own, and it's the piece most likely to be silently broken by treating questions as transient UI state instead of persisted canvas content.

**Independent Test**: Can be fully tested by generating questions, leaving at least one unanswered, reloading the page, and confirming the unanswered question node is still present, still shows as unanswered, and behaves like a normal node in the canvas layout/physics — independent of any answering interaction.

**Acceptance Scenarios**:

1. **Given** one or more unanswered question nodes exist, **When** the user reloads the page, **Then** every unanswered question node is still present, still marked unanswered, and still connected to its target node.
2. **Given** an unanswered question node, **When** the canvas is panned, zoomed, or other nodes are added/expanded elsewhere, **Then** the question node continues to participate in the canvas's layout/physics exactly like an idea node — it is never auto-hidden, auto-collapsed, or excluded from the visible field.
3. **Given** an unanswered question node, **When** the user takes no action on it, **Then** the system never auto-generates an answer for it and never assigns it a keep/park/drop verdict — the only fates available are: the user answers it, the user leaves it open (parked), or the user deletes it.
4. **Given** an answered question node, **When** the AI generates content elsewhere on the canvas (e.g., a further Expand/Branch or Ask Me on a different node), **Then** the answered question node's own text is never re-submitted as a prompt to generate further questions about itself (no question-about-question recursion).

---

### User Story 4 - Apply a lens to Ask Me (Priority: P4)

A user wants questions asked from a particular angle — e.g., "ask me questions as a pessimist," or "focus on cost." They supply that steer/lens text when triggering Ask Me, the same way they would for Expand/Branch, and the generated questions reflect it.

**Why this priority**: This reuses the existing lens mechanism rather than introducing new UI, so it's low-risk, but it's not required for the core loop (Stories 1–3) to deliver value — a user who never touches the lens field still gets useful default questions.

**Independent Test**: Can be fully tested by triggering Ask Me on a node with lens/steer text supplied (e.g., "as a skeptic") and confirming the generated questions visibly reflect that framing, then separately confirming that omitting the lens text still produces the default balanced question set.

**Acceptance Scenarios**:

1. **Given** the user supplies lens/steer text when triggering Ask Me, **When** questions are generated, **Then** the lens text is passed into the question-generation prompt the same way it is passed into the Expand/Branch prompt, and the resulting questions reflect that framing.
2. **Given** the user triggers Ask Me with no lens/steer text, **When** questions are generated, **Then** the default balanced question set (covering distinct dimensions) is produced, unaffected by any lens from a prior, unrelated action.

---

### Edge Cases

- What happens when a question node is deleted before it's answered? It is removed like any dismissed node, and any nodes that reference it as a parent are detached rather than deleted with it (mirrors existing dismiss behavior for idea nodes).
- What happens when a question node is deleted after it's answered? The question node is removed; its answer node is detached (not deleted), preserving the user's authored content even though the question that prompted it is gone.
- What happens when the target node for Ask Me is deleted or changes state while question generation is still in flight? The in-flight generation must not attach questions to a node that no longer exists or is no longer active (mirrors the existing race-condition handling for Expand/Branch).
- What happens when the AI response for question generation can't be parsed into the expected question list? The system degrades gracefully (no crash, no partial/malformed question nodes left on the canvas) rather than surfacing raw or broken output as a question.
- What happens when a legacy saved project (created before this feature existed) is loaded? Every node without a stored kind is treated as an ordinary idea node; no question/answer nodes existed before, so nothing is misclassified.
- What happens when the user tries to select two question nodes for merge, or a question node and an idea node? Merge is not offered on question nodes — only idea and/or answer nodes are valid merge participants.
- What happens when the user composes the board while question and answer nodes are present? The compose summary draws on idea and answer node text; raw question text is not fed into the summary as content to synthesize.
- What happens when the user tries to answer a question node that has already been answered? Its existing answer is what's shown/reachable; submitting new text through the same inline pattern does not create a second, conflicting answer node for the same question.

## Requirements *(mandatory)*

### Functional Requirements

**Group A — Trigger & question generation**

- **FR-001**: The node context menu MUST offer an "Ask Me" item for any active node, alongside the existing Expand/Branch and Steer/Lens items, and MUST NOT offer it for an inactive (dismissed) node. Carve-out (traceability): the menu MUST NOT offer "Ask Me" on a `question` node — a question is answered, parked, or deleted, never re-questioned (FR-014; no question-about-question recursion).
- **FR-002**: Selecting "Ask Me" on a target node MUST generate a small set of probing questions (default 3–5) about that node, using the same context-aware prompting approach used for Expand/Branch (direct context + wider context), producing questions that span distinct dimensions (e.g., audience, failure mode, cost, assumption, next step) rather than near-duplicates of each other.
- **FR-003**: Each generated question MUST be created as a new node connected as a child of the target node, and MUST be visually distinguishable from idea nodes.
- **FR-004**: Question nodes MUST participate in the canvas's layout/physics system the same way idea nodes do.
- **FR-005**: When the user supplies lens/steer text while triggering Ask Me, that text MUST be incorporated into the question-generation prompt the same way steer text is incorporated into the Expand/Branch prompt; when no lens/steer text is supplied, the default balanced question set MUST be produced.
- **FR-006**: If question generation fails (provider error, auth error, network error) or returns content that cannot be interpreted as a question list, the system MUST surface the same class of legible, non-crashing error feedback used for a failed Expand/Branch and MUST NOT leave partial or malformed question nodes on the canvas.

**Group B — Answering & provenance**

- **FR-007**: Focusing or clicking an unanswered question node MUST expose an inline answer input, using the same inline-editing interaction pattern used elsewhere for entering node text.
- **FR-008**: Submitting non-empty text through a question node's answer input MUST create a new node containing exactly the submitted text, connected as a child of that question node.
- **FR-009**: Submitting only blank/whitespace text through the answer input MUST NOT create an answer node and MUST leave the question node's unanswered state unchanged.
- **FR-010**: Once an answer node is created for a question, the question node MUST be marked as answered and MUST record a link to its answer node's identity; the question node MUST remain visible on the canvas as provenance rather than being removed or hidden.
- **FR-011**: An answer node MUST support the same downstream per-node actions as an idea node, at minimum Expand/Branch and Ask Me, so the user can continue branching or questioning from their own answer.
- **FR-012**: The AI MUST NOT author, suggest, or auto-fill the content of an answer node under any circumstance — only user-typed text may become an answer node's content.

**Group C — Visibility, persistence & data model**

- **FR-013**: Every node MUST carry a kind discriminator distinguishing `idea`, `question`, and `answer` nodes. Nodes from projects saved before this feature existed, which lack a stored kind, MUST be treated as `idea` nodes.
- **FR-014**: Unanswered question nodes MUST remain visible on the canvas indefinitely, surviving other AI actions elsewhere on the board, until the user explicitly answers or deletes them — they MUST NOT be auto-dismissed, auto-answered, or hidden by the system.
- **FR-015**: Question nodes MUST NOT be subject to any AI-assigned keep/park/drop verdict; the only fates available for a question node are user-initiated: answer it, leave it open (parked, i.e. no action), or delete it.
- **FR-016**: An answered question node's own text MUST NOT be used as input context to generate further questions about itself (no question-about-question recursion). This does not restrict generating questions about, or expanding, its answer node.
- **FR-017**: Question and answer nodes MUST persist through the same per-project local storage mechanism used for idea nodes, and MUST survive a full page reload with their kind, text, answered state, and lineage links (question ↔ answer, parent/child) intact.
- **FR-018**: Deleting a question node MUST detach (not delete) any node that references it as a parent, mirroring existing delete behavior for idea nodes; deleting an answered question node MUST NOT delete its associated answer node.

**Group D — Composition interop**

- **FR-019**: The compose action MUST draw its synthesized summary from idea and answer node text; it MUST NOT include raw question node text as content to be summarized.
- **FR-020**: The merge action MUST only accept idea and/or answer nodes as merge participants; question nodes MUST NOT be offered or accepted as a merge source or target.
- **FR-021**: The system MUST NOT expose a bulk/multi-select "Ask Me" action — Ask Me MUST remain a single-node, per-node trigger from the context menu only.
- **FR-022**: The system MUST NOT introduce any global "Ask Me session" mode or mode switch outside the per-node context menu trigger; the existing Explore/Expand flow's behavior MUST be unchanged by this feature. (Satisfied by construction: the feature adds a single node-context-menu item and two node kinds; no mode state, no global switch, no change to any Explore/Expand path — see plan.md Summary and research.md R3–R5.)

### Key Entities

- **Question Node**: Represents a single AI-generated probing question about a target node. Carries the question text and an answered/unanswered state; when answered, carries a link to its answer node's identity. Never receives an AI verdict (keep/park/drop); remains on the canvas as provenance after being answered. Excluded from compose's summarized content and from merge participation.
- **Answer Node**: Represents the user's own authored response to a question node. Carries the user's exact submitted text and a link back to its originating question node. Behaves like an idea node for all downstream actions (Expand/Branch, Ask Me, merge, compose).
- **Node Kind**: The discriminator (`idea` | `question` | `answer`) present on every node. Existing nodes from projects saved before this feature shipped, which lack a stored kind, are treated as `idea` by default.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From any active node, a user can trigger Ask Me and see a small set (3–5) of distinct, differently-angled question nodes appear connected to that node, without leaving the canvas or opening any separate chat surface.
- **SC-002**: A user can go from reading a question node to having their answer exist as a permanent, connected canvas node in a single submit action.
- **SC-003**: 100% of unanswered question nodes remain visible on the canvas after any unrelated AI or user action elsewhere on the board and after a full page reload — none are ever silently lost, auto-answered, or hidden.
- **SC-004**: 100% of answer node content is user-authored; the AI never produces or fills in an answer on the user's behalf.
- **SC-005**: 100% of question and answer nodes, including their answered state and question↔answer links, survive a full page reload unchanged.
- **SC-006**: Composing a board that includes question and answer nodes produces a summary with zero raw question text present, drawing only on idea and answer content.
- **SC-007**: Users can distinguish a question node from an idea node at a glance, without needing to open or click it, on their first exposure to the feature.

## Assumptions

- The default number of generated questions (3–5) mirrors the existing branch-count convention loosely but is not tied to the user's configured branch count setting; introducing a separate user-configurable question count is out of scope for this feature.
- The exact visual treatment that makes a question node "visually distinguishable" (color, shape, badge, etc.) and the exact mechanism by which an answered question node visually "collapses" while remaining as provenance are left open to the planning phase; only the behavioral contract (distinguishable at a glance; remains visible and reachable after being answered) is fixed here.
- Streaming question generation is out of scope; questions are generated and rendered as a completed batch, consistent with how Expand/Branch works today.
- AI auto-answering of questions is explicitly out of scope and excluded by Constitution Principle III (user as author) — no requirement in this spec permits it.
- A global "Ask Me session" mode or any mode switch outside the per-node context menu trigger is explicitly out of scope; Ask Me is only ever invoked per-node.
- Changes to the existing Explore/Expand flow's own behavior are out of scope; Ask Me is an additive, parallel mode reached from the same context menu.
- Multi-select bulk Ask Me (triggering it across several selected nodes at once) is explicitly out of scope for this feature.
- No new runtime dependency is required; Ask Me reuses the existing chat-completions request/response plumbing, the existing context menu component, and the existing inline node-input pattern.
