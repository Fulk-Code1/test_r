import React, { createContext, useContext, useState } from 'react'
import { TRANSLATIONS } from './i18n'
import type { Lang, TKey } from './i18n'

const LangContext = createContext<{
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TKey) => string
}>({ lang: 'ru', setLang: () => {}, t: (k) => k })

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('lang') as Lang) || 'ru')

  const setLang = (l: Lang) => {
    setLangState(l)
    localStorage.setItem('lang', l)
  }

  const t = (key: TKey): string => TRANSLATIONS[key]?.[lang] ?? TRANSLATIONS[key]?.['ru'] ?? key

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>
}

export const useLang = () => useContext(LangContext)