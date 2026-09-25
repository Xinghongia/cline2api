import { useState } from 'react'
import { Button, Card, Form, Input, Typography, message } from 'antd'
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
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f5f7' }}>
      <Card style={{ width: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div className="c2a-logo" style={{ margin: '0 auto 10px', width: 44, height: 44, fontSize: 18 }}>
            C2
          </div>
          <Typography.Title level={4} style={{ marginBottom: 0 }}>
            {t('app.title', 'Cline2API')}
          </Typography.Title>
          <Typography.Text type="secondary">{t('login.hint', '管理后台已启用密码保护')}</Typography.Text>
        </div>
        <Form onFinish={submit}>
          <Form.Item name="password" rules={[{ required: true, message: t('login.required', '请输入密码') }]}>
            <Input.Password
              prefix={<LockOutlined />}
              placeholder={t('login.placeholder', '管理密码')}
              autoFocus
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            {t('login.submit', '登录')}
          </Button>
        </Form>
      </Card>
    </div>
  )
}
