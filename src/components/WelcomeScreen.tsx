import { useState } from 'react'
import { motion } from 'framer-motion'
import { writeConfig, looksLikeOpenRouterKey } from '../lib/config'
import { useToastStore } from '../lib/toast'
import { DURATION, EASE } from '../lib/motion'
import { LogoMarkIcon } from './icons'

export function WelcomeScreen() {
  const [key, setKey] = useState('')

  const save = () => {
    const trimmed = key.trim()
    if (!trimmed) return
    if (!looksLikeOpenRouterKey(trimmed)) {
      useToastStore.getState().push({
        kind: 'info',
        message:
          "That doesn't look like an OpenRouter key, but i'll let you in anyway. Update it in Settings.",
        action: { label: 'Settings', intent: 'open-settings' },
        ttl: 8000,
      })
    }
    writeConfig({ apiKey: trimmed })
  }

  return (
    <div className="w-screen h-screen flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: DURATION.medium, ease: EASE.out }}
        className="w-full max-w-[380px] flex flex-col items-center gap-5"
      >
        <div className="flex flex-col gap-3 w-full">
          <div className="bg-surface-soft rounded-[28px] flex flex-col items-center gap-6 pt-8 pb-9 px-9 drop-shadow-[0_12px_12px_rgba(0,0,0,0.04)]">
            <div className="flex flex-col items-center gap-3 w-full">
              <LogoMarkIcon
                className={`w-12 h-12 transition-colors duration-300 ${
                  key.length > 0 ? 'text-ai' : 'text-ink/10'
                }`}
              />
              <div className="flex flex-col items-center gap-1.5 text-center text-ink leading-[1.4]">
                <h1 className="text-display font-semibold tracking-[-0.01em]">
                  Welcome to Henro
                </h1>
                <p className="text-button text-ink/60 max-w-[280px]">
                  Paste your{' '}
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 decoration-current/40 hover:text-ink hover:decoration-current"
                  >
                    OpenRouter
                  </a>{' '}
                  API key to start brainstorming — or bring any
                  OpenAI-compatible endpoint, configurable later in Settings.
                  Your key stays in this browser — nothing is sent anywhere
                  else.
                </p>
              </div>
            </div>

            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
              }}
              placeholder="sk-or..."
              autoFocus
              autoComplete="off"
              data-bwignore="true"
              data-1p-ignore=""
              data-lpignore="true"
              data-form-type="other"
              className="text-button bg-canvas rounded-control px-4 py-2.5 w-full outline-none text-ink placeholder:text-ink/60 leading-[1.4]"
            />
          </div>

          <button
            onClick={save}
            disabled={!key.trim()}
            className="text-button font-medium bg-ink text-white rounded-full py-3 w-full hover:opacity-90 disabled:opacity-40 transition-opacity duration-300"
          >
            Save Key
          </button>
        </div>

        <p className="text-body text-ink/60 text-center leading-[1.4]">
          Or, if you don't trust me,{' '}
          <a
            href="https://github.com/vldsvrk/henro"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 decoration-current/40 hover:text-ink hover:decoration-current"
          >
            run it locally
          </a>
          .
        </p>
      </motion.div>
    </div>
  )
}
