# Feature Specification: Configurable Endpoint, Readable Node Detail, Context Menus

**Feature Branch**: `001-openai-endpoint-readable-canvas`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Platform + UX: OpenAI-compatible endpoint configurability, readable node detail panel, and right-click context menus for node and canvas — one feature directory, three requirement groups (A: OpenAI-compatible endpoint, was OpenRouter lock-in; B: readable node detail, was cramped right panel; C: context menus, was no right-click)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bring your own OpenAI-compatible endpoint (Priority: P1)

A user who wants to use a different inference provider (a self-hosted OpenAI-compatible server, a different aggregator, etc.) opens Settings, enters a base URL, an API key, and a model name, and Henro sends all subsequent brainstorm requests to that endpoint instead of being locked to OpenRouter. A user who never touches this setting keeps using OpenRouter exactly as before, with their existing saved key intact.

**Why this priority**: This removes the hardcoded dependency on a single provider, which is the most structural change and the one most likely to break existing users if done carelessly (key loss, silent breakage of the public henro.space deployment). It has to be right before the other groups matter.

**Independent Test**: Can be fully tested by opening Settings, changing the base URL/key/model to a second OpenAI-compatible endpoint, running an expand/branch action, and confirming the request goes to the new endpoint and returns usable results — independent of any panel or menu changes.

**Acceptance Scenarios**:

1. **Given** a fresh install with no saved configuration, **When** the user opens Settings, **Then** the base URL field is prefilled with the OpenRouter endpoint as the default preset and the user can still complete first-run setup exactly as before.
2. **Given** a user with a previously saved `openrouter-config` (API key, model, branch count, system prompt) from before this feature existed, **When** they load Henro after the update, **Then** their key, model, and other saved preferences are still present and usable with no re-entry required and no data loss.
3. **Given** a user has entered a different base URL, API key, and model pointing at another OpenAI-compatible `/chat/completions` endpoint, **When** they trigger an AI action (expand, merge, compose, project naming), **Then** the request is sent to the configured base URL using the existing chat-completions request/response shape, with the configured key and model.
4. **Given** a user has configured a non-OpenRouter endpoint, **When** an AI request fails (auth error, rate limit, network error), **Then** the error message shown does not say "OpenRouter" and instead refers to the configured endpoint generically.
5. **Given** the configured base URL is the OpenRouter endpoint (whether by default or explicit user choice), **When** a request is sent, **Then** the OpenRouter-specific `HTTP-Referer` and `X-Title` headers are included as they are today.
6. **Given** the configured base URL is not the OpenRouter endpoint, **When** a request is sent, **Then** the OpenRouter-specific `HTTP-Referer` and `X-Title` headers are omitted.
7. **Given** no API key is configured and no dev-mode environment key is available, **When** the user tries an AI action, **Then** they see the existing "add a key" guidance, phrased generically rather than assuming OpenRouter.

---

### User Story 2 - Read a node's full detail comfortably (Priority: P2)

A user selects a node to review what the AI generated (or their own longer thought), and can read the entire text — including multi-paragraph responses and the "Branched from" lineage — without the text being visually cramped, low-contrast, or cut off mid-sentence.

**Why this priority**: This is a pure usability fix with no dependency on Group A or C, but it's ranked below endpoint configurability because it doesn't block anyone from using the product — it makes existing usage better rather than unblocking new usage.

**Independent Test**: Can be fully tested by selecting a node with long, multi-paragraph AI-generated text and confirming every line is readable (font size, line height, contrast) and the full text is reachable via scroll or expand, without needing any endpoint or context-menu changes.

**Acceptance Scenarios**:

1. **Given** a node is selected, **When** its detail view is shown, **Then** the body text renders at a comfortable reading size and line height with sufficient contrast against its background, distinctly more legible than the prior cramped small-gray-text presentation.
2. **Given** an AI-generated node has a parent, **When** its detail view is shown, **Then** the "Branched from" lineage and the originating prompt/steer are visible and legible, not truncated.
3. **Given** a node's text is long enough to exceed the visible detail area (multi-paragraph), **When** the user views it, **Then** the full text is reachable through a clear, discoverable affordance (e.g., scrolling within the panel, or an expand action) rather than being clipped with no way to see the rest.
4. **Given** the user is viewing a long node's detail, **When** they use the provided affordance to see more text, **Then** no sentence or word is cut off partway — the boundary between visible and hidden content only ever falls at a natural scroll/expand boundary, never mid-word.

---

### User Story 3 - Act on nodes and canvas via right-click (Priority: P3)

A user right-clicks a node to get a contextual menu of actions relevant to that node (expand/branch, steer/lens, delete, and merge when a second node is targeted), or right-clicks empty canvas space to get a menu of canvas-level actions (add a seed/node at that location, compose the board).

