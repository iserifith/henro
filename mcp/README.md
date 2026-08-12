# henro-mcp-bridge

Lets an MCP client (Claude Code, Claude Desktop, any MCP-speaking agent) read
and control a running Henro canvas: list/inspect nodes, add or edit them,
trigger Henro's own AI actions (Expand, Ask Me, Merge, Compose), and manage
projects.

## How it works

Henro has no backend — everything lives in the browser tab. This package is
a small local relay:

```
MCP client (stdio) <-> this server <-> WebSocket <-> Henro tab (in-app bridge)
```

The server is the WebSocket *host* (so there's one stable address); the
Henro tab connects out to it as a client. Only one Henro tab can be bridged
at a time — the newest connection wins.

Nothing here talks to the network beyond localhost. There's no auth on the
socket, so only run this on a machine you trust and don't expose the port.

## Setup

1. Install dependencies:

   ```bash
   cd mcp
   npm install
   ```

2. Build Henro with the bridge enabled (it's off by default). In the repo
   root's `.env.local`:

   ```
   VITE_HENRO_MCP_BRIDGE=true
   # VITE_HENRO_MCP_BRIDGE_URL=ws://localhost:8934   # only if you changed HENRO_BRIDGE_PORT below
   ```

   Then `pnpm build` (or `pnpm dev`) and open the app. It'll try to connect
   to `ws://localhost:8934` and retry every 3s until this server is up.

3. Register the server with your MCP client. For Claude Code, add to its MCP
   config:

   ```json
   {
     "mcpServers": {
       "henro": {
         "command": "node",
         "args": ["/absolute/path/to/henro/mcp/src/server.js"]
       }
     }
   }
   ```

   Or run it standalone to sanity-check the WebSocket side comes up:

   ```bash
   npm start
   ```

   Set `HENRO_BRIDGE_PORT` to change the port from the default `8934` (must
   match `VITE_HENRO_MCP_BRIDGE_URL` on the Henro side if you do).

## Tools

Every tool is a thin wrapper over Henro's own store actions — the agent gets
exactly what a user clicking around the canvas would trigger, including AI
calls billed to the user's own configured key.

| Tool | What it does |
| --- | --- |
| `henro_get_state` | Read all nodes, connections, and the compose result for the open project |
| `henro_list_projects` | List projects and which one is open |
| `henro_new_project` / `henro_switch_project` / `henro_rename_project` / `henro_delete_project` | Project management |
| `henro_add_node` | Add a plain node, optionally connected to another |
| `henro_update_node_text` | Overwrite a node's text |
| `henro_dismiss_node` | Delete a node (children are orphaned, not deleted) |
| `henro_move_node` | Reposition a node |
| `henro_add_connection` / `henro_remove_connection` | Manual connections between nodes |
| `henro_expand_node` | AI: branch a node into idea children |
| `henro_ask_me_node` | AI: generate probing question children |
| `henro_answer_question` | Answer a question node |
| `henro_merge_nodes` | AI: merge two nodes into one |
| `henro_compose` | AI: synthesize the whole board into a summary |
| `henro_undo` / `henro_redo` | Step through Henro's undo history |

If a tool call comes back with "Henro is not connected", the app isn't
open (or wasn't built with the bridge flag) or this server isn't running —
start whichever is missing.
