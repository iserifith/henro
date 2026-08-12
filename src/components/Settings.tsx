import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useBrainstormStore } from '../store'
import { TRANSITION } from '../lib/motion'
import {
  SYSTEM_PROMPT_PRESETS,
  PRESET_LABELS,
  DEFAULT_BRANCH_COUNT,
  DEFAULT_SYSTEM_PROMPT,
  type PresetKey,
} from '../lib/prompts'
import { readConfig, writeConfig, OPENROUTER_URL, DEFAULT_MODEL, isValidBaseUrl } from '../lib/config'
import { BranchIcon } from './icons'

export function Settings() {
  const showAI = useBrainstormStore((s) => s.settingsAIOpen)
  const setShowAI = useBrainstormStore((s) => s.setSettingsAIOpen)
  const [apiKey, setApiKey] = useState(() => readConfig().apiKey || '')
  const [model, setModel] = useState(() => readConfig().model || DEFAULT_MODEL)
  const [branchCount, setBranchCount] = useState(() => {
    const n = Number(readConfig().branchCount)
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_BRANCH_COUNT
  })
  const [systemPrompt, setSystemPrompt] = useState<string>(() => {
    const c = readConfig()
    return typeof c.systemPrompt === 'string' && c.systemPrompt.trim()
      ? c.systemPrompt
      : DEFAULT_SYSTEM_PROMPT
  })
  const [baseUrl, setBaseUrl] = useState<string>(
    () => readConfig().baseUrl || OPENROUTER_URL,
  )
  const baseUrlValid = isValidBaseUrl(baseUrl.trim())

  function adjustBranch(delta: number) {
    const next = Math.min(10, Math.max(1, branchCount + delta))
    if (next === branchCount) return
    setBranchCount(next)
    writeConfig({ branchCount: next })
  }

  function loadPreset(key: PresetKey) {
    const prompt = SYSTEM_PROMPT_PRESETS[key]
    setSystemPrompt(prompt)
    writeConfig({ systemPrompt: prompt })
  }

  function commitBaseUrl() {
    // Only persist when the current value is a valid http(s) URL — an
    // in-progress/invalid edit is left in local state (with the warning
    // shown below) without clobbering the last-known-good stored value.
    const trimmed = baseUrl.trim()
    if (trimmed && isValidBaseUrl(trimmed)) {
      writeConfig({ baseUrl: trimmed })
    }
  }

  const rootRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!showAI) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null
      if (target && rootRef.current && !rootRef.current.contains(target)) {
        setShowAI(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [showAI, setShowAI])

  return (
        <motion.div
          key="settings-root"
          ref={rootRef}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={TRANSITION.snappy}
          className="fixed top-4 right-4 z-40 flex flex-col gap-2 items-end"
        >
      <div className="flex items-center gap-2">
        <div
          className="flex items-center h-7 bg-white rounded-control px-1"
          title="Branches per expansion"
        >
          <button
            onClick={() => adjustBranch(-1)}
            disabled={branchCount <= 1}
            aria-label="Decrease branches"
            className="w-5.5 h-5.5 flex items-center justify-center text-ink/70 hover:text-ink disabled:opacity-30 transition-colors text-button leading-none"
          >
            −
          </button>
          <span className="flex items-center gap-1 px-1 text-body font-medium text-ink min-w-[26px] justify-center">
            <BranchIcon className="w-3 h-3 text-[#8F9091]" />
            {branchCount}
          </span>
          <button
            onClick={() => adjustBranch(1)}
            disabled={branchCount >= 10}
            aria-label="Increase branches"
            className="w-5.5 h-5.5 flex items-center justify-center text-ink/70 hover:text-ink disabled:opacity-30 transition-colors text-button leading-none"
          >
            +
          </button>
        </div>
        <button
          onClick={() => setShowAI(!showAI)}
          className={`h-7 px-3.5 text-body font-medium rounded-control transition-colors ${
            showAI
              ? 'bg-ink text-white'
              : 'bg-white text-ink hover:bg-chip'
          }`}
        >
          AI
        </button>
      </div>

      <AnimatePresence>
        {showAI && (
          <motion.div
            key="ai-panel"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={TRANSITION.snappy}
            className="bg-white rounded-card p-3.5 w-[320px] flex flex-col gap-2.5 max-h-[80vh] overflow-y-auto"
          >
          <div className="flex items-center justify-between">
            <label className="text-body text-ink/60">API Key</label>
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-caption text-ink/50 hover:text-ink underline underline-offset-2"
            >
              Get a key →
            </a>
          </div>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onBlur={() => writeConfig({ apiKey })}
            placeholder="API key"
            autoComplete="off"
            data-bwignore="true"
            data-1p-ignore=""
            data-lpignore="true"
            data-form-type="other"
            className="text-ui bg-surface-soft rounded-lg px-3 py-2 w-full outline-none text-ink placeholder:text-ink/40"
          />

          <label className="text-body text-ink/60">Base URL</label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            onBlur={commitBaseUrl}
            placeholder={OPENROUTER_URL}
            autoComplete="off"
            spellCheck={false}
            className="text-ui bg-surface-soft rounded-lg px-3 py-2 w-full outline-none text-ink placeholder:text-ink/40"
          />
          {!baseUrlValid && (
            <p className="text-caption text-ink/50 -mt-1">
              Enter a full http(s) URL — an invalid value falls back to the
              OpenRouter default on save.
            </p>
          )}

          <label className="text-body text-ink/60">Model</label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            onBlur={() => writeConfig({ model })}
            placeholder="anthropic/claude-sonnet-4.5"
            className="text-ui bg-surface-soft rounded-lg px-3 py-2 w-full outline-none text-ink placeholder:text-ink/40"
          />

          <label className="text-body text-ink/60 mt-1">System prompt</label>
          <div className="flex gap-1.5 flex-wrap">
            {(Object.keys(SYSTEM_PROMPT_PRESETS) as PresetKey[]).map((key) => (
              <button
                key={key}
                onClick={() => loadPreset(key)}
                className="text-body px-2.5 py-1.25 bg-chip rounded-lg text-ink hover:bg-chip-hover transition-colors"
              >
                {PRESET_LABELS[key]}
              </button>
            ))}
          </div>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            onBlur={() => writeConfig({ systemPrompt })}
            rows={8}
            className="text-body bg-surface-soft rounded-lg px-3 py-2 w-full outline-none resize-none text-ink leading-[1.5]"
          />

          <button
            onClick={() => setShowAI(false)}
            className="text-ui font-medium bg-ink text-white rounded-lg px-4 py-2 self-end hover:opacity-90 mt-1 transition-opacity"
          >
            Done
          </button>
          </motion.div>
        )}
      </AnimatePresence>
        </motion.div>
  )
}
