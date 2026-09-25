import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { detectLang, persistLang } from './i18n'
import i18n from './i18n'

export type ThemeMode = 'light' | 'dark'
export type Lang = 'zh' | 'en'

interface AppearanceContextValue {
  mode: ThemeMode
  toggleMode: () => void
  lang: Lang
  setLang: (lang: Lang) => void
}

const ThemeContext = createContext<AppearanceContextValue | null>(null)

function detectMode(): ThemeMode {
  const stored = localStorage.getItem('c2a_theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(detectMode)
  const [lang, setLangState] = useState<Lang>(detectLang)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode)
  }, [mode])

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'light' ? 'dark' : 'light'
      localStorage.setItem('c2a_theme', next)
      return next
    })
  }, [])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    persistLang(next)
    void i18n.changeLanguage(next)
  }, [])

  const value = useMemo(
    () => ({ mode, toggleMode, lang, setLang }),
    [mode, toggleMode, lang, setLang],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useAppearance must be used within ThemeProvider')
  return ctx
}
