import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Typography,
  message,
} from 'antd'
import { useEffect, useState } from 'react'
import { useResizableModal } from '../../../hooks/useResizableModal'
import { createProcess, deleteProcess, fetchProcesses, updateProcess } from '../../../services/setup'

const { Text } = Typography

function ToolBtn({ icon, onClick, disabled, title }) {
  return (
    <button title={title} onClick={disabled ? undefined : onClick} style={{
      width: 28, height: 28, borderRadius: 5,
      background: disabled ? '#c8d0da' : '#1e3a5f',
      border: 'none', color: '#fff',
      cursor: disabled ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, opacity: disabled ? 0.6 : 1, transition: 'background 0.15s',
    }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#27508a' }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = '#1e3a5f' }}>
      {icon}
    </button>
  )
}

export default function ProcessesApp({ session }) {
  const [processes, setProcesses] = useState([])
  const [loading, setLoading]     = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()
  const { modalWidth, bodyHeight, resetSize } = useResizableModal({ defaultWidth: 480, defaultHeight: 360, minWidth: 380, minHeight: 240 })

  const load = () => {
    setLoading(true)
    fetchProcesses(session.access_token)
      .then(setProcesses)
      .catch(() => message.error('Failed to load processes'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const selected = processes.find((p) => p.id === selectedId) ?? null

  const openCreate = () => {
    setEditTarget(null)
    form.resetFields()
    form.setFieldsValue({ sequence: 0, planned: false, update_by_size: false })
    resetSize()
    setModalOpen(true)
  }

  const openEdit = () => {
    if (!selected) return
    setEditTarget(selected)
    form.setFieldsValue({
      name:               selected.name,
      short_name:         selected.short_name ?? '',
      external_reference: selected.external_reference ?? '',
      sequence:           selected.sequence ?? 0,
      work_content_unit:  selected.work_content_unit ?? '',
      planned:            selected.planned,
      update_by_size:     selected.update_by_size,
    })
    resetSize()
    setModalOpen(true)
  }

  const handleFinish = async (values) => {
    setSubmitting(true)
    const payload = {
      ...values,
      short_name:         values.short_name?.trim() || null,
      external_reference: values.external_reference?.trim() || null,
      work_content_unit:  values.work_content_unit?.trim() || null,
    }
    try {
      if (editTarget) {
        await updateProcess(session.access_token, editTarget.id, payload)
        message.success('Process updated')
      } else {
        await createProcess(session.access_token, payload)
        message.success('Process created')
      }
      setModalOpen(false)
      setSelectedId(null)
      load()
    } catch (err) { message.error(err.message) }
    finally { setSubmitting(false) }
  }

  const handleDelete = async () => {
    if (!selected) return
    try {
      await deleteProcess(session.access_token, selected.id)
      message.success(`"${selected.name}" deleted`)
      setSelectedId(null)
      load()
    } catch (err) { message.error(err.message) }
  }

  const handleToggle = async (id, field, value) => {
    try {
      await updateProcess(session.access_token, id, { [field]: value })
      setProcesses((prev) => prev.map((p) => p.id === id ? { ...p, [field]: value } : p))
    } catch (err) { message.error(err.message) }
  }

  const columns = [
    {
      title: 'Name', dataIndex: 'name', sorter: (a, b) => a.name.localeCompare(b.name),
      render: (v) => <span style={{ color: '#1677ff', fontSize: 12 }}>{v}</span>,
    },
    {
      title: 'Short Name', dataIndex: 'short_name', width: 110,
      render: (v) => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      title: 'External Ref', dataIndex: 'external_reference', width: 120,
      render: (v) => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      title: 'Sequence', dataIndex: 'sequence', width: 90, align: 'right',
      sorter: (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
      render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Work Content Unit', dataIndex: 'work_content_unit', width: 150,
      render: (v) => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      title: 'Planned', dataIndex: 'planned', width: 90, align: 'center',
      render: (v, row) => (
        <Switch size="small" checked={v}
          onChange={(val) => handleToggle(row.id, 'planned', val)} />
      ),
    },
    {
      title: 'Update By Size', dataIndex: 'update_by_size', width: 120, align: 'center',
      render: (v, row) => (
        <Switch size="small" checked={v}
          onChange={(val) => handleToggle(row.id, 'update_by_size', val)} />
      ),
    },
  ]

  const hasSelection = !!selectedId

  return (
    <div style={{ padding: '10px 14px', fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Space size={4}>
          <ToolBtn icon={<PlusOutlined />}  onClick={openCreate}                    title="Add process" />
          <ToolBtn icon={<EditOutlined />}  onClick={openEdit} disabled={!hasSelection} title="Edit selected" />
          <Popconfirm title={`Delete "${selected?.name}"?`} onConfirm={handleDelete}
            okText="Delete" okButtonProps={{ danger: true }} disabled={!hasSelection}>
            <span><ToolBtn icon={<DeleteOutlined />} disabled={!hasSelection} title="Delete selected" /></span>
          </Popconfirm>
        </Space>
        <ToolBtn icon={<ReloadOutlined />} onClick={load} title="Refresh" />
      </div>

      <Table
        size="small"
        columns={columns}
        dataSource={processes}
        loading={loading}
        rowKey="id"
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedId ? [selectedId] : [],
          onChange: ([key]) => setSelectedId(key ?? null),
          columnWidth: 36,
        }}
        onRow={(record) => ({
          onClick: () => setSelectedId((prev) => prev === record.id ? null : record.id),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          pageSizeOptions: ['10', '25', '50'],
          showTotal: (total, [from, to]) => `Showing ${from} to ${to} of ${total}`,
        }}
      />

      <Modal
        title={editTarget ? `Edit — ${editTarget.name}` : 'Add Process'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        footer={null}
        width={modalWidth}
        destroyOnHidden
        draggable
        styles={{ body: { maxHeight: bodyHeight, overflowY: 'auto' } }}
      >
        <Form form={form} layout="vertical" onFinish={handleFinish} style={{ marginTop: 14 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="e.g. 005 CUT" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="short_name" label="Short Name">
              <Input placeholder="e.g. CUT" />
            </Form.Item>
            <Form.Item name="external_reference" label="External Reference">
              <Input placeholder="e.g. 005" />
            </Form.Item>
            <Form.Item name="sequence" label="Sequence">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="work_content_unit" label="Work Content Unit">
              <Input placeholder="e.g. SMV, PCS, STITCHES" />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="planned" label="Planned" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="update_by_size" label="Update By Size" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
          <Space style={{ justifyContent: 'flex-end', width: '100%', marginTop: 4 }}>
            <Button onClick={() => { setModalOpen(false); form.resetFields() }}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              {editTarget ? 'Save Changes' : 'Add Process'}
            </Button>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}
