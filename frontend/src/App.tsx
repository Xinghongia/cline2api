import { lazy, Suspense, useEffect, useState } from 'react'
import { Layout, Menu, Button, Space, Spin, Typography } from 'antd'
import type { MenuProps } from 'antd'
import {
  DashboardOutlined,
  TeamOutlined,
  FileTextOutlined,
  ApiOutlined,
  CloudServerOutlined,
  KeyOutlined,
  SettingOutlined,
  InfoCircleOutlined,
  AppstoreOutlined,
  MoonOutlined,
  SunOutlined,
  TranslationOutlined,
} from '@ant-design/icons'
import { NavLink, Route, Routes, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { api, UNAUTHORIZED_EVENT } from './api/client'
import { useAppearance } from './theme'
// 路由级代码分割：每个页面独立 chunk，ECharts 等重组件只随用到的页面加载
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Accounts = lazy(() => import('./pages/Accounts'))
const Logs = lazy(() => import('./pages/Logs'))
const Models = lazy(() => import('./pages/Models'))
const Providers = lazy(() => import('./pages/Providers'))
const Upstreams = lazy(() => import('./pages/Upstreams'))
const Keys = lazy(() => import('./pages/Keys'))
const Settings = lazy(() => import('./pages/Settings'))
const About = lazy(() => import('./pages/About'))

const { Sider, Content, Header } = Layout

const NAV_ITEMS = [
  { key: '/dashboard', icon: <DashboardOutlined />, labelKey: 'nav.dashboard', def: '仪表盘' },
  { key: '/accounts', icon: <TeamOutlined />, labelKey: 'nav.accounts', def: '账号管理' },
  { key: '/logs', icon: <FileTextOutlined />, labelKey: 'nav.logs', def: '请求日志' },
  { key: '/models', icon: <AppstoreOutlined />, labelKey: 'nav.models', def: '模型管理' },
  { key: '/providers', icon: <ApiOutlined />, labelKey: 'nav.providers', def: '提供商' },
  { key: '/upstreams', icon: <CloudServerOutlined />, labelKey: 'nav.upstreams', def: '上游服务' },
  { key: '/keys', icon: <KeyOutlined />, labelKey: 'nav.keys', def: '密钥与安全' },
  { key: '/settings', icon: <SettingOutlined />, labelKey: 'nav.settings', def: '设置' },
  { key: '/about', icon: <InfoCircleOutlined />, labelKey: 'nav.about', def: '关于' },
]

const ROUTES: Record<string, React.ComponentType> = {
  '/dashboard': Dashboard,
  '/accounts': Accounts,
  '/logs': Logs,
  '/models': Models,
  '/providers': Providers,
  '/upstreams': Upstreams,
  '/keys': Keys,
  '/settings': Settings,
  '/about': About,
}

function useNavItems(): MenuProps['items'] {
  const { t } = useTranslation()
  return NAV_ITEMS.map((item) => ({
    key: item.key,
    icon: item.icon,
    label: <NavLink to={item.key}>{t(item.labelKey, { defaultValue: item.def })}</NavLink>,
  }))
}

function AppShell() {
  const { t } = useTranslation()
  const { mode, toggleMode, lang, setLang } = useAppearance()
  const items = useNavItems()

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} theme="light" style={{ borderInlineEnd: '1px solid rgba(128,128,128,.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px 14px' }}>
          <div className="c2a-logo">C2</div>
          <div>
            <Typography.Text strong style={{ display: 'block', lineHeight: 1.2 }}>
              {t('app.title', 'Cline2API')}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('app.subtitle', 'Cline API 反向代理')}
            </Typography.Text>
          </div>
        </div>
        <Menu mode="inline" items={items} style={{ borderInlineEnd: 'none' }} />
      </Sider>
      <Layout>
        <Header
          style={{
            background: 'transparent',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            paddingInline: 24,
            height: 56,
          }}
        >
          <Space>
            <Button
              type="text"
              icon={<TranslationOutlined />}
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            >
              {lang === 'zh' ? 'EN' : '中文'}
            </Button>
            <Button
              type="text"
              icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggleMode}
            />
          </Space>
        </Header>
        <Content style={{ padding: '8px 24px 40px', overflow: 'auto' }}>
          <Suspense fallback={<div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              {NAV_ITEMS.map((item) => {
                const Page = ROUTES[item.key]
                return <Route key={item.key} path={item.key} element={<Page />} />
              })}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  )
}

/** 认证门：首次探测 /config；任何请求 401 都会回到登录页 */
function AuthGate() {
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    const on401 = () => setAuthed(false)
    window.addEventListener(UNAUTHORIZED_EVENT, on401)
    api
      .get('/config')
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false))
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, on401)
  }, [])

  if (authed === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }
  if (!authed) return <Login onSuccess={() => setAuthed(true)} />
  return <AppShell />
}

export default function App() {
  return <AuthGate />
}
