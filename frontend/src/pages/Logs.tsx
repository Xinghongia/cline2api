import { useCallback, useState } from 'react'
import { Button, Table, Tag, Tooltip } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

import { api } from '../api/client'
import type { LogPage, RequestLog } from '../api/types'
import PageHeader from '../components/PageHeader'
import { fmtNum, fmtTime } from '../utils'

export default function Logs() {
  const { t } = useTranslation()
  const [items, setItems] = useState<RequestLog[]>([])
  const [cursor, setCursor] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback(
    async (reset: boolean) => {
      reset ? setLoading(true) : setLoadingMore(true)
      try {
        const q = reset ? '' : `&cursor=${encodeURIComponent(cursor)}`
        const page = await api.get<LogPage>(`/request-logs?limit=50${q}`)
        setItems((prev) => (reset ? page.items : [...prev, ...page.items]))
        setCursor(page.nextCursor)
        setHasMore(page.hasMore)
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [cursor],
  )

  // 首次加载
  const [loaded, setLoaded] = useState(false)
  if (!loaded) {
    setLoaded(true)
    void load(true)
  }

  const columns = [
    {
      title: t('logs.time', '时间'),
      dataIndex: 'startedAt',
      key: 'startedAt',
      width: 170,
      render: fmtTime,
    },
    {
      title: t('logs.model', '模型'),
      dataIndex: 'model',
      key: 'model',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span>,
    },
    {
      title: t('logs.protocol', '协议'),
      dataIndex: 'protocol',
      key: 'protocol',
      width: 100,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: t('logs.upstream', '上游'),
      dataIndex: 'upstream',
      key: 'upstream',
      width: 100,
      render: (v: string) => <Tag color={v === 'cline' ? 'green' : 'geekblue'}>{v || '-'}</Tag>,
    },
    {
      title: t('logs.account', '账号'),
      dataIndex: 'accountEmail',
      key: 'accountEmail',
      render: (v: string) => v || '-',
    },
    {
      title: t('logs.tokens', 'Tokens (入/出/缓存/总)'),
      key: 'tokens',
      render: (_: unknown, row: RequestLog) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmtNum(row.inputTokens)} / {fmtNum(row.outputTokens)} / {fmtNum(row.cachedTokens)} /{' '}
          {fmtNum(row.totalTokens)}
        </span>
      ),
    },
    {
      title: t('logs.duration', '耗时'),
      dataIndex: 'durationMs',
      key: 'durationMs',
      width: 90,
      render: (v: number) => `${fmtNum(v)}ms`,
    },
    {
      title: 'TPS',
      dataIndex: 'outputTokensPerSecond',
      key: 'tps',
      width: 80,
      render: (v: number | undefined) => (v ? v.toFixed(1) : '-'),
    },
    {
      title: t('logs.result', '结果'),
      dataIndex: 'completed',
      key: 'completed',
      width: 150,
      render: (completed: boolean, row: RequestLog) =>
        completed ? (
          <Tag color="success">{t('logs.completed', '完成')}</Tag>
        ) : (
          <Tooltip title={row.error}>
            <Tag color="error">{t('logs.failed', '失败')}</Tag>
          </Tooltip>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title={t('nav.logs', '请求日志')}
        subtitle={t('logs.subtitle', '每次转发的用量与耗时记录')}
        extra={
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load(true)}>
            {t('common.refresh', '刷新')}
          </Button>
        }
      />
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={items}
        columns={columns}
        pagination={false}
        locale={{ emptyText: t('logs.empty', '暂无请求记录') }}
        footer={() =>
          hasMore ? (
            <div style={{ textAlign: 'center' }}>
              <Button loading={loadingMore} onClick={() => void load(false)}>
                {t('common.loadMore', '加载更多')}
              </Button>
            </div>
          ) : items.length > 0 ? (
            <span style={{ color: '#999' }}>{t('logs.end', '已全部加载')}</span>
          ) : null
        }
      />
    </>
  )
}