**Why this priority**: This is a discoverability/efficiency improvement layered on top of already-existing actions (the buttons still work) — valuable, but the least structurally risky and least blocking of the three groups.

**Independent Test**: Can be fully tested by right-clicking a node and confirming the expected action menu appears and each action performs the same effect as its existing button/UI equivalent, and separately right-clicking empty canvas and confirming the canvas menu appears — independent of Group A/B changes.

**Acceptance Scenarios**:

1. **Given** a single node on the canvas, **When** the user right-clicks it, **Then** a context menu appears offering at least expand/branch, steer/lens, and delete for that node.
2. **Given** two nodes are selected/targeted for merge, **When** the user right-clicks one of them, **Then** the context menu additionally offers a merge action, and choosing it performs the same merge behavior available today.
3. **Given** empty canvas space (no node underneath the cursor), **When** the user right-clicks it, **Then** a canvas menu appears offering at least "add seed/node here" and "compose board."
4. **Given** a context menu (node or canvas) is open, **When** the user presses Esc or clicks outside the menu, **Then** the menu closes without performing any action.
5. **Given** a context menu is open, **When** the user selects a menu item via keyboard, **Then** the corresponding action is performed and the menu closes.
6. **Given** the user right-clicks and drags (as they would to start a marquee selection or drag a node with the primary button), **When** this happens on canvas or on a node, **Then** no marquee selection box or node drag is initiated by the right-click — only the context menu opens.
7. **Given** a context menu is already open, **When** the user right-clicks a different node or a different canvas location, **Then** the open menu closes and the new, correctly-targeted menu opens in its place (or the interaction is otherwise unambiguous about which target is active).

---

### Edge Cases

