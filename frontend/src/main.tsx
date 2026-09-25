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
    colorPrimary: '#8f97f4',
    colorInfo: '#8f97f4',
    colorSuccess: '#56c08d',
    colorWarning: '#dcb469',
    colorError: '#e97b70',
    colorBgBase: '#14151a',
    colorBgLayout: 'transparent',
    colorBgContainer: '#1a1b21',
    colorBgElevated: '#202127',
    colorText: '#e8e9ec',
    colorTextSecondary: '#9a9ca6',
    colorTextTertiary: '#74767f',
    colorBorder: '#383a43',
    colorBorderSecondary: '#2c2e36',
  },
  light: {
    colorPrimary: '#5561e8',
    colorInfo: '#5561e8',
    colorSuccess: '#1f9d63',
    colorWarning: '#b28214',
    colorError: '#d64545',
    colorBgBase: '#f5f6f8',
    colorBgLayout: 'transparent',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#fafafb',
    colorText: '#24262c',
    colorTextSecondary: '#5b5e68',
    colorTextTertiary: '#8a8d96',
    colorBorder: '#d8dade',
    colorBorderSecondary: '#e6e8ec',
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
            itemColor: mode === 'dark' ? '#c9cbd2' : '#3a3d45',
            itemHoverColor: mode === 'dark' ? '#e8e9ec' : '#24262c',
            itemSelectedColor: mode === 'dark' ? '#8f97f4' : '#5561e8',
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
