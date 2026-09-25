import { useEffect, useState } from 'react'
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Upload,
  message,
} from 'antd'
import type { UploadFile } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CloudUploadOutlined,
  ExportOutlined,
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

import { api } from '../api/client'
import type {
  Account,
  AccountTestResult,
  AccountsResp,
  BatchImportResult,
  OAuthStart,
  OAuthStatus,
} from '../api/types'
import PageHeader from '../components/PageHeader'
import { copyText, fmtNum, fmtTime, openExternal, parseTokenLines } from '../utils'

const STATUS_COLOR: Record<string, string> = {
  active: 'green',
  cooldown: 'orange',
  expired: 'red',
}

function statusTag(status: string, cooldownUntil: string | undefined) {
  return (
    <Tooltip title={status === 'cooldown' && cooldownUntil ? `冷却至 ${fmtTime(cooldownUntil)}` : undefined}>
      <Tag color={STATUS_COLOR[status] ?? 'default'}>{status}</Tag>
    </Tooltip>
  )
}

/** OAuth 设备授权流程弹窗：start 后每 2 秒轮询 status */
function OAuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [session, setSession] = useState<OAuthStart | null>(null)

  const start = useMutation({
    mutationFn: () => api.post<OAuthStart>('/oauth/start'),
    onSuccess: (data) => setSession(data),
    onError: (err) => void message.error(err.message),
  })

  const status = useQuery({
    queryKey: ['oauth-status', session?.sessionId],
    queryFn: () => api.get<OAuthStatus>(`/oauth/status?sessionId=${session!.sessionId}`),
    enabled: open && !!session,
    refetchInterval: 2000,
  })

  // 轮询结束：成功/失败都停表并提示
  useEffect(() => {
    if (!status.data?.done || !session) return
    const done = status.data
    setSession(null)
    if (done.success) {
      void message.success(`${t('accounts.oauthSuccess', '授权成功')}: ${done.email ?? ''}`)
    } else {
      void message.error(done.error || t('accounts.oauthFailed', '授权失败'))
    }
    void qc.invalidateQueries({ queryKey: ['accounts'] })
    onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.data, session])

  const handleOpen = () => {
    setSession(null)
    start.mutate()
  }

  return (
    <Modal
      title={t('accounts.oauthLogin', 'OAuth 浏览器登录')}
      open={open}
      onCancel={() => {
        setSession(null)
        onClose()
      }}
      footer={
        session ? (
          <Button type="primary" onClick={() => openExternal(session.verificationUri)}>
            {t('accounts.openAuthPage', '打开授权页面')}
          </Button>
        ) : (
          <Button type="primary" loading={start.isPending} onClick={handleOpen}>
            {t('accounts.startOAuth', '开始授权')}
          </Button>
        )
      }
    >
      {session ? (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <p>{t('accounts.oauthStep1', '1. 在系统浏览器中打开授权页面（或点击下方按钮）')}</p>
          <p>
            {t('accounts.oauthStep2', '2. 输入设备码完成登录：')}
            <UserCodeButton code={session.userCode} />
          </p>
          <p style={{ wordBreak: 'break-all' }}>
            <a onClick={() => openExternal(session.verificationUri)}>{session.verificationUri}</a>
          </p>
          <p>{t('accounts.oauthWaiting', '等待授权完成…（每 2 秒自动检查）')}</p>
        </div>
      ) : (
        <p>{t('accounts.oauthIntro', '将启动 WorkOS 设备授权流程，在系统浏览器完成 Cline 登录后账号自动入池。')}</p>
      )}
    </Modal>
  )
}

function UserCodeButton({ code }: { code: string }) {
  return (
    <Button type="link" size="small" onClick={() => void copyText(code)} style={{ fontSize: 16, fontWeight: 600 }}>
      {code}
    </Button>
  )
}

