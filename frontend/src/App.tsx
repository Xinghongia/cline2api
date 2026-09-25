import { Layout, Menu, Button, Space, Typography } from 'antd'
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

import { useAppearance } from './theme'
import PlaceholderPage from './components/PlaceholderPage'

const { Sider, Content, Header } = Layout

const NAV_ITEMS = [
  { key: '/dashboard', icon: <DashboardOutlined />, labelKey: 'nav.dashboard' },
  { key: '/accounts', icon: <TeamOutlined />, labelKey: 'nav.accounts' },
  { key: '/logs', icon: <FileTextOutlined />, labelKey: 'nav.logs' },
  { key: '/models', icon: <AppstoreOutlined />, labelKey: 'nav.models' },
  { key: '/providers', icon: <ApiOutlined />, labelKey: 'nav.providers' },
  { key: '/upstreams', icon: <CloudServerOutlined />, labelKey: 'nav.upstreams' },
  { key: '/keys', icon: <KeyOutlined />, labelKey: 'nav.keys' },
  { key: '/settings', icon: <SettingOutlined />, labelKey: 'nav.settings' },
  { key: '/about', icon: <InfoCircleOutlined />, labelKey: 'nav.about' },
]

function useNavItems(): MenuProps['items'] {
  const { t } = useTranslation()
  return NAV_ITEMS.map((item) => ({
    key: item.key,
    icon: item.icon,
    label: <NavLink to={item.key}>{t(item.labelKey)}</NavLink>,
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
              {t('app.title')}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('app.subtitle')}
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
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            {NAV_ITEMS.map((item) => (
              <Route
                key={item.key}
                path={item.key}
                element={<PlaceholderPage titleKey={item.labelKey} />}
              />
            ))}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default function App() {
  return <AppShell />
}
