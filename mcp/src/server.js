#!/usr/bin/env node
// Bridges an MCP client (this process's stdio) to a running Henro tab (over
// a local WebSocket that Henro connects out to, see src/lib/mcpBridge.ts).
// This process is the WebSocket *server* so there's one stable address for
// the browser to dial into regardless of which MCP client is attached.
import { WebSocketServer } from 'ws'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const WS_PORT = Number(process.env.HENRO_BRIDGE_PORT || 8934)
const COMMAND_TIMEOUT_MS = 20_000

// --- Relay to the browser -------------------------------------------------

let activeSocket = null
const pending = new Map() // command id -> { resolve, reject, timer }
let nextId = 1

const wss = new WebSocketServer({ port: WS_PORT })
wss.on('connection', (ws) => {
  if (activeSocket && activeSocket.readyState === activeSocket.OPEN) {
    activeSocket.close()
  }
  activeSocket = ws

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    clearTimeout(p.timer)
    if (msg.ok) p.resolve(msg.result)
    else p.reject(new Error(msg.error || 'Unknown Henro bridge error'))
  })

  ws.on('close', () => {
    if (activeSocket === ws) activeSocket = null
  })
})

function sendCommand(type, payload) {
  return new Promise((resolve, reject) => {
    if (!activeSocket || activeSocket.readyState !== activeSocket.OPEN) {
      reject(
        new Error(
          `Henro is not connected on port ${WS_PORT}. Open the app with the bridge enabled ` +
            '(VITE_HENRO_MCP_BRIDGE=true at build time) and make sure this server is running first.',
        ),
      )
      return
    }
    const id = String(nextId++)
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('Timed out waiting for Henro to respond.'))
    }, COMMAND_TIMEOUT_MS)
    pending.set(id, { resolve, reject, timer })
    activeSocket.send(JSON.stringify({ id, type, payload }))
  })
}

// --- MCP surface -----------------------------------------------------------

const server = new McpServer({ name: 'henro-bridge', version: '0.1.0' })

function ok(result) {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}

function fail(err) {
  return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
}

function registerCommand(name, type, description, shape) {
  server.registerTool(
    name,
    { description, inputSchema: shape },
    async (args) => {
      try {
        return ok(await sendCommand(type, args))
      } catch (err) {
        return fail(err)
      }
    },
  )
}

const position = z.object({ x: z.number(), y: z.number() })

registerCommand(
  'henro_get_state',
  'get_state',
  'Read the current Henro project: all nodes (text, kind, status, parent/children, position), connections, and the latest compose result.',
  {},
)

registerCommand(
  'henro_list_projects',
  'list_projects',
  'List every Henro project (id, name, timestamps) and which one is currently open.',
  {},
)

registerCommand(
  'henro_new_project',
  'new_project',
  'Create a new, empty Henro project and switch to it.',
  { name: z.string().optional().describe('Project name; defaults to "Untitled"') },
)

registerCommand(
  'henro_switch_project',
  'switch_project',
  'Switch the open Henro project.',
  { id: z.string() },
)

registerCommand(
  'henro_rename_project',
  'rename_project',
  'Rename a Henro project.',
  { id: z.string(), name: z.string() },
)

registerCommand(
  'henro_delete_project',
  'delete_project',
  'Delete a Henro project permanently.',
  { id: z.string() },
)

registerCommand(
  'henro_add_node',
  'add_node',
  'Add a plain (non-AI) node to the canvas, optionally connected to an existing node.',
  {
    text: z.string(),
    position: position.optional().describe('Canvas position; defaults to {x:0, y:0}'),
    connectFromId: z.string().optional().describe('Node id to draw a connection from'),
  },
)

registerCommand(
  'henro_update_node_text',
  'update_node_text',
  'Overwrite a node\'s text (recorded as an undoable edit).',
  { id: z.string(), text: z.string() },
)

registerCommand(
  'henro_dismiss_node',
  'dismiss_node',
  'Delete (dismiss) a node. Its children are orphaned, not deleted.',
  { id: z.string() },
)

registerCommand(
  'henro_move_node',
  'move_node',
  'Move a node to a new canvas position.',
  { id: z.string(), position },
)

registerCommand(
  'henro_add_connection',
  'add_connection',
  'Draw a manual connection between two nodes.',
  { id1: z.string(), id2: z.string() },
)

registerCommand(
  'henro_remove_connection',
  'remove_connection',
  'Remove a connection (manual, or a parent/child link) between two nodes.',
  { id1: z.string(), id2: z.string() },
)

registerCommand(
  'henro_expand_node',
  'expand_node',
  'AI action: branch a node into new idea children. Uses the user\'s configured model/key in Henro. Returns the created child nodes.',
  { id: z.string(), steer: z.string().optional().describe('Optional lens/ask to steer the branches') },
)

registerCommand(
  'henro_ask_me_node',
  'ask_me_node',
  'AI action: generate probing question children for a node. Returns the created question nodes.',
  { id: z.string(), steer: z.string().optional() },
)

registerCommand(
  'henro_answer_question',
  'answer_question',
  'Answer a question node with plain text, creating an answer child.',
  { questionId: z.string(), text: z.string() },
)

registerCommand(
  'henro_merge_nodes',
  'merge_nodes',
  'AI action: merge two nodes into one synthesized node.',
  { id1: z.string(), id2: z.string() },
)

registerCommand(
  'henro_compose',
  'compose',
  'AI action: synthesize every active node into a summary. Returns the compose result text.',
  {},
)

registerCommand('henro_undo', 'undo', 'Undo the last change in Henro.', {})
registerCommand('henro_redo', 'redo', 'Redo the last undone change in Henro.', {})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error(`[henro-mcp-bridge] listening for Henro on ws://localhost:${WS_PORT}, MCP server ready on stdio`)
