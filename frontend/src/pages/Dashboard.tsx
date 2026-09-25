import { useMemo, useState, type CSSProperties } from 'react'
import { Card, Col, Descriptions, Row, Segmented, Space, Spin } from 'antd'
import { TeamOutlined, ThunderboltOutlined, FireOutlined, DatabaseOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { api } from '../api/client'
import type { AdminConfig, SeriesResp, StatsResp, SummaryResp } from '../api/types'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import Chart from '../components/Chart'
import { useAppearance } from '../theme'
import { cssColorToRgb } from '../utils/color'
import { fmtNum } from '../utils'

const RANGES = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
]

const MONO = "'JetBrains Mono Variable', Consolas, monospace"

function rangeMs(range: string): number {
  if (range === '7d') return 7 * 86400_000
  if (range === '30d') return 30 * 86400_000
  return 86400_000
}

/**
 * 从 CSS 变量取图表可用颜色。zrender 只认 hex/rgb，
 * 自定义属性读出来是 oklch 字符串，这里统一换算成 rgb()。
 */
function readVar(name: string, alpha?: number): string {
  const css = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return cssColorToRgb(css, alpha)
}

/** 页脚信息 chip：呼吸点 + 文本 */
function Chip({ dotColor, children }: { dotColor?: string; children: React.ReactNode }) {
  return (
    <span className="c2a-chip">
      {dotColor ? <span className="c2a-dot" style={{ '--dot-color': dotColor } as CSSProperties} /> : null}
      {children}
    </span>
  )
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

  const palette = useMemo(() => {
    void mode // 明暗切换时重新读 CSS 变量
    return {
      accent: readVar('--accent'),
      ink: readVar('--ink'),
      ink2: readVar('--ink-2'),
      ink3: readVar('--ink-3'),
      rule: readVar('--rule', 0.5),
      success: readVar('--success'),
      warning: readVar('--warning'),
      danger: readVar('--danger'),
    }
  }, [mode])

  const trendOption = useMemo(() => {
    const g = series.data?.groups?.[0]
    const points = g?.points ?? []
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: { data: [t('dashboard.requests', '累计请求'), t('dashboard.totalTokens', 'Token 总量')], textStyle: { color: palette.ink2 } },
      grid: { left: 48, right: 56, top: 36, bottom: 28 },
      xAxis: {
        type: 'time',
        axisLabel: { color: palette.ink2, fontFamily: MONO, fontSize: 11 },
        splitLine: { lineStyle: { color: palette.rule } },
      },
      yAxis: [
        { type: 'value', name: t('dashboard.requests', '累计请求'), axisLabel: { color: palette.ink2, fontFamily: MONO, fontSize: 11 }, splitLine: { lineStyle: { color: palette.rule } } },
        { type: 'value', name: 'Token', axisLabel: { color: palette.ink2, fontFamily: MONO, fontSize: 11 }, splitLine: { show: false } },
      ],
      series: [
        {
          name: t('dashboard.requests', '累计请求'),
          type: 'bar',
          data: points.map((p) => [p.t * 1000, p.r]),
          itemStyle: { color: palette.accent, borderRadius: [3, 3, 0, 0], opacity: 0.55 },
          barMaxWidth: 14,
        },
        {
          name: t('dashboard.totalTokens', 'Token 总量'),
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          showSymbol: false,
          data: points.map((p) => [p.t * 1000, p.total]),
          lineStyle: { color: palette.accent, width: 2 },
          itemStyle: { color: palette.accent },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: palette.accent },
                { offset: 1, color: palette.accent },
              ],
            },
            opacity: 0.08,
          },
        },
      ],
    }
  }, [series.data, palette, t])

  const upstreamOption = useMemo(() => {
    const colors = [palette.accent, palette.ink3, palette.warning, palette.success, palette.rule]
    const data = (summary.data?.upstreams ?? []).map((u, i) => ({
      name: u.name || 'cline',
      value: u.totalTokens,
      itemStyle: { color: colors[i % colors.length], borderWidth: 2, borderColor: 'transparent' },
    }))
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, textStyle: { color: palette.ink2, fontFamily: MONO, fontSize: 11 } },
      series: [
        {
          type: 'pie',
          radius: ['46%', '70%'],
          center: ['50%', '44%'],
          data,
          label: { color: palette.ink2 },
          itemStyle: { borderRadius: 6 },
        },
      ],
    }
  }, [summary.data, palette])

  const topModelsOption = useMemo(() => {
    const models = [...(summary.data?.topModels ?? [])].reverse()
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: 'value', axisLabel: { color: palette.ink2, fontFamily: MONO, fontSize: 11 }, splitLine: { lineStyle: { color: palette.rule } } },
      yAxis: {
        type: 'category',
        data: models.map((m) => m.name),
        axisLabel: { color: palette.ink2, fontSize: 11, fontFamily: MONO },
      },
      series: [
        {
          type: 'bar',
          data: models.map((m) => m.totalTokens),
          barMaxWidth: 12,
          itemStyle: { borderRadius: [0, 5, 5, 0], color: palette.accent, opacity: 0.8 },
        },
      ],
    }
  }, [summary.data, palette])

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
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <StatCard
            icon={<TeamOutlined />}
            label={t('dashboard.accounts', '账号总数')}
            value={s.total}
            footer={
              <>
                <Chip dotColor={palette.success}>{t('dashboard.active', '活跃')} {s.active}</Chip>
                <Chip dotColor={palette.warning}>{t('dashboard.cooldown', '冷却')} {s.cooldown}</Chip>
                <Chip dotColor={palette.danger}>{t('dashboard.expired', '失效')} {s.expired}</Chip>
              </>
            }
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard
            icon={<ThunderboltOutlined />}
            label={t('dashboard.requests', '累计请求')}
            value={s.usageCount}
            footer={<Chip>{t('dashboard.strategy', '策略')}: <span className="c2a-mono">{s.strategy}</span></Chip>}
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard
            icon={<FireOutlined />}
            label={t('dashboard.totalTokens', 'Token 总量')}
            value={s.totalTokens}
            footer={
              <>
                <Chip>{t('dashboard.prompt', '输入')} {fmtNum(s.promptTokens)}</Chip>
                <Chip>{t('dashboard.completion', '输出')} {fmtNum(s.completionTokens)}</Chip>
              </>
            }
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard
            icon={<DatabaseOutlined />}
            label={t('dashboard.cachedTokens', '缓存命中 Token')}
            value={s.cachedTokens}
            footer={
              <Chip dotColor={palette.accent}>
                {t('dashboard.cachedPrompt', '占输入')}{' '}
                <span className="c2a-mono">{s.promptTokens > 0 ? `${((s.cachedTokens / s.promptTokens) * 100).toFixed(1)}%` : '-'}</span>
              </Chip>
            }
          />
        </Col>

        <Col xs={24} lg={16}>
          <Card
            title={t('dashboard.trend', '用量趋势')}
            extra={totals ? (
              <span className="c2a-mono" style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                {t('logs.requests', '请求数')} {fmtNum(totals.requests)} · Token {fmtNum(totals.totalTokens)}
                {summary.data?.estimatedCost ? ` · ≈$${summary.data.estimatedCost.toFixed(4)}` : ''}
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
                <span className="c2a-mono">{fmtNum(s.opencodeToday?.requests ?? 0)}</span>
              </Descriptions.Item>
              <Descriptions.Item label={t('logs.inputTokens', '输入 Token')}>
                <span className="c2a-mono">{fmtNum(s.opencodeToday?.inputTokens ?? 0)}</span>
              </Descriptions.Item>
              <Descriptions.Item label={t('logs.outputTokens', '输出 Token')}>
                <span className="c2a-mono">{fmtNum(s.opencodeToday?.outputTokens ?? 0)}</span>
              </Descriptions.Item>
              <Descriptions.Item label={t('logs.totalTokens', '总 Token')}>
                <span className="c2a-mono">{fmtNum(s.opencodeToday?.totalTokens ?? 0)}</span>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        {config.data ? (
          <Col xs={24}>
            <Card title={t('dashboard.runtime', '运行时信息')} size="small">
              <Descriptions size="small" column={{ xs: 1, md: 3 }}>
                <Descriptions.Item label={t('dashboard.version', '版本')}>
                  <span className="c2a-mono">{config.data.version}</span>
                </Descriptions.Item>
                <Descriptions.Item label={t('dashboard.address', '监听地址')}>
                  <span className="c2a-mono">{config.data.address}</span>
                </Descriptions.Item>
                <Descriptions.Item label={t('dashboard.defaultModel', '默认模型')}>
                  <span className="c2a-mono">{config.data.defaultModel || '-'}</span>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
        ) : null}
      </Row>
    </>
  )
}