- What happens when the user saves a base URL that is empty, malformed, or missing a scheme? The system should not silently send requests to an invalid destination — the base URL field should require a plausible URL before it's treated as configured, and OpenRouter's default remains the fallback preset.
- What happens when a legacy `openrouter-config` entry has no base URL at all (all pre-existing users, since the field didn't exist before)? It must be treated as "using the default OpenRouter preset" rather than as an error or empty/broken state.
- What happens when the configured endpoint's error response doesn't match OpenRouter's shape (different status codes, different body format)? The user must still get a legible, non-crashing error message, generically worded.
- What happens when a node's text is extremely long (e.g., several thousand words)? The detail view must remain usable (scroll/expand) rather than degrading performance or breaking layout.
- What happens when the user right-clicks on empty canvas while a node is currently selected? The canvas menu (not the node menu) opens, using the right-click location as the anchor for "add node here."
- What happens when the user right-clicks a node that is already selected/open in the detail view? The node context menu opens without closing or altering the existing detail view.
- What happens when the right-click target is ambiguous during an in-progress drag or marquee gesture started with the primary button? The right-click context menu takes precedence and the in-progress primary-button gesture is not corrupted by it.
- What happens when merge is chosen from the context menu but the second node used for targeting has since been deleted or deselected? The merge action is unavailable (not offered, or offered but safely no-ops with feedback) rather than merging against a stale/missing node.

## Requirements *(mandatory)*

### Functional Requirements

**Group A — OpenAI-compatible endpoint**

- **FR-001**: Users MUST be able to configure a base URL, an API key, and a model name for any OpenAI-compatible `/chat/completions` endpoint, in the same settings surface used today for OpenRouter configuration.
- **FR-002**: The system MUST default the base URL to the OpenRouter endpoint as a prefilled preset, so users who take no action continue to use OpenRouter unchanged.
- **FR-003**: The system MUST send AI requests (branch generation, merge, compose, project naming) to the user-configured base URL using the existing chat-completions request and response shape, regardless of which OpenAI-compatible provider is configured.
- **FR-004**: The system MUST preserve all data previously saved under the existing `openrouter-config` localStorage key (API key, model, branch count, system prompt) so existing users experience no loss of saved settings after this feature ships.
- **FR-005**: The system MUST store the user's API key only in localStorage and MUST send it only to the currently configured base URL — never to any other destination.
- **FR-006**: The system MUST continue to support the `VITE_OPENROUTER_API_KEY` development-time environment fallback exactly as it behaves today (used only when no saved key is present, never bundled into a way that leaks to non-configured destinations).
- **FR-007**: Error messages surfaced to the user MUST NOT hardcode "OpenRouter" when the user has configured a different endpoint; error copy must be generic ("the configured endpoint," "your AI provider," etc.) or dynamically reflect the active provider.
- **FR-008**: The system MUST include the OpenRouter-specific `HTTP-Referer` and `X-Title` request headers only when the active base URL is the OpenRouter endpoint, and MUST omit them when a different endpoint is configured, so app metadata is not sent to arbitrary third-party endpoints.
- **FR-009**: Settings and first-run (Welcome) copy MUST NOT present OpenRouter as the only supported provider; copy must reflect that any OpenAI-compatible endpoint is supported, while still surfacing OpenRouter as the default/easy path.

**Group B — Readable node detail**

- **FR-010**: The node detail view MUST render body text (node content, lineage, prompt/steer text) at a font size, line height, and contrast that are comfortably readable, a clear improvement over the current small, low-contrast presentation.
- **FR-011**: The node detail view MUST keep the "Branched from" lineage and originating prompt/steer text visible and legible for AI-generated nodes.
- **FR-012**: The node detail view MUST support node text of any length (including long multi-paragraph content) without truncating or clipping content with no way to reach the rest — via scrolling, expansion, or an equivalent clear affordance.
- **FR-013**: Whatever affordance is used to reveal additional content MUST be discoverable without documentation (visually evident that more content exists and how to reach it).

**Group C — Context menus**

- **FR-014**: Right-clicking a node MUST open a context menu offering, at minimum: expand/branch, steer/lens, and delete for that node.
- **FR-015**: When a second node is selected/targeted for merge, right-clicking a node MUST additionally offer a merge action in that node's context menu, performing the same merge behavior as the existing merge interaction.
- **FR-016**: Right-clicking empty canvas space (no node under the cursor) MUST open a canvas context menu offering, at minimum: add a seed/node at that location, and compose board.
- **FR-017**: Context menus MUST be dismissible via the Esc key and via clicking/tapping outside the menu, in both cases performing no action.
- **FR-018**: Context menus MUST be operable via keyboard (at minimum: navigate items and activate the focused item) in addition to mouse/pointer interaction.
- **FR-019**: A right-click that would otherwise be interpreted as the start of a marquee selection or a node drag MUST NOT initiate marquee selection or dragging — only the context menu opens.
- **FR-020**: Opening a new context menu (via right-click elsewhere) while one is already open MUST close the previous menu, and the resulting action target MUST be unambiguous.

### Key Entities

- **Endpoint Configuration**: The user's AI provider settings — base URL, API key, model name — plus the OpenRouter default preset and the migrated state read from the legacy `openrouter-config` storage key. Determines both where requests go and whether OpenRouter-specific headers are attached.
- **Node Detail View**: The readable presentation of a single node's full text, its origin (user vs. AI), and — for AI-generated nodes — its lineage (parent node, originating prompt/steer). Must remain legible and fully reachable regardless of content length.
- **Context Menu**: A transient, targeted list of actions anchored to either a specific node (node menu: expand/branch, steer/lens, delete, conditionally merge) or an empty canvas location (canvas menu: add seed/node, compose board), dismissed by Esc, outside click, or action selection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can configure a non-OpenRouter, OpenAI-compatible endpoint (base URL, key, model) and successfully receive AI-generated content from it, with zero application source changes required.
- **SC-002**: 100% of users with a pre-existing saved configuration retain their API key, model, and other saved preferences after the update, with no re-entry required.
- **SC-003**: Users configured against a non-OpenRouter endpoint never see the word "OpenRouter" in error messages, and never have app-identifying headers sent to that endpoint.
- **SC-004**: Users reading any node's detail — including long, multi-paragraph AI responses — can reach and read 100% of the node's text, with no portion permanently hidden or cut off mid-sentence.
- **SC-005**: Users report the node detail text as clearly more comfortable to read than the prior small-gray-text presentation, without needing to zoom their browser.
- **SC-006**: Users can complete any of the core per-node actions (expand, steer, delete, merge) via right-click without first locating the equivalent button, on their first attempt.
- **SC-007**: Introducing right-click menus causes zero regression in the existing marquee-select and node-drag success rate — every prior left-click/drag interaction continues to behave exactly as before.

## Assumptions

- OpenRouter remains the default, prefilled preset; a user who never opens Settings continues to get identical behavior to today, including on the public henro.space deployment.
- "OpenAI-compatible" is scoped to the chat-completions request/response shape Henro already sends and parses; providers requiring a different request contract are out of scope.
- Streaming responses, saving multiple endpoint profiles, and fetching an available-models list from the endpoint are explicitly out of scope for this feature, per the locked exclusions; only a free-text model field is required.
- Ask Me mode and any question-generation behavior are entirely excluded from this feature's scope, including as a byproduct of endpoint or panel changes.
- Visual redesign or theming beyond what's needed to satisfy the readability requirements (Group B) is out of scope — this is not a general UI refresh.
- The mechanism for how the node detail view achieves readability (larger panel, modal, expandable card, etc.) is left open to the planning phase; only the readability contract (comfortable size/line height/contrast, no clipped content) is fixed here.
- Merge-via-context-menu reuses the existing notion of "a second node currently selected/targeted for merge" rather than introducing a new selection mechanism.
- Existing automated tests and `pnpm build` are expected to keep passing through this spec's requirements; no requirement here depends on removing or fundamentally restructuring currently-tested behavior.
