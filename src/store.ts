import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { computeChildPositions, type Position, type NodeBox } from './lib/layout'
import {
  generateBranches,
  generateQuestions,
  mergeIdeas,
  compose as composeAI,
  generateProjectName,
  ASK_ME_MODEL,
  ASK_ME_REASONING_EFFORT,
  type ContextNode,
} from './lib/ai'
import { CONTEXT_MAX_DEPTH, CONTEXT_MAX_NODES } from './lib/prompts'
import { AiError, toastMessageForAiError } from './lib/errors'
import { useToastStore } from './lib/toast'
import { uid } from './lib/uid'
import {
  henroStorage,
  readProjectData,
  deleteProjectStorage,
  type ProjectMeta,
} from './lib/persistence'

function notifyBusy() {
  useToastStore.getState().push({
    kind: 'info',
    message: 'Still working on the last request — hang tight.',
  })
}

function toastError(err: unknown) {
  // 'auth' / 'no-key' toasts mention "Settings" — surface it as an inline
  // clickable word that jumps the user straight into the Settings panel.
  const action =
    err instanceof AiError && (err.kind === 'auth' || err.kind === 'no-key')
      ? ({ label: 'Settings', intent: 'open-settings' } as const)
      : undefined
  useToastStore.getState().push({
    kind: 'error',
    message: toastMessageForAiError(err),
    action,
  })
}

export type NodeKind = 'idea' | 'question' | 'answer'

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
  kind?: NodeKind
  answerId?: string
}

// Kind is optional so legacy persisted nodes stay kind-absent — treat them
// as idea nodes everywhere a kind-conditional decision is made.
export function effectiveKind(n: NodeData): NodeKind {
  return n.kind ?? 'idea'
}

export type SteerPrompt = {
  nodeId: string
  defaultValue: string
}

export type MergeAnim = {
  placeholderId: string
}

// Ephemeral UI state — never persisted (kept out of persist's partialize).
export type ContextMenuState =
  | {
      kind: 'node'
      nodeId: string
      x: number // screen-space, for menu placement
      y: number
    }
  | {
      kind: 'canvas'
      canvasPos: Position // canvas-space, for "Add node here"
      x: number // screen-space, for menu placement
      y: number
    }
  | null

type HistoryFrame = {
  nodes: Record<string, NodeData>
  connections: [string, string][]
  seedNodeId: string | null
}

const MAX_HISTORY = 50

function snapshot(s: {
  nodes: Record<string, NodeData>
  connections: [string, string][]
  seedNodeId: string | null
}): HistoryFrame {
  return { nodes: s.nodes, connections: s.connections, seedNodeId: s.seedNodeId }
}

function appendCapped(arr: HistoryFrame[], frame: HistoryFrame): HistoryFrame[] {
  const next = [...arr, frame]
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
}

interface BrainstormStore {
  nodes: Record<string, NodeData>
  viewport: { x: number; y: number; zoom: number }
  isLoading: string | null
  namingProjectId: string | null
  mergeTarget: string | null
  composeResult: string | null
  composeOpen: boolean
  settingsAIOpen: boolean
  pendingNodePosition: Position | null
  selectedNodeId: string | null
  selectedNodeIds: string[]
  selectedConnectionIds: Array<[string, string]>
  connectionDrag: { sourceId: string; point: Position } | null
  connections: [string, string][]
  draggedNodeId: string | null
  steerPrompt: SteerPrompt | null
  askMePrompt: SteerPrompt | null
  answeringQuestionId: string | null
  pendingConnectionSource: string | null
  seedNodeId: string | null
  mergeAnim: MergeAnim | null
  contextMenu: ContextMenuState
  currentProjectId: string | null
  projectsIndex: ProjectMeta[]
  past: HistoryFrame[]
  future: HistoryFrame[]
  pendingEdit: { nodeId: string; snapshot: HistoryFrame } | null

  undo: () => void
  redo: () => void
  beginTextEdit: (id: string) => void
  commitTextEdit: () => void

  newProject: (name?: string) => string
  renameProject: (id: string, name: string) => void
  deleteProject: (id: string) => void
  switchProject: (id: string) => void

