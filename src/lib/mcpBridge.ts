// Opt-in local bridge that lets an MCP server (running alongside the app on
// the same machine, see mcp/) drive Henro on an agent's behalf — read the
// canvas, add/edit nodes, trigger AI actions, manage projects. Off by
// default; only connects when VITE_HENRO_MCP_BRIDGE=true is set at build
// time (same pattern as VITE_HENRO_DEBUG). Henro is the WebSocket *client*
// here — the MCP server hosts the socket so a single Node process can be
// the one stable endpoint agents talk to over stdio.
import { useBrainstormStore, effectiveKind, type NodeData } from '../store'

const DEBUG = import.meta.env.VITE_HENRO_DEBUG === 'true'
const BRIDGE_ENABLED = import.meta.env.VITE_HENRO_MCP_BRIDGE === 'true'
const BRIDGE_URL =
  (import.meta.env.VITE_HENRO_MCP_BRIDGE_URL as string | undefined) ||
  'ws://localhost:8934'
const RECONNECT_MS = 3000

type Command = { id: string; type: string; payload?: Record<string, unknown> }
type CommandReply =
  | { id: string; ok: true; result?: unknown }
  | { id: string; ok: false; error: string }

function nodeSummary(n: NodeData) {
  return {
    id: n.id,
    text: n.text,
    kind: effectiveKind(n),
    origin: n.origin,
    status: n.status,
    parentId: n.parentId,
    childIds: n.childIds,
    answerId: n.answerId,
    steer: n.steer,
    position: n.position,
  }
}

async function handleCommand(type: string, payload: Record<string, unknown> = {}): Promise<unknown> {
  const s = useBrainstormStore.getState()
  const str = (k: string) => payload[k] as string
  const pos = (k: string) => payload[k] as { x: number; y: number } | undefined

  switch (type) {
    case 'list_projects':
      return { projects: s.projectsIndex, currentProjectId: s.currentProjectId }

    case 'new_project':
      return { id: s.newProject(payload.name as string | undefined) }

    case 'switch_project':
      s.switchProject(str('id'))
      return { ok: true }

    case 'rename_project':
      s.renameProject(str('id'), str('name'))
      return { ok: true }

    case 'delete_project':
      s.deleteProject(str('id'))
      return { ok: true }

    case 'get_state': {
      const cur = useBrainstormStore.getState()
      return {
        currentProjectId: cur.currentProjectId,
        seedNodeId: cur.seedNodeId,
        composeResult: cur.composeResult,
        nodes: Object.values(cur.nodes).map(nodeSummary),
        connections: cur.connections,
      }
    }

    case 'add_node':
      return { id: s.addUserNode(str('text'), pos('position') ?? { x: 0, y: 0 }, payload.connectFromId as string | undefined) }

    case 'update_node_text':
      s.beginTextEdit(str('id'))
      s.updateNodeText(str('id'), str('text'))
      s.commitTextEdit()
      return { ok: true }

    case 'dismiss_node':
      s.dismissNode(str('id'))
      return { ok: true }

    case 'move_node':
      s.moveNode(str('id'), pos('position')!)
      return { ok: true }

    case 'add_connection':
      s.addConnection(str('id1'), str('id2'))
      return { ok: true }

    case 'remove_connection':
      s.removeConnection(str('id1'), str('id2'))
      return { ok: true }

    case 'expand_node': {
      const childIds = await s.expandNode(str('id'), payload.steer as string | undefined)
      const cur = useBrainstormStore.getState()
      return { childIds, children: childIds.map((cid) => nodeSummary(cur.nodes[cid])).filter(Boolean) }
    }

    case 'ask_me_node': {
      const childIds = await s.askMeNode(str('id'), payload.steer as string | undefined)
      const cur = useBrainstormStore.getState()
      return { childIds, children: childIds.map((cid) => nodeSummary(cur.nodes[cid])).filter(Boolean) }
    }

    case 'answer_question': {
      const answerId = s.answerQuestion(str('questionId'), str('text'))
      return { answerId }
    }

    case 'merge_nodes': {
      const mergedId = await s.mergeNodes(str('id1'), str('id2'))
      const cur = useBrainstormStore.getState()
      return { id: mergedId, node: mergedId ? nodeSummary(cur.nodes[mergedId]) : undefined }
    }

    case 'compose':
      await s.compose()
      return { composeResult: useBrainstormStore.getState().composeResult }

    case 'undo':
      s.undo()
      return { ok: true }

    case 'redo':
      s.redo()
      return { ok: true }

    default:
      throw new Error(`Unknown bridge command: ${type}`)
  }
}

let socket: WebSocket | null = null

function send(msg: CommandReply) {
  socket?.send(JSON.stringify(msg))
}

function connect() {
  if (socket) return
  const ws = new WebSocket(BRIDGE_URL)
  socket = ws

  ws.onopen = () => {
    if (DEBUG) console.log('[MCP bridge] connected to', BRIDGE_URL)
  }

  ws.onmessage = async (event) => {
    let msg: Command
    try {
      msg = JSON.parse(event.data)
    } catch {
      return
    }
    try {
      const result = await handleCommand(msg.type, msg.payload)
      send({ id: msg.id, ok: true, result })
    } catch (err) {
      send({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  ws.onclose = () => {
    if (socket === ws) socket = null
    window.setTimeout(connect, RECONNECT_MS)
  }

  ws.onerror = () => {
    ws.close()
  }
}

export function initMcpBridge() {
  if (!BRIDGE_ENABLED) return
  connect()
}
