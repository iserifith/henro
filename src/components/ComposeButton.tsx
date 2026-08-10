import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { useBrainstormStore } from '../store'
import { useToastStore } from '../lib/toast'
import { TRANSITION } from '../lib/motion'

export function ComposeButton() {
  const compose = useBrainstormStore((s) => s.compose)
  const composeResult = useBrainstormStore((s) => s.composeResult)
  const composeOpen = useBrainstormStore((s) => s.composeOpen)
  const openCompose = useBrainstormStore((s) => s.openCompose)
  const closeCompose = useBrainstormStore((s) => s.closeCompose)
  const isLoading = useBrainstormStore((s) => s.isLoading)
  const nodeCount = useBrainstormStore(
    (s) => Object.values(s.nodes).filter((n) => n.status === 'active').length,
  )
  const hasSelection = useBrainstormStore((s) => s.selectedNodeId !== null)

  // Delay un-hiding so the panel close animation finishes first; the hide
  // itself is applied synchronously during render below.
  const [delayedShow, setDelayedShow] = useState(!hasSelection)
  useEffect(() => {
    if (hasSelection) return
    const t = setTimeout(() => setDelayedShow(true), 140)
    return () => clearTimeout(t)
  }, [hasSelection])
  const hiddenByPanel = hasSelection || !delayedShow

  const [copied, setCopied] = useState<'text' | 'md' | null>(null)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(null), 1400)
    return () => clearTimeout(t)
  }, [copied])

  useEffect(() => {
    if (!composeOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCompose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [composeOpen, closeCompose])

  const composing = isLoading === 'compose'
  const canCompose = nodeCount >= 2
  const showFab =
    !composeOpen && !hiddenByPanel && (canCompose || !!composeResult)

  const stripMd = (md: string) =>
    md
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^>\s?/gm, '')
      .replace(/^[-*+]\s+/gm, '• ')
      .replace(/^\d+\.\s+/gm, '')

  const copyPlain = async () => {
    if (!composeResult) return
    try {
      await navigator.clipboard.writeText(stripMd(composeResult))
      setCopied('text')
    } catch {
      useToastStore.getState().push({ kind: 'error', message: 'Could not copy — clipboard blocked.' })
    }
  }
  const copyMd = async () => {
    if (!composeResult) return
    try {
      await navigator.clipboard.writeText(composeResult)
      setCopied('md')
    } catch {
      useToastStore.getState().push({ kind: 'error', message: 'Could not copy — clipboard blocked.' })
    }
  }

  return (
    <>
      <AnimatePresence>
        {showFab && (
          <motion.button
            key="compose-fab"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={TRANSITION.snappy}
            onClick={composeResult ? openCompose : compose}
            disabled={composing}
            className="fixed bottom-6 right-6 z-40 px-4 py-2 rounded-lg bg-ink hover:opacity-90 text-button font-medium text-white disabled:opacity-50 transition-opacity"
          >
            {composing ? 'Composing...' : composeResult ? 'View Summary' : 'Compose'}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {composeOpen && composeResult && (
          <motion.div
            key="compose-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={TRANSITION.fast}
            className="fixed inset-0 flex items-center justify-center bg-black/20 z-50 p-4"
            onClick={closeCompose}
          >
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={TRANSITION.base}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white rounded-card w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            >
              <div className="flex-1 overflow-y-auto scrollbar-soft px-9 pt-20 pb-22">
                <div className="prose-compose text-prose text-ink leading-[1.7]">
                  <ReactMarkdown>{composeResult}</ReactMarkdown>
                </div>
              </div>

              <div className="absolute left-0 right-2.5 top-0 pointer-events-none">
                <div className="bg-white flex items-center justify-between pl-8.5 pr-6 py-4 pointer-events-auto">
                  <span className="text-button text-ink/60">Summary</span>
                  <button
                    onClick={closeCompose}
                    aria-label="Close"
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-ink/60 hover:text-ink hover:bg-chip transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                      <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <div className="h-10 bg-gradient-to-b from-white to-white/0" />
              </div>

              <div className="absolute left-0 right-2.5 bottom-0 pointer-events-none">
                <div className="h-10 bg-gradient-to-b from-white/0 to-white" />
                <div className="bg-white flex items-center gap-2 px-5 pb-3.5 pt-1 pointer-events-auto">
                  <button
                    onClick={copyPlain}
                    className="px-3.5 py-1.75 rounded-lg bg-chip hover:bg-chip-hover text-ui font-medium text-ink transition-colors"
                  >
                    {copied === 'text' ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={copyMd}
                    className="px-3.5 py-1.75 rounded-lg bg-chip hover:bg-chip-hover text-ui font-medium text-ink transition-colors"
                  >
                    {copied === 'md' ? 'Copied' : 'Copy as Markdown'}
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={compose}
                    disabled={composing}
                    className="px-3.5 py-1.75 rounded-lg bg-ink hover:opacity-90 text-ui font-medium text-white disabled:opacity-50 transition-opacity"
                  >
                    {composing ? 'Regenerating...' : 'Regenerate'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
