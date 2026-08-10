# Contract: Context Menu Actions

Henro has no external API surface for this group — the "interface" is the internal contract
between the new `ContextMenu` component, the `onContextMenu` trigger points, and the Zustand
store actions each menu item dispatches to. This document fixes that contract so implementation
(tasks.md, out of scope for this file) has an unambiguous target, and so each menu item is
traceable to an existing, already-shipped store action (per research.md R6/R7 — no new action
logic, only new entry points).

## Trigger contract

| Trigger element | Event | Guard | Resulting store call |
|---|---|---|---|
| `BubbleNode` root div (`src/components/BubbleNode.tsx`) | `onContextMenu` | `e.preventDefault()` (suppress native menu); node must resolve via `store.nodes[id]` | `openNodeContextMenu(id, e.clientX, e.clientY)` |
| `Canvas` container (`src/components/Canvas.tsx`) | `onContextMenu` | `e.preventDefault()`; only when `e.target === e.currentTarget` (empty canvas, not bubbling from a node — same target-equality check the existing `handlePointerDown`/`handleDoubleClick` already use, `Canvas.tsx:97,166`) | `openCanvasContextMenu(screenToCanvas(e.clientX, e.clientY), e.clientX, e.clientY)` |

Right-click-and-drag guard (FR-019): both `BubbleNode.handlePointerDown` and
`Canvas.handlePointerDown` MUST early-return on `e.button === 2` (in addition to the existing
`e.button === 1` middle-click branch) so a right-button pointer-down never sets
`isDragging.current`/`isSelecting.current`. The `contextmenu` event that follows fires
independently of this guard and is what actually opens the menu.

## Menu contract — node target

Precondition: `contextMenu?.kind === 'node'`, node resolved via `store.nodes[contextMenu.nodeId]`,
node must still be `status === 'active'` at render time (if the node was deleted between
right-click and render — e.g., by a rapid keyboard delete on another node's selection — the menu
closes itself instead of rendering with a stale target; see Edge Case row below).

| Menu item | Always shown? | Dispatches | Equivalent existing UI affordance |
|---|---|---|---|
| Expand / Branch | Yes | `setSteerPrompt({ nodeId, defaultValue: 'brainstorm ideas' })` | `SidePanel`'s "Expand" button (`SidePanel.tsx:123-137`) when no active children; `BubbleNode`'s second-press gesture (`BubbleNode.tsx:266-267`) |
| Steer / Lens | Yes | Same dispatch as Expand/Branch (one underlying affordance today — see data-model.md §3) | Same as above |
| Delete | Yes | `dismissNode(nodeId)` | `SidePanel`'s "Delete" button (`SidePanel.tsx:139-146`); `BubbleNode`'s hover-dismiss × button (`BubbleNode.tsx:285-291`) |
| Merge | Only if `selectedNodeIds.length === 2 && selectedNodeIds.includes(nodeId)` | `mergeNodes(nodeId, otherId)` where `otherId = selectedNodeIds.find(id => id !== nodeId)!` | Drag-to-merge gesture (`BubbleNode.tsx:277-279`) |

Each dispatch is followed by `closeContextMenu()`.

## Menu contract — canvas target

Precondition: `contextMenu?.kind === 'canvas'`.

| Menu item | Always shown? | Dispatches | Equivalent existing UI affordance |
|---|---|---|---|
| Add seed/node here | Yes | `setPendingNodePosition(contextMenu.canvasPos)` | Double-click on empty canvas (`Canvas.tsx:164-171`) |
| Compose board | Yes, but disabled/no-op-with-feedback if `nodeCount < 2` (mirrors `ComposeButton`'s existing `canCompose` gate, `ComposeButton.tsx:47`) | `compose()` | `ComposeButton` FAB (`ComposeButton.tsx:91`) |

Each dispatch is followed by `closeContextMenu()`.

## Dismissal contract (FR-017, FR-020)

| Trigger | Behavior |
|---|---|
| `Escape` keydown while `contextMenu !== null` | `closeContextMenu()`, no action performed |
| `pointerdown` outside the menu's DOM node while `contextMenu !== null` | `closeContextMenu()`, no action performed (same pattern as `Settings.tsx:65-76`) |
| A menu item is activated (click or keyboard) | The item's dispatch runs, then `closeContextMenu()` |
| A new `onContextMenu` fires anywhere while `contextMenu !== null` | State is overwritten (not merged) with the new target — old menu is implicitly closed, new one opens targeting the new location, per FR-020 |

## Keyboard operability contract (FR-018)

- On open, focus moves to the first menu item (`role="menuitem"`, container `role="menu"`).
- `ArrowDown`/`ArrowUp` move focus among items, wrapping at the ends.
- `Enter`/`Space` activates the focused item (same as click).
- `Escape` closes with no action (see Dismissal contract).
- Tab is not trapped beyond the standard browser behavior expected of a transient popover — Esc
  and outside-click are the two documented ways out (matching FR-017's exact wording, which does
  not mention Tab).

## Edge cases resolved by this contract

| Spec Edge Case | Resolution |
|---|---|
| Right-click empty canvas while a node is selected | `Canvas`'s `onContextMenu` target-equality check (`e.target === e.currentTarget`) means the canvas menu opens regardless of `selectedNodeId` — selection state does not gate which menu variant opens, only *where* the pointer landed. |
| Right-click a node already selected/open in detail view | `openNodeContextMenu` does not touch `selectedNodeId`/`selectedNodeIds` — the `SidePanel` stays exactly as it was; only `contextMenu` state changes. |
| Right-click during an in-progress drag/marquee started with the primary (left) button | Right-click fires a separate browser `contextmenu` event; it does not cancel an in-flight left-button pointer capture. The in-progress gesture is left to resolve normally on its own `pointerup`/`pointercancel` (unchanged existing behavior); the context menu simply opens on top, per spec Edge Case: "the in-progress primary-button gesture is not corrupted by it." |
| Merge target node deleted/deselected between right-click and item activation | The `Merge` item's precondition (`selectedNodeIds.length === 2 && selectedNodeIds.includes(nodeId)`) is re-evaluated at **render** time (menu is a live subscriber to store state, not a snapshot taken at open time), so if the second node is deselected or deleted before the user clicks, the item disappears from the re-rendered menu rather than dispatching against a stale id. |
