import { useEffect } from 'react'
import {
  Badge,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  message,
} from 'antd'
import { SyncOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { api } from '../api/client'
import type { ClineProxyConfig, ModelSyncResult, OpencodeConfig } from '../api/types'
import PageHeader from '../components/PageHeader'
import { fmtTime } from '../utils'

function linesToText(lines: string[] | undefined): string {
  return (lines ?? []).join('\n')
}

function textToLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')
}

function ZenTab() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [form] = Form.useForm()
  const oc = useQuery({
    queryKey: ['opencode-config'],
    queryFn: () => api.get<OpencodeConfig>('/opencode/config'),
  })

  useEffect(() => {
    if (oc.data) {
      form.setFieldsValue({
        ...oc.data,
        proxies: linesToText(oc.data.proxies),
      })
    }
  }, [oc.data, form])

  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) => api.post('/opencode/config/update', values),
    onSuccess: () => {
      void message.success(t('common.saved', '已保存，立即生效'))
      void qc.invalidateQueries({ queryKey: ['opencode-config'] })
    },
    onError: (err) => void message.error(err.message),
  })

  const syncModels = useMutation({
    mutationFn: () => api.post<ModelSyncResult>('/opencode/models/sync'),
    onSuccess: (r) => {
      if (r.error) void message.error(r.error)
      else void message.success(t('upstreams.zenSyncDone', '同步完成，共 {{total}} 个模型', { total: r.total }))
      void qc.invalidateQueries({ queryKey: ['opencode-config'] })
    },
    onError: (err) => void message.error(err.message),
  })

  if (oc.isLoading || !oc.data) return <Card loading />

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={(values) =>
        save.mutate({
          ...values,
          proxies: textToLines(values.proxies as string),
        })
      }
    >
      <Space style={{ marginBottom: 16 }} wrap>
        <Badge
          status={oc.data.runtime?.failoverActive ? 'error' : 'success'}
          text={
            oc.data.runtime?.failoverActive
              ? t('upstreams.failoverActive', '故障转移进行中（请求临时走 Cline 池）')
              : t('upstreams.normal', '运行正常')
          }
        />
        <Tag>
          {t('upstreams.syncedModels', '已同步模型')}: {oc.data.syncedModels ?? '-'}
        </Tag>
        <Tag>
          {t('models.lastSync', '上次同步')}: {fmtTime(oc.data.lastSync?.syncedAt)}
        </Tag>
        <Button icon={<SyncOutlined />} loading={syncModels.isPending} onClick={() => syncModels.mutate()}>
          {t('upstreams.syncModels', '同步 Zen 模型')}
        </Button>
      </Space>
      <Space size="large" wrap style={{ display: 'flex' }}>
        <Form.Item name="enabled" label={t('upstreams.zenEnabled', '启用 opencode Zen')} valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="key" label={t('upstreams.zenKey', 'API Key（免费层用 public）')}>
          <Input.Password style={{ width: 280 }} autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="baseURL" label="Base URL">
          <Input style={{ width: 320 }} />
        </Form.Item>
      </Space>
      <Space size="large" wrap style={{ display: 'flex' }}>
        <Form.Item name="maxConcurrency" label={t('upstreams.maxConcurrency', '最大并发')}>
          <InputNumber min={1} max={64} />
        </Form.Item>
        <Form.Item name="retries" label={t('upstreams.retries', '重试次数')}>
          <InputNumber min={0} max={10} />
        </Form.Item>
        <Form.Item name="failover" label={t('upstreams.failover', '故障转移')} valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="failoverCount" label={t('upstreams.failoverCount', '触发阈值（连续失败）')}>
          <InputNumber min={1} max={20} />
        </Form.Item>
        <Form.Item name="failoverMinutes" label={t('upstreams.failoverMinutes', '转移持续（分钟）')}>
          <InputNumber min={1} max={120} />
        </Form.Item>
      </Space>
      <Space size="large" wrap style={{ display: 'flex', alignItems: 'flex-start' }}>
        <Form.Item
          name="proxies"
          label={t('upstreams.proxies', '出口代理（每行一个）')}
          extra={t('upstreams.proxiesHint', '支持 http/https/socks5/socks5h，如 socks5://127.0.0.1:1080；留空直连')}
        >
          <Input.TextArea rows={4} style={{ width: 420, fontFamily: 'monospace' }} />
        </Form.Item>
        <Form.Item name="proxyStrategy" label={t('upstreams.proxyStrategy', '代理策略')}>
          <Select style={{ width: 160 }} options={[
            { value: 'round_robin', label: 'round_robin' },
            { value: 'random', label: 'random' },
            { value: 'fill', label: 'fill' },
          ]} />
        </Form.Item>
      </Space>
      {Object.keys(oc.data.proxyCooldowns ?? {}).length > 0 ? (
        <p>
          {t('upstreams.cooldowns', '冷却中的出口')}:{' '}
          {Object.entries(oc.data.proxyCooldowns ?? {}).map(([k, v]) => (
            <Tag key={k} color="orange">
              {k} → {fmtTime(v)}
            </Tag>
          ))}
        </p>
      ) : null}
      <Button type="primary" htmlType="submit" loading={save.isPending}>
        {t('common.save', '保存')}
      </Button>
    </Form>
  )
}

