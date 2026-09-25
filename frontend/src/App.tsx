import { lazy, Suspense, useEffect, useState } from 'react'
import { Button, Grid, Layout, Menu, Space, Spin, Tooltip, Typography } from 'antd'
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
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  SunOutlined,
  TranslationOutlined,
} from '@ant-design/icons'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
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

const SIDER_WIDTH = 232
const SIDER_COLLAPSED_WIDTH = 72

function AppShell() {
  const { t } = useTranslation()
  const { mode, toggleMode, lang, setLang } = useAppearance()
  const location = useLocation()
  const navigate = useNavigate()
  const screens = Grid.useBreakpoint()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('c2a_sider_collapsed') === '1')

  const toggleCollapsed = () =>
    setCollapsed((prev) => {
      localStorage.setItem('c2a_sider_collapsed', prev ? '0' : '1')
      return !prev
    })

  const menuItems: MenuProps['items'] = NAV_ITEMS.map((item) => ({
    key: item.key,
    icon: item.icon,
    label: t(item.labelKey, { defaultValue: item.def }),
  }))

  const current = NAV_ITEMS.find((item) => location.pathname.startsWith(item.key))

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        className="c2a-sider"
        width={SIDER_WIDTH}
        collapsedWidth={SIDER_COLLAPSED_WIDTH}
        collapsed={collapsed}
        collapsible
        trigger={null}
        breakpoint="lg"
        onBreakpoint={(broken) => {
          if (broken) setCollapsed(true)
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 11,
            padding: '18px 16px 16px',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          <div className="c2a-logo">C2</div>
          {!collapsed && (
            <div>
              <Typography.Text strong style={{ display: 'block', lineHeight: 1.2, fontSize: 15 }}>
                {t('app.title', 'Cline2API')}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t('app.subtitle', 'Cline API 反向代理')}
              </Typography.Text>
            </div>
          )}
        </div>
        <Menu
          mode="inline"
          inlineCollapsed={collapsed}
          items={menuItems}
          selectedKeys={[current?.key ?? location.pathname]}
          onClick={({ key }) => navigate(key)}
          style={{ borderInlineEnd: 'none' }}
        />
      </Sider>
      <Layout>
        <Header className="c2a-header" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingInline: 20, height: 58 }}>
          <Tooltip title={collapsed ? t('shell.expand', '展开侧栏') : t('shell.collapse', '收起侧栏')}>
            <Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={toggleCollapsed} />
          </Tooltip>
          <Typography.Text strong style={{ fontSize: 15 }}>
            {current ? t(current.labelKey, { defaultValue: current.def }) : ''}
          </Typography.Text>
          <div style={{ flex: 1 }} />
          <Space size={4} align="center">
            {screens.md !== false && (
              <span className="c2a-chip" style={{ gap: 7, padding: '3px 12px', marginInlineEnd: 6 }}>
                <span className="c2a-dot" />
                {t('shell.running', '服务运行中')}
              </span>
            )}
            <Button
              type="text"
              icon={<TranslationOutlined />}
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            >
              {lang === 'zh' ? 'EN' : '中文'}
            </Button>
            <Tooltip title={mode === 'dark' ? t('shell.light', '浅色模式') : t('shell.dark', '深色模式')}>
              <Button type="text" icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />} onClick={toggleMode} />
            </Tooltip>
          </Space>
        </Header>
        <Content style={{ padding: '20px 24px 44px', overflow: 'auto' }}>
          <div style={{ maxWidth: 1440, margin: '0 auto' }}>
            <div className="c2a-page" key={location.pathname}>
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
            </div>
          </div>
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
