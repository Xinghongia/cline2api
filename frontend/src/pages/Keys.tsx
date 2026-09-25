import { useState } from 'react'
import { Button, Card, Input, Modal, Popconfirm, Space, Table, Typography, message } from 'antd'
import { CopyOutlined, KeyOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { api } from '../api/client'
import type { AdminConfig } from '../api/types'
import PageHeader from '../components/PageHeader'
import { copyText } from '../utils'

export default function Keys() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [genOpen, setGenOpen] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [pwdOpen, setPwdOpen] = useState(false)
  const [pwd, setPwd] = useState('')

  const keys = useQuery({
    queryKey: ['keys'],
    queryFn: () => api.get<{ keys: string[] }>('/keys'),
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
    mutationFn: () => api.post<{ key: string }>('/keys/generate'),
    onSuccess: (r) => {
      setNewKey(r.key)
      setGenOpen(true)
      void qc.invalidateQueries({ queryKey: ['keys'] })
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

  return (
    <>
      <PageHeader
        title={t('nav.keys', '密钥与安全')}
        subtitle={t('keys.subtitle', '保护 /v1 代理端点的 API Key 与管理后台密码')}
        extra={
          <>
            <Button type="primary" icon={<PlusOutlined />} loading={generate.isPending} onClick={() => generate.mutate()}>
              {t('keys.generate', '生成 API Key')}
            </Button>
            <Button icon={<KeyOutlined />} onClick={() => setPwdOpen(true)}>
              {t('keys.password', '管理密码')}
            </Button>
          </>
        }
      />

      <Card title={t('keys.list', 'API Key 列表')} size="small">
        <Table
          rowKey={(k) => k}
          loading={keys.isLoading}
          dataSource={keys.data?.keys ?? []}
          pagination={false}
          locale={{ emptyText: t('keys.empty', '暂无 API Key —— 未配置任何 Key 时 /v1 端点无需鉴权，建议生成') }}
          columns={[
            {
              title: 'API Key',
              key: 'key',
              render: (k: string) => (
                <Space>
                  <Typography.Text code copyable={false} style={{ fontSize: 12 }}>
                    {k.slice(0, 14)}…{k.slice(-6)}
                  </Typography.Text>
                  <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => void copyText(k)} />
                </Space>
              ),
            },
            {
              title: t('models.actions', '操作'),
              key: 'actions',
              width: 120,
              render: (k: string) => (
                <Popconfirm title={t('keys.deleteConfirm', '确认删除该 Key？使用它的客户端将立即失效')} onConfirm={() => del.mutate(k)}>
                  <Button type="link" size="small" danger>
                    {t('common.delete', '删除')}
                  </Button>
                </Popconfirm>
              ),
            },
          ]}
        />
        <p style={{ color: '#999', marginTop: 12 }}>
          {t('keys.usage', '客户端用法：Header x-api-key 或 Authorization: Bearer <key>；Base URL: http://<host>:3457/v1')}
        </p>
      </Card>

      <Modal
        title={t('keys.generated', 'API Key 已生成')}
        open={genOpen}
        onCancel={() => setGenOpen(false)}
        footer={<Button type="primary" onClick={() => setGenOpen(false)}>{t('common.close', '关闭')}</Button>}
      >
        <p>{t('keys.onlyOnce', '请立即复制保存（关闭后仍可在列表中查看完整 Key）：')}</p>
        <Space.Compact style={{ width: '100%' }}>
          <Input value={newKey} readOnly />
          <Button icon={<CopyOutlined />} onClick={() => void copyText(newKey)} />
        </Space.Compact>
      </Modal>

      <Modal
        title={t('keys.password', '管理后台密码')}
        open={pwdOpen}
        onCancel={() => setPwdOpen(false)}
        onOk={() => setPassword.mutate(pwd)}
        confirmLoading={setPassword.isPending}
      >
        <p>
          {t('keys.pwdState', '当前状态')}: {config.data?.hasPassword ? t('keys.pwdOn', '已启用') : t('keys.pwdOff', '未设置（后台无鉴权）')}
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