function ClineProxyTab() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [form] = Form.useForm()
  const cfg = useQuery({
    queryKey: ['cline-proxy-config'],
    queryFn: () => api.get<ClineProxyConfig>('/cline-proxy/config'),
  })

  useEffect(() => {
    if (cfg.data) {
      form.setFieldsValue({ ...cfg.data, proxies: linesToText(cfg.data.proxies) })
    }
  }, [cfg.data, form])

  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) => api.post('/cline-proxy/config/update', values),
    onSuccess: () => {
      void message.success(t('common.saved', '已保存，立即生效'))
      void qc.invalidateQueries({ queryKey: ['cline-proxy-config'] })
    },
    onError: (err) => void message.error(err.message),
  })

  if (cfg.isLoading || !cfg.data) return <Card loading />

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={(values) =>
        save.mutate({ proxies: textToLines(values.proxies as string), proxyStrategy: values.proxyStrategy })
      }
    >
      <p style={{ color: '#999', maxWidth: 720 }}>
        {t('upstreams.clineProxyIntro',
          '国内直连 api.cline.bot / api.workos.com 会命中跨区限制；配置出口代理池后，所有发往 Cline 的请求（对话、登录刷新、模型同步）经代理轮询出去。优先级：应用内代理 > 环境变量 HTTPS_PROXY > 直连。')}
      </p>
      <Space size="large" wrap style={{ display: 'flex', alignItems: 'flex-start' }}>
        <Form.Item name="proxies" label={t('upstreams.proxies', '出口代理（每行一个）')}>
          <Input.TextArea rows={5} style={{ width: 420, fontFamily: 'monospace' }} />
        </Form.Item>
        <Form.Item name="proxyStrategy" label={t('upstreams.proxyStrategy', '代理策略')}>
          <Select style={{ width: 160 }} options={[
            { value: 'round_robin', label: 'round_robin' },
            { value: 'random', label: 'random' },
            { value: 'fill', label: 'fill' },
          ]} />
        </Form.Item>
      </Space>
      <Button type="primary" htmlType="submit" loading={save.isPending}>
        {t('common.save', '保存')}
      </Button>
    </Form>
  )
}

export default function Upstreams() {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t('nav.upstreams', '上游服务')} subtitle={t('upstreams.subtitle', 'opencode Zen 与 Cline 出口代理配置')} />
      <Tabs
        items={[
          { key: 'zen', label: 'opencode Zen', children: <ZenTab /> },
          { key: 'clineproxy', label: t('upstreams.clineProxy', 'Cline 出口代理'), children: <ClineProxyTab /> },
        ]}
      />
    </>
  )
}
