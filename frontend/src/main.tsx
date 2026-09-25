import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'

// 本地打包的变量字体（离线可用）：正文 Inter / 标题数字 Space Grotesk / 数据 JetBrains Mono
import '@fontsource-variable/inter'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/jetbrains-mono'

import './i18n'
import App from './App'
import { ThemeProvider, useAppearance } from './theme'

import 'antd/dist/reset.css'
import './styles/global.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10_000 },
  },
})

/** antd 色彩算法无法解析 var()/oklch，这里给每个模式一份等值 hex 映射（与 tokens.css 对应） */
const ANT_TOKENS = {
  dark: {
    colorPrimary: '#a78bfa',
    colorInfo: '#a78bfa',
    colorSuccess: '#4ade80',
    colorWarning: '#fbbf24',
    colorError: '#f87171',
    colorBgBase: '#12131a',
    colorBgLayout: 'transparent',
    colorBgContainer: '#1a1b26',
    colorBgElevated: '#23242f',
    colorText: '#e9eaf2',
    colorTextSecondary: '#9296ac',
    colorTextTertiary: '#7c7f96',
    colorBorder: '#343750',
    colorBorderSecondary: '#272938',
  },
  light: {
    colorPrimary: '#7c3aed',
    colorInfo: '#7c3aed',
    colorSuccess: '#10b981',
    colorWarning: '#d97706',
    colorError: '#e5484d',
    colorBgBase: '#f5f6fa',
    colorBgLayout: 'transparent',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#fafbfe',
    colorText: '#262836',
    colorTextSecondary: '#5d6070',
    colorTextTertiary: '#8a8d9c',
    colorBorder: '#d4d6e0',
    colorBorderSecondary: '#e4e5ec',
  },
} as const

function ThemedConfigProvider({ children }: { children: React.ReactNode }) {
  const { mode, lang } = useAppearance()
  return (
    <ConfigProvider
      locale={lang === 'zh' ? zhCN : enUS}
      theme={{
        algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          ...ANT_TOKENS[mode],
          borderRadius: 8,
          fontFamily: "var(--font-body)",
          fontFamilyCode: 'var(--font-mono)',
        },
        components: {
          Layout: { headerBg: 'transparent', siderBg: 'transparent', bodyBg: 'transparent' },
          Menu: {
            activeBarBorderWidth: 0,
            itemBg: 'transparent',
            itemMarginInline: 8,
            itemColor: mode === 'dark' ? '#c7c9d6' : '#3d3f4e',
            itemHoverColor: mode === 'dark' ? '#a78bfa' : '#7c3aed',
            itemSelectedColor: mode === 'dark' ? '#a78bfa' : '#7c3aed',
          },
          Table: { headerBg: 'transparent', headerSplitColor: 'transparent' },
        },
      }}
    >
      {children}
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ThemedConfigProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter basename="/admin">
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </ThemedConfigProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
