# Quickstart: Configurable Endpoint, Readable Node Detail, Context Menus

Manual validation guide for the three requirement groups in `spec.md`. This repo has no
automated test runner (see `plan.md` Technical Context / research.md R8), so these are the actual
verification steps to run before considering the feature done — in addition to the two automated
gates (`pnpm build`, `pnpm lint`).

## Prerequisites

```bash
pnpm install
```

- Node/pnpm as already pinned by the repo's lockfile — no new dependency is added by this feature.
- A real OpenRouter key for baseline (Group A scenario 1–2) and, ideally, access to a second
  OpenAI-compatible endpoint for Group A scenario 3–6 (e.g., a local
  [Ollama](https://ollama.com) instance serving `/v1/chat/completions`, or any other
  OpenAI-compatible server you can point at). If a second endpoint isn't available, scenario 3–6
  can be partially verified by pointing `baseUrl` at an invalid/unreachable URL and confirming the
  generic error path (network error, not an OpenRouter-specific message).

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

## Group A — OpenAI-compatible endpoint

### Scenario 1: Fresh install, default preset

1. Clear `localStorage` for the dev origin (DevTools → Application → Local Storage → clear), or
   use a private window.
2. Load the app → Welcome screen appears.
3. Open Settings (gear/AI toggle) without saving a key yet.
4. **Expect**: the base URL field (new) is prefilled with the OpenRouter endpoint; nothing about
   first-run is broken by the new field's presence.

### Scenario 2: Legacy config preserved (no data loss)

1. In DevTools console, seed a *pre-feature-shaped* record (no `baseUrl` key) to simulate an
   existing user:
   ```js
   localStorage.setItem('openrouter-config', JSON.stringify({
     apiKey: 'sk-or-test-existing-key',
     model: 'anthropic/claude-sonnet-4.5',
     branchCount: 5,
     systemPrompt: 'existing custom prompt',
   }))
   ```
2. Reload the app.
3. Open Settings.
4. **Expect**: API key, model, branch count (5), and system prompt all show the seeded values
   exactly — no re-entry, no reset, no error. Base URL field shows the OpenRouter default (since
   none was saved).

### Scenario 3–5: Custom endpoint round-trip

1. In Settings, change the base URL to a second OpenAI-compatible endpoint's full
   `/chat/completions`-shaped URL, set its API key and model, Save.
2. Select a node → click Expand (or right-click → Expand once Group C is implemented).
3. **Expect**: request goes to the configured base URL (verify via DevTools → Network tab — the
   request URL should match what you entered, not `openrouter.ai`), the `Authorization` header
   carries the configured key, and results populate normally in the UI.
4. In the Network tab, inspect request headers.
   **Expect**: `HTTP-Referer` and `X-Title` are **absent** for this non-OpenRouter request.
5. Switch the base URL back to blank (or the OpenRouter URL) and Save, trigger another action.
   **Expect**: `HTTP-Referer`/`X-Title` are **present** again.

### Scenario 4: Generic error copy

1. With a non-OpenRouter base URL configured, set an invalid API key (or point at an unreachable
   URL) and trigger an AI action.
2. **Expect**: the toast error message does not contain the word "OpenRouter" — e.g., "Invalid API
   key – edit in Settings." / "Network error – check your connection." / a generic
   `AI provider error ...` message, per `contracts/endpoint-config.md`'s error table.

### Scenario 7: No key configured

1. Clear the API key field in Settings (or clear localStorage) and ensure no
   `VITE_OPENROUTER_API_KEY` dev env var is set.
2. Trigger an AI action.
3. **Expect**: toast reads generic "add your key" guidance (no hardcoded "OpenRouter").

**Trace to contracts**: `contracts/endpoint-config.md` (full request/response/header/error
contract).

---

## Group B — Readable node detail

### Scenario 1–2: Legibility + lineage

1. Select an AI-generated node that has a parent (branch from any existing node).
2. **Expect**: body text renders visibly larger/more legible than before (15px `text-prose` vs.
   the prior 12–13px), with generous line height; "Branched from: ..." and "Prompt: ..." lines are
   present and legible, not truncated.

### Scenario 3–4: Long text reachability, no mid-word clipping

1. Select a node, click into its textarea, paste several paragraphs of long text (or generate one
   via a branch with a lot of content), then click away to commit.
2. Re-select the node.
3. **Expect**: the panel does not clip the text with no way to see the rest — scroll within the
   textarea reaches every word; scrolling to the very bottom never cuts a sentence/word mid-way
   (the scrollable region's natural end is the text's natural end, not an arbitrary clamp).

**Trace to data-model**: data-model.md §2 (Node Detail View) — no schema change, presentation only.

---

## Group C — Context menus

### Scenario 1: Node menu

1. Right-click a single node on the canvas.
2. **Expect**: native browser context menu does NOT appear; Henro's context menu appears with at
   least Expand/Branch, Steer/Lens, Delete.
3. Click Delete. **Expect**: node is dismissed (same as clicking the existing × button), menu
   closes.

### Scenario 2: Merge via context menu

1. Shift-click (or marquee-select) exactly two nodes so both are in `selectedNodeIds`.
2. Right-click one of the two selected nodes.
3. **Expect**: menu additionally offers Merge; selecting it merges the two nodes, same visual
   result (shimmering placeholder → merged text) as the existing drag-to-merge gesture.

### Scenario 3: Canvas menu

1. Right-click empty canvas space (not on any node).
2. **Expect**: canvas menu appears with "Add seed/node here" and "Compose board".
3. Click "Add seed/node here". **Expect**: same input affordance as double-clicking empty canvas
   appears, anchored near the right-click point.

### Scenario 4–5: Dismissal + keyboard

1. Open any context menu, press `Escape`. **Expect**: menu closes, nothing happened.
2. Open any context menu, click elsewhere outside it. **Expect**: menu closes, nothing happened.
3. Open a node menu, press `ArrowDown` a few times then `Enter`. **Expect**: the focused item's
   action fires, matching what clicking it would do.

### Scenario 6: No marquee/drag regression

1. Right-click-and-drag on empty canvas (as if starting a marquee) — **expect**: no selection
   rectangle appears, only the context menu (opened at the initial right-click point).
2. Right-click-and-drag on a node — **expect**: node does not move, only the context menu opens.
3. As a regression check, repeat both with the **left** mouse button — **expect**: marquee
   selection and node drag both still work exactly as before (SC-007).

### Scenario 7: Retargeting

1. Open a node's context menu, then right-click a *different* node without dismissing the first.
2. **Expect**: the first menu closes and a new menu opens targeting the second node — never both
   open, never the first menu's target left ambiguous.

**Trace to contracts**: `contracts/context-menu-actions.md` (full trigger/dismissal/keyboard
contract, action-to-store-call mapping).

---

## Done criteria for this quickstart

- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes
- [ ] All Group A scenarios above verified (1, 2, 3–5, 4, 7)
- [ ] All Group B scenarios above verified (1–2, 3–4)
- [ ] All Group C scenarios above verified (1, 2, 3, 4–5, 6, 7)
