import { Card, Col, Descriptions, Row, Spin, Statistic, Tag } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { api } from '../api/client'
import type { AdminConfig, StatsResp } from '../api/types'
import PageHeader from '../components/PageHeader'
import { fmtNum } from '../utils'

export default function Dashboard() {
  const { t } = useTranslation()
  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get<StatsResp>('/stats'),
    refetchInterval: 10_000,
  })
  const config = useQuery({
    queryKey: ['config'],
    queryFn: () => api.get<AdminConfig>('/config'),
  })

  if (stats.isLoading || !stats.data) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }
  const s = stats.data

  return (
    <>
      <PageHeader
        title={t('nav.dashboard', '仪表盘')}
        subtitle={t('dashboard.subtitle', '账号池与用量总览，每 10 秒自动刷新')}
      />
      <Row gutter={[14, 14]}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title={t('dashboard.accounts', '账号总数')} value={s.total} />
            <div style={{ marginTop: 8 }}>
              <Tag color="green">{t('dashboard.active', '活跃')} {s.active}</Tag>
              <Tag color="orange">{t('dashboard.cooldown', '冷却')} {s.cooldown}</Tag>
              <Tag color="red">{t('dashboard.expired', '失效')} {s.expired}</Tag>
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title={t('dashboard.requests', '累计请求')} value={s.usageCount} />
            <div style={{ marginTop: 8 }}>
              <Tag color="blue">
                {t('dashboard.strategy', '策略')}: {s.strategy}
              </Tag>
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title={t('dashboard.totalTokens', 'Token 总量')} value={fmtNum(s.totalTokens)} />
            <div style={{ marginTop: 8 }}>
              <Tag>
                {t('dashboard.prompt', '输入')} {fmtNum(s.promptTokens)}
              </Tag>
              <Tag>
                {t('dashboard.completion', '输出')} {fmtNum(s.completionTokens)}
              </Tag>
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title={t('dashboard.cachedTokens', '缓存命中 Token')} value={fmtNum(s.cachedTokens)} />
            <div style={{ marginTop: 8 }}>
              <Tag color="geekblue">
                {t('dashboard.cachedPrompt', '占输入')}{' '}
                {s.promptTokens > 0 ? `${((s.cachedTokens / s.promptTokens) * 100).toFixed(1)}%` : '-'}
              </Tag>
            </div>
          </Card>
        </Col>
        <Col xs={24}>
          <Card title={t('dashboard.opencodeToday', 'opencode（Zen）今日用量')}>
            <Descriptions size="small" column={{ xs: 2, md: 4 }}>
              <Descriptions.Item label={t('logs.requests', '请求数')}>
                {fmtNum(s.opencodeToday?.requests ?? 0)}
              </Descriptions.Item>
              <Descriptions.Item label={t('logs.inputTokens', '输入 Token')}>
                {fmtNum(s.opencodeToday?.inputTokens ?? 0)}
              </Descriptions.Item>
              <Descriptions.Item label={t('logs.outputTokens', '输出 Token')}>
                {fmtNum(s.opencodeToday?.outputTokens ?? 0)}
              </Descriptions.Item>
              <Descriptions.Item label={t('logs.totalTokens', '总 Token')}>
                {fmtNum(s.opencodeToday?.totalTokens ?? 0)}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        {config.data ? (
          <Col xs={24}>
            <Card title={t('dashboard.runtime', '运行时信息')} size="small">
              <Descriptions size="small" column={{ xs: 1, md: 3 }}>
                <Descriptions.Item label={t('dashboard.version', '版本')}>{config.data.version}</Descriptions.Item>
                <Descriptions.Item label={t('dashboard.address', '监听地址')}>{config.data.address}</Descriptions.Item>
                <Descriptions.Item label={t('dashboard.defaultModel', '默认模型')}>
                  {config.data.defaultModel || '-'}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
        ) : null}
      </Row>
    </>
  )
}
