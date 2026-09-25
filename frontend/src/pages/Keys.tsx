import { useState } from 'react'
import { Button, Card, Input, Modal, Popconfirm, Space, Switch, Table, Typography, message } from 'antd'
import { CopyOutlined, KeyOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { api } from '../api/client'
import type { AdminConfig, APIKey } from '../api/types'
import PageHeader from '../components/PageHeader'
import { copyText, fmtNum, fmtTime } from '../utils'

export default function Keys() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [genOpen, setGenOpen] = useState(false)
  const [newKey, setNewKey] = useState<APIKey | null>(null)
  const [genName, setGenName] = useState('')
  const [pwdOpen, setPwdOpen] = useState(false)
  const [pwd, setPwd] = useState('')
  const [editing, setEditing] = useState<APIKey | null>(null)
  const [editName, setEditName] = useState('')

  const keys = useQuery({
    queryKey: ['keys'],
    queryFn: () => api.get<{ keys: APIKey[] }>('/keys'),
  })
  const config = useQuery({
    queryKey: ['config'],
    queryFn: () => api.get<AdminConfig>('/config'),
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['keys'] })
    void qc.invalidateQueries({ queryKey: ['config'] })
  }

  const generate = useMutation({
    mutationFn: (name: string) => api.post<{ key: APIKey }>('/keys/generate', { name }),
    onSuccess: (r) => {
      setNewKey(r.key)
      setGenOpen(true)
      setGenName('')
      void qc.invalidateQueries({ queryKey: ['keys'] })
    },
    onError: (err) => void message.error(err.message),
  })
  const update = useMutation({
    mutationFn: (v: { key: string; name?: string; enabled?: boolean }) => api.post('/keys/update', v),
    onSuccess: () => {
      void message.success(t('keys.updated', '已更新'))
      invalidate()
    },
    onError: (err) => void message.error(err.message),
  })
  const del = useMutation({
    mutationFn: (key: string) => api.post('/keys/delete', { key }),
    onSuccess: () => {
      void message.success(t('keys.deleted', '已删除'))
      void qc.invalidateQueries({ queryKey: ['keys'] })
    },
    onError: (err) => void message.error(err.message),
  })
  const setPassword = useMutation({
    mutationFn: (password: string) => api.post('/password', { password }),
    onSuccess: () => {
      void message.success(t('keys.pwdSaved', '密码已更新（清除则留空保存）'))
      setPwdOpen(false)
      setPwd('')
      invalidate()
    },
    onError: (err) => void message.error(err.message),
  })

  const columns = [
    {
      title: t('keys.nameCol', '名称'),
      dataIndex: 'name',
      key: 'name',
      width: 160,
      render: (v: string, row: APIKey) =>
        v ? (
          <Space size={4}>
            <span>{v}</span>
            <Button type="text" size="small" onClick={() => { setEditing(row); setEditName(v) }} />
          </Space>
        ) : (
          <Button type="link" size="small" onClick={() => { setEditing(row); setEditName('') }}>
            {t('keys.setName', '设置名称')}
          </Button>
        ),
    },
    {
      title: 'API Key',
      dataIndex: 'key',
      key: 'key',
      render: (v: string) => (
        <Space size={4}>
          <Typography.Text code style={{ fontSize: 12 }}>
            {v.slice(0, 14)}…{v.slice(-6)}
          </Typography.Text>
          <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => void copyText(v)} />
        </Space>
      ),
    },
    {
      title: t('keys.enabledCol', '启用'),
      dataIndex: 'enabled',
      key: 'enabled',
      width: 90,
      render: (v: boolean, row: APIKey) => (
        <Switch size="small" checked={v} onChange={(c) => update.mutate({ key: row.key, enabled: c })} />
      ),
    },
    {
      title: t('keys.totalRequests', '调用次数'),
      dataIndex: 'totalRequests',
      key: 'totalRequests',
      width: 110,
      render: (v: number | undefined) => fmtNum(v ?? 0),
    },
    {
      title: t('logs.tokens', 'Tokens (入/出/缓存/总)'),
      key: 'tokens',
      render: (_: unknown, row: APIKey) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmtNum(row.inputTokens ?? 0)} / {fmtNum(row.outputTokens ?? 0)} / {fmtNum(row.cachedTokens ?? 0)} /{' '}
          {fmtNum(row.totalTokens ?? 0)}
        </span>
      ),
    },
    {
      title: t('accounts.lastUsed', '最近使用'),
      dataIndex: 'lastUsedAt',
      key: 'lastUsedAt',
      width: 170,
      render: fmtTime,
    },
    {
      title: t('models.actions', '操作'),
      key: 'actions',
      width: 110,
      render: (_: unknown, row: APIKey) => (
        <Popconfirm
          title={t('keys.deleteConfirm', '确认删除该 Key？使用它的客户端将立即失效')}
          onConfirm={() => del.mutate(row.key)}
        >
          <Button type="link" size="small" danger>
            {t('common.delete', '删除')}
          </Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title={t('nav.keys', '密钥与安全')}
        subtitle={t('keys.subtitle', '保护 /v1 代理端点的 API Key 与管理后台密码')}
        extra={
          <>
            <Button icon={<KeyOutlined />} onClick={() => setPwdOpen(true)}>
              {t('keys.password', '管理密码')}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setGenOpen(true)}>
              {t('keys.generate', '生成 API Key')}
            </Button>
          </>
        }
      />

      <Card title={t('keys.list', 'API Key 列表')} size="small">
        <Table
          rowKey={(k) => k.key}
          loading={keys.isLoading}
          dataSource={keys.data?.keys ?? []}
          pagination={false}
          locale={{ emptyText: t('keys.empty', '暂无 API Key —— 未配置任何 Key 时 /v1 端点无需鉴权，建议生成') }}
          columns={columns}
        />
        <p style={{ color: 'var(--ink-2)', marginTop: 12 }}>
          {t('keys.usage', '客户端用法：Header x-api-key 或 Authorization: Bearer <key>；Base URL: http://<host>:3457/v1')}
        </p>
      </Card>

      <Modal
        title={t('keys.generate', '生成 API Key')}
        open={genOpen && newKey === null}
        onCancel={() => setGenOpen(false)}
        onOk={() => generate.mutate(genName.trim())}
        confirmLoading={generate.isPending}
        okText={t('common.save', '保存')}
      >
        <Input
          value={genName}
          onChange={(e) => setGenName(e.target.value)}
          placeholder={t('keys.namePlaceholder', '名称/备注（可选），如“我的 Claude Code”')}
        />
      </Modal>

      <Modal
        title={t('keys.generated', 'API Key 已生成')}
        open={newKey !== null}
        onCancel={() => {
          setNewKey(null)
          setGenOpen(false)
        }}
        footer={
          <Button
            type="primary"
            onClick={() => {
              setNewKey(null)
              setGenOpen(false)
            }}
          >
            {t('common.close', '关闭')}
          </Button>
        }
      >
        <p>{t('keys.onlyOnce', '请立即复制保存：')}</p>
        <Space.Compact style={{ width: '100%' }}>
          <Input value={newKey?.key ?? ''} readOnly />
          <Button icon={<CopyOutlined />} onClick={() => void copyText(newKey?.key ?? '')} />
        </Space.Compact>
      </Modal>

      <Modal
        title={t('keys.rename', '修改名称')}
        open={editing !== null}
        onCancel={() => setEditing(null)}
        onOk={() => {
          if (editing) {
            update.mutate({ key: editing.key, name: editName.trim() })
          }
          setEditing(null)
        }}
        okText={t('common.save', '保存')}
      >
        <Input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={60} />
      </Modal>

      <Modal
        title={t('keys.password', '管理后台密码')}
        open={pwdOpen}
        onCancel={() => setPwdOpen(false)}
        onOk={() => setPassword.mutate(pwd)}
        confirmLoading={setPassword.isPending}
      >
        <p>
          {t('keys.pwdState', '当前状态')}:{' '}
          {config.data?.hasPassword ? t('keys.pwdOn', '已启用') : t('keys.pwdOff', '未设置（后台无鉴权）')}
        </p>
        <Input.Password
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          placeholder={t('keys.pwdPlaceholder', '新密码；留空提交 = 清除密码')}
          autoComplete="new-password"
        />
        {config.data?.hasPassword ? (
          <Button danger style={{ marginTop: 12 }} onClick={() => setPassword.mutate('')}>
            {t('keys.pwdClear', '清除密码')}
          </Button>
        ) : null}
      </Modal>
    </>
  )
}
