import { SettingOutlined } from '@ant-design/icons'
import { Typography } from 'antd'

const { Text } = Typography

export default function SetupPlaceholder({ title, description }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 40px', minHeight: 320 }}>
      <SettingOutlined style={{ fontSize: 36, color: '#c8d8e4', marginBottom: 14 }} />
      <Text strong style={{ fontSize: 14, color: '#4a6e7e', marginBottom: 6 }}>{title}</Text>
      <Text style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-text-placeholder)', textAlign: 'center', maxWidth: 300 }}>{description}</Text>
      <div style={{ marginTop: 16, padding: '3px 14px', borderRadius: 12, background: '#eef5f8', fontSize: 'var(--fs-xs)', color: '#6a8a98', fontWeight: 600 }}>Coming soon</div>
    </div>
  )
}
