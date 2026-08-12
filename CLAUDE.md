# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Henro — a brainstorming canvas that expands ideas with AI. Type a seed, branch it into sub-ideas via an LLM, steer branches with a "lens," merge nodes, and compose the board into a summary. No backend, no accounts, no database — everything lives in the browser's localStorage. BYOK: users paste their own OpenRouter (or configurable OpenAI-compatible) API key.

## Commands

```bash
pnpm install
pnpm dev       # vite dev server
pnpm build     # tsc -b && vite build — this is the type-check step; there is no separate `tsc --noEmit` script
pnpm lint      # eslint .
pnpm preview   # preview production build
```

There is no test suite/script in this repo. Verify changes via `pnpm build` (type errors) + `pnpm lint`, and by running the app in a browser.

For debugging AI prompts/responses: copy `.env.example` to `.env.local` and set `VITE_HENRO_DEBUG=true` to log every prompt + response to the console (collapsed groups).

## Architecture

```
src/
├── App.tsx              – tri-state gate: WelcomeScreen → SeedInput → Canvas
├── main.tsx             – ErrorBoundary wrapper
├── store.ts             – single Zustand store, persist middleware, project slice
├── components/
│   ├── Canvas.tsx       – pan/zoom, marquee select
│   ├── BubbleNode.tsx   – draggable node, merge animation, expand
│   ├── Connections.tsx  – SVG edges
│   ├── SeedInput.tsx    – initial seed prompt (pre-canvas)
│   ├── NodeInput.tsx    – inline rename / per-node prompt
│   ├── SidePanel.tsx    – node detail (on selection)
│   ├── ComposeButton.tsx– summary modal
│   ├── Settings.tsx     – API key + model + branch count + system prompt (presets + editor)
│   ├── ProjectSwitcher.tsx
│   ├── HenroMenu.tsx    – top-left brand menu
│   ├── HelpButton.tsx   – bottom-left shortcuts overlay
│   ├── SelectionCount.tsx – selection count chip
│   ├── WelcomeScreen.tsx
│   ├── Toaster.tsx / ErrorBoundary.tsx
│   └── icons.tsx
├── lib/
│   ├── ai.ts            – chat completion call + retry + debug logging
│   ├── prompts.ts       – system-prompt presets
│   ├── errors.ts        – AiError class + classifier
│   ├── toast.ts         – tiny toast store
│   ├── persistence.ts   – custom Zustand StateStorage adapter (split per-project keys)
│   ├── config.ts        – BYOK config read/write + useHasApiKey
│   ├── tokens.ts        – design tokens (z-index, etc.)
│   ├── motion.ts        – framer-motion duration / easing presets
│   ├── uid.ts           – RFC4122 v4 UUID helper (works in non-secure contexts)
│   ├── layout.ts        – child-node position math
│   ├── physics.ts       – overlap resolution
│   └── usePhysics.ts    – settle-after-drag hook
└── index.css             – Tailwind theme + prose-compose + scrollbar-soft
```

### Persistence schema

- `henro:projects:index` — project metadata list + current ID
- `henro:project:<id>` — one key per project (nodes, connections, viewport, seed, composeResult)
- `openrouter-config` — BYOK config (apiKey, model, branchCount, systemPrompt)

The Zustand store (`src/store.ts`) only persists `nodes`, `connections`, `viewport`, `seedNodeId`, `composeResult` per project (see `partialize` in the `persist` config). Everything else (selections, drag state, loading, modals) is ephemeral. **If you add persistent state, you must update both `partialize` in `src/store.ts` and `PersistedProject`/`readProjectData` in `src/lib/persistence.ts`** — they are two separate places that must stay in sync.

### AI calls

Prompt templates live in `src/lib/ai.ts` and `src/lib/prompts.ts`. `chat()` accepts an optional `modelOverride` so utility calls (e.g. `generateProjectName`) can use a cheaper model than the user's primary one — don't bill cheap utility calls to the primary model.

## Code style constraints (from CONTRIBUTING.md)

- TypeScript strict; no `any` without a comment explaining why.
- Use existing Tailwind theme tokens (`text-ink`, `bg-surface-soft`, `bg-chip`, `border-line-neutral`, etc.) instead of raw hex/colors.
- Node bubbles on the canvas are **text-only**. Metadata about a node (origin, depth, lens used) belongs in the side panel on selection — not as hover labels or inline tags on the bubble.
- New dependencies with non-trivial bundle cost, changes to the persistence schema/storage keys, or anything that breaks the BYOK/local-only story (backend, accounts) should be raised as an issue before implementing.

## Env flags (`.env.local`, copy from `.env.example`)

- `VITE_OPENROUTER_API_KEY` — dev-only fallback key. **Never set in a hosted build** — Vite inlines `VITE_*` vars into the public bundle.
- `VITE_HENRO_DEBUG=true` — logs AI prompts/responses to console.

## Spec-driven feature workflow

This repo uses the `speckit-*` skills (spec-kit) for larger features: specs live under `specs/<NNN-feature-name>/` (spec.md, plan.md, tasks.md, research.md, data-model.md, contracts, quickstart.md). Recent features (`001-openai-endpoint-readable-canvas`, `002-ask-me-mode`) followed this pattern — check `specs/` for prior art before designing a new feature from scratch.
