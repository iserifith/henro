import { useRef, useEffect, useCallback, useState, type ReactNode } from 'react'
import { useBrainstormStore } from '../store'

export function Canvas({ children }: { children: ReactNode }) {
  const viewport = useBrainstormStore((s) => s.viewport)
  const pan = useBrainstormStore((s) => s.pan)
  const zoom = useBrainstormStore((s) => s.zoom)
  const setPendingNodePosition = useBrainstormStore((s) => s.setPendingNodePosition)
  const selectNode = useBrainstormStore((s) => s.selectNode)
  const selectInRect = useBrainstormStore((s) => s.selectInRect)
  const openCanvasContextMenu = useBrainstormStore((s) => s.openCanvasContextMenu)

  const containerRef = useRef<HTMLDivElement>(null)
  const spaceHeld = useRef(false)
  const [spaceDown, setSpaceDown] = useState(false)
  const isPanning = useRef(false)
  const [panning, setPanning] = useState(false)
  const isSelecting = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  // Track space key
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        spaceHeld.current = true
        setSpaceDown(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeld.current = false
        setSpaceDown(false)
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Non-passive wheel listener for zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        // Pinch-to-zoom (trackpad), Ctrl+scroll, or Cmd+scroll
        const delta = -e.deltaY * 0.01
        zoom(delta, { x: e.clientX, y: e.clientY })
      } else {
        // Two-finger scroll = pan
        pan(-e.deltaX, -e.deltaY)
      }
    }

    el.addEventListener('wheel', handleWheel, { passive: false })

    // Block browser middle-click autoscroll
    const blockMiddle = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault()
    }
    el.addEventListener('mousedown', blockMiddle)
    el.addEventListener('auxclick', blockMiddle)

    return () => {
      el.removeEventListener('wheel', handleWheel)
      el.removeEventListener('mousedown', blockMiddle)
      el.removeEventListener('auxclick', blockMiddle)
    }
  }, [zoom, pan])

  const screenToCanvas = useCallback(
    (sx: number, sy: number) => ({
      x: (sx - window.innerWidth / 2 - viewport.x) / viewport.zoom,
      y: (sy - window.innerHeight / 2 - viewport.y) / viewport.zoom,
    }),
    [viewport],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Middle mouse button — pan from anywhere
      if (e.button === 1) {
        e.preventDefault()
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        isPanning.current = true
        setPanning(true)
        dragStart.current = { x: e.clientX, y: e.clientY }
        return
      }

      // Right-click only opens the context menu (handled by onContextMenu) —
      // never starts marquee selection or panning.
      if (e.button === 2) return

      if (e.target !== e.currentTarget) return

      // Shift held — preserve existing multi-selection, no rubber-band
      if (e.shiftKey) return

      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

      if (spaceHeld.current) {
        // Space held — start panning
        isPanning.current = true
        setPanning(true)
        dragStart.current = { x: e.clientX, y: e.clientY }
      } else {
        // No space — start selection
        isSelecting.current = true
        dragStart.current = { x: e.clientX, y: e.clientY }
        selectNode(null)
      }
    },
    [selectNode],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning.current) {
        const dx = e.clientX - dragStart.current.x
        const dy = e.clientY - dragStart.current.y
        pan(dx, dy)
        dragStart.current = { x: e.clientX, y: e.clientY }
        return
      }

      if (isSelecting.current) {
        const x = Math.min(e.clientX, dragStart.current.x)
        const y = Math.min(e.clientY, dragStart.current.y)
        const w = Math.abs(e.clientX - dragStart.current.x)
        const h = Math.abs(e.clientY - dragStart.current.y)
        setSelectionBox({ x, y, w, h })

        // Live selection so nodes + connections highlight while dragging
        if (w > 5 || h > 5) {
          const topLeft = screenToCanvas(x, y)
          const bottomRight = screenToCanvas(x + w, y + h)
          selectInRect({
            x: topLeft.x,
            y: topLeft.y,
            w: bottomRight.x - topLeft.x,
            h: bottomRight.y - topLeft.y,
          })
        }
      }
    },
    [pan, screenToCanvas, selectInRect],
  )

  const handlePointerUp = useCallback(() => {
    if (isPanning.current) {
      isPanning.current = false
      setPanning(false)
      return
    }

    if (isSelecting.current) {
      isSelecting.current = false
      // Final selection already applied during drag; just tear down the box.
      setSelectionBox(null)
    }
  }, [])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target !== e.currentTarget) return
      const pos = screenToCanvas(e.clientX, e.clientY)
      setPendingNodePosition(pos)
    },
    [screenToCanvas, setPendingNodePosition],
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // Empty canvas = the container itself or its direct transform wrapper
      // (the wrapper is translated across the whole viewport, so it is what a
      // real right-click on empty space actually targets). Node clicks never
      // match either, so they are still handled by BubbleNode's own menu.
      const t = e.target as HTMLElement
      const isEmptyCanvas =
        t === e.currentTarget || t.parentElement === e.currentTarget
      if (!isEmptyCanvas) return
      e.preventDefault()
      openCanvasContextMenu(screenToCanvas(e.clientX, e.clientY), e.clientX, e.clientY)
    },
    [screenToCanvas, openCanvasContextMenu],
  )

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden"
      style={{ cursor: panning ? 'grabbing' : spaceDown ? 'grab' : 'default' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <div
        style={{
          transform: `translate(calc(50vw + ${viewport.x}px), calc(50vh + ${viewport.y}px)) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>

      {/* Selection rectangle */}
      {selectionBox && (selectionBox.w > 2 || selectionBox.h > 2) && (
        <div
          className="fixed border border-select bg-select/15 pointer-events-none rounded-sm"
          style={{
            left: selectionBox.x,
            top: selectionBox.y,
            width: selectionBox.w,
            height: selectionBox.h,
          }}
        />
      )}
    </div>
  )
}
