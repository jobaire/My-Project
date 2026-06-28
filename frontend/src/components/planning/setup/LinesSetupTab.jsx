import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { Button, Form, Input, InputNumber, Popconfirm, Select, Typography, App } from 'antd'
import { Fragment, useEffect, useState } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { apiFetch } from '../../../utils/planningUtils'

const { Text } = Typography

export default function LinesSetupTab({ token, active, onSaved }) {
  const { message } = App.useApp()
  const [lines,      setLines]      = useState([])
  const [calendars,  setCalendars]  = useState([])
  const [planUnits,  setPlanUnits]  = useState([])
  const [form]       = Form.useForm()
  const [saving,     setSaving]     = useState(false)
  const [dragId,     setDragId]     = useState(null)
  const [editingId,  setEditingId]  = useState(null)
  const [editVals,   setEditVals]   = useState({})

  const sortSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const reload = () => Promise.all([
    apiFetch('/planning/lines', token),
    apiFetch('/planning/calendars', token),
    apiFetch('/planning/plan-units', token),
  ]).then(([l, c, u]) => { setLines(l); setCalendars(c); setPlanUnits(u) }).catch(() => {})

  useEffect(() => { if (active) reload() }, [active])

  const patchLine = async (id, fields) => {
    try {
      await apiFetch(`/planning/lines/${id}`, token, { method: 'PATCH', body: JSON.stringify(fields) })
      await reload(); onSaved()
    } catch (e) { message.error(e.message) }
  }

  const handleAdd = async (values) => {
    setSaving(true)
    try {
      await apiFetch('/planning/lines', token, { method: 'POST', body: JSON.stringify(values) })
      form.resetFields(); await reload(); onSaved()
    } catch (e) { message.error(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    try { await apiFetch(`/planning/lines/${id}`, token, { method: 'DELETE' }); await reload(); onSaved() }
    catch (e) { message.error(e.message) }
  }

  const handleSortEnd = async ({ active, over }) => {
    setDragId(null)
    if (!over || active.id === over.id) return
    const activeL = lines.find(l => l.id === active.id)
    const overL   = lines.find(l => l.id === over.id)
    if (!activeL || !overL || activeL.plan_unit_id !== overL.plan_unit_id) return
    const oldIdx = lines.findIndex(l => l.id === active.id)
    const newIdx = lines.findIndex(l => l.id === over.id)
    const reordered = arrayMove(lines, oldIdx, newIdx)
    setLines(reordered)
    try {
      await Promise.all(reordered.map((l, i) =>
        apiFetch(`/planning/lines/${l.id}`, token, { method: 'PATCH', body: JSON.stringify({ display_order: i }) })
      ))
      onSaved()
    } catch (e) { message.error(e.message); reload() }
  }

  const handleAddSubtotal = async (unitId) => {
    if (lines.some(l => l.is_subtotal && l.plan_unit_id === unitId)) return
    try {
      await apiFetch('/planning/lines', token, {
        method: 'POST',
        body: JSON.stringify({ plan_unit_id: unitId, is_subtotal: true, name: 'Subtotal', machines_count: 0, display_order: 9999 })
      })
      await reload(); onSaved()
    } catch (e) { message.error(e.message) }
  }

  const startEdit = (line) => {
    setEditingId(line.id)
    setEditVals({ name: line.name, machines_count: line.machines_count, external_id: line.external_id ?? '', plan_unit_id: line.plan_unit_id ?? null, calendar_id: line.calendar_id ?? null })
  }
  const saveEdit = async () => { await patchLine(editingId, editVals); setEditingId(null) }
  const cancelEdit = () => setEditingId(null)

  const activeLines = lines.filter(l => l.is_active)
  const nonSubLines = activeLines.filter(l => !l.is_subtotal)
  const knownIds  = planUnits.map(u => u.id)
  const extraIds  = [...new Set(nonSubLines.map(l => l.plan_unit_id ?? null).filter(id => !knownIds.includes(id)))]
  const groups = [...knownIds, ...extraIds]
    .map(uid => ({
      unitId:   uid,
      unit:     planUnits.find(u => u.id === uid),
      lines:    nonSubLines.filter(l => l.plan_unit_id === uid),
      subtotal: activeLines.find(l => l.is_subtotal && l.plan_unit_id === uid) ?? null,
    }))
    .filter(g => g.lines.length > 0 || g.subtotal)

  const SortableLineRow = ({ line }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: line.id })
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, background: '#fff' }
    const isEditing = editingId === line.id
    const td = { padding: '3px 6px', borderBottom: '1px solid #f5f5f5', fontSize: 12 }
    const puLabel  = planUnits.find(u => u.id === line.plan_unit_id)?.name ?? '—'
    const calLabel = calendars.find(c => c.id === line.calendar_id)?.name  ?? '—'
    return (
      <tr ref={setNodeRef} style={style}>
        <td style={{ ...td, width: 24, textAlign: 'center', color: '#ccc', cursor: 'grab' }} {...attributes} {...listeners}><HolderOutlined /></td>
        <td style={{ ...td, width: 110, color: '#555' }}>
          {isEditing
            ? <Select size="small" style={{ width: 100 }} value={editVals.plan_unit_id} allowClear placeholder="—" options={planUnits.map(u => ({ value: u.id, label: u.name }))} onChange={v => setEditVals(p => ({ ...p, plan_unit_id: v ?? null }))} />
            : puLabel}
        </td>
        <td style={td}>
          {isEditing
            ? <Input size="small" style={{ width: 120 }} value={editVals.name} onChange={e => setEditVals(p => ({ ...p, name: e.target.value }))} />
            : <span style={{ fontWeight: 500 }}>{line.name}</span>}
        </td>
        <td style={{ ...td, width: 70, textAlign: 'center', color: '#555' }}>
          {isEditing
            ? <InputNumber size="small" style={{ width: 58 }} min={1} value={editVals.machines_count} onChange={v => setEditVals(p => ({ ...p, machines_count: v }))} />
            : line.machines_count}
        </td>
        <td style={{ ...td, width: 80, color: '#555' }}>
          {isEditing
            ? <Input size="small" style={{ width: 68 }} value={editVals.external_id} onChange={e => setEditVals(p => ({ ...p, external_id: e.target.value }))} />
            : (line.external_id || '—')}
        </td>
        <td style={{ ...td, width: 110, color: '#555' }}>
          {isEditing
            ? <Select size="small" style={{ width: 100 }} value={editVals.calendar_id} allowClear placeholder="—" options={calendars.map(c => ({ value: c.id, label: c.name }))} onChange={v => setEditVals(p => ({ ...p, calendar_id: v ?? null }))} />
            : calLabel}
        </td>
        <td style={{ ...td, width: 60, textAlign: 'right' }}>
          {isEditing ? (
            <span style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <Button size="small" type="text" icon={<CheckOutlined />} style={{ color: '#22c55e' }} onClick={saveEdit} />
              <Button size="small" type="text" icon={<CloseOutlined />} onClick={cancelEdit} />
            </span>
          ) : (
            <span style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <Button size="small" type="text" icon={<EditOutlined />} style={{ color: '#888' }} onClick={() => startEdit(line)} />
              <Popconfirm title="Deactivate this line?" onConfirm={() => handleDelete(line.id)} okButtonProps={{ danger: true }}>
                <Button size="small" type="text" icon={<DeleteOutlined />} danger />
              </Popconfirm>
            </span>
          )}
        </td>
      </tr>
    )
  }

  const SubtotalRow = ({ unitId }) => {
    const unitLines = nonSubLines.filter(l => l.plan_unit_id === unitId)
    const total = unitLines.reduce((s, l) => s + (l.machines_count || 0), 0)
    const sub   = activeLines.find(l => l.is_subtotal && l.plan_unit_id === unitId)
    const td = { padding: '3px 6px', borderBottom: '1px solid #e8f0f4', fontSize: 12 }
    return (
      <tr style={{ background: '#f0f6fa' }}>
        <td style={{ ...td, width: 24 }} />
        <td style={{ ...td, width: 110, color: '#888', fontStyle: 'italic', fontSize: 11 }}>subtotal</td>
        <td style={td}><span style={{ fontWeight: 600, color: 'var(--c-navy)', fontSize: 12 }}>Σ {total} machines</span></td>
        <td style={{ ...td, width: 70, textAlign: 'center', fontWeight: 600, color: 'var(--c-navy)' }}>{total}</td>
        <td style={{ ...td, width: 80 }}>—</td>
        <td style={{ ...td, width: 110 }}>—</td>
        <td style={{ ...td, width: 60, textAlign: 'right' }}>
          <Popconfirm title="Remove subtotal row?" onConfirm={() => sub && handleDelete(sub.id)} okButtonProps={{ danger: true }}>
            <Button size="small" type="text" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </td>
      </tr>
    )
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <DndContext sensors={sortSensors} collisionDetection={closestCenter}
        onDragStart={({ active }) => setDragId(active.id)}
        onDragEnd={handleSortEnd}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '1px solid #ebebeb', fontSize: 11 }}>
              <th style={{ width: 24 }} />
              <th style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 500, color: '#777', width: 110 }}>Plan Unit</th>
              <th style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 500, color: '#777' }}>Line Name</th>
              <th style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 500, color: '#777', width: 70 }}>Machines</th>
              <th style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 500, color: '#777', width: 80 }}>Ext. ID</th>
              <th style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 500, color: '#777', width: 110 }}>Calendar</th>
              <th style={{ width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {nonSubLines.length === 0
              ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 14, color: '#bbb', fontSize: 12 }}>No lines yet — add one below</td></tr>
              : groups.map(group => (
                <Fragment key={group.unitId ?? 'nounit'}>
                  <tr style={{ background: '#e8f0f4', borderBottom: '1px solid #d0e0ea' }}>
                    <td colSpan={6} style={{ padding: '4px 8px 4px 34px', fontWeight: 600, fontSize: 11, color: 'var(--c-navy)', textTransform: 'uppercase', letterSpacing: 0.7 }}>
                      {group.unit?.name ?? 'No Plan Unit'}
                    </td>
                    <td style={{ padding: '2px 4px', textAlign: 'right' }}>
                      {!group.subtotal && group.unitId && (
                        <Button size="small" type="text" style={{ fontSize: 11, color: '#0b9e94' }} icon={<PlusOutlined />} onClick={() => handleAddSubtotal(group.unitId)}>Subtotal</Button>
                      )}
                    </td>
                  </tr>
                  <SortableContext items={group.lines.map(l => l.id)} strategy={verticalListSortingStrategy}>
                    {group.lines.map(l => <SortableLineRow key={l.id} line={l} />)}
                  </SortableContext>
                  {group.subtotal && <SubtotalRow unitId={group.unitId} />}
                </Fragment>
              ))
            }
          </tbody>
        </table>
      </DndContext>

      <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px', border: '1px solid #e8eef2', marginBottom: 16 }}>
        <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Add New Line</Text>
        <Form form={form} layout="inline" onFinish={handleAdd} size="small">
          <Form.Item name="plan_unit_id" style={{ marginBottom: 0 }}>
            <Select style={{ width: 120 }} allowClear placeholder="Plan Unit" options={planUnits.map(u => ({ value: u.id, label: u.name }))} />
          </Form.Item>
          <Form.Item name="name" rules={[{ required: true, message: 'Name required' }]} style={{ marginBottom: 0 }}>
            <Input placeholder="Line name" style={{ width: 130 }} />
          </Form.Item>
          <Form.Item name="machines_count" initialValue={40} style={{ marginBottom: 0 }}>
            <InputNumber min={1} placeholder="Machines" style={{ width: 90 }} suffix="M" />
          </Form.Item>
          <Form.Item name="external_id" style={{ marginBottom: 0 }}>
            <Input placeholder="Ext. ID" style={{ width: 80 }} />
          </Form.Item>
          <Form.Item name="calendar_id" style={{ marginBottom: 0 }}>
            <Select style={{ width: 120 }} allowClear placeholder="Calendar" options={calendars.map(c => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={saving} icon={<PlusOutlined />}>Add</Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  )
}
