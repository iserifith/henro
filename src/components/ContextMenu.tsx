import { useEffect, useRef, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useBrainstormStore } from '../store'
import { useToastStore } from '../lib/toast'
import { TRANSITION } from '../lib/motion'

type Item = {
  key: string
  label: string
  disabled?: boolean
  onActivate: () => void
}

export function ContextMenu() {
  const contextMenu = useBrainstormStore((s) => s.contextMenu)
  const nodes = useBrainstormStore((s) => s.nodes)
  const selectedNodeIds = useBrainstormStore((s) => s.selectedNodeIds)
  const setSteerPrompt = useBrainstormStore((s) => s.setSteerPrompt)
  const setAskMePrompt = useBrainstormStore((s) => s.setAskMePrompt)
  const dismissNode = useBrainstormStore((s) => s.dismissNode)
  const mergeNodes = useBrainstormStore((s) => s.mergeNodes)
  const setPendingNodePosition = useBrainstormStore((s) => s.setPendingNodePosition)
  const compose = useBrainstormStore((s) => s.compose)
  const closeContextMenu = useBrainstormStore((s) => s.closeContextMenu)

  const rootRef = useRef<HTMLDivElement | null>(null)

  // T019 — Esc + outside pointerdown dismissal (mirrors Settings.tsx:65-76).
  useEffect(() => {
    if (!contextMenu) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeContextMenu()
    }
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null
      if (target && rootRef.current && !rootRef.current.contains(target)) {
        closeContextMenu()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [contextMenu, closeContextMenu])

  // T020 — on open, focus the first menuitem.
  useEffect(() => {
    if (!contextMenu) return
    const first = rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')
    first?.focus()
  }, [contextMenu])

  const handleMenuKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const items = Array.from(
        rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [],
      )
      if (items.length === 0) return
      const active = document.activeElement as HTMLElement | null
      const idx = active ? items.indexOf(active) : -1
      const delta = e.key === 'ArrowDown' ? 1 : -1
      const next = idx === -1 ? 0 : (idx + delta + items.length) % items.length
      items[next]?.focus()
    },
    [],
  )

  // Build the item list per contract.
  let items: Item[] = []
  let nodeActive = true
  if (contextMenu?.kind === 'node') {
    const nodeId = contextMenu.nodeId
    const node = nodes[nodeId]
    nodeActive = !!node && node.status === 'active'
    if (nodeActive) {
      // FR-001 carve-out: question nodes only ever offer Delete — no
      // Expand/Branch, Steer/Lens, Ask Me, or Merge (research.md R3).
      if ((node.kind ?? 'idea') === 'question') {
        items = [
          {
            key: 'delete',
            label: 'Delete',
            onActivate: () => {
              dismissNode(nodeId)
              closeContextMenu()
            },
          },
        ]
      } else {
      items = [
        {
          key: 'expand',
          label: 'Expand / Branch',
          onActivate: () => {
            setSteerPrompt({ nodeId, defaultValue: 'brainstorm ideas' })
            closeContextMenu()
          },
        },
        {
          key: 'steer',
          label: 'Steer / Lens',
          onActivate: () => {
            setSteerPrompt({ nodeId, defaultValue: 'brainstorm ideas' })
            closeContextMenu()
          },
        },
        {
          key: 'ask-me',
          label: 'Ask Me',
          onActivate: () => {
            setAskMePrompt({ nodeId, defaultValue: '' })
            closeContextMenu()
          },
        },
        {
          key: 'delete',
          label: 'Delete',
          onActivate: () => {
            dismissNode(nodeId)
            closeContextMenu()
          },
        },
      ]
      if (selectedNodeIds.length === 2 && selectedNodeIds.includes(nodeId)) {
        const otherId = selectedNodeIds.find((id) => id !== nodeId)!
        // FR-020: never offer Merge when either selected node is a question
        // (the nodeId check is redundant with the kind-aware branch above,
        // but this is the only place that also checks the other node).
        if (
          (nodes[nodeId].kind ?? 'idea') !== 'question' &&
          (nodes[otherId].kind ?? 'idea') !== 'question'
        ) {
          items.splice(3, 0, {
            key: 'merge',
            label: 'Merge',
            onActivate: () => {
              mergeNodes(nodeId, otherId)
              closeContextMenu()
            },
          })
        }
      }
      }
    }
  } else if (contextMenu?.kind === 'canvas') {
    const activeCount = Object.values(nodes).filter((n) => n.status === 'active').length
    const canCompose = activeCount >= 2
    items = [
      {
        key: 'add-here',
        label: 'Add node here',
        onActivate: () => {
          if (contextMenu.kind === 'canvas') setPendingNodePosition(contextMenu.canvasPos)
          closeContextMenu()
        },
      },
      {
        key: 'compose',
        label: 'Compose board',
        disabled: !canCompose,
        onActivate: () => {
          if (!canCompose) {
            useToastStore.getState().push({
              kind: 'info',
              message: 'Add at least 2 nodes to compose the board.',
            })
            closeContextMenu()
            return
          }
          compose()
          closeContextMenu()
        },
      },
    ]
  }

  const open = contextMenu !== null && (contextMenu.kind !== 'node' || nodeActive)

  return (
    <AnimatePresence>
      {open && contextMenu && (
        <motion.div
          key="context-menu"
          ref={rootRef}
          role="menu"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={TRANSITION.snappy}
          onKeyDown={handleMenuKeyDown}
          className="fixed z-50 bg-white rounded-card py-1.5 min-w-[180px] flex flex-col shadow-bubble-drag"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {items.map((item) => (
            <button
              key={item.key}
              role="menuitem"
              aria-disabled={item.disabled ? true : undefined}
              onClick={item.onActivate}
              className={`text-left text-ui px-3.5 py-2 transition-colors outline-none ${
                item.disabled
                  ? 'text-ink/40'
                  : 'text-ink hover:bg-chip focus:bg-chip'
              }`}
            >
              {item.label}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
