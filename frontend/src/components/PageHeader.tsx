import type { ReactNode } from 'react'
import { Typography } from 'antd'

interface Props {
  title: string
  subtitle?: string
  extra?: ReactNode
}

export default function PageHeader({ title, subtitle, extra }: Props) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <Typography.Title level={3} style={{ marginBottom: subtitle ? 4 : 0, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
          {title}
        </Typography.Title>
        {subtitle ? <Typography.Text type="secondary">{subtitle}</Typography.Text> : null}
      </div>
      {extra ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{extra}</div> : null}
    </div>
  )
}
