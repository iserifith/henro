import { useRef, useCallback, useEffect } from 'react'
import { useBrainstormStore } from '../store'
import { resolveOverlaps } from './physics'

/**
 * Runs overlap resolution for a few frames after a drag ends.
 * Mount once (e.g. in App).  No springs, no oscillation — just pushes
 * overlapping nodes apart then stops.
 */
export function usePhysics() {
  const rafId = useRef(0)
  const running = useRef(false)
  const framesLeft = useRef(0)

  const loop = useCallback(() => {
    const state = useBrainstormStore.getState()
    const active = Object.values(state.nodes).filter((n) => n.status === 'active')

    const updates = resolveOverlaps(active)
    if (updates) state.moveNodes(updates)

    framesLeft.current--

    if (updates && framesLeft.current > 0) {
      // eslint-disable-next-line react-hooks/immutability -- self-referencing rAF loop; `loop` is stable via useCallback([])
      rafId.current = requestAnimationFrame(loop)
    } else {
      running.current = false
    }
  }, [])

  const settle = useCallback(() => {
    // Refresh the budget on every trigger so an in-flight settle gets extended
    // when a new size change comes in (e.g. expand mid-physics).
    framesLeft.current = 20
    if (running.current) return
    running.current = true
    rafId.current = requestAnimationFrame(loop)
  }, [loop])

  // Trigger settling on drag-end and on any node size change (expand/collapse,
  // AI stream growth, new node growing in from {0,0} to its rendered size).
  useEffect(() => {
    let prevDragged: string | null = null
    const prevHeights = new Map<string, number>()

    const unsub = useBrainstormStore.subscribe((state) => {
      const cur = state.draggedNodeId
      if (!cur && prevDragged) settle()
      prevDragged = cur

      let sizeChanged = false
      for (const node of Object.values(state.nodes)) {
        const prevH = prevHeights.get(node.id)
        if (prevH !== undefined && Math.abs(node.size.h - prevH) > 0.5) {
          sizeChanged = true
        }
        prevHeights.set(node.id, node.size.h)
      }
      if (sizeChanged) settle()
    })
    return () => {
      unsub()
      cancelAnimationFrame(rafId.current)
      running.current = false
    }
  }, [settle])
}
