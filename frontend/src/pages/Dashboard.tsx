import { useMemo, useState } from 'react'
import { Card, Col, Descriptions, Row, Segmented, Space, Spin, Statistic, Tag } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { api } from '../api/client'
import type { AdminConfig, SeriesResp, StatsResp, SummaryResp } from '../api/types'
import PageHeader from '../components/PageHeader'
import Chart from '../components/Chart'
import { useAppearance } from '../theme'
import { fmtNum } from '../utils'

const RANGES = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
]

function rangeMs(range: string): number {
  if (range === '7d') return 7 * 86400_000
  if (range === '30d') return 30 * 86400_000
  return 86400_000
}

export default function Dashboard() {
  const { t } = useTranslation()
  const { mode } = useAppearance()
  const [range, setRange] = useState('24h')

  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get<StatsResp>('/stats'),
    refetchInterval: 10_000,
  })
  const config = useQuery({
    queryKey: ['config'],
    queryFn: () => api.get<AdminConfig>('/config'),
  })
  const series = useQuery({
    queryKey: ['series', range],
    queryFn: () => {
      const to = Math.floor(Date.now() / 1000)
      const from = Math.floor((Date.now() - rangeMs(range)) / 1000)
      const bucket = range === '24h' ? 'hour' : 'day'
      return api.get<SeriesResp>(`/stats/series?bucket=${bucket}&group=total&from=${from}&to=${to}`)
    },
    refetchInterval: 60_000,
  })
  const summary = useQuery({
    queryKey: ['summary', range],
    queryFn: () => api.get<SummaryResp>(`/stats/summary?range=${range}`),
    refetchInterval: 60_000,
  })

  const axisColor = mode === 'dark' ? '#999' : '#666'
  const splitColor = mode === 'dark' ? '#333' : '#e8e8e8'

  const trendOption = useMemo(() => {
    const g = series.data?.groups?.[0]
    const points = g?.points ?? []
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: { data: [t('dashboard.requests', '累计请求'), t('dashboard.totalTokens', 'Token 总量')], textStyle: { color: axisColor } },
      grid: { left: 48, right: 56, top: 36, bottom: 28 },
      xAxis: {
        type: 'time',
        axisLabel: { color: axisColor },
        splitLine: { lineStyle: { color: splitColor } },
      },
      yAxis: [
        { type: 'value', name: t('dashboard.requests', '累计请求'), axisLabel: { color: axisColor }, splitLine: { lineStyle: { color: splitColor } } },
        { type: 'value', name: 'Token', axisLabel: { color: axisColor }, splitLine: { show: false } },
      ],
      series: [
        {
          name: t('dashboard.requests', '累计请求'),
          type: 'bar',
          data: points.map((p) => [p.t * 1000, p.r]),
          itemStyle: { color: '#5b8ff9' },
          barMaxWidth: 18,
        },
        {
          name: t('dashboard.totalTokens', 'Token 总量'),
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          showSymbol: false,
          data: points.map((p) => [p.t * 1000, p.total]),
          itemStyle: { color: '#5ad8a6' },
        },
      ],
    }
  }, [series.data, axisColor, splitColor, t])

  const upstreamOption = useMemo(() => {
    const colors = ['#5b8ff9', '#5ad8a6', '#f6bd16', '#e8684a', '#6dc8ec']
    const data = (summary.data?.upstreams ?? []).map((u, i) => ({
      name: u.name || 'cline',
      value: u.totalTokens,
      itemStyle: { color: colors[i % colors.length] },
    }))
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, textStyle: { color: axisColor } },
      series: [
        {
          type: 'pie',
          radius: ['40%', '65%'],
          center: ['50%', '45%'],
          data,
          label: { color: axisColor },
        },
      ],
    }
  }, [summary.data, axisColor])

  const topModelsOption = useMemo(() => {
    const models = [...(summary.data?.topModels ?? [])].reverse()
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: 'value', axisLabel: { color: axisColor }, splitLine: { lineStyle: { color: splitColor } } },
      yAxis: {
        type: 'category',
        data: models.map((m) => m.name),
        axisLabel: { color: axisColor, fontSize: 11 },
      },
      series: [
        {
          type: 'bar',
          data: models.map((m) => m.totalTokens),
          itemStyle: { color: '#5b8ff9' },
          barMaxWidth: 16,
        },
      ],
    }
  }, [summary.data, axisColor, splitColor])

  if (stats.isLoading || !stats.data) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }
  const s = stats.data
  const totals = summary.data?.totals

  return (
    <>
      <PageHeader
        title={t('nav.dashboard', '仪表盘')}
        subtitle={t('dashboard.subtitle', '账号池与用量总览，每 10 秒自动刷新')}
        extra={
          <Space>
            <Segmented options={RANGES} value={range} onChange={(v) => setRange(v as string)} />
          </Space>
        }
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

        <Col xs={24} lg={16}>
          <Card
            title={t('dashboard.trend', '用量趋势')}
            extra={totals ? (
              <span>
                {t('logs.requests', '请求数')} {fmtNum(totals.requests)} · Token {fmtNum(totals.totalTokens)}
                {totals.cachedTokens > 0 ? ` · ${t('logs.cached', '缓存')} ${fmtNum(totals.cachedTokens)}` : ''}
              </span>
            ) : null}
          >
            <Chart option={trendOption} height={300} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={t('dashboard.upstreamSplit', '上游分布（Token）')}>
            <Chart option={upstreamOption} height={300} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={t('dashboard.topModels', '模型 Top 5（Token）')}>
            <Chart option={topModelsOption} height={240} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
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
