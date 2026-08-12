import { useEffect } from 'react'
import { AnimatePresence, LayoutGroup, MotionConfig } from 'framer-motion'
import { useShallow } from 'zustand/react/shallow'
import { useBrainstormStore } from './store'
import { usePhysics } from './lib/usePhysics'
import { useHasApiKey } from './lib/config'
import { Canvas } from './components/Canvas'
import { Connections } from './components/Connections'
import { BubbleNode } from './components/BubbleNode'
import { SeedInput } from './components/SeedInput'
import { NodeInput } from './components/NodeInput'
import { ComposeButton } from './components/ComposeButton'
import { Settings } from './components/Settings'
import { ContextMenu } from './components/ContextMenu'
import { SelectionCount } from './components/SelectionCount'
import { Toaster } from './components/Toaster'
import { WelcomeScreen } from './components/WelcomeScreen'
import { ProjectSwitcher } from './components/ProjectSwitcher'
import { HenroMenu } from './components/HenroMenu'
import { HelpButton } from './components/HelpButton'

function App() {
  usePhysics()
  const hasApiKey = useHasApiKey()
  // Subscribe only to the active node IDs (shallow-equal). When a node moves,
  // the ID list is unchanged, so App skips re-rendering and BubbleNodes don't
  // re-mount.
  const activeNodeIds = useBrainstormStore(
    useShallow((s) => {
      const ids: string[] = []
      for (const id in s.nodes) {
        if (s.nodes[id].status === 'active') ids.push(id)
      }
      return ids
    }),
  )
  // hasSeed mirrors the original semantics: any node ever (active or dismissed)
  // means the canvas has been seeded — so SeedInput stays hidden after dismiss.
  const hasSeed = useBrainstormStore((s) => Object.keys(s.nodes).length > 0)
  const deleteSelection = useBrainstormStore((s) => s.deleteSelection)
  const undo = useBrainstormStore((s) => s.undo)
  const redo = useBrainstormStore((s) => s.redo)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const tag = target.tagName
      const isTextField =
        tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (isTextField) return
        e.preventDefault()
        deleteSelection()
        return
      }

      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 'z') {
        if (isTextField) return
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (key === 'y') {
        if (isTextField) return
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [deleteSelection, undo, redo])

  return (
    // reducedMotion="user" honors prefers-reduced-motion for every <motion.*>
    // child — pairs with the CSS sweep in index.css for non-framer animations.
    <MotionConfig reducedMotion="user">
      <div className="w-screen h-screen bg-canvas text-ink">
        {!hasApiKey && <WelcomeScreen />}
        {hasApiKey && (
          <>
            {/* LayoutGroup only needs to wrap the seed-shell layoutId pair
             * (SeedInput ↔ seed BubbleNode) so they can animate between
             * mount/unmount. Wider scope made every motion child sync layout. */}
            <LayoutGroup>
              <AnimatePresence>
                {!hasSeed && <SeedInput key="seed-input" />}
              </AnimatePresence>
              {hasSeed && (
                <Canvas>
                  <Connections />
                  <AnimatePresence>
                    {activeNodeIds.map((id) => (
                      <BubbleNode key={id} id={id} />
                    ))}
                  </AnimatePresence>
                </Canvas>
              )}
            </LayoutGroup>
            {hasSeed && (
              <>
                <NodeInput />
                <ComposeButton />
                <SelectionCount />
              </>
            )}
            <div className="fixed top-4 left-4 z-40 flex items-start gap-2">
              <HenroMenu />
              <ProjectSwitcher />
            </div>
            <Settings />
            <ContextMenu />
            <HelpButton />
          </>
        )}
        <Toaster />
      </div>
    </MotionConfig>
  )
}

export default App
