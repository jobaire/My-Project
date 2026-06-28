import { DeleteOutlined, PlusOutlined, ScheduleOutlined } from '@ant-design/icons'
import { Button, Input, InputNumber, Popconfirm, Space, Typography, App } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/planningUtils'

const { Text } = Typography

export default function LearningCurvesTab({ token, active }) {
  const { message } = App.useApp()
  const [presets,      setPresets]      = useState([])
  const [selectedId,   setSelectedId]   = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [addingPreset, setAddingPreset] = useState(false)
  const [newName,      setNewName]      = useState('')
  const [editName,     setEditName]     = useState('')
  const [stages,       setStages]       = useState([])

  const selectedPreset = presets.find(p => p.id === selectedId) ?? null

  const loadPresets = useCallback(() =>
    apiFetch('/planning/learning-curves', token).then(setPresets).catch(() => {}),
  [token])

  useEffect(() => { if (active) loadPresets() }, [active, loadPresets])

  useEffect(() => {
    if (selectedPreset) {
      setEditName(selectedPreset.name)
      setStages((selectedPreset.stages || []).map(s => ({ ...s })))
    } else {
      setEditName('')
      setStages([])
    }
  }, [selectedId]) // eslint-disable-line

  const handleCreate = async () => {
    if (!newName.trim()) return
    setAddingPreset(true)
    try {
      const p = await apiFetch('/planning/learning-curves', token, {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), stages: [] }),
      })
      await loadPresets()
      setSelectedId(p.id)
      setNewName('')
    } catch (e) { message.error(e.message) }
    finally { setAddingPreset(false) }
  }

  const handleSave = async () => {
    if (!selectedId) return
    setSaving(true)
    try {
      await apiFetch(`/planning/learning-curves/${selectedId}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName, stages }),
      })
      await loadPresets()
      message.success('Saved')
    } catch (e) { message.error(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    await apiFetch(`/planning/learning-curves/${id}`, token, { method: 'DELETE' })
    if (selectedId === id) setSelectedId(null)
    await loadPresets()
  }

  const addStage = () => {
    const nextDay = stages.length ? Math.max(...stages.map(s => s.day_number)) + 1 : 1
    setStages(prev => [...prev, { day_number: nextDay, efficiency_pct: 100 }])
  }

  const updateStage = (idx, field, val) => {
    setStages(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s))
  }

  return (
    <div style={{ display: 'flex', minHeight: 400 }}>
      <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid #e8eef2', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid #e8eef2' }}>
          <Input.Search
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="New preset name…"
            enterButton={<PlusOutlined />}
            size="small"
            onSearch={handleCreate}
            loading={addingPreset}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {presets.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#bbb', fontSize: 'var(--fs-sm)' }}>
              No presets.<br />Enter a name above to create one.
            </div>
          )}
          {presets.map(p => (
            <div
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              style={{ padding: '9px 10px', cursor: 'pointer', background: selectedId === p.id ? '#e6f7f5' : 'transparent', borderLeft: `3px solid ${selectedId === p.id ? 'var(--c-teal)' : 'transparent'}`, borderBottom: '1px solid #f0f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}
            >
              <div style={{ minWidth: 0 }}>
                <Text strong style={{ fontSize: 'var(--fs-sm)', display: 'block', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.name}</Text>
                <Text style={{ fontSize: 'var(--fs-2xs)', color: '#888' }}>{p.stages?.length ?? 0} stages</Text>
              </div>
              <Popconfirm title="Delete this preset?" onConfirm={e => { e.stopPropagation(); handleDelete(p.id) }} okButtonProps={{ danger: true }}>
                <Button size="small" type="text" icon={<DeleteOutlined />} danger onClick={e => e.stopPropagation()} />
              </Popconfirm>
            </div>
          ))}
        </div>
      </div>

      {!selectedPreset ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6, color: '#bbb' }}>
          <ScheduleOutlined style={{ fontSize: 28 }} />
          <Text style={{ fontSize: 'var(--fs-sm)', color: '#bbb' }}>Select a preset to edit</Text>
        </div>
      ) : (
        <div style={{ flex: 1, padding: '14px 18px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
            <Input value={editName} onChange={e => setEditName(e.target.value)} size="small" style={{ maxWidth: 220 }} />
            <Button type="primary" size="small" loading={saving} onClick={handleSave}>Save</Button>
          </div>
          <Text strong style={{ fontSize: 'var(--fs-sm)', display: 'block', marginBottom: 4 }}>Efficiency Stages</Text>
          <Text style={{ fontSize: 'var(--fs-xs)', color: '#888', display: 'block', marginBottom: 10 }}>
            Day 1 = first working day of the order. Days after the last stage use 100%.
          </Text>
          {stages.map((s, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 'var(--fs-xs)', color: '#888', width: 30, flexShrink: 0 }}>Day</span>
              <InputNumber value={s.day_number} onChange={v => updateStage(idx, 'day_number', v)} min={1} max={365} size="small" style={{ width: 60 }} />
              <span style={{ fontSize: 'var(--fs-xs)', color: '#888' }}>→</span>
              <InputNumber value={s.efficiency_pct} onChange={v => updateStage(idx, 'efficiency_pct', v)} min={1} max={100} step={5} size="small" style={{ width: 70 }} suffix="%" />
              <Button size="small" type="text" icon={<DeleteOutlined />} danger onClick={() => setStages(prev => prev.filter((_, i) => i !== idx))} />
            </div>
          ))}
          <Space style={{ marginTop: 8 }}>
            <Button size="small" icon={<PlusOutlined />} onClick={addStage}>Add Stage</Button>
            <Button type="primary" size="small" loading={saving} onClick={handleSave}>Save Stages</Button>
          </Space>
        </div>
      )}
    </div>
  )
}
