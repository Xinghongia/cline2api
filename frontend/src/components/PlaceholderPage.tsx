import { Card, Typography } from 'antd'
import { useTranslation } from 'react-i18next'

interface Props {
  titleKey: string
}

// M1 功能对齐前，各页面先用此占位；实现时替换为真实页面组件。
export default function PlaceholderPage({ titleKey }: Props) {
  const { t } = useTranslation()
  return (
    <Card>
      <Typography.Title level={4}>{t(titleKey)}</Typography.Title>
      <Typography.Paragraph type="secondary">{t('placeholder.desc')}</Typography.Paragraph>
    </Card>
  )
}