  setPendingConnectionSource: (id: string | null) => void
  setSteerPrompt: (prompt: SteerPrompt | null) => void
  setAskMePrompt: (prompt: SteerPrompt | null) => void
  openAnswerInput: (questionId: string) => void
  closeAnswerInput: () => void
  answerQuestion: (questionId: string, text: string) => void
  addConnection: (id1: string, id2: string) => void
  removeConnection: (id1: string, id2: string) => void
  setNodeSize: (id: string, w: number, h: number) => void
  selectNode: (id: string | null) => void
  toggleNodeSelected: (id: string) => void
  selectConnection: (conn: [string, string] | null) => void
  selectInRect: (rect: { x: number; y: number; w: number; h: number }) => void
  deleteSelection: () => void
  setConnectionDrag: (drag: { sourceId: string; point: Position } | null) => void
  updateNodeText: (id: string, text: string) => void
  setSeed: (text: string) => void
  expandNode: (id: string, steer?: string) => Promise<void>
  askMeNode: (id: string, steer?: string) => Promise<void>
  dismissNode: (id: string) => void
  mergeNodes: (id1: string, id2: string) => Promise<void>
  addUserNode: (text: string, position: Position, connectFromId?: string) => void
  moveNode: (id: string, position: Position) => void
  moveNodes: (updates: Record<string, Position>) => void
  setDraggedNode: (id: string | null) => void
  setMergeTarget: (id: string | null) => void
  setPendingNodePosition: (position: Position | null) => void
  compose: () => Promise<void>
  openCompose: () => void
  closeCompose: () => void
  clearComposeResult: () => void
  setSettingsAIOpen: (open: boolean) => void
  openNodeContextMenu: (nodeId: string, x: number, y: number) => void
  openCanvasContextMenu: (canvasPos: Position, x: number, y: number) => void
  closeContextMenu: () => void
  pan: (dx: number, dy: number) => void
  zoom: (delta: number, center: Position) => void
}

function getContextNodes(
  nodes: Record<string, NodeData>,
  connections: [string, string][],
  startId: string,
  maxDepth: number = CONTEXT_MAX_DEPTH,
  maxNodes: number = CONTEXT_MAX_NODES,
): { direct: ContextNode[]; wider: ContextNode[] } {
  // Unified adjacency — treat parent-child and user-drawn connections equally.
  const adj = new Map<string, Set<string>>()
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }
  for (const id of Object.keys(nodes)) {
    const n = nodes[id]
    if (n.status !== 'active') continue
    if (n.parentId && nodes[n.parentId]?.status === 'active') {
      link(n.id, n.parentId)
    }
  }
  for (const [a, b] of connections) {
    if (nodes[a]?.status === 'active' && nodes[b]?.status === 'active') {
      link(a, b)
    }
  }

  // BFS outward from the target; closest first. Split depth-1 (direct) from
  // further hops (wider background) so the AI knows what's immediately linked.
  const visited = new Set<string>([startId])
  const queue: { id: string; depth: number }[] = [{ id: startId, depth: 0 }]
  const direct: ContextNode[] = []
  const wider: ContextNode[] = []
  let total = 0
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!
    if (depth >= maxDepth) continue
    const neighbors = adj.get(id)
    if (!neighbors) continue
    for (const nid of neighbors) {
      if (visited.has(nid)) continue
      visited.add(nid)
      const n = nodes[nid]
      if (n?.text) {
        const entry: ContextNode = { text: n.text, steer: n.steer }
        if (depth === 0) direct.push(entry)
        else wider.push(entry)
        total++
        if (total >= maxNodes) return { direct, wider }
      }
      queue.push({ id: nid, depth: depth + 1 })
    }
  }
  return { direct, wider }
}

function segmentIntersectsRect(
  p1: Position,
  p2: Position,
  rect: { x: number; y: number; w: number; h: number },
): boolean {
  const { x, y, w, h } = rect
  const x2 = x + w
  const y2 = y + h
  const inside = (p: Position) =>
    p.x >= x && p.x <= x2 && p.y >= y && p.y <= y2
  if (inside(p1) || inside(p2)) return true

  const segCross = (
    a: Position,
    b: Position,
    c: Position,
    d: Position,
  ): boolean => {
    const d1 = (d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x)
    const d2 = (d.x - c.x) * (b.y - c.y) - (d.y - c.y) * (b.x - c.x)
    const d3 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    const d4 = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x)
    return (
      ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
    )
  }

  const tl = { x, y }
  const tr = { x: x2, y }
  const br = { x: x2, y: y2 }
  const bl = { x, y: y2 }
  return (
    segCross(p1, p2, tl, tr) ||
    segCross(p1, p2, tr, br) ||
    segCross(p1, p2, br, bl) ||
    segCross(p1, p2, bl, tl)
  )
}

