import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'

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

function ThemedConfigProvider({ children }: { children: React.ReactNode }) {
  const { mode } = useAppearance()
  const { lang } = useAppearance()
  return (
    <ConfigProvider
      locale={lang === 'zh' ? zhCN : enUS}
      theme={{
        algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: { borderRadius: 8 },
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