/** 批量导入弹窗：粘贴文本 / 上传文件 / SSO Cookie 三种来源 */
function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [sso, setSso] = useState('')
  const [loading, setLoading] = useState(false)

  const finish = (r: BatchImportResult) => {
      void message.success(
        t('accounts.importResult', {
          defaultValue: '导入 {{imported}} 个，重复 {{duplicates}} 个，失败 {{failed}} 个',
          imported: r.imported,
          duplicates: r.duplicates,
          failed: r.failed,
        }),
      )
    void qc.invalidateQueries({ queryKey: ['accounts'] })
    setText('')
    setSso('')
    onClose()
  }

  const submitTokens = async () => {
    const tokens = parseTokenLines(text)
    if (tokens.length === 0) {
      void message.warning(t('accounts.noTokens', '请先粘贴或上传 token 内容'))
      return
    }
    setLoading(true)
    try {
      finish(await api.post<BatchImportResult>('/batch-import', { tokens }))
    } catch (err) {
      void message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const submitSso = async () => {
    if (!sso.trim()) return
    setLoading(true)
    try {
      finish(await api.post<BatchImportResult>('/sso/import', { ssoCookies: sso }))
    } catch (err) {
      void message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title={t('accounts.batchImport', '批量导入账号')} open={open} onCancel={onClose} footer={null} width={560}>
      <Tabs
        items={[
          {
            key: 'paste',
            label: t('accounts.tabPaste', '粘贴文本'),
            children: (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Input.TextArea
                  rows={8}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t(
                    'accounts.pastePlaceholder',
                    '每行一个 refreshToken；或粘贴 JSON 数组 [{"refreshToken":"...","email":"..."}]',
                  )}
                />
                <Button type="primary" loading={loading} onClick={submitTokens}>
                  {t('accounts.import', '导入')}
                </Button>
              </Space>
            ),
          },
          {
            key: 'file',
            label: t('accounts.tabFile', '从文件导入'),
            children: (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Upload.Dragger
                  accept=".json,.txt"
                  maxCount={1}
                  beforeUpload={(file: UploadFile) => {
                    const reader = new FileReader()
                    reader.onload = () => setText(String(reader.result ?? ''))
                    reader.readAsText(file as unknown as Blob)
                    return false
                  }}
                >
                  <p className="ant-upload-text">{t('accounts.dropFile', '点击或拖拽 JSON/TXT 文件到此处')}</p>
                </Upload.Dragger>
                <Input.TextArea
                  rows={5}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t('accounts.filePreview', '文件内容会填充到这里，可继续编辑')}
                />
                <Button type="primary" loading={loading} onClick={submitTokens}>
                  {t('accounts.import', '导入')}
                </Button>
              </Space>
            ),
          },
          {
            key: 'sso',
            label: t('accounts.tabSso', 'SSO Cookie'),
            children: (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Input.TextArea
                  rows={8}
                  value={sso}
                  onChange={(e) => setSso(e.target.value)}
                  placeholder={t('accounts.ssoPlaceholder', '每行一个 SSO Cookie / Token')}
                />
                <Button type="primary" loading={loading} onClick={submitSso}>
                  {t('accounts.import', '导入')}
                </Button>
              </Space>
            ),
          },
        ]}
      />
    </Modal>
  )
}

