import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import zh from './locales/zh.json'
import en from './locales/en.json'

export const LANG_COOKIE = 'cline_admin_lang'

export function detectLang(): 'zh' | 'en' {
  const stored = localStorage.getItem('c2a_lang')
  if (stored === 'zh' || stored === 'en') return stored
  const match = document.cookie.match(/(?:^|;\s*)cline_admin_lang=(zh|en)/)
  if (match) return match[1] as 'zh' | 'en'
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

// 同步写 cookie：后端 tAPI 依据 cline_admin_lang 返回本地化错误文案
export function persistLang(lang: 'zh' | 'en') {
  localStorage.setItem('c2a_lang', lang)
  document.cookie = `${LANG_COOKIE}=${lang};path=/admin;max-age=31536000`
}

void i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: detectLang(),
  fallbackLng: 'zh',
  interpolation: { escapeValue: false },
})

export default i18n
