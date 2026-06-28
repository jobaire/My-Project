import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  TagsOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Checkbox,
  ColorPicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Popover,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useResizableModal } from '../../../hooks/useResizableModal'
import AuditLogTab from '../../../components/AuditLogTab'
import ImportModal from '../../../components/ImportModal'
import { fetchCustomerAuditLog } from '../../../services/audit'
import { confirmCustomerImport, downloadCustomerTemplate, previewCustomerImport } from '../../../services/importService'
import SavedViewsBtn from '../../../components/SavedViewsBtn'
import {
  createBrand, createCustomer, deleteBrand, deleteCustomer,
  fetchBrands, fetchCustomerGroups, fetchCustomers, updateBrand, updateCustomer,
} from '../../../services/customers'


const { Text } = Typography

// ── Toolbar button ────────────────────────────────────────────────────────────
function ToolBtn({ icon, onClick, disabled, title }) {
  return (
    <button
      title={title}
      onClick={disabled ? undefined : onClick}
      style={{
        width: 28, height: 28, borderRadius: 5,
        background: disabled ? '#c8d0da' : '#1e3a5f',
        border: 'none', color: '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, opacity: disabled ? 0.6 : 1, transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#27508a' }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = '#1e3a5f' }}
    >
      {icon}
    </button>
  )
}


