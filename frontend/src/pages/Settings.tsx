import { useEffect } from 'react'
import { Button, Card, Form, Input, Select, Space, Switch, Tag, message } from 'antd'
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { api } from '../api/client'
import type { AdminConfig } from '../api/types'
import PageHeader from '../components/PageHeader'

export default function Settings() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [form] = Form.useForm()

  const config = useQuery({
    queryKey: ['config'],
    queryFn: () => api.get<AdminConfig>('/config'),
  })
  const models = useQuery({
    queryKey: ['models'],
    queryFn: () => api.get<{ models: { id: string; cost?: string }[] }>('/models'),
  })

  useEffect(() => {
    if (config.data) {
      form.setFieldsValue({
        strategy: config.data.strategy,
        onlyFree: config.data.onlyFree,
        modelChain: config.data.modelChain ?? [],
        headers: Object.entries(config.data.headers ?? {}).map(([key, value]) => ({ key, value })),
        host: config.data.host,
      })
    }
  }, [config.data, form])

  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.post<{ restarting: boolean }>('/config/update', {
        strategy: values.strategy,
        onlyFree: values.onlyFree,
        modelChain: values.modelChain ?? [],
        headers: Object.fromEntries(
          ((values.headers as { key: string; value: string }[]) ?? [])
            .filter((h) => h.key && h.value)
            .map((h) => [h.key, h.value]),
        ),
        host: values.host,
      }),
    onSuccess: (r) => {
      void message.success(t('common.saved', '已保存，立即生效'))
      if (r.restarting) {
        void message.info(t('settings.restarting', '监听地址已变更，服务正在重启'))
      }
      void qc.invalidateQueries({ queryKey: ['config'] })
    },
    onError: (err) => void message.error(err.message),
  })

  if (config.isLoading || !config.data) return <Card loading />

  const hostOptions = [
    { value: '127.0.0.1', label: '127.0.0.1' },
    { value: '0.0.0.0', label: '0.0.0.0' },
    ...(config.data.localIPs ?? []).map((ip) => ({ value: ip, label: ip })),
  ]

  return (
    <>
      <PageHeader
        title={t('nav.settings', '设置')}
        subtitle={t('settings.subtitle', '轮询策略、上游请求头、免费链与监听地址')}
        extra={
          <Button type="primary" loading={save.isPending} onClick={() => form.submit()}>
            {t('common.save', '保存')}
          </Button>
        }
      />
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)} style={{ maxWidth: 860 }}>
        <Space size="large" wrap style={{ display: 'flex' }}>
          <Form.Item name="strategy" label={t('settings.strategy', '账号轮询策略')} tooltip={t('settings.strategyHint', 'round_robin：轮流；fill：用满一个再换；random：随机')}>
            <Select
              style={{ width: 180 }}
              options={[
                { value: 'round_robin', label: 'round_robin' },
                { value: 'fill', label: 'fill' },
                { value: 'random', label: 'random' },
              ]}
            />
          </Form.Item>
          <Form.Item name="onlyFree" label={t('settings.onlyFree', '仅使用免费模型')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="host" label={t('settings.host', '监听地址')} extra={t('settings.hostHint', '0.0.0.0 会将服务暴露到局域网，请确认网络安全')}>
            <Select style={{ width: 200 }} options={hostOptions} />
          </Form.Item>
        </Space>

        <Form.Item
          name="modelChain"
          label={t('settings.modelChain', '免费模型链（"free" 别名的回退顺序）')}
          extra={t('settings.chainHint', '按选择顺序作为回退链；留空使用内置默认链')}
        >
          <Select
            mode="multiple"
            placeholder={t('settings.chainPlaceholder', '依次选择模型（保留选择顺序）')}
            options={(models.data?.models ?? []).map((m) => ({ value: m.id, label: m.id }))}
          />
        </Form.Item>

        <Card size="small" title={t('settings.headers', 'Cline 上游请求头')} style={{ marginBottom: 16 }}>
          <Form.List name="headers">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Space key={field.key} style={{ display: 'flex' }} align="baseline">
                    <Form.Item name={[field.name, 'key']} noStyle>
                      <Input placeholder="Header" style={{ width: 220 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'value']} noStyle>
                      <Input placeholder="Value" style={{ width: 480 }} />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(field.name)} />
                  </Space>
                ))}
                <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => add()}>
                  {t('settings.addHeader', '添加请求头')}
                </Button>
              </>
            )}
          </Form.List>
          <p style={{ color: 'var(--ink-2)', marginTop: 8 }}>
            {t('settings.headersHint', '这些请求头会附加到发往 Cline 上游的请求；留空 Value 的行会被忽略。')}
          </p>
        </Card>

        <p>
          {t('settings.poolPath', '数据文件')}: <Tag style={{ fontFamily: 'monospace' }}>{config.data.poolPath}</Tag>
        </p>
      </Form>
    </>
  )
}
