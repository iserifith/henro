import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useBrainstormStore } from '../store'
import { TRANSITION } from '../lib/motion'

export function ProjectSwitcher() {
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const currentId = useBrainstormStore((s) => s.currentProjectId)
  const namingProjectId = useBrainstormStore((s) => s.namingProjectId)
  const projects = useBrainstormStore((s) => s.projectsIndex)
  const newProject = useBrainstormStore((s) => s.newProject)
  const renameProject = useBrainstormStore((s) => s.renameProject)
  const deleteProject = useBrainstormStore((s) => s.deleteProject)
  const switchProject = useBrainstormStore((s) => s.switchProject)

  const current = projects.find((p) => p.id === currentId)
  const others = projects.filter((p) => p.id !== currentId)
  const naming = !!currentId && namingProjectId === currentId

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setConfirmDelete(false)
        setRenaming(false)
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const startRename = () => {
    if (!current) return
    setRenameValue(current.name)
    setRenaming(true)
  }

  const commitRename = () => {
    if (!current) return
    const next = renameValue.trim()
    if (next && next !== current.name) {
      renameProject(current.id, next)
    }
    setRenaming(false)
  }

  const handleDelete = () => {
    if (!current) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    deleteProject(current.id)
    setConfirmDelete(false)
    setOpen(false)
  }

  return (
    <div
      ref={rootRef}
      className="flex flex-col gap-2 items-start"
    >
      <button
        onClick={() => {
          setOpen(!open)
          setConfirmDelete(false)
          setRenaming(false)
        }}
        className={`px-3.5 py-1.5 text-body font-medium rounded-control max-w-[240px] truncate transition-colors ${
          open
            ? 'bg-ink text-white'
            : 'bg-white text-ink hover:bg-chip'
        } ${naming ? 'animate-pulse' : ''}`}
        title={naming ? 'Naming project…' : undefined}
      >
        {current?.name ?? 'Untitled'}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="project-panel"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={TRANSITION.snappy}
            className="bg-white rounded-card p-2.5 w-[260px] flex flex-col gap-1.5 max-h-[70vh] overflow-y-auto"
          >
          <div className="px-1 py-0.5">
            <label className="text-caption text-ink/50 uppercase tracking-wider">
              Current
            </label>
            {renaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setRenaming(false)
                }}
                className="mt-0.5 text-ui bg-surface-soft rounded-md px-2 py-1.25 w-full outline-none text-ink"
              />
            ) : (
              <button
                onClick={startRename}
                className={`mt-0.5 text-ui text-ink w-full text-left hover:underline underline-offset-2 ${
                  naming ? 'animate-pulse' : ''
                }`}
                title={naming ? 'Naming project…' : 'Click to rename'}
              >
                {current?.name ?? 'Untitled'}
              </button>
            )}
          </div>

          {others.length > 0 && (
            <>
              <div className="h-px bg-line-neutral/60 my-0.5" />
              <label className="text-caption text-ink/50 uppercase tracking-wider px-1">
                Other projects
              </label>
              <div className="flex flex-col gap-0.5">
                {others.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      switchProject(p.id)
                      setOpen(false)
                    }}
                    className="text-ui text-ink text-left px-2 py-1.5 rounded-md hover:bg-chip transition-colors truncate"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="h-px bg-line-neutral/60 my-0.5" />

          <button
            onClick={() => {
              newProject()
              setOpen(false)
            }}
            className="text-ui text-ink text-left px-2 py-1.5 rounded-md hover:bg-chip transition-colors"
          >
            + New project
          </button>

          <button
            onClick={handleDelete}
            className={`text-ui text-left px-2 py-1.5 rounded-md transition-colors ${
              confirmDelete
                ? 'bg-danger-soft text-danger'
                : 'text-ink/70 hover:bg-chip'
            }`}
          >
            {confirmDelete ? 'Click again to delete' : 'Delete project'}
          </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