// ── Brands sub-table (expandable row content) ─────────────────────────────────
function BrandsPanel({ customer, token }) {
  const [brands, setBrands]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [modalOpen, setModalOpen]   = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()
  const { modalWidth: bModalWidth, bodyHeight: bBodyHeight, resetSize: bResetSize } = useResizableModal({ defaultWidth: 400, defaultHeight: 260, minWidth: 320, minHeight: 180 })
  useEffect(() => { if (modalOpen) bResetSize() }, [modalOpen])

  const load = () => {
    setLoading(true)
    fetchBrands(token, customer.id)
      .then(setBrands)
      .catch(() => message.error('Failed to load brands'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [customer.id])

  const openCreate = () => { setEditTarget(null); form.resetFields(); setModalOpen(true) }
  const openEdit   = (b)  => { setEditTarget(b); form.setFieldsValue({ name: b.name, description: b.description ?? '' }); setModalOpen(true) }

  const handleFinish = async (values) => {
    setSubmitting(true)
    try {
      if (editTarget) {
        await updateBrand(token, customer.id, editTarget.id, values)
        message.success('Brand updated')
      } else {
        await createBrand(token, customer.id, values)
        message.success('Brand added')
      }
      setModalOpen(false)
      load()
    } catch (err) { message.error(err.message) }
    finally { setSubmitting(false) }
  }

  const handleDelete = async (brand) => {
    try {
      await deleteBrand(token, customer.id, brand.id)
      message.success(`${brand.name} deleted`)
      load()
    } catch (err) { message.error(err.message) }
  }

  const columns = [
    { title: 'Brand Name', dataIndex: 'name', render: (v) => <span style={{ color: '#1677ff' }}>{v}</span> },
    { title: 'Description', dataIndex: 'description', render: (v) => v || <Text type="secondary">—</Text> },
    {
      title: '', key: 'actions', width: 80,
      render: (_, b) => (
        <Space size={4}>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(b)} />
          <Popconfirm title={`Delete "${b.name}"?`} onConfirm={() => handleDelete(b)} okText="Delete" okButtonProps={{ danger: true }}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ background: '#f0f7ff', padding: '12px 16px 12px 48px', borderTop: '1px solid #e8eef5' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Space>
          <TagsOutlined style={{ color: '#1677ff' }} />
          <Text strong style={{ fontSize: 13 }}>Brands — {customer.name}</Text>
          <Tag color="blue">{brands.length}</Tag>
        </Space>
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Brand</Button>
      </div>

      <Table
        size="small"
        columns={columns}
        dataSource={brands}
        loading={loading}
        rowKey="id"
        pagination={false}
        locale={{ emptyText: 'No brands yet — click Add Brand' }}
      />

      <Modal
        title={editTarget ? `Edit Brand` : `Add Brand — ${customer.name}`}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        footer={null}
        width={bModalWidth}
        destroyOnHidden
        draggable
        styles={{ body: { maxHeight: bBodyHeight, overflowY: 'auto' } }}
      >
        <Form form={form} layout="vertical" onFinish={handleFinish} style={{ marginTop: 14 }}>
          <Form.Item name="name" label="Brand Name" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="e.g. Air Jordan" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional" />
          </Form.Item>
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => { setModalOpen(false); form.resetFields() }}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              {editTarget ? 'Save' : 'Add Brand'}
            </Button>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}

const ALL_COLS = [
  { key: 'name',              label: 'Name',              fixed: true },
  { key: 'customer_group',    label: 'Customer Group' },
  { key: 'description',       label: 'Description' },
  { key: 'delivery_location', label: 'Delivery Location' },
  { key: 'plan_colour',       label: 'Plan Colour' },
  { key: 'late_tolerance',    label: 'Late Tolerance' },
]

function ColumnChooserBtn({ visibleCols, onChange }) {
  const [open, setOpen] = useState(false)

  const content = (
    <div style={{ width: 190 }}>
      <div style={{ fontSize: 10, color: '#999', marginBottom: 6 }}>Toggle columns</div>
      {ALL_COLS.map((c) => (
        <div key={c.key} style={{ padding: '3px 0' }}>
          <Checkbox
            checked={visibleCols[c.key]}
            disabled={c.fixed}
            onChange={(e) => onChange({ ...visibleCols, [c.key]: e.target.checked })}
          >
            <span style={{ fontSize: 12 }}>{c.label}</span>
            {c.fixed && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 4 }}>(always)</span>}
          </Checkbox>
        </div>
      ))}
      <Divider style={{ margin: '8px 0' }} />
      <Button
        size="small" block
        onClick={() => onChange(Object.fromEntries(ALL_COLS.map((c) => [c.key, true])))}
        style={{ fontSize: 11 }}
      >
        Show all
      </Button>
    </div>
  )

  return (
    <Popover
      content={content}
      title={<span style={{ fontSize: 12 }}>Columns</span>}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
    >
      <button
        title="Column settings"
        style={{
          width: 28, height: 28, borderRadius: 5,
          background: '#1e3a5f', border: 'none', color: '#fff',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 13, transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#27508a' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = '#1e3a5f' }}
      >
        <SettingOutlined />
      </button>
    </Popover>
  )
}

// ── Main CustomersApp ─────────────────────────────────────────────────────────
export default function CustomersApp({ session }) {
  const [customers, setCustomers]   = useState([])
  const [loading, setLoading]       = useState(true)

  const [modalOpen, setModalOpen]   = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [expandedRows, setExpandedRows] = useState([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [pageSize, setPageSize]     = useState(25)
  const [search, setSearch]         = useState('')
  const [group, setGroup]           = useState('')
  const [groups, setGroups]         = useState([])
  const [visibleCols, setVisibleCols] = useState(
    Object.fromEntries(ALL_COLS.map((c) => [c.key, true]))
  )
  const [activeTab, setActiveTab] = useState('details')
  const [importOpen, setImportOpen] = useState(false)
  const [form] = Form.useForm()
  const { modalWidth, bodyHeight, resetSize } = useResizableModal({ defaultWidth: 520, defaultHeight: 400, minWidth: 400, minHeight: 260 })

  const load = useCallback((p, ps, s, g = '') => {
    setLoading(true)
    fetchCustomers(session.access_token, { page: p, pageSize: ps, search: s, group: g })
      .then((data) => { setCustomers(data.items); setTotal(data.total) })
      .catch(() => message.error('Failed to load customers'))
      .finally(() => setLoading(false))
  }, [session.access_token])

  useEffect(() => { load(1, 25, '') }, [load])
  useEffect(() => {
    fetchCustomerGroups(session.access_token).then(setGroups).catch(() => {})
  }, [session.access_token])

  const getViewState = useCallback(() => ({ columns: visibleCols, group }), [visibleCols, group])
  const applyView = useCallback(({ columns, group: g } = {}) => {
    if (columns) setVisibleCols(columns)
    const newGroup = g ?? ''
    setGroup(newGroup)
    setPage(1)
    load(1, pageSize, search, newGroup)
  }, [load, pageSize, search])

  const openCreate = () => {
    setEditTarget(null)
    form.resetFields()
    resetSize()
    setActiveTab('details')
    setModalOpen(true)
  }

  const openEdit = (record) => {
    setEditTarget(record)
    form.setFieldsValue({
      name:              record.name,
      customer_group:    record.customer_group ?? '',
      description:       record.description ?? '',
      delivery_location: record.delivery_location ?? '',
      plan_colour:       record.plan_colour ?? '#000000',
      late_tolerance:    record.late_tolerance ?? 0,
    })
    resetSize()
    setActiveTab('details')
    setModalOpen(true)
  }

  const handleDuplicate = async () => {
    if (!editTarget) return
    try {
      const { id, ...rest } = editTarget
      await createCustomer(session.access_token, { ...rest, name: `${rest.name} (Copy)` })
      message.success('Customer duplicated')
      load(page, pageSize, search, group)
    } catch (err) { message.error(err.message) }
  }

  const handleFinish = async (values) => {
    setSubmitting(true)
    const pc = values.plan_colour
    const payload = {
      ...values,
      plan_colour:       pc ? (typeof pc === 'string' ? pc : pc.toHexString?.() ?? null) : null,
      description:       values.description?.trim() || null,
      delivery_location: values.delivery_location?.trim() || null,
      customer_group:    values.customer_group?.trim() || null,
    }
    try {
      if (editTarget) {
        await updateCustomer(session.access_token, editTarget.id, payload)
        message.success('Customer updated')
      } else {
        await createCustomer(session.access_token, payload)
        message.success('Customer created')
      }
      setModalOpen(false)
      load(page, pageSize, search, group)
    } catch (err) { message.error(err.message) }
    finally { setSubmitting(false) }
  }

  const handleDelete = async () => {
    if (!editTarget) return
    try {
      await deleteCustomer(session.access_token, editTarget.id)
      message.success(`${editTarget.name} deleted`)
      setModalOpen(false)
      setEditTarget(null)
      load(page, pageSize, search, group)
    } catch (err) { message.error(err.message) }
  }

  const allColumns = [
    {
      key: 'name', title: 'Name', dataIndex: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (v) => <span style={{ color: '#1677ff' }}>{v}</span>,
    },
    {
      key: 'customer_group', title: 'Customer Group', dataIndex: 'customer_group',
      sorter: (a, b) => (a.customer_group ?? '').localeCompare(b.customer_group ?? ''),
      render: (v) => v ? <Tag>{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      key: 'description', title: 'Description', dataIndex: 'description',
      render: (v) => v || <Text type="secondary">—</Text>,
    },
    {
      key: 'delivery_location', title: 'Delivery Location', dataIndex: 'delivery_location',
      render: (v) => v || <Text type="secondary">—</Text>,
    },
    {
      key: 'plan_colour', title: 'Plan Colour', dataIndex: 'plan_colour', width: 150,
      render: (v) => v ? (
        <Space size={6}>
          <div style={{ width: 14, height: 14, background: v, borderRadius: 3, border: '1px solid rgba(0,0,0,0.18)' }} />
          <Text code style={{ fontSize: 11 }}>{v.toUpperCase()}</Text>
        </Space>
      ) : <Text type="secondary">—</Text>,
    },
    {
      key: 'late_tolerance', title: 'Late Tolerance', dataIndex: 'late_tolerance',
      width: 130, align: 'right',
      sorter: (a, b) => (a.late_tolerance ?? 0) - (b.late_tolerance ?? 0),
    },
  ]

  const columns = allColumns.filter((c) => visibleCols[c.key])

  return (
    <div style={{ padding: '10px 14px', fontSize: 12 }}>
      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Space size={4}>
          <ToolBtn icon={<PlusOutlined />} onClick={openCreate} title="Add customer" />
          <div style={{ width: 1, height: 18, background: '#d0d7de', margin: '0 4px' }} />
          <ToolBtn icon={<UploadOutlined />} onClick={() => setImportOpen(true)} title="Import from CSV" />
          {groups.length > 0 && (
            <>
              <div style={{ width: 1, height: 18, background: '#d0d7de', margin: '0 4px' }} />
              <Select
                size="small"
                allowClear
                placeholder="All Groups"
                style={{ width: 150 }}
                options={groups.map((g) => ({ value: g, label: g }))}
                value={group || undefined}
                onChange={(val) => {
                  const g = val ?? ''
                  setGroup(g)
                  setPage(1)
                  load(1, pageSize, search, g)
                }}
              />
            </>
          )}
        </Space>
        <Space size={4}>
          <Input.Search
            allowClear
            placeholder="Search name / group…"
            size="small"
            style={{ width: 220 }}
            onSearch={(val) => { const s = val.trim(); setSearch(s); setPage(1); load(1, pageSize, s, group) }}
            onChange={(e) => { if (!e.target.value) { setSearch(''); setPage(1); load(1, pageSize, '', group) } }}
          />
          <SavedViewsBtn
            token={session.access_token}
            viewKey="customers"
            getState={getViewState}
            onApply={applyView}
          />
          <ToolBtn icon={<ReloadOutlined />} onClick={() => load(page, pageSize, search, group)} title="Refresh" />
          <ColumnChooserBtn visibleCols={visibleCols} onChange={setVisibleCols} />
        </Space>
      </div>

      {/* ── Table ── */}
      <Table
        size="small"
        columns={columns}
        dataSource={customers}
        loading={loading}
        rowKey="id"
        onRow={(record) => ({
          onClick: () => openEdit(record),
          style: { cursor: 'pointer' },
        })}
        onChange={(pag) => {
          const p = pag.current, ps = pag.pageSize
          setPage(p); setPageSize(ps)
          load(p, ps, search, group)
        }}
        expandable={{
          expandedRowKeys: expandedRows,
          onExpand: (expanded, record) =>
            setExpandedRows(expanded ? [record.id] : expandedRows.filter((k) => k !== record.id)),
          expandedRowRender: (record) => (
            <BrandsPanel customer={record} token={session.access_token} />
          ),
          rowExpandable: () => true,
        }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['10', '25', '50', '100'],
          showTotal: (t, [from, to]) => `${from}–${to} of ${t}`,
        }}
      />

      {/* ── Customer Modal ── */}
      <Modal
        title={editTarget ? `Edit — ${editTarget.name}` : 'Add Customer'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        footer={null}
        width={modalWidth}
        destroyOnHidden
        draggable
        styles={{ body: { maxHeight: bodyHeight, overflowY: 'auto' } }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          size="small"
          style={{ marginTop: -8 }}
          items={[
            {
              key: 'details',
              label: 'Details',
              children: (
                <Form form={form} layout="vertical" onFinish={handleFinish} style={{ marginTop: 4 }} initialValues={{ late_tolerance: 0 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]} style={{ marginBottom: 8 }}>
                      <Input placeholder="e.g. Nike" size="small" />
                    </Form.Item>
                    <Form.Item name="customer_group" label="Customer Group" style={{ marginBottom: 8 }}>
                      <Input placeholder="e.g. Sportswear" size="small" />
                    </Form.Item>
                    <Form.Item name="description" label="Description" style={{ marginBottom: 8, gridColumn: '1 / -1' }}>
                      <Input.TextArea rows={1} placeholder="Optional" size="small" />
                    </Form.Item>
                    <Form.Item name="delivery_location" label="Delivery Location" style={{ marginBottom: 8, gridColumn: '1 / -1' }}>
                      <Input placeholder="e.g. UK PORT" size="small" />
                    </Form.Item>
                    <Form.Item name="plan_colour" label="Plan Colour" style={{ marginBottom: 8 }}>
                      <ColorPicker format="hex" showText size="small" />
                    </Form.Item>
                    <Form.Item name="late_tolerance" label="Late Tolerance (days)" rules={[{ type: 'number', min: 0 }]} style={{ marginBottom: 8 }}>
                      <InputNumber min={0} style={{ width: '100%' }} size="small" />
                    </Form.Item>
                  </div>
                  <Space style={{ justifyContent: 'flex-end', width: '100%', marginTop: 4 }}>
                    {editTarget && (
                      <>
                        <Popconfirm
                          title={`Delete "${editTarget.name}"?`}
                          onConfirm={handleDelete}
                          okText="Delete" okButtonProps={{ danger: true }}
                        >
                          <Button size="small" danger>Delete</Button>
                        </Popconfirm>
                        <Button size="small" onClick={handleDuplicate}>Duplicate</Button>
                      </>
                    )}
                    <Button size="small" onClick={() => { setModalOpen(false); form.resetFields() }}>Cancel</Button>
                    <Button size="small" type="primary" htmlType="submit" loading={submitting}>
                      {editTarget ? 'Save Changes' : 'Add Customer'}
                    </Button>
                  </Space>
                </Form>
              ),
            },
            {
              key: 'history',
              label: 'History',
              disabled: !editTarget,
              children: (
                <AuditLogTab
                  fetchFn={editTarget ? (token) => fetchCustomerAuditLog(token, editTarget.id) : null}
                  token={session.access_token}
                  active={activeTab === 'history'}
                />
              ),
            },
          ]}
        />
      </Modal>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={() => load(page, pageSize, search, group)}
        entityName="Customers"
        onPreview={(file) => previewCustomerImport(session.access_token, file)}
        onConfirm={(rows) => confirmCustomerImport(session.access_token, rows)}
        onTemplate={() => downloadCustomerTemplate(session.access_token)}
      />
    </div>
  )
}
