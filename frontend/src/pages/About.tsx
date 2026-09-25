import { Card, Descriptions, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { api } from '../api/client'
import type { AdminConfig } from '../api/types'
import PageHeader from '../components/PageHeader'
import { openExternal } from '../utils'

const REPO = 'https://github.com/luawei1/cline2api'

export default function About() {
  const { t } = useTranslation()
  const config = useQuery({
    queryKey: ['config'],
    queryFn: () => api.get<AdminConfig>('/config'),
  })

  return (
    <>
      <PageHeader title={t('nav.about', '关于')} />
      <Card style={{ maxWidth: 860 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div className="c2a-logo" style={{ width: 48, height: 48, fontSize: 20 }}>
            C2
          </div>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Cline2API
            </Typography.Title>
            <Typography.Text type="secondary">
              {t('about.desc', 'Cline API 反向代理 · 多账号轮询 · 双协议兼容 · 桌面端')}
            </Typography.Text>
          </div>
        </div>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label={t('dashboard.version', '版本')}>{config.data?.version ?? '-'}</Descriptions.Item>
          <Descriptions.Item label={t('dashboard.address', '监听地址')}>{config.data?.address ?? '-'}</Descriptions.Item>
          <Descriptions.Item label={t('settings.poolPath', '数据文件')}>
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{config.data?.poolPath ?? '-'}</span>
          </Descriptions.Item>
          <Descriptions.Item label="GitHub">
            <a onClick={() => openExternal(REPO)}>{REPO}</a>
          </Descriptions.Item>
        </Descriptions>
        <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
          {t('about.tech',
            'Go 1.25（后端 + 代理 + 桌面壳）· Wails v2 桌面 WebView · React 19 + Ant Design 6 管理后台（go:embed 内嵌单文件）')}
        </Typography.Paragraph>
      </Card>
    </>
  )
}
