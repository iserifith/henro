# Phase 0 Research: Configurable Endpoint, Readable Node Detail, Context Menus

No `NEEDS CLARIFICATION` markers remain in the spec (confirmed by
`checklists/requirements.md`) or were introduced by the Technical Context. This file records the
research/decisions made to ground the plan in the real codebase rather than in the spec's
technology-agnostic language.

## R1 — Where does the base URL live, and how does migration work?

**Decision**: Add an optional `baseUrl?: string` field to the `OpenRouterConfig` type in
`src/lib/config.ts`, stored in the same `openrouter-config` localStorage record. Treat
`baseUrl` absent/empty as "use the OpenRouter default" — do not write a literal default value
into storage on migration; only write it when the user explicitly saves a custom one (or clears
back to default). `getConfig()` in `src/lib/ai.ts` resolves the effective base URL as
`parsed.baseUrl?.trim() || OPENROUTER_URL`.

**Rationale**: `src/lib/config.ts` already has exactly this shape for `model`, `branchCount`,
`systemPrompt` — each is optional-with-fallback, read via `readConfig()`/`writeConfig()`
(`src/lib/config.ts:5-32`), and `src/lib/ai.ts`'s own `getConfig()` (`src/lib/ai.ts:9-32`)
duplicates that resolution for the fields it needs. Following the same pattern means:
- FR-004 (100% of existing saved config preserved) is automatically satisfied — old records simply
  have no `baseUrl` key, `JSON.parse` doesn't choke on a missing key, and the fallback kicks in.
- Edge case "legacy `openrouter-config` entry has no base URL at all" (spec Edge Cases) is handled
  by construction, not by a special migration step or version bump.
- FR-002 (OpenRouter prefilled as default preset) is satisfied by having `Settings.tsx` display
  the resolved effective URL (falling back to the OpenRouter constant) in the input's value, same
  as it already does for `model`.

**Alternatives considered**:
- *Bump the Zustand/localStorage schema version and write a migration function.* Rejected —
  `openrouter-config` is a hand-rolled key outside Zustand's `persist` (which only covers `henro`
  project data), so there is no migration framework here to hook into, and none is needed since
  the field is purely additive/optional.
- *Store base URL in the Zustand `persist` store instead of `openrouter-config`.* Rejected — it's
  AI-provider configuration, same category as `apiKey`/`model`/`systemPrompt`, and splitting it
  across two storage mechanisms would be pure inconsistency with no benefit; also the entire
  `readConfig`/`writeConfig`/`useHasApiKey` API in `config.ts` is already built around
  `openrouter-config`.

## R2 — How to validate the base URL (edge case: empty/malformed/no-scheme)?

**Decision**: Treat the base URL as "configured" only if `new URL(value)` does not throw and the
protocol is `http:` or `https:`; otherwise fall back to the OpenRouter default and surface a
lightweight inline validation hint in Settings (not a blocking modal). No network reachability
check (that would require a request, which is out of scope and would leak the key to an unproven
endpoint before the user asked).

