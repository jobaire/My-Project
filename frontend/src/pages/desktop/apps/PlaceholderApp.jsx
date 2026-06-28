import { ToolOutlined } from '@ant-design/icons'
import { Typography } from 'antd'

const { Title, Text } = Typography

export default function PlaceholderApp({ title }) {
  return (
    <div
      style={{
        height: '100%',
        minHeight: 300,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 40,
        color: '#aaa',
      }}
    >
      <ToolOutlined style={{ fontSize: 44, color: '#d0d5dd' }} />
      <Title level={4} style={{ margin: 0, color: '#555' }}>{title}</Title>
      <Text type="secondary">This module is coming soon.</Text>
    </div>
  )
}
