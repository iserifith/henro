import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  writeConfig,
  isValidBaseUrl,
  OPENROUTER_URL,
  DEFAULT_MODEL,
} from '../lib/config'
import { useToastStore } from '../lib/toast'
import { DURATION, EASE } from '../lib/motion'
import { LogoMarkIcon } from './icons'

const QUICK_BASE_URLS = [
  { label: 'OpenRouter', url: OPENROUTER_URL },
  { label: 'OpenAI', url: 'https://api.openai.com/v1/chat/completions' },
  { label: 'Ollama', url: 'http://localhost:11434/v1/chat/completions' },
]

export function WelcomeScreen() {
  const [key, setKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(OPENROUTER_URL)
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const baseUrlTrimmed = baseUrl.trim()
  const baseUrlValid = isValidBaseUrl(baseUrlTrimmed)
  const isOpenRouter = baseUrlTrimmed === OPENROUTER_URL

  const save = () => {
    const trimmedKey = key.trim()
    if (!trimmedKey) return
    if (!baseUrlValid) {
      useToastStore.getState().push({
        kind: 'info',
        message: 'That base URL doesn\u2019t look valid — check it and try again.',
        ttl: 6000,
      })
      return
    }
    writeConfig({
      apiKey: trimmedKey,
      baseUrl: baseUrlTrimmed,
      model: model.trim() || undefined,
    })
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
                <p className="text-button text-ink/60 max-w-[290px]">
                  Connect any OpenAI-compatible endpoint to start
                  brainstorming. Your key stays in this browser — nothing is
                  sent anywhere else.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 w-full">
              <div className="flex gap-1.5 w-full">
                {QUICK_BASE_URLS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      setBaseUrl(preset.url)
                      setShowAdvanced(true)
                    }}
                    className={`flex-1 text-caption rounded-lg px-2 py-1.5 transition-colors ${
                      baseUrl === preset.url
                        ? 'bg-ink text-white'
                        : 'bg-canvas text-ink/70 hover:text-ink'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save()
                }}
                placeholder="API key"
                autoFocus
                autoComplete="off"
                data-bwignore="true"
                data-1p-ignore=""
                data-lpignore="true"
                data-form-type="other"
                className="text-button bg-canvas rounded-control px-4 py-2.5 w-full outline-none text-ink placeholder:text-ink/60 leading-[1.4]"
              />

              {showAdvanced && (
                <>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={OPENROUTER_URL}
                    autoComplete="off"
                    spellCheck={false}
                    className="text-button bg-canvas rounded-control px-4 py-2.5 w-full outline-none text-ink placeholder:text-ink/60 leading-[1.4]"
                  />
                  {!baseUrlValid && (
                    <p className="text-caption text-ink/50 -mt-1">
                      Enter a full http(s) chat-completions URL.
                    </p>
                  )}
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={`Model (default: ${DEFAULT_MODEL})`}
                    autoComplete="off"
                    spellCheck={false}
                    className="text-button bg-canvas rounded-control px-4 py-2.5 w-full outline-none text-ink placeholder:text-ink/60 leading-[1.4]"
                  />
                </>
              )}
            </div>

            {!showAdvanced && (
              <button
                onClick={() => setShowAdvanced(true)}
                className="text-caption text-ink/50 hover:text-ink underline underline-offset-2 decoration-current/40 hover:decoration-current transition-colors -mt-2"
              >
                {isOpenRouter ? 'Custom endpoint or model?' : 'Edit endpoint or model'}
              </button>
            )}
          </div>

          <button
            onClick={save}
            disabled={!key.trim() || !baseUrlValid}
            className="text-button font-medium bg-ink text-white rounded-full py-3 w-full hover:opacity-90 disabled:opacity-40 transition-opacity duration-300"
          >
            Start Brainstorming
          </button>
        </div>

        <p className="text-body text-ink/60 text-center leading-[1.4]">
          {isOpenRouter ? (
            <>
              Need a key?{' '}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 decoration-current/40 hover:text-ink hover:decoration-current"
              >
                Get one at OpenRouter
              </a>
              {' · '}
            </>
          ) : null}
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
