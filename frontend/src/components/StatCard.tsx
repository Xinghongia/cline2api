import type { ReactNode } from 'react'
import { Card } from 'antd'

import { useCountUp } from '../hooks/useCountUp'
import { fmtNum } from '../utils'

interface Props {
  icon: ReactNode
  label: string
  value: number
  /** 数字格式化，默认千分位取整；传 n => `${n}%` 之类可自定义 */
  format?: (n: number) => string
  footer?: ReactNode
}

/** 统计卡：微标签 + 等宽大数字（滚动动画）+ 图标徽章 + 底部信息 chips */
export default function StatCard({ icon, label, value, format, footer }: Props) {
  const animated = useCountUp(value)
  const fmt =
    format ??
    ((n: number) => (Number.isFinite(n) ? fmtNum(Math.round(n)) : '-'))

  return (
    <Card styles={{ body: { padding: '18px 20px' } }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="c2a-stat-label">{label}</div>
          <div className="c2a-stat-num" style={{ marginTop: 6 }}>
            {fmt(animated)}
          </div>
          {footer ? (
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>{footer}</div>
          ) : null}
        </div>
        <div className="c2a-stat-icon">{icon}</div>
      </div>
    </Card>
  )
}
