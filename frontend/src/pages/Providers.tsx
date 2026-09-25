import { useState } from 'react'
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd'
import { ApiOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { api } from '../api/client'
import type { CustomProvider, ProviderPreset, ProviderTestResult } from '../api/types'
import PageHeader from '../components/PageHeader'
import { fmtTime } from '../utils'

const EMPTY: CustomProvider = {
  id: '',
  name: '',
  baseURL: '',
  apiKey: '',
  protocol: 'openai',
  modelIds: [],
  modelMapping: {},
  headers: {},
  enabled: true,
  priority: 100,
  timeoutSec: 300,
  free: false,
}

function ProviderEditor(props: {
  open: boolean
  initial: CustomProvider
  presets: ProviderPreset[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [form] = Form.useForm()
  const [testing, setTesting] = useState(false)
  const formValue = Form.useWatch([], form)

  // 把映射编辑行合并为 modelMapping 对象
  const buildPayload = (): CustomProvider => {
    const v = form.getFieldsValue() as CustomProvider & { modelMappingPairs?: { from: string; to: string }[] }
    const mapping: Record<string, string> = {}
    for (const pair of v.modelMappingPairs ?? []) {
      if (pair?.from && pair?.to) mapping[pair.from] = pair.to
    }
    const { modelMappingPairs: _pairs, ...rest } = v
    return { ...rest, modelMapping: mapping }
  }

  const save = useMutation({
    mutationFn: (values: CustomProvider) => api.post<{ provider: CustomProvider }>('/providers/save', values),
    onSuccess: () => {
      void message.success(t('providers.saved', '提供商已保存'))
      void qc.invalidateQueries({ queryKey: ['providers'] })
      props.onClose()
    },
    onError: (err) => void message.error(err.message),
  })

  const test = async () => {
    const values = buildPayload()
    if (!values.baseURL || !values.modelIds?.length) {
      void message.warning(t('providers.testNeedFields', '测试需要 baseURL 和至少一个模型'))
      return
    }
    setTesting(true)
    try {
      // 先暂存再测试：保证测的是表单里的当前值
      const saved = await api.post<{ provider: CustomProvider }>('/providers/save', {
        ...EMPTY,
        ...values,
        id: values.id || `prov-${Date.now()}`,
      })
      const r = await api.post<ProviderTestResult>('/providers/test', { id: saved.provider.id })
      if (r.ok) {
        void message.success(
          t('providers.testOk', '测试通过（{{ms}}ms，入 {{in}} / 出 {{out}} tokens）', {
            defaultValue: '测试通过（{{ms}}ms，入 {{in}} / 出 {{out}} tokens）',
            ms: r.durationMs,
            in: r.inputTokens ?? '-',
            out: r.outputTokens ?? '-',
          }),
        )
      } else {
        void message.error(r.error || t('providers.testFail', '测试失败'))
      }
    } catch (err) {
      void message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setTesting(false)
    }
  }

  return (
    <Modal
      title={props.initial.id ? t('providers.edit', '编辑提供商') : t('providers.add', '添加提供商')}
      open={props.open}
      onCancel={props.onClose}
      onOk={() => save.mutate(buildPayload())}
      confirmLoading={save.isPending}
      width={640}
      footer={
        <Space>
          <Button onClick={props.onClose}>{t('common.cancel', '取消')}</Button>
          <Button loading={testing} onClick={() => void test()}>
            {t('providers.test', '测试连通性')}
          </Button>
          <Button type="primary" loading={save.isPending} onClick={() => save.mutate(buildPayload())}>
            {t('common.save', '保存')}
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" initialValues={props.initial}>
        <Space style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <Form.Item name="enabled" label={t('providers.enabled', '启用')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="free" label={t('providers.free', '免费来源')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            name="presetApply"
            label={t('providers.preset', '应用预设')}
            style={{ minWidth: 220 }}
          >
            <Select
              allowClear
              placeholder={t('providers.presetPlaceholder', '选择上游预设自动填充')}
              options={props.presets.map((p) => ({ value: p.key, label: p.name }))}
              onChange={(key) => {
                const p = props.presets.find((x) => x.key === key)
                if (p) {
                  form.setFieldsValue({
                    name: p.name,
                    baseURL: p.baseURL,
                    protocol: p.protocol || 'openai',
                    headers: p.headers ?? {},
                  })
                  if (p.notes) void message.info(p.notes)
                }
              }}
            />
          </Form.Item>
        </Space>
        <Form.Item name="id" hidden>
          <Input />
        </Form.Item>
        <Form.Item name="name" label={t('providers.name', '名称')} rules={[{ required: true }]}>
          <Input placeholder="OpenRouter / DeepSeek / 本机 Ollama" />
        </Form.Item>
        <Form.Item
          name="baseURL"
          label="Base URL"
          rules={[{ required: true }]}
          extra={t('providers.baseURLHint', 'OpenAI 兼容地址，如 https://openrouter.ai/api/v1')}
        >
          <Input placeholder="https://api.example.com/v1" />
        </Form.Item>
        <Form.Item name="apiKey" label="API Key">
          <Input.Password placeholder="sk-..." autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="protocol"
          label={t('providers.protocol', '上游协议')}
          extra={t('providers.protocolHint', 'anthropic 协议自动完成请求/响应/SSE 双向转换')}
        >
          <Select
            options={[
              { value: 'openai', label: 'OpenAI 兼容 (/chat/completions)' },
              { value: 'anthropic', label: 'Anthropic (/v1/messages)' },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="modelIds"
          label={t('providers.modelIds', '模型 ID 列表')}
          extra={t('providers.modelIdsHint', '回车确认添加；这些模型将出现在 /v1/models 并可被路由')}
          rules={[{ required: true }]}
        >
          <Select mode="tags" open={false} tokenSeparators={[',']} placeholder="gpt-4o, deepseek-chat" />
        </Form.Item>
        <Form.List name="modelMappingPairs">
          {(fields, { add, remove }) => (
            <>
              <p style={{ marginBottom: 4 }}>{t('providers.mapping', '模型映射（可选）')}</p>
              {fields.map((field) => (
                <Space key={field.key} style={{ display: 'flex' }} align="baseline">
                  <Form.Item name={[field.name, 'from']} noStyle>
                    <Input placeholder={t('providers.mappingFrom', '对外 ID')} style={{ width: 180 }} />
                  </Form.Item>
                  <span>→</span>
                  <Form.Item name={[field.name, 'to']} noStyle>
                    <Input placeholder={t('providers.mappingTo', '上游真实 ID')} style={{ width: 220 }} />
                  </Form.Item>
                  <Button type="text" danger onClick={() => remove(field.name)}>
                    ✕
                  </Button>
                </Space>
              ))}
              <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => add()}>
                {t('providers.addMapping', '添加映射')}
              </Button>
            </>
          )}
        </Form.List>
        <Space size="large">
          <Form.Item name="priority" label={t('providers.priority', '优先级（小者优先）')}>
            <InputNumber min={1} max={9999} />
          </Form.Item>
          <Form.Item name="timeoutSec" label={t('providers.timeout', '超时（秒）')}>
            <InputNumber min={10} max={3600} />
          </Form.Item>
        </Space>
        <Form.List name="headers">
          {(fields, { add, remove }) => (
            <>
              <p style={{ marginBottom: 4 }}>{t('providers.headers', '自定义请求头')}</p>
              {fields.map((field) => (
                <Space key={field.key} style={{ display: 'flex' }} align="baseline">
                  <Form.Item name={[field.name, 'key']} noStyle>
                    <Input placeholder="Header" style={{ width: 200 }} />
                  </Form.Item>
                  <Form.Item name={[field.name, 'value']} noStyle>
                    <Input placeholder="Value" style={{ width: 320 }} />
                  </Form.Item>
                  <Button type="text" danger onClick={() => remove(field.name)}>
                    ✕
                  </Button>
                </Space>
              ))}
              <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => add()}>
                {t('providers.addHeader', '添加请求头')}
              </Button>
            </>
          )}
        </Form.List>
        <p style={{ color: '#999', marginTop: 12 }}>
          {formValue?.modelIds?.length ?? 0} {t('providers.modelsCount', '个模型')}
        </p>
      </Form>
    </Modal>
  )
}

export default function Providers() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<CustomProvider | null>(null)

  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: () => api.get<{ providers: CustomProvider[]; cooldowns: Record<string, string> }>("/providers"),
  })
  const presets = useQuery({
    queryKey: ['provider-presets'],
    queryFn: () => api.get<{ presets: ProviderPreset[] }>('/providers/presets'),
  })

  const del = useMutation({
    mutationFn: (id: string) => api.post('/providers/delete', { id }),
    onSuccess: () => {
      void message.success(t('providers.deleted', '已删除'))
      void qc.invalidateQueries({ queryKey: ['providers'] })
    },
    onError: (err) => void message.error(err.message),
  })
  const testOne = useMutation({
    mutationFn: (id: string) => api.post<ProviderTestResult>('/providers/test', { id }),
    onSuccess: (r) => {
      if (r.ok) {
        void message.success(
          t('providers.testOk', {
            defaultValue: '测试通过（{{ms}}ms，入 {{in}} / 出 {{out}} tokens）',
            ms: r.durationMs,
            in: r.inputTokens ?? '-',
            out: r.outputTokens ?? '-',
          }),
        )
      } else {
        void message.error(r.error || t('providers.testFail', '测试失败'))
      }
    },
    onError: (err) => void message.error(err.message),
  })
  const toggle = useMutation({
    mutationFn: (p: CustomProvider) => api.post('/providers/save', { ...p, enabled: !p.enabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['providers'] }),
    onError: (err) => void message.error(err.message),
  })

  const columns = [
    {
      title: t('providers.name', '名称'),
      dataIndex: 'name',
      key: 'name',
      render: (v: string, row: CustomProvider) => (
        <Space size={6}>
          <span>{v}</span>
          <Tag color={row.protocol === 'anthropic' ? 'purple' : 'blue'}>
            {row.protocol === 'anthropic' ? 'anthropic' : 'openai'}
          </Tag>
          {row.free ? <Tag color="green">{t('models.free', '免费')}</Tag> : null}
          {(() => {
            const cooling = Object.entries(providers.data?.cooldowns ?? {}).filter(([k]) => k.startsWith(row.id + ':'))
            if (cooling.length === 0) return null
            return (
              <Tooltip title={cooling.map(([k, v]) => `${k} → ${fmtTime(v)}`).join('\n')}>
                <Tag color="orange">{t('providers.cooling', '冷却')} {cooling.length}</Tag>
              </Tooltip>
            )
          })()}
        </Space>
      ),
    },
    {
      title: 'Base URL',
      dataIndex: 'baseURL',
      key: 'baseURL',
      render: (v: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{v}</span>
      ),
    },
    {
      title: t('providers.models', '模型数'),
      dataIndex: 'modelIds',
      key: 'modelIds',
      width: 90,
      render: (v: string[]) => v?.length ?? 0,
    },
    { title: t('providers.priority', '优先级'), dataIndex: 'priority', key: 'priority', width: 80 },
    {
      title: t('providers.enabled', '启用'),
      dataIndex: 'enabled',
      key: 'enabled',
      width: 90,
      render: (_: boolean, row: CustomProvider) => (
        <Switch size="small" checked={row.enabled} onChange={() => toggle.mutate(row)} />
      ),
    },
    {
      title: t('models.actions', '操作'),
      key: 'actions',
      width: 200,
      render: (_: unknown, row: CustomProvider) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            icon={<ApiOutlined />}
            loading={testOne.isPending}
            onClick={() => testOne.mutate(row.id)}
          >
            {t('providers.test', '测试')}
          </Button>
          <Button type="link" size="small" onClick={() => setEditing(row)}>
            {t('common.edit', '编辑')}
          </Button>
          <Popconfirm title={t('providers.deleteConfirm', '确认删除该提供商？')} onConfirm={() => del.mutate(row.id)}>
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
        title={t('nav.providers', '提供商')}
        subtitle={t('providers.subtitle', '自定义 OpenAI 兼容上游；命中其模型列表时优先于 Cline 账号池使用')}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ ...EMPTY })}>
            {t('providers.add', '添加提供商')}
          </Button>
        }
      />
      <Table
        rowKey="id"
        loading={providers.isLoading}
        dataSource={providers.data?.providers ?? []}
        columns={columns}
        pagination={false}
        locale={{ emptyText: t('providers.empty', '暂无自定义提供商') }}
      />
      {editing ? (
        <ProviderEditor
          open
          initial={editing}
          presets={presets.data?.presets ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  )
}
