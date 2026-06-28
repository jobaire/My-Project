import { CalendarOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Checkbox, DatePicker, Form, Input, InputNumber, Popconfirm, Space, Table, TimePicker, Typography, App } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { apiFetch } from '../../../utils/planningUtils'

const { Text } = Typography

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function CalendarTab({ token, active }) {
  const { message } = App.useApp()
  const [calendars,    setCalendars]    = useState([])
  const [selectedId,   setSelectedId]   = useState(null)
  const [holidays,     setHolidays]     = useState([])
  const [saving,       setSaving]       = useState(false)
  const [addingHol,    setAddingHol]    = useState(false)
  const [addingCal,    setAddingCal]    = useState(false)
  const [newCalName,   setNewCalName]   = useState('')
  const [form]         = Form.useForm()
  const [holForm]      = Form.useForm()
  const [holMode,      setHolMode]      = useState('single')
  const [breaks,       setBreaks]       = useState([])
  const [addingBreak,  setAddingBreak]  = useState(false)
  const [newBreakTime, setNewBreakTime] = useState(null)
  const [newBreakDur,  setNewBreakDur]  = useState(1)

  const selectedCal = calendars.find(c => c.id === selectedId) ?? null

  const loadCalendars = useCallback(() =>
    apiFetch('/planning/calendars', token).then(setCalendars).catch(() => {}),
  [token])

  const loadHolidays = useCallback((id) => {
    if (!id) { setHolidays([]); return }
    apiFetch(`/planning/calendars/${id}/holidays`, token).then(setHolidays).catch(() => {})
  }, [token])

  const loadBreaks = useCallback((id) => {
    if (!id) { setBreaks([]); return }
    apiFetch(`/planning/calendars/${id}/breaks`, token).then(setBreaks).catch(() => {})
  }, [token])

  useEffect(() => { if (active) loadCalendars() }, [active, loadCalendars])
  useEffect(() => { loadHolidays(selectedId); loadBreaks(selectedId) }, [selectedId, loadHolidays, loadBreaks])

  useEffect(() => {
    if (selectedCal) {
      form.setFieldsValue({
        name:         selectedCal.name,
        shift_hours:  selectedCal.shift_hours,
        working_days: selectedCal.working_days || [0, 1, 2, 3, 4, 5],
        start_time:   dayjs(selectedCal.start_time || '08:00', 'HH:mm'),
      })
    }
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddBreak = async () => {
    if (!selectedId || !newBreakTime) return
    setAddingBreak(true)
    try {
      await apiFetch(`/planning/calendars/${selectedId}/breaks`, token, {
        method: 'POST',
        body: JSON.stringify({ break_start: newBreakTime.format('HH:mm'), break_duration: newBreakDur }),
      })
      await loadBreaks(selectedId)
      setNewBreakTime(null)
      setNewBreakDur(1)
    } catch (e) { message.error(e.message) }
    finally { setAddingBreak(false) }
  }

  const handleDeleteBreak = async (id) => {
    try {
      await apiFetch(`/planning/calendars/${selectedId}/breaks/${id}`, token, { method: 'DELETE' })
      await loadBreaks(selectedId)
    } catch (e) { message.error(e.message) }
  }

  const handleCreateCalendar = async () => {
    if (!newCalName.trim()) return
    setAddingCal(true)
    try {
      const cal = await apiFetch('/planning/calendars', token, {
        method: 'POST',
        body: JSON.stringify({ name: newCalName.trim(), shift_hours: 8, start_time: '08:00', working_days: [0, 1, 2, 3, 4, 5] }),
      })
      await loadCalendars()
      setSelectedId(cal.id)
      setNewCalName('')
    } catch (e) { message.error(e.message) }
    finally { setAddingCal(false) }
  }

  const handleSave = async (values) => {
    if (!selectedId) return
    setSaving(true)
    try {
      const payload = { ...values, start_time: values.start_time ? values.start_time.format('HH:mm') : undefined }
      await apiFetch(`/planning/calendars/${selectedId}`, token, { method: 'PATCH', body: JSON.stringify(payload) })
      await loadCalendars()
      message.success('Calendar saved')
    } catch (e) { message.error(e.message) }
    finally { setSaving(false) }
  }

  const handleDeleteCalendar = async (id) => {
    await apiFetch(`/planning/calendars/${id}`, token, { method: 'DELETE' })
    if (selectedId === id) { setSelectedId(null); setHolidays([]) }
    await loadCalendars()
  }

  const handleAddHoliday = async (values) => {
    setAddingHol(true)
    try {
      let body = { name: values.name || null }
      if (holMode === 'range' && values.range) {
        body.start_date = values.range[0].format('YYYY-MM-DD')
        body.end_date   = values.range[1].format('YYYY-MM-DD')
      } else if (values.date) {
        body.holiday_date = values.date.format('YYYY-MM-DD')
      } else {
        message.warning('Select a date or date range')
        return
      }
      await apiFetch(`/planning/calendars/${selectedId}/holidays`, token, { method: 'POST', body: JSON.stringify(body) })
      holForm.resetFields()
      await loadHolidays(selectedId)
      await loadCalendars()
    } catch (e) { message.error(e.message) }
    finally { setAddingHol(false) }
  }

  const handleDeleteHoliday = async (hid) => {
    await apiFetch(`/planning/calendars/${selectedId}/holidays/${hid}`, token, { method: 'DELETE' })
    await loadHolidays(selectedId)
    await loadCalendars()
  }

  return (
    <div style={{ display: 'flex', minHeight: 400 }}>
      <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid #e8eef2', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid #e8eef2' }}>
          <Input.Search
            value={newCalName}
            onChange={e => setNewCalName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateCalendar()}
            placeholder="New calendar name…"
            enterButton={<PlusOutlined />}
            size="small"
            onSearch={handleCreateCalendar}
            loading={addingCal}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {calendars.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#bbb', fontSize: 'var(--fs-sm)' }}>
              No calendars yet.<br />Enter a name above to create one.
            </div>
          )}
          {calendars.map(cal => (
            <div
              key={cal.id}
              onClick={() => setSelectedId(cal.id)}
              style={{ padding: '9px 10px', cursor: 'pointer', background: selectedId === cal.id ? '#e6f7f5' : 'transparent', borderLeft: `3px solid ${selectedId === cal.id ? 'var(--c-teal)' : 'transparent'}`, borderBottom: '1px solid #f0f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}
            >
              <div style={{ minWidth: 0 }}>
                <Text strong style={{ fontSize: 'var(--fs-sm)', display: 'block', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{cal.name}</Text>
                <Text style={{ fontSize: 'var(--fs-2xs)', color: '#888' }}>
                  {cal.start_time || '08:00'} · {cal.shift_hours}h · {(cal.working_days || []).length}d/wk
                </Text>
              </div>
              <Popconfirm title="Delete this calendar?" onConfirm={e => { e.stopPropagation(); handleDeleteCalendar(cal.id) }} okButtonProps={{ danger: true }}>
                <Button size="small" type="text" icon={<DeleteOutlined />} danger onClick={e => e.stopPropagation()} />
              </Popconfirm>
            </div>
          ))}
        </div>
      </div>

      {!selectedCal ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6, color: '#bbb' }}>
          <CalendarOutlined style={{ fontSize: 28 }} />
          <Text style={{ fontSize: 'var(--fs-sm)', color: '#bbb' }}>Select a calendar to edit</Text>
        </div>
      ) : (
        <div style={{ flex: 1, padding: '14px 18px', overflowY: 'auto' }}>
          <Form form={form} layout="vertical" onFinish={handleSave} size="small">
            <Form.Item name="name" label="Calendar Name" rules={[{ required: true, message: 'Name required' }]} style={{ marginBottom: 10 }}>
              <Input />
            </Form.Item>
            <div style={{ display: 'flex', gap: 12 }}>
              <Form.Item name="start_time" label="Start Time" style={{ marginBottom: 10 }}>
                <TimePicker format="HH:mm" minuteStep={15} style={{ width: 110 }} allowClear={false} />
              </Form.Item>
              <Form.Item name="shift_hours" label="Working Hours / Day" style={{ marginBottom: 10 }}>
                <InputNumber min={0.5} max={24} step={0.5} style={{ width: 110 }} suffix="hrs" />
              </Form.Item>
            </div>
            <Form.Item name="working_days" label="Working Days" style={{ marginBottom: 10 }}>
              <Checkbox.Group>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {DAYS_OF_WEEK.map((day, i) => (
                    <Checkbox key={i} value={i} style={{ marginRight: 0 }}>
                      <span style={{ fontSize: 'var(--fs-xs)' }}>{day}</span>
                    </Checkbox>
                  ))}
                </div>
              </Checkbox.Group>
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" loading={saving} size="small">Save Calendar</Button>
            </Form.Item>
          </Form>

          <div style={{ borderTop: '1px solid #e8eef2', marginTop: 16, paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text strong style={{ fontSize: 'var(--fs-sm)' }}>Holidays & Shutdowns ({holidays.length})</Text>
              <Space size={4}>
                <Button size="small" type={holMode === 'single' ? 'primary' : 'default'} ghost={holMode !== 'single'} onClick={() => setHolMode('single')}>Single Day</Button>
                <Button size="small" type={holMode === 'range' ? 'primary' : 'default'} ghost={holMode !== 'range'} onClick={() => setHolMode('range')}>Date Block</Button>
              </Space>
            </div>
            {holidays.length > 0 && (
              <Table
                dataSource={holidays} rowKey="id" size="small" pagination={false} style={{ marginBottom: 10 }}
                columns={[
                  { title: 'Date', dataIndex: 'holiday_date', width: 104, render: v => v?.slice(0, 10) },
                  { title: 'Description', dataIndex: 'name', ellipsis: true, render: v => v || <Text type="secondary" style={{ fontSize: 'var(--fs-xs)' }}>—</Text> },
                  { title: '', width: 36, render: (_, r) => <Button size="small" type="text" icon={<DeleteOutlined />} danger onClick={() => handleDeleteHoliday(r.id)} /> },
                ]}
              />
            )}
            <Form form={holForm} layout="inline" onFinish={handleAddHoliday} size="small">
              {holMode === 'single'
                ? <Form.Item name="date" style={{ marginBottom: 6 }}><DatePicker placeholder="Pick date" style={{ width: 130 }} /></Form.Item>
                : <Form.Item name="range" style={{ marginBottom: 6 }}><DatePicker.RangePicker style={{ width: 230 }} /></Form.Item>
              }
              <Form.Item name="name" style={{ marginBottom: 6 }}>
                <Input placeholder="Description (optional)" style={{ width: 190 }} />
              </Form.Item>
              <Form.Item style={{ marginBottom: 6 }}>
                <Button type="primary" htmlType="submit" loading={addingHol} icon={<PlusOutlined />}>
                  {holMode === 'range' ? 'Add Block' : 'Add Holiday'}
                </Button>
              </Form.Item>
            </Form>
          </div>

          <div style={{ borderTop: '1px solid #e8eef2', marginTop: 16, paddingTop: 14 }}>
            <Text strong style={{ fontSize: 'var(--fs-sm)' }}>Break Hours ({breaks.length})</Text>
            {breaks.length > 0 && (
              <div style={{ marginTop: 8, marginBottom: 8 }}>
                {breaks.map(b => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', borderBottom: '1px solid #f4f6f8' }}>
                    <Text style={{ flex: 1, fontSize: 'var(--fs-xs)' }}>{b.break_start} ({b.break_duration}h)</Text>
                    <Button size="small" type="text" icon={<DeleteOutlined />} danger onClick={() => handleDeleteBreak(b.id)} />
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 'var(--fs-xs)', color: '#888', marginBottom: 2 }}>Start</div>
                <TimePicker value={newBreakTime} onChange={setNewBreakTime} format="HH:mm" minuteStep={15} style={{ width: 100 }} size="small" allowClear={false} />
              </div>
              <div>
                <div style={{ fontSize: 'var(--fs-xs)', color: '#888', marginBottom: 2 }}>Duration</div>
                <InputNumber value={newBreakDur} onChange={setNewBreakDur} min={0.5} max={4} step={0.5} style={{ width: 80 }} size="small" suffix="hrs" />
              </div>
              <Button type="primary" size="small" icon={<PlusOutlined />} loading={addingBreak} onClick={handleAddBreak} disabled={!newBreakTime}>
                Add Break
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
