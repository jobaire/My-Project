import { ClockCircleOutlined } from '@ant-design/icons'
import { Empty, Spin, Tag, Timeline, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { fetchAuditLog } from '../services/audit'

const { Text } = Typography

const ACTION_COLOR = {
  create: 'green',
  update: 'blue',
  delete: 'red',
  reorder: 'orange',
}

// Human-readable label for sub-entity tables shown in aggregate history views
const TABLE_LABEL = {
  style_version_steps: 'Routing Step',
  style_versions: 'Version',
  product_color_sizes: 'Color-Size',
  brands: 'Brand',
}

function fieldLabel(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function displayVal(v) {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function Diff({ action, oldData, newData, tableName }) {
  if (action === 'create') {
    const entries = Object.entries(newData || {}).filter(
      ([k, v]) => k !== 'id' && !k.endsWith('_id') && v != null && v !== ''
    )
    if (!entries.length)
      return <Text type="secondary" style={{ fontSize: 11 }}>Created</Text>
    return (
      <div>
        {entries.map(([k, v]) => (
          <div key={k} style={{ fontSize: 11, marginBottom: 1 }}>
            <Text style={{ color: '#555', fontWeight: 500 }}>{fieldLabel(k)}: </Text>
            <Text style={{ color: '#1677ff' }}>{displayVal(v)}</Text>
          </div>
        ))}
      </div>
    )
  }
  if (action === 'delete') {
    const name = oldData?.name ?? oldData?.process_name ?? (oldData?.id ? `ID ${oldData.id}` : null)
    return <Text type="secondary" style={{ fontSize: 11 }}>Deleted{name ? `: ${name}` : ''}</Text>
  }
  if (action === 'reorder') {
    return <Text type="secondary" style={{ fontSize: 11 }}>Steps reordered</Text>
  }
  if (action === 'update' && oldData && newData) {
    const nameFields = new Set(
      Object.keys(newData)
        .filter((k) => k.endsWith('_name'))
        .map((k) => k.replace('_name', '_id'))
    )
    const changed = Object.keys(newData).filter((k) => {
      if (k === 'id' || nameFields.has(k)) return false
      return JSON.stringify(oldData[k] ?? null) !== JSON.stringify(newData[k] ?? null)
    })
    if (!changed.length)
      return <Text type="secondary" style={{ fontSize: 11 }}>No field changes recorded</Text>
    return (
      <div>
        {changed.map((k) => (
          <div key={k} style={{ fontSize: 11, marginBottom: 1 }}>
            <Text style={{ color: '#555', fontWeight: 500 }}>{fieldLabel(k)}: </Text>
            <Text delete style={{ color: '#aaa' }}>{displayVal(oldData[k])}</Text>
            <Text style={{ color: '#999' }}> → </Text>
            <Text style={{ color: '#1677ff' }}>{displayVal(newData[k])}</Text>
          </div>
        ))}
      </div>
    )
  }
  return null
}

export default function AuditLogTab({ table, recordId, token, active, fetchFn }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!active) return
    if (!fetchFn && !recordId) return
    setLoading(true)
    const fetch = fetchFn
      ? fetchFn(token)
      : fetchAuditLog(token, table, recordId)
    fetch
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [table, recordId, token, active, fetchFn])

  if (!fetchFn && !recordId)
    return <div style={{ padding: 24, color: '#999', fontSize: 12 }}>Save the record first to see its history.</div>

  if (loading)
    return <div style={{ padding: 24, textAlign: 'center' }}><Spin size="small" /></div>

  if (!entries.length)
    return <Empty description="No history yet" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 24 }} />

  return (
    <div style={{ paddingTop: 12, paddingLeft: 4, maxHeight: 340, overflowY: 'auto' }}>
      <Timeline
        items={entries.map((e) => ({
          color: ACTION_COLOR[e.action] ?? 'gray',
          dot: <ClockCircleOutlined style={{ fontSize: 11 }} />,
          children: (
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                <Tag
                  color={ACTION_COLOR[e.action] ?? 'default'}
                  style={{ fontSize: 10, lineHeight: '16px', padding: '0 5px', margin: 0 }}
                >
                  {e.action.toUpperCase()}
                </Tag>
                {TABLE_LABEL[e.table_name] && (
                  <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 5px', margin: 0, background: '#f0f0f0', border: '1px solid #d9d9d9', color: '#555' }}>
                    {TABLE_LABEL[e.table_name]}
                  </Tag>
                )}
                <Text style={{ fontSize: 11, fontWeight: 500 }}>{e.actor_email ?? 'system'}</Text>
                <Text type="secondary" style={{ fontSize: 10 }}>
                  {new Date(e.changed_at).toLocaleString()}
                </Text>
              </div>
              <Diff action={e.action} oldData={e.old_data} newData={e.new_data} tableName={e.table_name} />
            </div>
          ),
        }))}
      />
    </div>
  )
}
