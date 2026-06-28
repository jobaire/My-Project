import { DeleteOutlined, HolderOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Divider, Form, Input, Popconfirm, Select, Typography, App } from 'antd'
import { useEffect, useState } from 'react'
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

export default function PlanSegmentTab({ token, active }) {
  const { message } = App.useApp()
  const [planUnits,     setPlanUnits]     = useState([])
  const [users,         setUsers]         = useState([])
  const [editorDrafts,  setEditorDrafts]  = useState({})
  const [savingEditors, setSavingEditors] = useState({})
  const [unitForm]   = Form.useForm()
  const [savingUnit, setSavingUnit] = useState(false)

  const reload = () => Promise.all([
    apiFetch('/planning/plan-units', token),
    apiFetch('/users/', token),
  ]).then(([u, us]) => {
    setPlanUnits(u)
    setUsers(us)
    const drafts = {}
    u.forEach(unit => { drafts[unit.id] = unit.editors || [] })
    setEditorDrafts(drafts)
  }).catch(() => {})

  useEffect(() => { if (active) reload() }, [active])

  const saveEditors = async (unitId) => {
    setSavingEditors(s => ({ ...s, [unitId]: true }))
    try {
      await apiFetch(`/planning/plan-units/${unitId}/editors`, token, {
        method: 'PUT',
        body: JSON.stringify(editorDrafts[unitId] || []),
      })
      message.success('Editors saved')
    } catch (e) { message.error(e.message) }
    finally { setSavingEditors(s => ({ ...s, [unitId]: false })) }
  }

  const unitSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleUnitSortEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return
    const oldIdx = planUnits.findIndex(u => u.id === active.id)
    const newIdx = planUnits.findIndex(u => u.id === over.id)
    const reordered = arrayMove(planUnits, oldIdx, newIdx)
    setPlanUnits(reordered)
    try {
      await Promise.all(reordered.map((u, i) =>
        apiFetch(`/planning/plan-units/${u.id}`, token, { method: 'PATCH', body: JSON.stringify({ display_order: i }) })
      ))
    } catch (e) { message.error(e.message); reload() }
  }

  const SortableUnitCard = ({ u }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: u.id })
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
    return (
      <div ref={setNodeRef} style={{ ...style, marginBottom: 10, border: '1px solid #dde8ed', borderRadius: 8, padding: '10px 14px', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#ccc', cursor: 'grab', lineHeight: 1 }} {...attributes} {...listeners}>
              <HolderOutlined />
            </span>
            <Text strong style={{ fontSize: 'var(--fs-sm)' }}>{u.name}</Text>
          </div>
          <Popconfirm title="Delete this plan unit?" onConfirm={async () => {
            await apiFetch(`/planning/plan-units/${u.id}`, token, { method: 'DELETE' })
            reload()
          }} okButtonProps={{ danger: true }}>
            <Button size="small" type="text" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </div>
        <Text style={{ fontSize: 'var(--fs-xs)', color: '#6a8a98', display: 'block', marginBottom: 4 }}>
          Assigned Editors&nbsp;<Text style={{ color: '#aaa', fontSize: 'var(--fs-2xs)' }}>(empty = anyone can edit)</Text>
        </Text>
        <div style={{ display: 'flex', gap: 6 }}>
          <Select
            mode="multiple"
            size="small"
            style={{ flex: 1 }}
            placeholder="No restriction — all users can edit"
            value={editorDrafts[u.id] || []}
            options={users.map(usr => ({ value: usr.email, label: usr.full_name ? `${usr.full_name} (${usr.email})` : usr.email }))}
            onChange={emails => setEditorDrafts(d => ({ ...d, [u.id]: emails }))}
          />
          <Button size="small" type="primary" loading={savingEditors[u.id]} onClick={() => saveEditors(u.id)}>
            Save
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      <Text strong style={{ fontSize: 'var(--fs-sm)', display: 'block', marginBottom: 10 }}>Plan Units (Segments)</Text>
      <DndContext sensors={unitSensors} collisionDetection={closestCenter} onDragEnd={handleUnitSortEnd}>
        <SortableContext items={planUnits.map(u => u.id)} strategy={verticalListSortingStrategy}>
          {planUnits.map(u => <SortableUnitCard key={u.id} u={u} />)}
        </SortableContext>
      </DndContext>
      {planUnits.length === 0 && <Text style={{ fontSize: 'var(--fs-xs)', color: '#aaa' }}>No plan units yet. Add one below.</Text>}
      <Divider style={{ margin: '12px 0' }} />
      <Form form={unitForm} layout="inline" onFinish={async (values) => {
        setSavingUnit(true)
        try { await apiFetch('/planning/plan-units', token, { method: 'POST', body: JSON.stringify(values) }); unitForm.resetFields(); reload() }
        catch (e) { message.error(e.message) }
        finally { setSavingUnit(false) }
      }}>
        <Form.Item name="name" rules={[{ required: true, message: 'Name required' }]}>
          <Input placeholder="e.g. Floor 1" style={{ width: 160 }} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={savingUnit} icon={<PlusOutlined />}>Add Unit</Button>
        </Form.Item>
      </Form>
    </div>
  )
}
