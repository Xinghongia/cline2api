import { useState } from 'react'
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd'
import { CloudDownloadOutlined, PlusOutlined, SyncOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { api } from '../api/client'
import type { AdminConfig, AdminModel, ModelSyncResult, ModelsResp } from '../api/types'
import PageHeader from '../components/PageHeader'
import { fmtTime } from '../utils'

function syncResultMessage(t: (k: string, o?: Record<string, unknown>) => string, r: ModelSyncResult) {
  if (r.error) {
    void message.error(r.error)
    return
  }
  if (r.changed) {
    void message.success(
      t('models.syncChanged', {
        defaultValue: '同步完成：新增 {{added}}，移除 {{removed}}，共 {{total}} 个',
        added: r.added?.length ?? 0,
        removed: r.removed?.length ?? 0,
        total: r.total,
      }),
    )
  } else {
    void message.info(t('models.syncUnchanged', { defaultValue: '模型无变化（共 {{total}} 个）', total: r.total }))
  }
}

export default function Models() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [ctxEditing, setCtxEditing] = useState<AdminModel | null>(null)
  const [addForm] = Form.useForm()
  const [ctxForm] = Form.useForm()

  const models = useQuery({
    queryKey: ['models'],
    queryFn: () => api.get<ModelsResp>('/models'),
  })
  const config = useQuery({
    queryKey: ['config'],
    queryFn: () => api.get<AdminConfig>('/config'),
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['models'] })
    void qc.invalidateQueries({ queryKey: ['config'] })
  }

  const syncCline = useMutation({
    mutationFn: () => api.post<ModelSyncResult>('/models/sync'),
    onSuccess: (r) => {
      syncResultMessage(t, r)
      invalidate()
    },
    onError: (err) => void message.error(err.message),
  })
  const syncZen = useMutation({
    mutationFn: () => api.post<ModelSyncResult>('/opencode/models/sync'),
    onSuccess: (r) => {
      syncResultMessage(t, r)
      invalidate()
    },
    onError: (err) => void message.error(err.message),
  })
  const addModel = useMutation({
    mutationFn: (values: { id: string; provider?: string; cost?: string }) => api.post('/models/add', values),
    onSuccess: () => {
      void message.success(t('models.added', '模型已添加'))
      addForm.resetFields()
      setAddOpen(false)
      invalidate()
    },
    onError: (err) => void message.error(err.message),
  })
  const delModel = useMutation({
    mutationFn: (id: string) => api.post('/models/delete', { id }),
    onSuccess: () => {
      void message.success(t('models.deleted', '模型已删除'))
      invalidate()
    },
    onError: (err) => void message.error(err.message),
  })
  const setPrice = useMutation({
    mutationFn: (v: { id: string; priceIn: number; priceOut: number }) => api.post("/models/price", v),
    onError: (err) => void message.error(err.message),
  })
  const setCtx = useMutation({
    mutationFn: (values: { id: string; context: number; output: number }) => api.post('/models/context', values),
    onSuccess: () => {
      void message.success(t('models.ctxSaved', '上下文配置已保存'))
      setCtxEditing(null)
      invalidate()
    },
    onError: (err) => void message.error(err.message),
  })
  const setDefault = useMutation({
    mutationFn: (defaultModel: string) => api.post('/config/update', { defaultModel }),
    onSuccess: () => {
      void message.success(t('models.defaultSaved', '默认模型已保存'))
      invalidate()
    },
    onError: (err) => void message.error(err.message),
  })

  const dataSource = models.data?.models ?? []

  const columns = [
    {
      title: 'Model ID',
      dataIndex: 'id',
      key: 'id',
      render: (v: string, row: AdminModel) => (
        <Space size={6}>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span>
          {row.custom ? <Tag color="purple">{t('models.custom', '自定义')}</Tag> : null}
        </Space>
      ),
    },
    {
      title: t('models.provider', '提供商'),
      dataIndex: 'provider',
      key: 'provider',
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: t('models.cost', '计费'),
      dataIndex: 'cost',
      key: 'cost',
      width: 90,
      render: (v: string) => (
        <Tag color={v === 'free' ? 'green' : 'gold'}>{v === 'free' ? t('models.free', '免费') : v}</Tag>
      ),
    },
    {
      title: t('models.source', '来源'),
      dataIndex: 'source',
      key: 'source',
      width: 90,
      render: (v: string) => <Tag>{v || 'builtin'}</Tag>,
    },
    {
      title: t('models.context', '上下文/输出'),
      key: 'context',
      width: 140,
      render: (_: unknown, row: AdminModel) =>
        row.context || row.output ? `${row.context ?? '-'} / ${row.output ?? '-'}` : '-',
    },
    {
      title: t('models.priceCol', '单价'),
      key: 'price',
      width: 120,
      render: (_: unknown, row: AdminModel) => {
        const pr = models.data?.prices?.[row.id]
        return pr ? `$${pr.in} / $${pr.out}` : '-'
      },
    },
    {
      title: t('models.actions', '操作'),
      key: 'actions',
      width: 170,
      render: (_: unknown, row: AdminModel) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => {
            const pr = models.data?.prices?.[row.id] ?? { in: 0, out: 0 }
            ctxForm.setFieldsValue({ context: row.context, output: row.output, priceIn: pr.in, priceOut: pr.out })
            setCtxEditing(row)
          }}>
            {t('models.setContext', '上下文')}
          </Button>
          {row.custom ? (
            <Popconfirm title={t('models.deleteConfirm', '确认删除该自定义模型？')} onConfirm={() => delModel.mutate(row.id)}>
              <Button type="link" size="small" danger>
                {t('common.delete', '删除')}
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title={t('nav.models', '模型管理')}
        subtitle={t('models.subtitle', '启动时自动从 Cline / opencode 同步模型，也可手动维护')}
        extra={
          <>
            <Select
              size="middle"
              style={{ minWidth: 260 }}
              showSearch
              value={config.data?.defaultModel || undefined}
              placeholder={t('models.defaultModel', '默认模型')}
              onChange={(v) => setDefault.mutate(v)}
              loading={setDefault.isPending}
              options={dataSource.map((m) => ({ value: m.id, label: m.id }))}
            />
            <Button icon={<SyncOutlined />} loading={syncCline.isPending} onClick={() => syncCline.mutate()}>
              {t('models.syncCline', '从 Cline 同步')}
            </Button>
            <Button icon={<CloudDownloadOutlined />} loading={syncZen.isPending} onClick={() => syncZen.mutate()}>
              {t('models.syncZen', '从 Zen 同步')}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
              {t('models.add', '添加模型')}
            </Button>
          </>
        }
      />
      {models.data?.lastSync ? (
        <p style={{ color: '#999', marginTop: -8 }}>
          {t('models.lastSync', '上次同步')}: {fmtTime(models.data.lastSync.syncedAt)} · {t('models.total', '共')}{' '}
          {models.data.lastSync.total} {t('models.modelsUnit', '个')}
        </p>
      ) : null}
      <Table
        rowKey="id"
        size="small"
        loading={models.isLoading}
        dataSource={dataSource}
        columns={columns}
        pagination={{ pageSize: 25, showSizeChanger: false }}
      />

      <Modal
        title={t('models.add', '添加模型')}
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => addModel.mutate(addForm.getFieldsValue())}
        confirmLoading={addModel.isPending}
      >
        <Form form={addForm} layout="vertical" initialValues={{ cost: 'pass' }}>
          <Form.Item
            name="id"
            label="Model ID"
            rules={[{ required: true, message: t('models.idRequired', '请输入模型 ID') }]}
          >
            <Input placeholder="my-provider/gpt-x" />
          </Form.Item>
          <Form.Item name="provider" label={t('models.providerLabel', '提供商前缀（可选）')}>
            <Input placeholder="my-provider" />
          </Form.Item>
          <Form.Item name="cost" label={t('models.costLabel', '计费类型')}>
            <Select
              options={[
                { value: 'free', label: t('models.free', '免费') },
                { value: 'pass', label: 'pass' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`${t('models.setContext', '上下文')}: ${ctxEditing?.id ?? ''}`}
        open={ctxEditing !== null}
        onCancel={() => setCtxEditing(null)}
        onOk={() => {
          setCtx.mutate({
            id: ctxEditing!.id,
            context: Number(ctxForm.getFieldValue("context")) || 0,
            output: Number(ctxForm.getFieldValue("output")) || 0,
          })
          setPrice.mutate({
            id: ctxEditing!.id,
            priceIn: Number(ctxForm.getFieldValue("priceIn")) || 0,
            priceOut: Number(ctxForm.getFieldValue("priceOut")) || 0,
          })
        }}
        confirmLoading={setCtx.isPending}
      >
        <Form form={ctxForm} layout="vertical">
          <Form.Item name="context" label={t('models.contextTokens', '上下文窗口（0 = 恢复自动）')}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="output" label={t('models.outputTokens', '最大输出（0 = 恢复自动）')}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="priceIn" label={t("models.priceIn", "输入单价（USD / 1M tokens）")}>
            <InputNumber style={{ width: "100%" }} min={0} step={0.1} />
          </Form.Item>
          <Form.Item name="priceOut" label={t("models.priceOut", "输出单价（USD / 1M tokens）")}>
            <InputNumber style={{ width: "100%" }} min={0} step={0.1} />
          </Form.Item>
        </Form>
        <p style={{ color: '#999' }}>{t('models.ctxHint', '填 0 会解锁被远程同步锁定的元数据，恢复内置默认值。')}</p>
      </Modal>
    </>
  )
}
