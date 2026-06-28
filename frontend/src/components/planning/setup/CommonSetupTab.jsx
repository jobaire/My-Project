import { Typography, Radio, App } from 'antd'
import { useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/planningUtils'

const { Text } = Typography

export default function CommonSetupTab({ token, active, onSaved }) {
  const { message } = App.useApp()
  const [settings, setSettings] = useState({ week_start: 1 })
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    if (active) apiFetch('/planning/settings', token).then(setSettings).catch(() => {})
  }, [active, token])

  const handleChange = async (key, value) => {
    setSaving(true)
    try {
      const updated = await apiFetch('/planning/settings', token, {
        method: 'PATCH',
        body: JSON.stringify({ [key]: value }),
      })
      setSettings(updated)
      onSaved?.()
    } catch (e) { message.error(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ padding: '16px 20px', maxWidth: 480 }}>
      <div style={{ marginBottom: 20 }}>
        <Text strong style={{ fontSize: 'var(--fs-sm)', display: 'block', marginBottom: 6 }}>Week Start Day</Text>
        <Radio.Group
          value={settings.week_start ?? 1}
          onChange={e => handleChange('week_start', e.target.value)}
          disabled={saving}
        >
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
            <Radio key={i} value={i} style={{ marginRight: 12 }}>{day}</Radio>
          ))}
        </Radio.Group>
        <Text style={{ fontSize: 'var(--fs-xs)', color: '#888', display: 'block', marginTop: 4 }}>
          Sets the first column of each week group in the Gantt header.
        </Text>
      </div>
    </div>
  )
}