/** 添加单个账号（手动 refreshToken） */
function AddAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    const values = await form.validateFields()
    setLoading(true)
    try {
      const r = await api.post<{ accountId: string; email?: string; status: string; duplicate?: boolean }>(
        '/accounts/add',
        values,
      )
      if (r.duplicate) {
        void message.warning(t('accounts.duplicate', '该账号已在池中'))
      } else {
        void message.success(`${t('accounts.added', '已添加')}: ${r.email ?? r.accountId}`)
      }
      form.resetFields()
      void qc.invalidateQueries({ queryKey: ['accounts'] })
      onClose()
    } catch (err) {
      void message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title={t('accounts.addTitle', '添加账号')}
      open={open}
      onCancel={onClose}
      onOk={submit}
      confirmLoading={loading}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="refreshToken"
          label="refreshToken"
          rules={[{ required: true, message: t('accounts.tokenRequired', '请输入 refreshToken') }]}
        >
          <Input.TextArea rows={4} placeholder="eyJhbGciOi..." />
        </Form.Item>
        <Form.Item name="email" label={t('accounts.emailOptional', '邮箱（可选）')}>
          <Input placeholder="user@example.com" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default function Accounts() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [oauthOpen, setOauthOpen] = useState(false)
  const [testResults, setTestResults] = useState<AccountTestResult[] | null>(null)

  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get<AccountsResp>('/accounts'),
    refetchInterval: 15_000,
  })

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['accounts'] })
  const onError = (err: Error) => void message.error(err.message)

  const del = useMutation({
    mutationFn: (accountId: string) => api.post('/accounts/delete', { accountId }),
    onSuccess: () => {
      void message.success(t('accounts.deleted', '已删除'))
      invalidate()
    },
    onError,
  })
  const reset = useMutation({
    mutationFn: (accountId: string) => api.post('/accounts/reset', { accountId }),
    onSuccess: () => {
      void message.success(t('accounts.resetDone', '已重置为活跃状态'))
      invalidate()
    },
    onError,
  })
  const refreshAll = useMutation({
    mutationFn: () => api.post('/accounts/refresh-all'),
    onSuccess: () => {
      void message.success(t('accounts.refreshAllDone', '已刷新全部 Token'))
      invalidate()
    },
    onError,
  })
  const deleteAll = useMutation({
    mutationFn: () => api.post('/accounts/delete-all'),
    onSuccess: () => {
      void message.success(t('accounts.deleteAllDone', '已清空账号池'))
      invalidate()
    },
    onError,
  })
  const testOne = useMutation({
    mutationFn: (accountId: string) => api.post<{ results: AccountTestResult[] }>('/accounts/test', { accountId }),
    onSuccess: (r) => setTestResults(r.results),
    onError,
  })
  const testAll = useMutation({
    mutationFn: () => api.post<{ results: AccountTestResult[] }>('/accounts/test', {}),
    onSuccess: (r) => setTestResults(r.results),
    onError,
  })

  const columns = [
    {
      title: t('accounts.email', '邮箱'),
      dataIndex: 'email',
      key: 'email',
      render: (v: string, row: Account) => (
        <Space size={4}>
          <span>{v || row.accountId}</span>
          <Button
            type="text"
            size="small"
            icon={<ExportOutlined />}
            onClick={() => void copyText(row.email || row.accountId)}
          />
        </Space>
      ),
    },
    {
      title: t('accounts.status', '状态'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string, row: Account) => statusTag(status, row.cooldownUntil),
    },
    {
      title: t('accounts.usage', '调用次数'),
      dataIndex: 'usageCount',
      key: 'usageCount',
      render: (v: number) => fmtNum(v),
      sorter: (a: Account, b: Account) => a.usageCount - b.usageCount,
    },
    {
      title: t('accounts.tokens', 'Tokens (入/出/缓存)'),
      key: 'tokens',
      render: (_: unknown, row: Account) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmtNum(row.promptTokens)} / {fmtNum(row.completionTokens)} / {fmtNum(row.cachedTokens)}
        </span>
      ),
      sorter: (a: Account, b: Account) => a.totalTokens - b.totalTokens,
    },
    {
      title: t('accounts.lastUsed', '最近使用'),
      dataIndex: 'lastUsed',
      key: 'lastUsed',
      render: fmtTime,
    },
    {
      title: t('accounts.actions', '操作'),
      key: 'actions',
      width: 220,
      render: (_: unknown, row: Account) => (
        <Space size={0}>
          <Button type="link" size="small" loading={testOne.isPending} onClick={() => testOne.mutate(row.accountId)}>
            {t('accounts.test', '测试')}
          </Button>
          <Button type="link" size="small" onClick={() => reset.mutate(row.accountId)}>
            {t('accounts.reset', '重置')}
          </Button>
          <Popconfirm
            title={t('accounts.deleteConfirm', '确认删除该账号？')}
            onConfirm={() => del.mutate(row.accountId)}
          >
            <Button type="link" size="small" danger>
              {t('common.delete', '删除')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title={t('nav.accounts', '账号管理')}
        subtitle={t('accounts.subtitle', 'Cline 账号池，请求按策略在活跃账号间轮询')}
        extra={
          <>
            <Button icon={<UserAddOutlined />} onClick={() => setAddOpen(true)}>
              {t('accounts.addToken', '手动添加')}
            </Button>
            <Button icon={<CloudUploadOutlined />} onClick={() => setOauthOpen(true)}>
              {t('accounts.oauthLogin', 'OAuth 登录')}
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => setImportOpen(true)}>
              {t('accounts.batchImport', '批量导入')}
            </Button>
            <Button
              icon={<ExportOutlined />}
              onClick={() => window.open('/admin/api/accounts/export', '_blank')}
            >
              {t('accounts.export', '导出')}
            </Button>
            <Button icon={<ReloadOutlined />} loading={refreshAll.isPending} onClick={() => refreshAll.mutate()}>
              {t('accounts.refreshAll', '刷新全部 Token')}
            </Button>
            <Button
              icon={<ThunderboltOutlined />}
              loading={testAll.isPending}
              onClick={() => testAll.mutate()}
            >
              {t('accounts.testAll', '测试全部')}
            </Button>
            <Popconfirm
              title={t('accounts.deleteAllConfirm', '将删除全部账号（含 API Key），确认？')}
              onConfirm={() => deleteAll.mutate()}
            >
              <Button danger loading={deleteAll.isPending}>
                {t('accounts.deleteAll', '清空')}
              </Button>
            </Popconfirm>
          </>
        }
      />

      <Table
        rowKey="accountId"
        loading={accounts.isLoading}
        dataSource={accounts.data?.accounts ?? []}
        columns={columns}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        expandable={{
          expandedRowRender: (row: Account) =>
            row.modelStats && Object.keys(row.modelStats).length > 0 ? (
              <Table
                size="small"
                rowKey={(m) => m.modelId ?? '-'}
                pagination={false}
                dataSource={Object.values(row.modelStats)}
                columns={[
                  { title: 'Model', dataIndex: 'modelId', key: 'modelId' },
                  {
                    title: t('accounts.usage', '调用次数'),
                    dataIndex: 'usageCount',
                    render: (v: number) => fmtNum(v),
                  },
                  { title: 'In', dataIndex: 'promptTokens', render: (v: number) => fmtNum(v) },
                  { title: 'Out', dataIndex: 'completionTokens', render: (v: number) => fmtNum(v) },
                  { title: 'Cached', dataIndex: 'cachedTokens', render: (v: number) => fmtNum(v) },
                ]}
              />
            ) : (
              <span style={{ color: '#999' }}>{t('accounts.noModelStats', '暂无分模型用量')}</span>
            ),
        }}
      />

      <AddAccountModal open={addOpen} onClose={() => setAddOpen(false)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      <OAuthModal open={oauthOpen} onClose={() => setOauthOpen(false)} />

      <Modal
        title={t('accounts.testResults', '账号测试结果')}
        open={testResults !== null}
        onCancel={() => setTestResults(null)}
        footer={null}
        width={640}
      >
        <Table
          size="small"
          rowKey="accountId"
          pagination={false}
          dataSource={testResults ?? []}
          columns={[
            { title: t('accounts.email', '邮箱'), dataIndex: 'email', key: 'email' },
            {
              title: t('accounts.ok', '结果'),
              dataIndex: 'ok',
              render: (ok: boolean) => (ok ? <Tag color="green">OK</Tag> : <Tag color="red">FAIL</Tag>),
            },
            {
              title: t('accounts.duration', '耗时'),
              dataIndex: 'durationMs',
              render: (v: number) => `${v}ms`,
            },
            {
              title: t('accounts.error', '错误'),
              dataIndex: 'error',
              render: (v: string) => (v ? <TypographyTextEllipsis text={v} /> : '-'),
            },
          ]}
        />
      </Modal>
    </>
  )
}

function TypographyTextEllipsis({ text }: { text: string }) {
  return (
    <Tooltip title={text}>
      <span style={{ display: 'inline-block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {text}
      </span>
    </Tooltip>
  )
}
