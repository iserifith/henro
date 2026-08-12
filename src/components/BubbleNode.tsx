import { useRef, useCallback, useState, useEffect, useLayoutEffect, memo } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { useBrainstormStore } from '../store'
import { CloseIcon } from './icons'
import { DURATION, TRANSITION } from '../lib/motion'

const MERGE_DISTANCE = 60
const DOUBLE_CLICK_MS = 350
const DRAG_THRESHOLD = 5
const NODE_WIDTH = 180

export const BubbleNode = memo(function BubbleNode({ id }: { id: string }) {
  // Subscribe only to this node's data — the dragged node is the only one
  // whose ref changes during a drag, so siblings don't re-render.
  const node = useBrainstormStore((s) => s.nodes[id])
  const expandNode = useBrainstormStore((s) => s.expandNode)
  const steerPrompt = useBrainstormStore((s) => s.steerPrompt)
  const setSteerPrompt = useBrainstormStore((s) => s.setSteerPrompt)
  const dismissNode = useBrainstormStore((s) => s.dismissNode)
  const moveNode = useBrainstormStore((s) => s.moveNode)
  const moveNodes = useBrainstormStore((s) => s.moveNodes)
  const mergeNodes = useBrainstormStore((s) => s.mergeNodes)
  const setMergeTarget = useBrainstormStore((s) => s.setMergeTarget)
  const mergeTarget = useBrainstormStore((s) => s.mergeTarget)
  const selectNode = useBrainstormStore((s) => s.selectNode)
  const toggleNodeSelected = useBrainstormStore((s) => s.toggleNodeSelected)
  const selectedNodeId = useBrainstormStore((s) => s.selectedNodeId)
  const isInMultiSelect = useBrainstormStore((s) => s.selectedNodeIds.includes(id))
  const isSelected = selectedNodeId === id || isInMultiSelect
  const setConnectionDrag = useBrainstormStore((s) => s.setConnectionDrag)
  const addConnection = useBrainstormStore((s) => s.addConnection)
  const connectionDrag = useBrainstormStore((s) => s.connectionDrag)
  const isLoading = useBrainstormStore((s) => s.isLoading)
  const mergeAnim = useBrainstormStore((s) => s.mergeAnim)
  const setNodeSize = useBrainstormStore((s) => s.setNodeSize)
  const setDraggedNode = useBrainstormStore((s) => s.setDraggedNode)
  const setPendingNodePosition = useBrainstormStore((s) => s.setPendingNodePosition)
  const setPendingConnectionSource = useBrainstormStore((s) => s.setPendingConnectionSource)
  const openNodeContextMenu = useBrainstormStore((s) => s.openNodeContextMenu)
  const askMePrompt = useBrainstormStore((s) => s.askMePrompt)
  const setAskMePrompt = useBrainstormStore((s) => s.setAskMePrompt)
  const askMeNode = useBrainstormStore((s) => s.askMeNode)
  const answeringQuestionId = useBrainstormStore((s) => s.answeringQuestionId)
  const answerQuestion = useBrainstormStore((s) => s.answerQuestion)
  const closeAnswerInput = useBrainstormStore((s) => s.closeAnswerInput)
  const updateNodeText = useBrainstormStore((s) => s.updateNodeText)
  const beginTextEdit = useBrainstormStore((s) => s.beginTextEdit)
  const commitTextEdit = useBrainstormStore((s) => s.commitTextEdit)
  const [isEditingText, setIsEditingText] = useState(false)
  const seedNodeId = useBrainstormStore((s) => s.seedNodeId)
  const isSeed = id === seedNodeId
  const [morphDone, setMorphDone] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMorphDone(true), 500)
    return () => clearTimeout(t)
  }, [])
  const useLayoutId = isSeed && !morphDone

  const elRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const nodeStart = useRef({ x: 0, y: 0 })
  const hasMoved = useRef(false)
  const lastClickTime = useRef(0)
  const isSecondPress = useRef(false)
  const isConnectionDragging = useRef(false)
  const isShiftClick = useRef(false)
  const groupStarts = useRef<Record<string, { x: number; y: number }> | null>(null)

  const textRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [fullH, setFullH] = useState(0)
  const [applyClamp, setApplyClamp] = useState(!expanded)

  const COLLAPSED_MAX = 67.2 // 4 lines × 12px × 1.4 line-height
  const isClamped = fullH > COLLAPSED_MAX + 1

  // Dismiss-button visibility: short close-delay so the cursor can cross
  // the small gap between bubble and × without dismissing.
  const [dismissVisible, setDismissVisible] = useState(false)
  const dismissTimerRef = useRef<number | null>(null)
  const showDismiss = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = null
    }
    setDismissVisible(true)
  }, [])
  const queueHideDismiss = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current)
    }
    dismissTimerRef.current = window.setTimeout(() => {
      setDismissVisible(false)
      dismissTimerRef.current = null
    }, 80)
  }, [])
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current)
      }
    }
  }, [])

  // Measure the natural (unclamped) text height from an invisible clone
  // so we always have the expand target and a reliable signal for the
  // pill, regardless of what the visible span is doing.
  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    const measure = () => setFullH(el.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Expand: drop the clamp immediately so the full text is actually reachable
  // (line-clamp caps visible lines regardless of the container's maxHeight).
  // Adjusted during render, not an effect, per React's guidance for
  // resetting state synchronously on a prop/state change.
  const [lastExpanded, setLastExpanded] = useState(expanded)
  if (expanded !== lastExpanded) {
    setLastExpanded(expanded)
    if (expanded) setApplyClamp(false)
  }

  // Collapse: keep the text unclamped while the container shrinks, then
  // re-clamp once the animation is done so the ellipsis doesn't snap in early.
  useEffect(() => {
    if (expanded) return
    const t = setTimeout(() => setApplyClamp(true), 220)
    return () => clearTimeout(t)
  }, [expanded])

  // Read viewport / nodes lazily inside handlers — subscribing to them would
  // re-render every BubbleNode on every pan, zoom, or peer move.
  const screenToCanvas = useCallback(
    (sx: number, sy: number) => {
      const { viewport } = useBrainstormStore.getState()
      return {
        x: (sx - window.innerWidth / 2 - viewport.x) / viewport.zoom,
        y: (sy - window.innerHeight / 2 - viewport.y) / viewport.zoom,
      }
    },
    [],
  )

  const findMergeCandidate = useCallback(
    (pos: { x: number; y: number }) => {
      const allNodes = useBrainstormStore.getState().nodes
      // FR-020: a dragged question node can never be a merge source.
      if ((allNodes[id]?.kind ?? 'idea') === 'question') return undefined
      for (const nid in allNodes) {
        if (nid === id) continue
        const n = allNodes[nid]
        if (n.status !== 'active') continue
        // FR-020: question nodes can never be merge targets either.
        if ((n.kind ?? 'idea') === 'question') continue
        if (Math.hypot(n.position.x - pos.x, n.position.y - pos.y) < MERGE_DISTANCE) {
          return n
        }
      }
      return undefined
    },
    [id],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Let middle mouse pass through for canvas panning; right-click only
      // opens the context menu (handled by onContextMenu) — never starts
      // a drag or connection gesture.
      if (e.button === 1 || e.button === 2) return
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

      const now = Date.now()
      const timeSinceLastClick = now - lastClickTime.current

      const state = useBrainstormStore.getState()
      const self = state.nodes[id]
      if (!self) return

      isDragging.current = true
      hasMoved.current = false
      dragStart.current = { x: e.clientX, y: e.clientY }
      nodeStart.current = { x: self.position.x, y: self.position.y }
      isShiftClick.current = e.shiftKey

      const sel = state.selectedNodeIds
      if (!e.shiftKey && sel.length > 1 && sel.includes(id)) {
        const starts: Record<string, { x: number; y: number }> = {}
        for (const sid of sel) {
          const n = state.nodes[sid]
          if (n && n.status === 'active') {
            starts[sid] = { x: n.position.x, y: n.position.y }
          }
        }
        groupStarts.current = starts
      } else {
        groupStarts.current = null
      }

      if (!e.shiftKey && timeSinceLastClick < DOUBLE_CLICK_MS) {
        isSecondPress.current = true
      } else {
        isSecondPress.current = false
      }
      isConnectionDragging.current = false
    },
    [id],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return

      const zoom = useBrainstormStore.getState().viewport.zoom
      const dx = (e.clientX - dragStart.current.x) / zoom
      const dy = (e.clientY - dragStart.current.y) / zoom
      const moved = Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD

      if (!moved) return

      const justStarted = !hasMoved.current
      hasMoved.current = true

      if (isSecondPress.current) {
        isConnectionDragging.current = true
        const canvasPos = screenToCanvas(e.clientX, e.clientY)
        setConnectionDrag({ sourceId: id, point: canvasPos })

        const candidate = findMergeCandidate(canvasPos)
        setMergeTarget(candidate?.id ?? null)
      } else {
        if (justStarted) setDraggedNode(id)
        if (groupStarts.current) {
          const updates: Record<string, { x: number; y: number }> = {}
          for (const [sid, start] of Object.entries(groupStarts.current)) {
            updates[sid] = { x: start.x + dx, y: start.y + dy }
          }
          moveNodes(updates)
          setMergeTarget(null)
        } else {
          const newPos = {
            x: nodeStart.current.x + dx,
            y: nodeStart.current.y + dy,
          }
          moveNode(id, newPos)

          const candidate = findMergeCandidate(newPos)
          setMergeTarget(candidate?.id ?? null)
        }
      }
    },
    [moveNode, moveNodes, id, findMergeCandidate, setMergeTarget, setConnectionDrag, screenToCanvas, setDraggedNode],
  )

  const handlePointerUp = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false

    if (hasMoved.current && !isConnectionDragging.current) {
      setDraggedNode(null)
    }

    if (isConnectionDragging.current) {
      if (mergeTarget) {
        addConnection(id, mergeTarget)
      } else if (connectionDrag) {
        // Drop on empty space → spawn a new connected node at release point
        setPendingNodePosition(connectionDrag.point)
        setPendingConnectionSource(id)
      }
      setConnectionDrag(null)
      setMergeTarget(null)
      isConnectionDragging.current = false
      isSecondPress.current = false
      return
    }

    if (!hasMoved.current) {
      if (isShiftClick.current) {
        toggleNodeSelected(id)
        isShiftClick.current = false
        lastClickTime.current = 0
      } else if (isSecondPress.current) {
        setSteerPrompt({ nodeId: id, defaultValue: 'brainstorm ideas' })
        isSecondPress.current = false
        lastClickTime.current = 0
      } else if (expanded && isSelected) {
        // Already reading this node (expanded from an earlier click) —
        // click again to edit it, right there in the bubble.
        setIsEditingText(true)
        lastClickTime.current = Date.now()
      } else {
        // A plain click on a clamped bubble reveals the full text right
        // there — no hunting for the small pill. This is a local read
        // toggle only; it never triggers AI generation (that's Expand in
        // the context menu, a completely separate action).
        if (isClamped && !expanded) setExpanded(true)
        selectNode(id)
        lastClickTime.current = Date.now()
      }
      return
    }

    if (mergeTarget && !groupStarts.current) {
      mergeNodes(id, mergeTarget)
    }
    setMergeTarget(null)
    isSecondPress.current = false
    groupStarts.current = null
  }, [setSteerPrompt, selectNode, toggleNodeSelected, mergeNodes, addConnection, mergeTarget, id, setMergeTarget, setConnectionDrag, setDraggedNode, connectionDrag, setPendingNodePosition, setPendingConnectionSource, isClamped, expanded, isSelected])

  const handleDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      dismissNode(id)
    },
    [dismissNode, id],
  )

  const handleToggleExpand = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setExpanded((v) => !v)
    },
    [],
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      openNodeContextMenu(id, e.clientX, e.clientY)
    },
    [openNodeContextMenu, id],
  )

  // Keep node size in sync with the rendered bubble, including during
  // framer height animations (which don't trigger React re-renders).
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (w && h) setNodeSize(id, w, h)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [id, setNodeSize])

  const draggedNodeId = useBrainstormStore((s) => s.draggedNodeId)

  if (!node) return null

  // AI-generated children only — manually drawn connections are already
  // visible as lines on the canvas, no need to double-count them here.
  const activeChildCount = node.childIds.filter(
    (cid) => useBrainstormStore.getState().nodes[cid]?.status === 'active',
  ).length
  const parent = node.parentId
    ? useBrainstormStore.getState().nodes[node.parentId]
    : null
  const answerNode = node.answerId
    ? useBrainstormStore.getState().nodes[node.answerId]
    : null
  const isAI = node.origin === 'ai'
  const kind = node.kind ?? 'idea'

  const isExpandLoading = isLoading === id
  const isMergeHighlight = mergeTarget === id
  const isConnectionTarget =
    connectionDrag && connectionDrag.sourceId !== id && isMergeHighlight
  const isBeingDragged = draggedNodeId === id

  const isMergePlaceholder = mergeAnim?.placeholderId === id

  // Position via transform (not left/top) so the compositor can move the
  // bubble without triggering layout/paint on every drag tick.
  const x = Math.round(node.position.x)
  const y = Math.round(node.position.y)
  const outerStyle: React.CSSProperties = {
    transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, 0)`,
    width: expanded ? NODE_WIDTH * 2 : NODE_WIDTH,
    transition: 'width 200ms ease-out',
    zIndex: isBeingDragged ? 10 : 1,
    // Only the dragged bubble gets willChange — applying it everywhere
    // wastes GPU memory and can hurt perf with many nodes.
    willChange: isBeingDragged ? 'transform' : undefined,
    ...(isMergePlaceholder ? { pointerEvents: 'none' as const } : {}),
  }

  // During morph: shell morphs via layoutId. Text crossfades in separately
  // so it never inherits the shell's FLIP scale (which caused stretch).
  if (useLayoutId) {
    return (
      <div className="absolute select-none" style={outerStyle}>
        <motion.div
          layoutId="seed-shell"
          className="bg-white rounded-bubble px-3.75 py-2.75"
          transition={TRANSITION.morph}
        >
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DURATION.medium, delay: DURATION.medium }}
            className="text-body leading-[1.4] break-words block"
          >
            {node.text}
          </motion.span>
        </motion.div>
      </div>
    )
  }

  return (
    <div
      className="absolute select-none group"
      style={outerStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={handleContextMenu}
      onPointerEnter={showDismiss}
      onPointerLeave={queueHideDismiss}
    >
      <motion.div
        ref={elRef}
        initial={isSeed ? false : { scale: 0.95, opacity: 0 }}
        animate={{ scale: isBeingDragged ? 1.05 : 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: DURATION.base }}
        className={`
          relative rounded-bubble px-3.75 py-2.75 cursor-pointer text-ink bg-white
          ${isBeingDragged ? 'shadow-bubble-drag' : ''}
          ${
            isConnectionTarget || isMergeHighlight || isSelected
              ? 'outline outline-[1.5px] outline-select'
              : (node.kind ?? 'idea') === 'question'
                ? node.answerId
                  ? 'outline outline-1 outline-question/50'
                  : 'outline outline-1 outline-question'
                : node.origin === 'ai'
                  ? 'outline outline-1 outline-ai'
                  : ''
          }
          ${isExpandLoading || isMergePlaceholder ? 'shimmer-outline' : ''}
        `}
      >
        <div
          className="overflow-hidden transition-[max-height] duration-200 ease-out"
          style={{
            maxHeight: expanded ? fullH || 1000 : COLLAPSED_MAX,
          }}
        >
          {expanded && isEditingText ? (
            <textarea
              autoFocus
              value={node.text}
              onPointerDown={(e) => e.stopPropagation()}
              onFocus={() => beginTextEdit(id)}
              onBlur={() => {
                commitTextEdit()
                setIsEditingText(false)
              }}
              onChange={(e) => updateNodeText(id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  ;(e.target as HTMLTextAreaElement).blur()
                }
              }}
              className="w-full text-body leading-[1.4] outline-none resize-none [field-sizing:content]"
            />
          ) : (
            <div
              ref={textRef}
              className={`text-body leading-[1.4] break-words ${
                expanded ? 'prose-compose cursor-text' : applyClamp ? 'line-clamp-4' : 'block'
              } ${isMergePlaceholder && !node.text ? 'text-ink/50 italic' : ''}`}
            >
              {isMergePlaceholder && !node.text ? (
                'Merging ideas…'
              ) : expanded ? (
                <ReactMarkdown>{node.text}</ReactMarkdown>
              ) : (
                node.text
              )}
            </div>
          )}
        </div>
        <div
          ref={measureRef}
          aria-hidden
          className="prose-compose absolute left-3.75 right-3.75 top-2.75 invisible pointer-events-none text-body leading-[1.4] break-words"
        >
          <ReactMarkdown>{node.text}</ReactMarkdown>
        </div>
        {!isExpandLoading && !isMergePlaceholder && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleDismiss}
            className={`group/dismiss absolute -top-6 -right-6 w-8 h-8 flex items-center justify-center transition-opacity ${
              dismissVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            aria-label="Dismiss"
          >
            <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-[#BCBCBD] group-hover/dismiss:text-ink transition-colors">
              <CloseIcon />
            </span>
          </button>
        )}
        {activeChildCount > 0 && !isMergePlaceholder && (
          <span
            className="absolute -bottom-2 -left-2 min-w-4.5 h-4.5 px-1 rounded-full bg-white border border-line-neutral text-[10px] leading-none flex items-center justify-center text-ink/60"
            aria-label={`${activeChildCount} children`}
          >
            {activeChildCount}
          </span>
        )}
      </motion.div>
      {!isMergePlaceholder && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full flex flex-col items-center">
          {(isClamped || expanded) && !isExpandLoading && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleToggleExpand}
              className="group/pill flex items-center justify-center px-4 py-2.5"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              <span
                className={`block h-1.5 rounded-pill bg-line-neutral/70 group-hover/pill:bg-ink/50 transition-[width,background-color] duration-150 ease-out ${
                  expanded ? 'w-15' : 'w-9'
                }`}
              />
            </button>
          )}
          {isSelected && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="w-[200px] flex flex-col items-center gap-1 text-center text-caption text-ink/60 pb-2"
            >
              {kind === 'question' && answerNode && (
                <button
                  onClick={() => selectNode(node.answerId!)}
                  className="hover:text-ink underline underline-offset-2"
                >
                  View answer →
                </button>
              )}
              {kind === 'answer' && parent && (
                <button
                  onClick={() => selectNode(node.parentId!)}
                  className="hover:text-ink underline underline-offset-2"
                >
                  Answers: {parent.text.slice(0, 40)}
                  {parent.text.length > 40 ? '…' : ''} →
                </button>
              )}
              {isAI && parent && (
                <p className="break-words">
                  Branched from: {parent.text.slice(0, 40)}
                  {parent.text.length > 40 ? '…' : ''}
                </p>
              )}
              {isAI && (
                <p className="break-words">Prompt: {node.steer ?? 'brainstorm ideas'}</p>
              )}
              {isAI && parent && (
                <button
                  onClick={() => {
                    selectNode(parent.id)
                    setSteerPrompt({
                      nodeId: parent.id,
                      defaultValue: node.steer ?? 'brainstorm ideas',
                    })
                  }}
                  className="hover:text-ink underline underline-offset-2"
                >
                  Re-branch with different lens
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {steerPrompt?.nodeId === id && (
        <SteerInput
          defaultValue={steerPrompt.defaultValue}
          placeholder="branch on..."
          onSubmit={(value) => expandNode(id, value)}
          onCancel={() => setSteerPrompt(null)}
        />
      )}
      {askMePrompt?.nodeId === id && (
        <SteerInput
          defaultValue={askMePrompt.defaultValue}
          placeholder="ask about..."
          onSubmit={(value) => askMeNode(id, value)}
          onCancel={() => setAskMePrompt(null)}
        />
      )}
      {answeringQuestionId === id && (
        <AnswerInput
          onSubmit={(text) => answerQuestion(id, text)}
          onCancel={() => closeAnswerInput()}
        />
      )}
    </div>
  )
})

function SteerInput({
  defaultValue,
  placeholder,
  onSubmit,
  onCancel,
}: {
  defaultValue: string
  placeholder: string
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(defaultValue)
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onSubmit(value)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      onBlur={onCancel}
      placeholder={placeholder}
      className="mt-2.5 w-full px-3 py-2 text-body rounded-control outline-none bg-white text-ink placeholder:text-ink/40"
    />
  )
}

function AnswerInput({
  onSubmit,
  onCancel,
}: {
  onSubmit: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim()) onSubmit(text.trim())
      }}
    >
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
        }}
        onBlur={() => {
          if (text.trim()) onSubmit(text.trim())
          else onCancel()
        }}
        placeholder="your answer..."
        className="mt-2.5 w-full px-3 py-2 text-body rounded-control outline-none bg-white text-ink placeholder:text-ink/40"
      />
    </form>
  )
}
