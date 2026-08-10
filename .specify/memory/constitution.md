<!--
Sync Impact Report
Version change: [TEMPLATE] → 1.0.0 (initial ratification)
Modified principles: n/a (first fill of template placeholders)
Added sections:
  - Core Principles I–VIII (Local-First No Backend No Accounts; BYOK and Key Hygiene;
    User as Author, AI as Expander; Everything Is a Node, Provenance Preserved;
    Canvas Over Chat; Evidence-Gated Bounded Work; Simplicity Over Feature Count;
    Static, Hostable Anywhere)
  - Technical Constraints
  - Development Workflow
  - Governance (amendment procedure, versioning policy, compliance review)
Removed sections: none (template placeholders only)
Templates requiring updates:
  - .specify/templates/plan-template.md — ⚠ pending manual check (not modified by this run)
  - .specify/templates/spec-template.md — ⚠ pending manual check (not modified by this run)
  - .specify/templates/tasks-template.md — ⚠ pending manual check (not modified by this run)
Follow-up TODOs: none — all placeholders resolved from docs/constitution-prompt.md and repo context.
-->

# Henro Constitution

## Core Principles

### I. Local-First, No Backend, No Accounts
All application state MUST live in the browser (Zustand `persist` middleware, per-project
localStorage keys). Henro MUST NOT depend on a server, a database, or telemetry collection.
Any proposed feature that requires a backend service to function is out of scope and violates
this constitution; it MUST be redesigned to work client-side or rejected.
**Rationale**: Henro's entire value proposition — no accounts, nothing leaves the browser — is
the product's trust boundary. A backend, even an optional one, breaks that promise.

### II. BYOK and Key Hygiene
The user's OpenRouter API key MUST be stored only in localStorage and MUST NOT be transmitted
anywhere except directly to OpenRouter. `VITE_*` environment keys are dev-only conveniences and
MUST NEVER ship inside a hosted production build. No feature may introduce a new credential
store, a new third-party inference endpoint, or any new destination for the user's key without
an explicit constitution amendment.
**Rationale**: BYOK is a security and trust commitment, not an implementation detail — leaking
or relaying the key defeats the local-first model.

### III. User as Author, AI as Expander
The user is the author of every idea on the board; the AI expands, steers, and converges ideas
but MUST NOT replace or override the user's thinking. Features where the AI asks questions
(e.g., Ask Me mode) MUST treat the user's answers as first-class canvas content, not as
transient chat scaffolding. The AI's role is framing and divergence — it MUST NOT issue verdicts,
scores, or judgments about the user or their ideas.
**Rationale**: Henro is a thinking tool for the user, not an autonomous idea generator; the AI's
authority is bounded to keep the user in control of the creative direction.

### IV. Everything Is a Node; Provenance Preserved
Ideas, questions, and answers all live on the canvas as nodes with visible lineage. Convergence
actions (merge, compose) MAY collapse nodes visually but MUST NOT silently destroy history —
parked or merged nodes MUST remain recoverable. Any feature that deletes canvas history without
an explicit, user-initiated, recoverable action is non-compliant.
**Rationale**: Provenance is what makes a canvas trustworthy as a record of how an idea evolved;
silent data loss breaks that record and the user's trust in it.

### V. Canvas Over Chat
Ideas are spatial and branchable, not a linear wall of text. Features MUST respect the visual
field: clutter is a defect, and unanswered or open items MUST stay visible rather than being
buried in a scrolling log or hidden state. Any UI pattern that reintroduces a linear chat-style
transcript as the primary interaction surface MUST be rejected in favor of canvas-native
alternatives.
**Rationale**: The canvas model is the core differentiator from chat-based AI tools; regressing
toward chat undermines the reason Henro exists.

### VI. Evidence-Gated, Bounded Work
Work MUST proceed in compact, verifiable checkpoints rather than large speculative changes.
Scope MUST be locked at the spec stage and MUST NOT be reopened mid-phase without an explicit
re-spec. Implementation MUST NOT begin until plan, tasks, and analyze gates have passed for the
feature in question.
**Rationale**: Bounded, evidence-gated work keeps changes reviewable and prevents scope creep
from silently expanding what a "small" feature touches.

### VII. Simplicity Over Feature Count
Prefer removing options that do not produce distinctly useful results over adding new ones. Any
new interaction mode MUST earn its place as a true sibling to the existing core machinery
(expand / lens / merge / compose) — it MUST NOT be a bolt-on UI element layered on top of the
existing model without integrating into it.
**Rationale**: Every additional mode multiplies UI surface and cognitive load; Henro's value
comes from a small set of composable actions, not from breadth of features.

### VIII. Static, Hostable Anywhere
Build output MUST be a static bundle deployable to any static host. Henro MUST NOT introduce
runtime server requirements (e.g., server-side rendering, API routes, persistent processes).
**Rationale**: Static hosting is what makes the no-backend, no-accounts promise operationally
true, not just a design intention — it must remain deployable as pure static assets.

## Technical Constraints

- TypeScript MUST be run in strict mode, ESLint MUST report no errors, and `pnpm build` MUST
  pass before a change is considered complete.
- No new runtime dependency may be added without explicit justification recorded in the
  feature's plan.
- No feature may introduce a runtime server requirement (see Principle VIII).

## Development Workflow

- Application source files MUST NOT be modified during the specify, plan, or tasks phases of a
  feature — those phases produce design artifacts only.
- Implementation MUST NOT begin until the plan, tasks, and analyze gates have passed for the
  feature (see Principle VI).
- Every plan and PR MUST be checked against the Core Principles above before merge; a principle
  violation MUST be justified in writing in the plan's Complexity Tracking section or the
  feature MUST be redesigned to comply.

## Governance

This constitution supersedes ad-hoc engineering decisions and prior undocumented conventions.
Amendments require explicit user approval and MUST be accompanied by a version bump in this
document's header, following semantic versioning:

- **MAJOR**: Backward-incompatible governance changes, or removal/redefinition of a Core
  Principle.
- **MINOR**: A new principle or section is added, or existing guidance is materially expanded.
- **PATCH**: Clarifications, wording fixes, typo corrections, or other non-semantic refinements.

Every feature plan MUST include a compliance check against the Core Principles before the
implementation phase begins. Complexity or deviation from a principle MUST be explicitly
justified in the plan; unjustified deviations MUST be rejected and the feature redesigned.

**Version**: 1.0.0 | **Ratified**: 2026-08-11 | **Last Amended**: 2026-08-11
