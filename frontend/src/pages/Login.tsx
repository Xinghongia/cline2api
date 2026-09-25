import { useState } from 'react'
import { Button, Form, Input, Typography, message } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

import { api } from '../api/client'

interface Props {
  onSuccess: () => void
}

export default function Login({ onSuccess }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)

  const submit = async (values: { password: string }) => {
    setLoading(true)
    try {
      await api.post('/login', { password: values.password })
      onSuccess()
    } catch (err) {
      void message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="c2a-login">
      <div className="c2a-glass" style={{ position: 'relative' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div className="c2a-logo" style={{ margin: '0 auto 14px', width: 48, height: 48, fontSize: 19, borderRadius: 14 }}>
            C2
          </div>
          <Typography.Title level={3} style={{ marginBottom: 4, fontFamily: 'var(--font-display)' }}>
            {t('app.title', 'Cline2API')}
          </Typography.Title>
          <Typography.Text type="secondary">{t('login.hint', '管理后台已启用密码保护')}</Typography.Text>
        </div>
        <Form onFinish={submit}>
          <Form.Item name="password" rules={[{ required: true, message: t('login.required', '请输入密码') }]}>
            <Input.Password
              prefix={<LockOutlined style={{ color: 'var(--ink-2)' }} />}
              placeholder={t('login.placeholder', '管理密码')}
              size="large"
              autoFocus
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            {t('login.submit', '登录')}
          </Button>
        </Form>
      </div>
    </div>
  )
}