function freshEphemeralState() {
  return {
    selectedNodeId: null,
    selectedNodeIds: [],
    selectedConnectionIds: [],
    connectionDrag: null,
    draggedNodeId: null,
    mergeTarget: null,
    mergeAnim: null,
    composeOpen: false,
    settingsAIOpen: false,
    pendingNodePosition: null,
    pendingConnectionSource: null,
    steerPrompt: null,
    askMePrompt: null,
    answeringQuestionId: null,
    isLoading: null,
    namingProjectId: null,
  }
}

export const useBrainstormStore = create<BrainstormStore>()(
  persist(
    (set, get) => ({
  nodes: {},
  viewport: { x: 0, y: 0, zoom: 1 },
  isLoading: null,
  namingProjectId: null,
  mergeTarget: null,
  composeResult: null,
  composeOpen: false,
  settingsAIOpen: false,
  pendingNodePosition: null,
  selectedNodeId: null,
  selectedNodeIds: [],
  selectedConnectionIds: [],
  connectionDrag: null,
  connections: [],
  draggedNodeId: null,
  steerPrompt: null,
  askMePrompt: null,
  answeringQuestionId: null,
  pendingConnectionSource: null,
  seedNodeId: null,
  mergeAnim: null,
  contextMenu: null,
  currentProjectId: null,
  projectsIndex: [],
  past: [],
  future: [],
  pendingEdit: null,

  beginTextEdit: (id) => {
    const s = get()
    if (s.pendingEdit && s.pendingEdit.nodeId !== id) {
      get().commitTextEdit()
    }
    if (get().pendingEdit?.nodeId === id) return
    const cur = get()
    set({ pendingEdit: { nodeId: id, snapshot: snapshot(cur) } })
  },

  commitTextEdit: () => {
    const s = get()
    if (!s.pendingEdit) return
    const before = s.pendingEdit.snapshot.nodes[s.pendingEdit.nodeId]?.text
    const after = s.nodes[s.pendingEdit.nodeId]?.text
    if (before === after) {
      set({ pendingEdit: null })
      return
    }
    set((cur) => ({
      past: appendCapped(cur.past, s.pendingEdit!.snapshot),
      future: [],
      pendingEdit: null,
    }))
  },

  undo: () => {
    const s = get()
    if (s.isLoading) return
    if (s.pendingEdit) get().commitTextEdit()
    const s2 = get()
    if (s2.past.length === 0) return
    const prev = s2.past[s2.past.length - 1]
    set({
      past: s2.past.slice(0, -1),
      future: [...s2.future, snapshot(s2)],
      nodes: prev.nodes,
      connections: prev.connections,
      seedNodeId: prev.seedNodeId,
      ...freshEphemeralState(),
    })
  },

  redo: () => {
    const s = get()
    if (s.isLoading || s.future.length === 0) return
    if (s.pendingEdit) set({ pendingEdit: null })
    const next = s.future[s.future.length - 1]
    set({
      future: s.future.slice(0, -1),
      past: appendCapped(s.past, snapshot(s)),
      nodes: next.nodes,
      connections: next.connections,
      seedNodeId: next.seedNodeId,
      ...freshEphemeralState(),
    })
  },

  newProject: (name) => {
    const id = uid()
    const now = Date.now()
    set((s) => ({
      currentProjectId: id,
      projectsIndex: [
        ...s.projectsIndex,
        { id, name: name || 'Untitled', createdAt: now, updatedAt: now },
      ],
      nodes: {},
      connections: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      seedNodeId: null,
      composeResult: null,
      past: [],
      future: [],
      pendingEdit: null,
      ...freshEphemeralState(),
    }))
    return id
  },

  renameProject: (id, name) => {
    const trimmed = name.trim() || 'Untitled'
    set((s) => ({
      projectsIndex: s.projectsIndex.map((p) =>
        p.id === id ? { ...p, name: trimmed, updatedAt: Date.now() } : p,
      ),
    }))
  },

  deleteProject: (id) => {
    const { currentProjectId, projectsIndex } = get()
    deleteProjectStorage(id)
    const nextIndex = projectsIndex.filter((p) => p.id !== id)
    if (currentProjectId !== id) {
      set({ projectsIndex: nextIndex })
      return
    }
    if (nextIndex.length === 0) {
      set({ projectsIndex: nextIndex, currentProjectId: null })
      get().newProject()
      return
    }
    const target = nextIndex[0]
    const data = readProjectData(target.id)
    set({
      projectsIndex: nextIndex,
      currentProjectId: target.id,
      nodes: (data?.nodes as Record<string, NodeData>) ?? {},
      connections: (data?.connections as [string, string][]) ?? [],
      viewport:
        (data?.viewport as { x: number; y: number; zoom: number }) ?? {
          x: 0,
          y: 0,
          zoom: 1,
        },
      seedNodeId: (data?.seedNodeId as string | null) ?? null,
      composeResult: (data?.composeResult as string | null) ?? null,
      past: [],
      future: [],
      pendingEdit: null,
      ...freshEphemeralState(),
    })
  },

  switchProject: (id) => {
    if (get().currentProjectId === id) return
    const data = readProjectData(id)
    set({
      currentProjectId: id,
      nodes: (data?.nodes as Record<string, NodeData>) ?? {},
      connections: (data?.connections as [string, string][]) ?? [],
      viewport:
        (data?.viewport as { x: number; y: number; zoom: number }) ?? {
          x: 0,
          y: 0,
          zoom: 1,
        },
      seedNodeId: (data?.seedNodeId as string | null) ?? null,
      composeResult: (data?.composeResult as string | null) ?? null,
      past: [],
      future: [],
      pendingEdit: null,
      ...freshEphemeralState(),
    })
  },

  setPendingConnectionSource: (id) => set({ pendingConnectionSource: id }),
  setSteerPrompt: (prompt) => set({ steerPrompt: prompt }),
  setAskMePrompt: (prompt) => set({ askMePrompt: prompt }),
  openAnswerInput: (questionId) => set({ answeringQuestionId: questionId }),
  closeAnswerInput: () => set({ answeringQuestionId: null }),
  addConnection: (id1, id2) =>
    set((s) => {
      const exists = s.connections.some(
        ([a, b]) => (a === id1 && b === id2) || (a === id2 && b === id1),
      )
      if (exists) return s
      return {
        connections: [...s.connections, [id1, id2]],
        past: appendCapped(s.past, snapshot(s)),
        future: [],
      }
    }),
  removeConnection: (id1, id2) =>
    set((s) => {
      const filtered = s.connections.filter(
        ([a, b]) => !(a === id1 && b === id2) && !(a === id2 && b === id1),
      )
      if (filtered.length === s.connections.length) return s
      return {
        connections: filtered,
        past: appendCapped(s.past, snapshot(s)),
        future: [],
      }
    }),
  selectNode: (id) => {
    get().commitTextEdit()
    set({ selectedNodeId: id, selectedNodeIds: id ? [id] : [], selectedConnectionIds: [] })
  },
  toggleNodeSelected: (id) => {
    get().commitTextEdit()
    set((s) => {
      const has = s.selectedNodeIds.includes(id)
      const nextIds = has
        ? s.selectedNodeIds.filter((x) => x !== id)
        : [...s.selectedNodeIds, id]
      return {
        selectedNodeIds: nextIds,
        selectedNodeId: nextIds.length === 1 ? nextIds[0] : null,
        selectedConnectionIds: [],
      }
    })
  },
  selectConnection: (conn) => {
    get().commitTextEdit()
    set({
      selectedConnectionIds: conn ? [conn] : [],
      selectedNodeId: null,
      selectedNodeIds: [],
    })
  },
  selectInRect: (rect) =>
    set((s) => {
      const activeNodes = Object.values(s.nodes).filter((n) => n.status === 'active')
      const ids = activeNodes
        .filter(
          (n) =>
            n.position.x >= rect.x &&
            n.position.x <= rect.x + rect.w &&
            n.position.y >= rect.y &&
            n.position.y <= rect.y + rect.h,
        )
        .map((n) => n.id)

      // Include any connection whose line crosses the rect — lets the user
      // lasso just the link between two nodes without grabbing either node.
      const connIds: Array<[string, string]> = []
      const seen = new Set<string>()
      const consider = (a: string, b: string) => {
        const na = s.nodes[a]
        const nb = s.nodes[b]
        if (!na || !nb || na.status !== 'active' || nb.status !== 'active') return
        const key = a < b ? `${a}|${b}` : `${b}|${a}`
        if (seen.has(key)) return
        if (segmentIntersectsRect(na.position, nb.position, rect)) {
          seen.add(key)
          connIds.push([a, b])
        }
      }
      for (const n of activeNodes) {
        if (n.parentId) consider(n.parentId, n.id)
      }
      for (const [a, b] of s.connections) consider(a, b)

      return {
        selectedNodeIds: ids,
        selectedNodeId: ids.length === 1 ? ids[0] : null,
        selectedConnectionIds: connIds,
      }
    }),
  deleteSelection: () => {
    get().commitTextEdit()
    set((s) => {
      const hasConns = s.selectedConnectionIds.length > 0
      const hasNodes = s.selectedNodeIds.length > 0
      if (!hasConns && !hasNodes) return s
      const preSnap = snapshot(s)

      const newNodes = { ...s.nodes }
      let newConnections = s.connections

      // Delete selected connections (parent-child or user-drawn)
      if (hasConns) {
        const userConnsToRemove = new Set<string>()
        for (const [a, b] of s.selectedConnectionIds) {
          const nodeA = newNodes[a]
          const nodeB = newNodes[b]
          if (!nodeA || !nodeB) continue
          if (nodeB.parentId === a) {
            newNodes[b] = { ...nodeB, parentId: null }
            newNodes[a] = {
              ...nodeA,
              childIds: nodeA.childIds.filter((c) => c !== b),
            }
          } else if (nodeA.parentId === b) {
            newNodes[a] = { ...nodeA, parentId: null }
            newNodes[b] = {
              ...nodeB,
              childIds: nodeB.childIds.filter((c) => c !== a),
            }
          } else {
            userConnsToRemove.add(`${a}|${b}`)
            userConnsToRemove.add(`${b}|${a}`)
          }
        }
        if (userConnsToRemove.size > 0) {
          newConnections = newConnections.filter(
            ([x, y]) =>
              !userConnsToRemove.has(`${x}|${y}`) &&
              !userConnsToRemove.has(`${y}|${x}`),
          )
        }
      }

      // Delete selected nodes (no cascade — children survive as orphans)
      if (hasNodes) {
        const deletingSet = new Set(s.selectedNodeIds)
        s.selectedNodeIds.forEach((nodeId) => {
          const node = newNodes[nodeId]
          if (!node) return
          // Orphan children not also being deleted
          node.childIds.forEach((childId) => {
            if (!deletingSet.has(childId) && newNodes[childId])
              newNodes[childId] = { ...newNodes[childId], parentId: null }
          })
          // Remove from parent's childIds
          if (node.parentId && !deletingSet.has(node.parentId) && newNodes[node.parentId]) {
            const parent = newNodes[node.parentId]
            newNodes[node.parentId] = { ...parent, childIds: parent.childIds.filter((c) => c !== nodeId) }
          }
          newNodes[nodeId] = { ...node, status: 'dismissed', childIds: [] }
        })
      }

      return {
        nodes: newNodes,
        connections: newConnections,
        selectedNodeId: null,
        selectedNodeIds: [],
        selectedConnectionIds: [],
        past: appendCapped(s.past, preSnap),
        future: [],
      }
    })
  },
  setConnectionDrag: (drag) => set({ connectionDrag: drag }),
  updateNodeText: (id, text) =>
    set((s) => ({
      nodes: { ...s.nodes, [id]: { ...s.nodes[id], text } },
    })),
  setNodeSize: (id, w, h) =>
    set((s) => {
      const cur = s.nodes[id]
      if (!cur) return s
      // Skip the write entirely when the size hasn't changed — this fires
      // a lot during drag (ResizeObserver tics) and every no-op write
      // wakes every store subscriber.
      if (cur.size.w === w && cur.size.h === h) return s
      return { nodes: { ...s.nodes, [id]: { ...cur, size: { w, h } } } }
    }),

  setSeed: (text) => {
    const id = uid()
    set((s) => ({
      seedNodeId: id,
      nodes: {
        [id]: {
          id,
          text,
          parentId: null,
          childIds: [],
          position: { x: 0, y: 0 },
          size: { w: 0, h: 0 },
          status: 'active',
          origin: 'user',
        },
      },
      past: appendCapped(s.past, snapshot(s)),
      future: [],
    }))

    const { currentProjectId, projectsIndex } = get()
    if (!currentProjectId) return
    const current = projectsIndex.find((p) => p.id === currentProjectId)
    if (!current || current.name !== 'Untitled') return

    set({ namingProjectId: currentProjectId })
    generateProjectName(text)
      .then((name) => {
        if (!name) return
        const cur = get().projectsIndex.find((p) => p.id === currentProjectId)
        if (cur?.name === 'Untitled') {
          get().renameProject(currentProjectId, name)
        }
      })
      .catch((err) => {
        console.warn('project auto-name failed:', err)
      })
      .finally(() => {
        if (get().namingProjectId === currentProjectId) {
          set({ namingProjectId: null })
        }
      })
  },

  expandNode: async (id, steer) => {
    const state = get()
    const node = state.nodes[id]
    if (!node) return
    if (state.isLoading) {
      notifyBusy()
      return
    }
    const preSnap = snapshot(state)

    set({ isLoading: id, steerPrompt: null })

    try {
      const context = getContextNodes(state.nodes, state.connections, id)
      const branches = await generateBranches(
        node.text,
        context.direct,
        context.wider,
        steer,
        node.steer,
      )

      const grandparent = node.parentId ? state.nodes[node.parentId] : null
      const occupied: NodeBox[] = Object.values(get().nodes)
        .filter((n) => n.status === 'active')
        .map((n) => ({ x: n.position.x, y: n.position.y, w: n.size.w, h: n.size.h }))
      const positions = computeChildPositions(
        node.position,
        grandparent?.position ?? null,
        branches.length,
        occupied,
      )

      const trimmedSteer = steer?.trim()
      const children: NodeData[] = branches.map((text, i) => ({
        id: uid(),
        text,
        parentId: id,
        childIds: [],
        position: positions[i],
        size: { w: 0, h: 0 },
        status: 'active',
        origin: 'ai' as const,
        steer: trimmedSteer || undefined,
      }))

      set((s) => {
        const newNodes = { ...s.nodes }
        children.forEach((child) => {
          newNodes[child.id] = child
        })
        newNodes[id] = {
          ...newNodes[id],
          childIds: [...newNodes[id].childIds, ...children.map((c) => c.id)],
        }
        return {
          nodes: newNodes,
          isLoading: null,
          past: appendCapped(s.past, preSnap),
          future: [],
        }
      })
    } catch (err) {
      console.error('expandNode failed:', err)
      set({ isLoading: null })
      toastError(err)
    }
  },

  askMeNode: async (id, steer) => {
    const state = get()
    const node = state.nodes[id]
    if (!node) return
    if (state.isLoading) {
      notifyBusy()
      return
    }
    const preSnap = snapshot(state)

    set({ isLoading: id, askMePrompt: null })

    try {
      const context = getContextNodes(state.nodes, state.connections, id)
      const questions = await generateQuestions(
        node.text,
        context.direct,
        context.wider,
        steer,
        node.steer,
        { model: ASK_ME_MODEL, reasoningEffort: ASK_ME_REASONING_EFFORT },
      )

      const grandparent = node.parentId ? state.nodes[node.parentId] : null
      const occupied: NodeBox[] = Object.values(get().nodes)
        .filter((n) => n.status === 'active')
        .map((n) => ({ x: n.position.x, y: n.position.y, w: n.size.w, h: n.size.h }))
      const positions = computeChildPositions(
        node.position,
        grandparent?.position ?? null,
        questions.length,
        occupied,
      )

      const trimmedSteer = steer?.trim()
      const children: NodeData[] = questions.map((text, i) => ({
        id: uid(),
        text,
        parentId: id,
        childIds: [],
        position: positions[i],
        size: { w: 0, h: 0 },
        status: 'active',
        origin: 'ai' as const,
        kind: 'question' as const,
        answerId: undefined,
        steer: trimmedSteer || undefined,
      }))

      set((s) => {
        const newNodes = { ...s.nodes }
        children.forEach((child) => {
          newNodes[child.id] = child
        })
        newNodes[id] = {
          ...newNodes[id],
          childIds: [...newNodes[id].childIds, ...children.map((c) => c.id)],
        }
        return {
          nodes: newNodes,
          isLoading: null,
          past: appendCapped(s.past, preSnap),
          future: [],
        }
      })
    } catch (err) {
      console.error('askMeNode failed:', err)
      set({ isLoading: null })
      toastError(err)
    }
  },

  answerQuestion: (questionId, text) => {
    const state = get()
    const question = state.nodes[questionId]
    const trimmed = text.trim()
    if (!trimmed) return
    if (!question) return
    if ((question.kind ?? 'idea') !== 'question') return
    if (question.answerId !== undefined) return
    const preSnap = snapshot(state)

    const grandparent = question.parentId ? state.nodes[question.parentId] : null
    const occupied: NodeBox[] = Object.values(state.nodes)
      .filter((n) => n.status === 'active')
      .map((n) => ({ x: n.position.x, y: n.position.y, w: n.size.w, h: n.size.h }))
    const positions = computeChildPositions(
      question.position,
      grandparent?.position ?? null,
      1,
      occupied,
    )

    const answer: NodeData = {
      id: uid(),
      text: trimmed,
      parentId: questionId,
      childIds: [],
      position: positions[0],
      size: { w: 0, h: 0 },
      status: 'active',
      origin: 'user',
      kind: 'answer',
    }

    set((s) => {
      const newNodes = { ...s.nodes }
      newNodes[answer.id] = answer
      newNodes[questionId] = {
        ...newNodes[questionId],
        childIds: [...newNodes[questionId].childIds, answer.id],
        answerId: answer.id,
      }
      return {
        nodes: newNodes,
        answeringQuestionId: null,
        past: appendCapped(s.past, preSnap),
        future: [],
      }
    })
  },

  dismissNode: (id) => {
    get().commitTextEdit()
    set((s) => {
      const newNodes = { ...s.nodes }
      const node = newNodes[id]
      if (!node) return s
      const preSnap = snapshot(s)
      // Orphan children (keep them alive, just detach)
      node.childIds.forEach((childId) => {
        if (newNodes[childId]) newNodes[childId] = { ...newNodes[childId], parentId: null }
      })
      // Remove from parent's childIds
      if (node.parentId && newNodes[node.parentId]) {
        const parent = newNodes[node.parentId]
        newNodes[node.parentId] = { ...parent, childIds: parent.childIds.filter((c) => c !== id) }
      }
      newNodes[id] = { ...node, status: 'dismissed', childIds: [] }
      return {
        nodes: newNodes,
        past: appendCapped(s.past, preSnap),
        future: [],
      }
    })
  },

  mergeNodes: async (id1, id2) => {
    const state = get()
    const node1 = state.nodes[id1]
    const node2 = state.nodes[id2]
    if (!node1 || !node2) return
    if (state.isLoading) {
      notifyBusy()
      return
    }
    // FR-020: question nodes can never be merged (defense-in-depth behind the
    // UI-level checks in ContextMenu and findMergeCandidate).
    if ((node1.kind ?? 'idea') === 'question' || (node2.kind ?? 'idea') === 'question') return
    const preSnap = snapshot(state)

    const midpoint: Position = {
      x: (node1.position.x + node2.position.x) / 2,
      y: (node1.position.y + node2.position.y) / 2,
    }
    const placeholderId = uid()

    // Instant dismiss both originals; spawn shimmering placeholder at midpoint.
    set((s) => {
      const newNodes = { ...s.nodes }
      newNodes[id1] = { ...newNodes[id1], status: 'dismissed' }
      newNodes[id2] = { ...newNodes[id2], status: 'dismissed' }
      newNodes[placeholderId] = {
        id: placeholderId,
        text: '',
        parentId: null,
        childIds: [],
        position: midpoint,
        size: { w: 0, h: 0 },
        status: 'active',
        origin: 'ai',
      }
      return {
        nodes: newNodes,
        isLoading: 'merge',
        mergeTarget: null,
        mergeAnim: { placeholderId },
      }
    })

    try {
      const mergedText = await mergeIdeas(node1.text, node2.text)
      set((s) => {
        const newNodes = { ...s.nodes }
        if (newNodes[placeholderId]) {
          newNodes[placeholderId] = {
            ...newNodes[placeholderId],
            text: mergedText,
          }
        }
        return {
          nodes: newNodes,
          isLoading: null,
          mergeTarget: null,
          mergeAnim: null,
          past: appendCapped(s.past, preSnap),
          future: [],
        }
      })
    } catch (err) {
      console.error('mergeNodes failed:', err)
      // Rollback: drop placeholder, un-dismiss originals.
      set((s) => {
        const newNodes = { ...s.nodes }
        if (newNodes[placeholderId]) delete newNodes[placeholderId]
        if (newNodes[id1]) newNodes[id1] = { ...newNodes[id1], status: 'active' }
        if (newNodes[id2]) newNodes[id2] = { ...newNodes[id2], status: 'active' }
        return {
          nodes: newNodes,
          isLoading: null,
          mergeTarget: null,
          mergeAnim: null,
        }
      })
      toastError(err)
    }
  },

  addUserNode: (text, position, connectFromId) => {
    const id = uid()
    set((s) => {
      const newConnections =
        connectFromId && s.nodes[connectFromId]
          ? ([...s.connections, [connectFromId, id]] as [string, string][])
          : s.connections
      return {
        nodes: {
          ...s.nodes,
          [id]: {
            id,
            text,
            parentId: null,
            childIds: [],
            position,
            size: { w: 0, h: 0 },
            status: 'active',
            origin: 'user',
          },
        },
        connections: newConnections,
        pendingNodePosition: null,
        pendingConnectionSource: null,
        past: appendCapped(s.past, snapshot(s)),
        future: [],
      }
    })
  },

  moveNode: (id, position) => {
    set((s) => ({
      nodes: {
        ...s.nodes,
        [id]: { ...s.nodes[id], position },
      },
    }))
  },

  moveNodes: (updates) =>
    set((s) => {
      const newNodes = { ...s.nodes }
      for (const [id, pos] of Object.entries(updates)) {
        if (newNodes[id]) {
          newNodes[id] = { ...newNodes[id], position: pos }
        }
      }
      return { nodes: newNodes }
    }),

  setDraggedNode: (id) =>
    set((s) => {
      if (id && !s.draggedNodeId) {
        return {
          draggedNodeId: id,
          past: appendCapped(s.past, snapshot(s)),
          future: [],
        }
      }
      return { draggedNodeId: id }
    }),

  setMergeTarget: (id) => {
    if (get().mergeTarget === id) return
    set({ mergeTarget: id })
  },
  setPendingNodePosition: (position) =>
    set({ pendingNodePosition: position }),

  compose: async () => {
    const state = get()
    if (state.isLoading) {
      notifyBusy()
      return
    }

    const activeTexts = Object.values(state.nodes)
      .filter((n) => n.status === 'active' && (n.kind ?? 'idea') !== 'question')
      .map((n) => n.text)

    if (activeTexts.length === 0) return

    set({ isLoading: 'compose' })
    try {
      const result = await composeAI(activeTexts)
      set({ composeResult: result, composeOpen: true, isLoading: null })
    } catch (err) {
      console.error('compose failed:', err)
      set({ isLoading: null })
      toastError(err)
    }
  },

  openCompose: () => set((s) => (s.composeResult ? { composeOpen: true } : s)),
  closeCompose: () => set({ composeOpen: false }),
  clearComposeResult: () => set({ composeResult: null, composeOpen: false }),
  setSettingsAIOpen: (open) => set({ settingsAIOpen: open }),

  openNodeContextMenu: (nodeId, x, y) =>
    set({ contextMenu: { kind: 'node', nodeId, x, y } }),
  openCanvasContextMenu: (canvasPos, x, y) =>
    set({ contextMenu: { kind: 'canvas', canvasPos, x, y } }),
  closeContextMenu: () => set({ contextMenu: null }),

  pan: (dx, dy) => {
    set((s) => ({
      viewport: {
        ...s.viewport,
        x: s.viewport.x + dx,
        y: s.viewport.y + dy,
      },
    }))
  },

  zoom: (delta, center) => {
    set((s) => {
      const oldZoom = s.viewport.zoom
      const newZoom = Math.max(0.3, Math.min(2.5, oldZoom + delta))
      const scale = newZoom / oldZoom

      // Zoom toward cursor
      const originX = center.x - window.innerWidth / 2
      const originY = center.y - window.innerHeight / 2
      const newX = originX - (originX - s.viewport.x) * scale
      const newY = originY - (originY - s.viewport.y) * scale

      return { viewport: { x: newX, y: newY, zoom: newZoom } }
    })
  },
    }),
    {
      name: 'henro',
      version: 1,
      storage: createJSONStorage(() => henroStorage),
      partialize: (s) => ({
        nodes: s.nodes,
        connections: s.connections,
        viewport: s.viewport,
        seedNodeId: s.seedNodeId,
        composeResult: s.composeResult,
        currentProjectId: s.currentProjectId,
        projectsIndex: s.projectsIndex,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && state.projectsIndex.length === 0) {
          state.newProject()
        }
      },
    },
  ),
)
