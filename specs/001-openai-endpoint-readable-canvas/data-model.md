# Data Model: Configurable Endpoint, Readable Node Detail, Context Menus

Henro has no database and no server-side schema — "data model" here means the client-side
TypeScript types and the localStorage records they (de)serialize to. This document covers the
three Key Entities named in the spec, mapped to concrete, existing-codebase-grounded shapes.

## 1. Endpoint Configuration

Extends the existing `OpenRouterConfig` type in `src/lib/config.ts` (persisted under the existing
`openrouter-config` localStorage key — no new key, no version bump; see research.md R1).

```ts
export type OpenRouterConfig = {
  apiKey: string
  baseUrl?: string        // NEW — OpenAI-compatible /chat/completions base URL
  model?: string
  branchCount?: number
  systemPrompt?: string
}
```

### Fields

| Field | Type | Required? | Default when absent | Notes |
|---|---|---|---|---|
| `apiKey` | `string` | Always present in the resolved shape (may be `''`) | `''`, or `VITE_OPENROUTER_API_KEY` dev fallback (FR-006) | Unchanged by this feature. |
| `baseUrl` | `string \| undefined` | Optional | OpenRouter endpoint constant (`https://openrouter.ai/api/v1/chat/completions`) | Empty string, whitespace-only, or a value that fails `new URL()`/non-http(s)-protocol validation is treated as absent (falls back to default) — see research.md R2. |
| `model` | `string \| undefined` | Optional | `'anthropic/claude-sonnet-4.5'` | Unchanged. |
| `branchCount` | `number \| undefined` | Optional | `DEFAULT_BRANCH_COUNT` (3) | Unchanged. |
| `systemPrompt` | `string \| undefined` | Optional | `DEFAULT_SYSTEM_PROMPT` | Unchanged. |

### Derived value: effective provider identity

Not stored — computed at request time in `src/lib/ai.ts`:

```ts
const effectiveBaseUrl = (config.baseUrl?.trim() || OPENROUTER_URL)
const isOpenRouter = effectiveBaseUrl === OPENROUTER_URL
```

`isOpenRouter` gates the `HTTP-Referer`/`X-Title` headers (FR-008). It is a derived boolean, not
persisted state.

### Validation rules

- A candidate `baseUrl` is "configured" (i.e., written as a non-empty string and used as-is)
  only if `new URL(candidate)` does not throw **and** `protocol` is `http:` or `https:`.
- An invalid or empty candidate is normalized to `undefined` before writing, so `readConfig()`
  never needs to re-validate on read — the stored value (if present) is always already valid.
- No uniqueness, no unmodeled cross-field validation (e.g., `model` is not validated against
  `baseUrl`'s provider — free-text `model` field is explicitly the only supported mechanism per
  spec Assumptions: "only a free-text model field is required").

### State transitions

| From | Event | To |
|---|---|---|
| No `openrouter-config` in localStorage (fresh install) | User saves any config in Settings/Welcome | Record created; `baseUrl` present only if user typed a custom, valid URL |
| Legacy record, no `baseUrl` key (pre-existing user) | App loads, no user action | Treated as "using OpenRouter default" — `readConfig()` returns the record unchanged; `baseUrl` stays absent until the user explicitly sets one |
| Record with a custom `baseUrl` | User clears the field back to blank/default in Settings | `baseUrl` written back as `undefined` (removed from the merged object, not stored as `''`) |

### Relationships

- Read by: `src/lib/ai.ts` (`getConfig()`/`chat()`), `src/components/Settings.tsx`,
  `src/lib/config.ts`'s `useHasApiKey()` (unaffected — still keys off `apiKey` only).
- Written by: `src/components/Settings.tsx` (`saveConfig()`), `src/components/WelcomeScreen.tsx`
  (`apiKey` only, `baseUrl` untouched by Welcome — first-run flow does not ask for a base URL,
  keeping the OpenRouter-default path zero-friction per FR-002/Assumptions).

## 2. Node Detail View

Not a new persisted entity — this is a *presentation* concern over the existing `NodeData` type
(`src/store.ts:36-46`), which is unchanged by this feature:

```ts
export type NodeData = {
  id: string
  text: string
  parentId: string | null
  childIds: string[]
  position: Position
  size: { w: number; h: number }
  status: 'active' | 'dismissed'
  origin: 'user' | 'ai'
  steer?: string
}
```

### What changes