**Rationale**: The spec's edge case is explicit: "the base URL field should require a plausible
URL before it's treated as configured, and OpenRouter's default remains the fallback preset."
`URL` is a built-in global (available in `DOM` lib, already in `tsconfig.app.json`'s `lib` array)
— no new dependency. This is the same lightweight-validation posture as the existing
`looksLikeOpenRouterKey()` regex check in `config.ts:37-39`, which is deliberately lenient
("catch obvious mistakes... not gatekeep").

**Alternatives considered**: A stricter allowlist (require path ending in `/chat/completions`) —
rejected as over-constraining; some OpenAI-compatible servers may structure paths differently
(spec explicitly scopes "OpenAI-compatible" to the request/response *shape*, not URL structure).

## R3 — Conditional OpenRouter-only headers (FR-008)

**Decision**: In `src/lib/ai.ts`'s `chat()`, compute `isOpenRouter = effectiveBaseUrl ===
OPENROUTER_URL` (exact match against the same constant used as the default) and only spread
`'HTTP-Referer'`/`'X-Title'` into the fetch headers when `isOpenRouter` is true.

**Rationale**: Directly satisfies FR-008 and Acceptance Scenarios 5–6 of User Story 1. Exact
string match (not a hostname substring/`includes` check) avoids accidentally sending
app-identifying headers to a look-alike or subdomain the user didn't intend, per Principle II's
"never to any other destination" framing.

**Alternatives considered**: Matching on hostname (`new URL(url).hostname === 'openrouter.ai'`) —
considered marginally more robust to trailing-slash variance, but rejected for this pass in favor
of the simpler exact-constant match; the default value is always written verbatim by this code
(never user-edited when "using the default"), so drift is not a real risk. Flagged as a
non-blocking implementation note, not a spec ambiguity.

## R4 — Generic error copy (FR-007) without losing useful specificity

**Decision**: `src/lib/errors.ts`'s `toastMessageForAiError()` already routes on `AiError.kind`
(`no-key` / `auth` / `rate-limit` / `network` / `unknown`) rather than on provider — only the
*strings* need to stop saying "OpenRouter" ("Add your OpenRouter key in Settings" →
"Add your API key in Settings"). `src/lib/ai.ts`'s own `throw new AiError('no-key', 'OpenRouter
API key not set.')` and the `unknown` branch's `` `OpenRouter error ${res.status}: ${body}` ``
(`src/lib/ai.ts:43,94`) need the same treatment — reword to "AI provider" / "the configured
endpoint" generically. No new `AiErrorKind` is needed; the taxonomy is already provider-agnostic.

**Rationale**: FR-007 only requires the *copy* to stop hardcoding "OpenRouter" when a different
endpoint is active — it does not require different error *behavior* per provider (out of scope:
"providers requiring a different request contract are out of scope"). Reusing the existing kind
taxonomy is the minimal change; inventing dynamic per-provider copy (e.g. deriving a display name
from the URL) is unnecessary complexity the spec doesn't ask for ("error copy must be generic...
or dynamically reflect the active provider" — generic satisfies this without the dynamic branch).

**Alternatives considered**: Deriving and interpolating the provider's hostname into error
strings ("api.example.com error 500..."). Rejected as unnecessary given generic copy is
explicitly spec-sufficient, and it would require extra plumbing (passing the resolved URL through
to every error site) for no required behavior change.

## R5 — Readable node detail: which mechanism (Group B)?

**Decision**: Reuse the existing `text-prose` (15px) / `leading-[1.7]` combination already used
for the Compose modal's markdown body (`ComposeButton.tsx:120`, `--text-prose: 0.9375rem` in
`src/index.css:29`) for the `SidePanel` body textarea, lineage line, and prompt line — replacing
`text-ui`/`text-body` (12–13px) + `leading-[1.4]`/`leading-[1.5]`. Keep the panel's existing
`overflow-y-auto` scroll container (`SidePanel.tsx:83`, `max-h-[50vh]`) as the reachability
affordance for long text — it already exists and already satisfies "scrolling within the panel"
per spec's own example affordance (FR-012/FR-013, Acceptance Scenario 3). No modal/expand-to-full-
screen mechanism is needed; the spec explicitly leaves the mechanism open ("left open to the
planning phase") and a scroll container that's already wired up is the minimal compliant choice.

**Rationale**: `text-prose` already exists in the token scale specifically for "modal markdown
body" reading — i.e., exactly the "comfortable reading size" bar this feature needs, and it's
already proven in production (Compose modal). Introducing a *new* font-size token would violate
"Visual redesign or theming beyond what's needed... is out of scope" (spec Assumptions) by
expanding the token set; reusing the existing largest-body token is the smallest change that
clears the "distinctly more legible" bar (SC-005). `max-h-[50vh]` + `overflow-y-auto` already
means no content is ever clipped with no way to reach it — confirmed from the pre-change source
`SidePanel.tsx` implementation (not assumed).

**Alternatives considered**:
- *New expand-to-modal affordance (like Compose's modal).* Rejected — the scroll container already
  satisfies "reachable... without needing any endpoint or context-menu changes" (spec Independent
  Test) with strictly less new UI surface; a modal would be a bigger behavior change than the
  requirement calls for (FR-012 requires reachability, not a particular presentation).
- *Increase panel width instead of font size.* Rejected — spec explicitly measures legibility via
  "font size, line height, contrast" (FR-010), not layout width; width is orthogonal and not what
  SC-005 ("users report the node detail text as clearly more comfortable to read... without
  zooming") is asking for.

## R6 — Context menu: component boundary and state shape (Group C)

**Decision**: One new component, `src/components/ContextMenu.tsx`, rendered once at the app root
(alongside `SidePanel`/`Settings`/`ComposeButton` siblings in `App.tsx`) and driven entirely by
new ephemeral state on `useBrainstormStore`:

```ts
contextMenu: { kind: 'node'; nodeId: string; x: number; y: number }
           | { kind: 'canvas'; canvasPos: Position; x: number; y: number }
           | null
```

`BubbleNode.tsx` and `Canvas.tsx` each get an `onContextMenu` handler that calls
`e.preventDefault()` (suppress native browser menu) and sets this state with the pointer's screen
coordinates (`x`/`y`, for menu placement) plus either the target `nodeId` or the canvas-space
position (for "add node here"). The menu itself is a plain positioned `<div>` (Framer Motion
`TRANSITION.snappy` fade/scale, matching Settings' `ai-panel` popover pattern at
`Settings.tsx:128-136`), dismissed by Esc, outside-pointerdown (matching the exact pattern already
used for the Settings popover at `Settings.tsx:65-76`), or action selection.

**Rationale**:
- A single shared component (not separate `NodeContextMenu`/`CanvasContextMenu`) keeps
  "opening a new menu closes the old one" (FR-020) trivially true — it's one piece of state, so a
  second `onContextMenu` firing just overwrites it, which is exactly the required behavior with no
  extra coordination code.
- Storing state in the Zustand store (not local component state in `BubbleNode`/`Canvas`) is
  required because the menu's *content* (list of actions) depends on cross-cutting store state —
  specifically FR-015's "second node selected for merge" condition — which only the store has
  visibility into without prop drilling.
- Reusing the exact outside-click/Esc pattern already in `Settings.tsx` is a direct precedent in
  this codebase for "transient popover, dismissed by outside click" — no new interaction pattern
  is invented (Principle VII).
- `e.preventDefault()` on `contextmenu` is the standard, only way to suppress the native browser
  menu; it does not require suppressing `pointerdown`, so it does not interfere with the existing
  `handlePointerDown`/marquee/drag logic in `Canvas.tsx`/`BubbleNode.tsx` — right-click
  (`button === 2`) never sets `isDragging.current`/`isSelecting.current` in the current pointer
  handlers (verified: both only branch on `button === 1` for middle-click and otherwise assume
  left-button semantics), so FR-019 ("right-click must not initiate marquee/drag") is close to
  already-true and only needs an explicit `if (e.button === 2) return` guard added defensively at
  the top of `handlePointerDown` in both files to make it robust rather than incidental.

**Alternatives considered**:
- *Native browser `contextmenu` + `<menu>` element.* Rejected — no styling control, inconsistent
  cross-browser, and the spec requires keyboard operability (FR-018) and Esc/outside-click
  dismissal (FR-017), which a custom component controls directly and a native menu does not.
- *Per-node local `useState` for menu open/closed.* Rejected per the cross-cutting-state
  reasoning above — merge-eligibility and "only one menu open at a time" both need shared state.

## R7 — What counts as "a second node selected/targeted for merge" for FR-015?

**Decision**: Reuse `selectedNodeIds` (existing multi-select array on the store, populated by
shift-click `toggleNodeSelected` and marquee `selectInRect`) — when a node context menu opens for
node `id`, offer "Merge" if `selectedNodeIds.length === 2 && selectedNodeIds.includes(id)`, using
the *other* id in that pair as the merge partner.

**Rationale**: The spec's own Assumptions section states: "Merge-via-context-menu reuses the
existing notion of 'a second node currently selected/targeted for merge' rather than introducing a
new selection mechanism." The codebase has exactly one persistent (non-drag-transient) notion of
"a second node selected" today: `selectedNodeIds` multi-select (`store.ts:88`,
`toggleNodeSelected` at `store.ts:462-475`). The other candidate — `mergeTarget` — is drag-gesture
transient (set only during an active second-press drag in `BubbleNode.tsx:207-232` and cleared on
pointer-up), so it cannot be "targeted" at the moment of a right-click, which happens on
pointer-down, not during a drag. `selectedNodeIds` is therefore the only viable existing mechanism,
confirming it's what the spec's Assumption is pointing at.

**Alternatives considered**: Introducing a new "merge target" click-to-pin mechanism triggered by
the context menu itself (e.g., "Merge with..." submenu listing nearby nodes). Rejected — this
would be a *new* selection mechanism, directly contradicting the spec's Assumption sentence, and
would violate Principle VII (no new interaction mode without integrating into existing machinery).

## R8 — TypeScript strict mode gap (pre-existing, out of scope to fix)

**Finding**: The constitution's Technical Constraints state "TypeScript MUST be run in strict
mode," but `tsconfig.app.json`/`tsconfig.node.json` do not set `"strict": true` (verified by
reading both files in full — only `noUnusedLocals`, `noUnusedParameters`,
`noFallthroughCasesInSwitch`, `erasableSyntaxOnly` are set; TypeScript's default for an unset
`strict` flag is `false`). This is a pre-existing repository condition, not something this feature
introduces or is asked to fix.

**Decision**: Do not modify `tsconfig*.json` as part of this feature (out of scope per the task
instructions — application source/config files are not to be edited during plan phase, and this
feature's spec does not mention build configuration). Code written for this feature will be
written *as if* strict mode were on (explicit types, no implicit `any`, null-checked access) so
that turning strict mode on later — a separate, un-scoped concern — would not immediately surface
new errors from this feature's code. This is noted here so `tasks.md` / implementation is not
surprised by the gap, and so the plan's Technical Context claim of "TypeScript strict" (per the
task's framing) is understood as "written to strict-mode discipline," not "enforced by
`tsconfig.json` today."

**Alternatives considered**: Flipping on `"strict": true` repo-wide as a drive-by fix. Rejected —
out of scope for this feature, would touch a config file (excluded by task instructions), and
could surface unrelated pre-existing type errors across the whole codebase that have nothing to do
with this spec's three requirement groups (Evidence-Gated, Bounded Work — Principle VI).

## Summary of resolved unknowns

| Technical Context field | Resolution |
|---|---|
| Testing | No test runner configured; gates are `pnpm build` + `pnpm lint` + manual quickstart verification (see quickstart.md) |
| Storage | `localStorage` — `openrouter-config` (Group A) + existing `henro`/per-project keys (unchanged) |
| Base URL validation | `new URL()` + protocol check, lenient, non-blocking |
| Header gating | Exact match against `OPENROUTER_URL` constant |
| Node detail readability mechanism | Reuse `text-prose` token + existing scroll container |
| Context menu state | New `contextMenu` field on the existing Zustand store, ephemeral (not persisted) |
| Merge-target-for-context-menu semantics | Reuse existing `selectedNodeIds` multi-select |