Only the rendering in `src/components/SidePanel.tsx` — Tailwind utility classes on the existing
`textarea`/`<p>` elements (`text-ui`/`text-body` + `leading-[1.4]`/`leading-[1.5]` →
`text-prose` + `leading-[1.7]`, per research.md R5). No field is added to `NodeData`; no new
component state; the existing `overflow-y-auto`/`max-h-[50vh]` scroll container on the textarea
(`SidePanel.tsx:83`) remains the reachability mechanism for long text (FR-012).

### Fields relevant to the detail view (all pre-existing, read-only for this feature)

| Field | Used for |
|---|---|
| `node.text` | Body content (readability target) |
| `node.origin` | "AI Response" vs "Your Thought" label; gates lineage/prompt block visibility |
| `node.parentId` → `parent.text` | "Branched from" lineage line (FR-011) |
| `node.steer` | "Prompt: ..." line (FR-011) |

No state transitions — this is a pure read/render entity.

## 3. Context Menu

New, entirely ephemeral (not persisted, not part of the `persist` middleware's `partialize`
selection — see `store.ts:941-949`) state on `useBrainstormStore`.

```ts
export type ContextMenuState =
  | {
      kind: 'node'
      nodeId: string
      x: number   // screen-space, for menu placement
      y: number
    }
  | {
      kind: 'canvas'
      canvasPos: Position   // canvas-space, for "add node here" / seed placement
      x: number
      y: number
    }
  | null
```

Added to the store interface:

```ts
contextMenu: ContextMenuState
openNodeContextMenu: (nodeId: string, x: number, y: number) => void
openCanvasContextMenu: (canvasPos: Position, x: number, y: number) => void
closeContextMenu: () => void
```

### Fields

| Field | Type | Notes |
|---|---|---|
| `kind` | `'node' \| 'canvas'` | Discriminates which action set applies. |
| `nodeId` | `string` (node variant only) | The right-clicked node's id — resolved to `NodeData` via `store.nodes[nodeId]` at render time, not duplicated into the menu state. |
| `canvasPos` | `Position` (canvas variant only) | Canvas-space coordinates for "add seed/node here" (reuses the existing `pendingNodePosition` flow — see below). |
| `x`, `y` | `number` | Screen-space pointer coordinates, for absolute-positioning the menu popup. |

### Derived: available actions (not stored, computed at render time)

**Node menu** (FR-014/FR-015):
- Expand/branch → always offered when node is `active`; dispatches existing `setSteerPrompt({ nodeId, defaultValue: 'brainstorm ideas' })` (same call `BubbleNode.tsx:267` already makes on second-press).
- Steer/lens → same action as Expand in the current UI (there is one "open steer input" affordance today — the menu offers it under both familiar labels per FR-014's "expand/branch, steer/lens" phrasing, both wired to the same `setSteerPrompt` dispatch).
- Delete → dispatches existing `dismissNode(nodeId)` (soft-delete, Principle IV-compliant, matches `SidePanel.tsx:140` and `BubbleNode.tsx`'s dismiss button).
- Merge → offered **only if** `selectedNodeIds.length === 2 && selectedNodeIds.includes(nodeId)` (research.md R7); dispatches existing `mergeNodes(nodeId, otherSelectedId)`.

**Canvas menu** (FR-016):
- Add seed/node here → dispatches existing `setPendingNodePosition(canvasPos)` (same state `Canvas.tsx`'s `handleDoubleClick` already sets at `Canvas.tsx:168`, which `SeedInput`/`NodeInput` already render off of).
- Compose board → dispatches existing `compose()` action (`store.ts:885-904`), same as `ComposeButton.tsx`'s FAB.

No new action logic is introduced anywhere in the store beyond the three menu-open/close setters
above — every menu item is a direct call to an action that already exists and is already
exercised by the current button/drag UI.

### State transitions

| From | Event | To |
|---|---|---|
| `null` | Right-click a node (`BubbleNode` `onContextMenu`) | `{ kind: 'node', nodeId, x, y }` |
| `null` | Right-click empty canvas (`Canvas` `onContextMenu`, target is the canvas element itself) | `{ kind: 'canvas', canvasPos, x, y }` |
| Any non-null | Right-click elsewhere (node or canvas) | Overwritten with the new target's state (FR-020 — one assignment, no manual "close old one first" step needed) |
| Any non-null | Esc keydown, outside pointerdown, or menu item selected | `null` (FR-017) |

### Relationships

- Rendered by: new `src/components/ContextMenu.tsx`, mounted once near the app root.
- Written by: `onContextMenu` handlers added to `src/components/BubbleNode.tsx` and
  `src/components/Canvas.tsx`.
- Reads (for merge-eligibility and canvas-menu positioning): `selectedNodeIds`, `nodes` — both
  pre-existing store fields, unmodified by this feature.
