import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  UnorderedListOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { formatDate } from '../../../utils/dateFormat'
import { useCallback, useEffect, useState } from 'react'
import AuditLogTab from '../../../components/AuditLogTab'
import ImportModal from '../../../components/ImportModal'
import { useResizableModal } from '../../../hooks/useResizableModal'
import {
  createOrder, createOrderLine, deleteOrder, deleteOrderLine,
  fetchOrderAuditLog, fetchOrderLines, fetchOrders, updateOrder, updateOrderLine,
} from '../../../services/orders'
import { confirmOrderImport, downloadOrderTemplate, previewOrderImport } from '../../../services/importService'
import { fetchAllBrands, fetchCustomers } from '../../../services/customers'
import { fetchColorSizes, fetchProducts, fetchVersions } from '../../../services/products'
import { fetchCategories, fetchColors, fetchSeasons, fetchSizes, fetchSubCategories, fetchUoM } from '../../../services/setup'

const { Text } = Typography

const ORDER_STATUSES = ['Forecast', 'Projection', 'Under Projection', 'Confirmed']
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY', 'BDT', 'INR', 'PKR']

const STATUS_COLOR = {
  'Forecast': 'blue',
  'Projection': 'cyan',
  'Under Projection': 'orange',
  'Confirmed': 'green',
}

function ToolBtn({ icon, onClick, disabled, title, danger }) {
  const base = danger ? '#c0392b' : '#1e3a5f'
  const hover = danger ? '#e74c3c' : '#27508a'
  return (
    <button
      title={title}
      onClick={disabled ? undefined : onClick}
      style={{
        width: 28, height: 28, borderRadius: 5,
        background: disabled ? '#c8d0da' : base,
        border: 'none', color: '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, opacity: disabled ? 0.6 : 1, transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = hover }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = base }}
    >
      {icon}
    </button>
  )
}


// ── Line Modal ─────────────────────────────────────────────────────────────────
function LineModal({ open, onClose, onSaved, token, orderId, editLine, allColors, sizes, uoms, allProducts, categories, subCategories }) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('general')
  const [versions, setVersions]   = useState([])
  const [filteredColors, setFilteredColors] = useState([])

  const sellingPrice = Form.useWatch('selling_price', form)
  const sellingCost  = Form.useWatch('selling_cost', form)
  const qty          = Form.useWatch('delivery_qty', form)
  const watchedLineProductId = Form.useWatch('product_id', form)
  const watchedLineCategoryId = Form.useWatch('category_id', form)
  const totalValue = (qty || 0) * (sellingPrice || 0)
  const totalCost  = (qty || 0) * (sellingCost || 0)

  // Filter sub-categories by selected category
  const filteredSubCategories = watchedLineCategoryId
    ? subCategories.filter((s) => s.category_id === watchedLineCategoryId)
    : subCategories

  useEffect(() => {
    if (open) {
      setActiveTab('general')
      if (editLine) {
        form.setFieldsValue({
          product_id:      editLine.product_id ?? undefined,
          version_id:      editLine.version_id ?? undefined,
          category_id:     editLine.category_id ?? undefined,
          sub_category_id: editLine.sub_category_id ?? undefined,
          color_id:        editLine.color_id ?? undefined,
          size_ids:        editLine.size_ids ?? [],
          ratio:           editLine.ratio ?? '',
          delivery_qty:    editLine.delivery_qty ?? 0,
          delivery_date:   editLine.delivery_date ? dayjs(editLine.delivery_date) : null,
          uom_id:          editLine.uom_id ?? undefined,
          selling_price:   editLine.selling_price ?? undefined,
          selling_cost:    editLine.selling_cost ?? undefined,
          currency:        editLine.currency ?? 'USD',
        })
      } else {
        form.resetFields()
        form.setFieldsValue({ delivery_qty: 0, currency: 'USD' })
      }
    }
  }, [open, editLine])

  // Load versions and filter colors when product changes
  useEffect(() => {
    if (!watchedLineProductId) {
      setVersions([])
      setFilteredColors(allColors)
      return
    }
    fetchVersions(token, watchedLineProductId).then(setVersions).catch(() => setVersions([]))
    fetchColorSizes(token, watchedLineProductId)
      .then((cs) => {
        const colorIds = new Set(cs.map((r) => r.color_id))
        setFilteredColors(allColors.filter((c) => colorIds.has(c.id)))
      })
      .catch(() => setFilteredColors(allColors))
    const prod = allProducts.find((p) => p.id === watchedLineProductId)
    if (prod) {
      form.setFieldsValue({
        category_id:     prod.category_id ?? undefined,
        sub_category_id: prod.sub_category_id ?? undefined,
      })
    }
  }, [watchedLineProductId, token])

  useEffect(() => { setFilteredColors(allColors) }, [allColors])

  const handleFinish = async (values) => {
    setSubmitting(true)
    const payload = {
      product_id:      values.product_id ?? null,
      version_id:      values.version_id ?? null,
      category_id:     values.category_id ?? null,
      sub_category_id: values.sub_category_id ?? null,
      color_id:        values.color_id ?? null,
      size_ids:        values.size_ids ?? [],
      ratio:           values.ratio?.trim() || null,
      delivery_qty:    values.delivery_qty ?? 0,
      delivery_date:   values.delivery_date ? values.delivery_date.format('YYYY-MM-DD') : null,
      uom_id:          values.uom_id ?? null,
      selling_price:   values.selling_price ?? null,
      selling_cost:    values.selling_cost ?? null,
      currency:        values.currency ?? 'USD',
    }
    try {
      if (editLine) {
        await updateOrderLine(token, orderId, editLine.id, payload)
        message.success('Line updated')
      } else {
        await createOrderLine(token, orderId, payload)
        message.success('Line added')
      }
      onSaved()
    } catch (err) { message.error(err.message) }
    finally { setSubmitting(false) }
  }

  return (
    <Modal
      title={editLine ? `Edit Line #${editLine.line_number}` : 'Add Order Line'}
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      destroyOnHidden
      draggable
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        size="small"
        style={{ marginTop: -8 }}
        items={[
          {
            key: 'general',
            label: 'General',
            children: (
              <Form form={form} layout="vertical" onFinish={handleFinish} style={{ marginTop: 4 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Form.Item name="product_id" label="Style" style={{ marginBottom: 8, gridColumn: '1 / -1' }}>
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="Select style"
                      size="small"
                      options={allProducts.map((p) => ({ value: p.id, label: p.name }))}
                      onChange={() => form.setFieldsValue({ version_id: undefined, color_id: undefined })}
                    />
                  </Form.Item>
                  <Form.Item name="version_id" label="Version" style={{ marginBottom: 8 }}>
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="Select version"
                      size="small"
                      disabled={!watchedLineProductId}
                      options={versions.map((v) => ({ value: v.id, label: v.name }))}
                    />
                  </Form.Item>
                  <Form.Item name="category_id" label="Category" style={{ marginBottom: 8 }}>
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="Auto-filled or select"
                      size="small"
                      options={categories.map((c) => ({ value: c.id, label: c.name }))}
                      onChange={() => form.setFieldsValue({ sub_category_id: undefined })}
                    />
                  </Form.Item>
                  <Form.Item name="sub_category_id" label="Sub-Category" style={{ marginBottom: 8 }}>
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="Auto-filled or select"
                      size="small"
                      options={filteredSubCategories.map((c) => ({ value: c.id, label: c.name }))}
                    />
                  </Form.Item>
                  <Form.Item name="color_id" label="Color" style={{ marginBottom: 8 }}>
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="Select colour"
                      size="small"
                      options={filteredColors.map((c) => ({ value: c.id, label: c.name }))}
                    />
                  </Form.Item>
                  <Form.Item name="uom_id" label="Unit of Measure" style={{ marginBottom: 8 }}>
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="Select UoM"
                      size="small"
                      options={uoms.map((u) => ({ value: u.id, label: u.abbreviation ? `${u.name} (${u.abbreviation})` : u.name }))}
                    />
                  </Form.Item>
                  <Form.Item name="size_ids" label="Sizes" style={{ marginBottom: 8, gridColumn: '1 / -1' }}>
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="Select sizes"
                      size="small"
                      options={sizes.map((s) => ({ value: s.id, label: s.name }))}
                    />
                  </Form.Item>
                  <Form.Item name="ratio" label="Ratio" style={{ marginBottom: 8 }}>
                    <Input placeholder="e.g. 1:2:2:1" size="small" />
                  </Form.Item>
                  <Form.Item name="delivery_qty" label="Delivery Qty" style={{ marginBottom: 8 }}>
                    <InputNumber min={0} style={{ width: '100%' }} size="small" />
                  </Form.Item>
                  <Form.Item name="delivery_date" label="Delivery Date" style={{ marginBottom: 8, gridColumn: '1 / -1' }}>
                    <DatePicker style={{ width: '100%' }} size="small" />
                  </Form.Item>
                </div>
                <Space style={{ justifyContent: 'flex-end', width: '100%', marginTop: 4 }}>
                  <Button size="small" onClick={onClose}>Cancel</Button>
                  <Button size="small" type="primary" htmlType="submit" loading={submitting}>
                    {editLine ? 'Save Changes' : 'Add Line'}
                  </Button>
                </Space>
              </Form>
            ),
          },
          {
            key: 'finance',
            label: 'Finance',
            children: (
              <Form form={form} layout="vertical" onFinish={handleFinish} style={{ marginTop: 4 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Form.Item name="selling_price" label="Selling Price" style={{ marginBottom: 8 }}>
                    <InputNumber min={0} precision={4} style={{ width: '100%' }} size="small" />
                  </Form.Item>
                  <Form.Item name="selling_cost" label="Selling Cost" style={{ marginBottom: 8 }}>
                    <InputNumber min={0} precision={4} style={{ width: '100%' }} size="small" />
                  </Form.Item>
                  <Form.Item name="currency" label="Currency" style={{ marginBottom: 8 }}>
                    <Select
                      size="small"
                      options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                    />
                  </Form.Item>
                  <div style={{ marginBottom: 8 }} />
                  <div style={{ background: '#f5f8ff', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
                    <div style={{ color: '#888', marginBottom: 2 }}>Total Selling Value</div>
                    <div style={{ fontWeight: 600, color: '#1677ff' }}>{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </div>
                  <div style={{ background: '#f5f8ff', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
                    <div style={{ color: '#888', marginBottom: 2 }}>Total Cost Value</div>
                    <div style={{ fontWeight: 600, color: '#52c41a' }}>{totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </div>
                </div>
                <Space style={{ justifyContent: 'flex-end', width: '100%', marginTop: 4 }}>
                  <Button size="small" onClick={onClose}>Cancel</Button>
                  <Button size="small" type="primary" htmlType="submit" loading={submitting}>
                    {editLine ? 'Save Changes' : 'Add Line'}
                  </Button>
                </Space>
              </Form>
            ),
          },
        ]}
      />
    </Modal>
  )
}


// ── Lines sub-panel (rendered inside OrderModal Lines tab) ─────────────────────
function LinesPanel({ order, token, allColors, sizes, uoms, allProducts, categories, subCategories }) {
  const [lines, setLines]           = useState([])
  const [loading, setLoading]       = useState(false)
  const [lineModalOpen, setLineModalOpen] = useState(false)
  const [editLine, setEditLine]     = useState(null)
  const [selectedLineId, setSelectedLineId] = useState(null)

  const load = () => {
    setLoading(true)
    fetchOrderLines(token, order.id)
      .then(setLines)
      .catch(() => message.error('Failed to load lines'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [order.id])

  const openAddLine = () => { setEditLine(null); setLineModalOpen(true) }
  const openEditLine = () => {
    const line = lines.find((l) => l.id === selectedLineId)
    if (line) { setEditLine(line); setLineModalOpen(true) }
  }

  const handleLineDelete = async () => {
    const line = lines.find((l) => l.id === selectedLineId)
    if (!line) return
    try {
      await deleteOrderLine(token, order.id, line.id)
      message.success(`Line #${line.line_number} deleted`)
      setSelectedLineId(null)
      load()
    } catch (err) { message.error(err.message) }
  }

  const selectedLine = lines.find((l) => l.id === selectedLineId) ?? null

  const columns = [
    { title: '#', dataIndex: 'line_number', width: 34, align: 'center' },
    {
      title: 'Style', dataIndex: 'product_name', width: 110,
      render: (v) => v ? <Text style={{ fontSize: 11 }}>{v}</Text> : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>,
    },
    {
      title: 'Version', dataIndex: 'version_name', width: 70,
      render: (v) => v ? <Tag style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>{v}</Tag> : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>,
    },
    {
      title: 'Color', dataIndex: 'color_name', width: 80,
      render: (v) => v ? <Tag color="geekblue" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>{v}</Tag> : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>,
    },
    {
      title: 'Sizes / Ratio', key: 'sizes', width: 130,
      render: (_, r) => {
        const sizeStr = r.size_names?.join(', ') || '—'
        const ratio = r.ratio ? ` (${r.ratio})` : ''
        return <Text style={{ fontSize: 11 }}>{sizeStr}{ratio}</Text>
      },
    },
    { title: 'Qty', dataIndex: 'delivery_qty', width: 46, align: 'right', render: (v) => <Text style={{ fontSize: 11 }}>{v ?? 0}</Text> },
    { title: 'Del. Date', dataIndex: 'delivery_date', width: 88, render: (v) => v ? <Text style={{ fontSize: 11 }}>{formatDate(v)}</Text> : <Text type="secondary" style={{ fontSize: 11 }}>—</Text> },
    { title: 'UoM', dataIndex: 'uom_name', width: 46, render: (v) => v ? <Text style={{ fontSize: 11 }}>{v}</Text> : <Text type="secondary" style={{ fontSize: 11 }}>—</Text> },
    { title: 'Price', dataIndex: 'selling_price', width: 68, align: 'right', render: (v) => v != null ? <Text style={{ fontSize: 11 }}>{Number(v).toFixed(2)}</Text> : <Text type="secondary" style={{ fontSize: 11 }}>—</Text> },
    { title: 'Cost', dataIndex: 'selling_cost', width: 68, align: 'right', render: (v) => v != null ? <Text style={{ fontSize: 11 }}>{Number(v).toFixed(2)}</Text> : <Text type="secondary" style={{ fontSize: 11 }}>—</Text> },
    { title: '$', dataIndex: 'currency', width: 38, render: (v) => <Text style={{ fontSize: 10 }}>{v || 'USD'}</Text> },
    {
      title: 'Total', key: 'total', width: 76, align: 'right',
      render: (_, r) => {
        const val = (r.delivery_qty || 0) * (r.selling_price || 0)
        return <Text style={{ fontSize: 11, color: '#1677ff' }}>{val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
      },
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Space size={4}>
          <ToolBtn icon={<PlusOutlined />} onClick={openAddLine} title="Add line" />
          <ToolBtn icon={<EditOutlined />} onClick={openEditLine} disabled={!selectedLineId} title="Edit selected line" />
          <Popconfirm
            title={`Delete line #${selectedLine?.line_number}?`}
            onConfirm={handleLineDelete}
            okText="Delete" okButtonProps={{ danger: true }}
            disabled={!selectedLineId}
          >
            <span><ToolBtn icon={<DeleteOutlined />} disabled={!selectedLineId} title="Delete selected line" danger /></span>
          </Popconfirm>
        </Space>
        <Text type="secondary" style={{ fontSize: 11 }}>{lines.length} line{lines.length !== 1 ? 's' : ''}</Text>
      </div>
      <Table
        size="small"
        columns={columns}
        dataSource={lines}
        loading={loading}
        rowKey="id"
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedLineId ? [selectedLineId] : [],
          onChange: ([key]) => setSelectedLineId(key ?? null),
          columnWidth: 28,
        }}
        onRow={(r) => ({ onClick: () => setSelectedLineId((p) => p === r.id ? null : r.id), style: { cursor: 'pointer' } })}
        pagination={false}
        locale={{ emptyText: 'No lines yet — click + to add' }}
      />
      <LineModal
        open={lineModalOpen}
        onClose={() => setLineModalOpen(false)}
        onSaved={() => { setLineModalOpen(false); load() }}
        token={token}
        orderId={order.id}
        editLine={editLine}
        allColors={allColors}
        sizes={sizes}
        uoms={uoms}
        allProducts={allProducts}
        categories={categories}
        subCategories={subCategories}
      />
    </div>
  )
}


// ── Main OrdersApp ─────────────────────────────────────────────────────────────
export default function OrdersApp({ session }) {
  const token = session.access_token

  // List state
  const [orders, setOrders]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [pageSize, setPageSize]     = useState(25)
  const [search, setSearch]         = useState('')
  const [filterStatus, setFilterStatus]     = useState(null)
  const [filterCustomer, setFilterCustomer] = useState(null)
  const [filterSeason, setFilterSeason]     = useState(null)
  const [importOpen, setImportOpen]         = useState(false)

  // Modal state
  const [modalOpen, setModalOpen]   = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [activeTab, setActiveTab]   = useState('header')
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()
  const { modalWidth, bodyHeight, resetSize } = useResizableModal({ defaultWidth: 760, defaultHeight: 540, minWidth: 560, minHeight: 380 })

  // Reference data
  const [customers, setCustomers]       = useState([])
  const [allBrands, setAllBrands]       = useState([])
  const [allProducts, setAllProducts]   = useState([])
  const [categories, setCategories]     = useState([])
  const [subCategories, setSubCategories] = useState([])
  const [colors, setColors]             = useState([])
  const [sizes, setSizes]               = useState([])
  const [uoms, setUoms]                 = useState([])
  const [seasons, setSeasons]           = useState([])
  const [allOrders, setAllOrders]       = useState([])

  // Watched form values
  const watchedStatus = Form.useWatch('status', form)

  const showParentOrder = watchedStatus === 'Projection' || watchedStatus === 'Under Projection'

  // Load reference data once
  useEffect(() => {
    fetchCustomers(token, { page: 1, pageSize: 1000 }).then((d) => setCustomers(d.items)).catch(() => {})
    fetchAllBrands(token).then(setAllBrands).catch(() => {})
    fetchProducts(token, { page: 1, pageSize: 1000 }).then((d) => setAllProducts(d.items)).catch(() => {})
    fetchCategories(token).then(setCategories).catch(() => {})
    fetchSubCategories(token).then(setSubCategories).catch(() => {})
    fetchColors(token).then(setColors).catch(() => {})
    fetchSizes(token).then(setSizes).catch(() => {})
    fetchUoM(token).then(setUoms).catch(() => {})
    fetchSeasons(token).then(setSeasons).catch(() => {})
  }, [token])

  const load = useCallback((p, ps, s, st, ci, si) => {
    setLoading(true)
    fetchOrders(token, { page: p, page_size: ps, search: s, status: st || undefined, customer_id: ci || undefined, season_id: si || undefined })
      .then((d) => { setOrders(d.items); setTotal(d.total) })
      .catch(() => message.error('Failed to load orders'))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => { load(1, 25, '', null, null, null) }, [load])

  // Reload parent-order dropdown on each modal open
  useEffect(() => {
    if (modalOpen) {
      fetchOrders(token, { page: 1, page_size: 1000 }).then((d) => setAllOrders(d.items)).catch(() => {})
    }
  }, [modalOpen, token])

  const openCreate = () => {
    setEditTarget(null)
    form.resetFields()
    form.setFieldsValue({ status: 'Forecast', currency: 'USD' })
    resetSize()
    setActiveTab('header')
    setModalOpen(true)
  }

  const openEdit = (record) => {
    setEditTarget(record)
    form.setFieldsValue({
      name:            record.name,
      status:          record.status,
      description:     record.description ?? '',
      customer_id:     record.customer_id ?? undefined,
      brand_id:        record.brand_id ?? undefined,
      customer_po:     record.customer_po ?? '',
      season_id:       record.season_id ?? undefined,
      parent_order_id: record.parent_order_id ?? undefined,
    })
    resetSize()
    setActiveTab('header')
    setModalOpen(true)
  }

  const handleFinish = async (values) => {
    setSubmitting(true)
    const payload = {
      name:            values.name?.trim(),
      status:          values.status ?? 'Forecast',
      description:     values.description?.trim() || null,
      customer_id:     values.customer_id ?? null,
      brand_id:        values.brand_id ?? null,
      customer_po:     values.customer_po?.trim() || null,
      season_id:       values.season_id ?? null,
      parent_order_id: showParentOrder ? (values.parent_order_id ?? null) : null,
    }
    try {
      if (editTarget) {
        await updateOrder(token, editTarget.id, payload)
        message.success('Order updated')
      } else {
        const created = await createOrder(token, payload)
        message.success('Order created')
        setEditTarget(created)
        setActiveTab('lines')
        load(page, pageSize, search, filterStatus, filterCustomer, filterSeason)
        setSubmitting(false)
        return
      }
      setModalOpen(false)
      load(page, pageSize, search, filterStatus, filterCustomer, filterSeason)
    } catch (err) { message.error(err.message) }
    finally { setSubmitting(false) }
  }

  const handleDelete = async () => {
    if (!editTarget) return
    try {
      await deleteOrder(token, editTarget.id)
      message.success(`Order "${editTarget.name}" deleted`)
      setModalOpen(false)
      setEditTarget(null)
      load(page, pageSize, search, filterStatus, filterCustomer, filterSeason)
    } catch (err) { message.error(err.message) }
  }

  const columns = [
    {
      title: 'Order Name', dataIndex: 'name', width: 180,
      render: (v) => <Text style={{ color: '#1677ff', fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Lines', dataIndex: 'line_count', width: 60, align: 'center',
      render: (v) => (
        <Tag icon={<UnorderedListOutlined />} color={v > 0 ? 'blue' : 'default'} style={{ fontSize: 11 }}>{v}</Tag>
      ),
    },
    {
      title: 'Status', dataIndex: 'status', width: 130,
      render: (v) => <Tag color={STATUS_COLOR[v] ?? 'default'} style={{ fontSize: 11 }}>{v}</Tag>,
    },
    {
      title: 'Customer', dataIndex: 'customer_name', width: 140,
      render: (v) => v || <Text type="secondary" style={{ fontSize: 11 }}>—</Text>,
    },
    {
      title: 'Season', dataIndex: 'season_name', width: 90,
      render: (v) => v ? <Tag style={{ fontSize: 11 }}>{v}</Tag> : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>,
    },
    {
      title: 'Customer PO', dataIndex: 'customer_po', width: 110,
      render: (v) => v || <Text type="secondary" style={{ fontSize: 11 }}>—</Text>,
    },
    {
      title: 'Created', dataIndex: 'created_at', width: 120,
      render: (v) => v ? <Text style={{ fontSize: 11 }}>{formatDate(v)}</Text> : '—',
    },
  ]

  return (
    <div style={{ padding: '10px 14px', fontSize: 12 }}>
      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Space size={4}>
          <ToolBtn icon={<PlusOutlined />} onClick={openCreate} title="New order" />
          <ToolBtn icon={<UploadOutlined />} onClick={() => setImportOpen(true)} title="Import from CSV" />
          <div style={{ width: 1, height: 18, background: '#d0d7de', margin: '0 4px' }} />
          <Select
            size="small"
            allowClear
            placeholder="All Statuses"
            style={{ width: 150 }}
            options={ORDER_STATUSES.map((s) => ({ value: s, label: s }))}
            value={filterStatus}
            onChange={(val) => {
              setFilterStatus(val ?? null)
              setPage(1)
              load(1, pageSize, search, val ?? null, filterCustomer, filterSeason)
            }}
          />
          <Select
            size="small"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="All Customers"
            style={{ width: 150 }}
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
            value={filterCustomer}
            onChange={(val) => {
              setFilterCustomer(val ?? null)
              setPage(1)
              load(1, pageSize, search, filterStatus, val ?? null, filterSeason)
            }}
          />
          <Select
            size="small"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="All Seasons"
            style={{ width: 120 }}
            options={seasons.map((s) => ({ value: s.id, label: s.year ? `${s.name} (${s.year})` : s.name }))}
            value={filterSeason}
            onChange={(val) => {
              setFilterSeason(val ?? null)
              setPage(1)
              load(1, pageSize, search, filterStatus, filterCustomer, val ?? null)
            }}
          />
        </Space>
        <Space size={4}>
          <Input.Search
            allowClear
            placeholder="Search name / PO…"
            size="small"
            style={{ width: 200 }}
            onSearch={(val) => { const s = val.trim(); setSearch(s); setPage(1); load(1, pageSize, s, filterStatus, filterCustomer, filterSeason) }}
            onChange={(e) => { if (!e.target.value) { setSearch(''); setPage(1); load(1, pageSize, '', filterStatus, filterCustomer, filterSeason) } }}
          />
          <ToolBtn icon={<ReloadOutlined />} onClick={() => load(page, pageSize, search, filterStatus, filterCustomer, filterSeason)} title="Refresh" />
        </Space>
      </div>

      {/* ── Table ── */}
      <Table
        size="small"
        columns={columns}
        dataSource={orders}
        loading={loading}
        rowKey="id"
        onRow={(record) => ({
          onClick: () => openEdit(record),
          style: { cursor: 'pointer' },
        })}
        onChange={(pag) => {
          const p = pag.current, ps = pag.pageSize
          setPage(p); setPageSize(ps)
          load(p, ps, search, filterStatus, filterCustomer, filterSeason)
        }}
        pagination={{
          current: page, pageSize, total,
          showSizeChanger: true,
          pageSizeOptions: ['10', '25', '50', '100'],
          showTotal: (t, [from, to]) => `${from}–${to} of ${t}`,
        }}
        scroll={{ x: 1050 }}
      />

      {/* ── Order Modal ── */}
      <Modal
        title={editTarget ? `Edit — ${editTarget.name}` : 'New Order'}
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
              key: 'header',
              label: 'Header',
              children: (
                <Form form={form} layout="vertical" onFinish={handleFinish} style={{ marginTop: 4 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <Form.Item name="name" label="Order Name" rules={[{ required: true, message: 'Required' }]} style={{ marginBottom: 8, gridColumn: '1 / -1' }}>
                      <Input placeholder="e.g. ORD-2025-001" size="small" />
                    </Form.Item>
                    <Form.Item name="status" label="Status" style={{ marginBottom: 8 }}>
                      <Select
                        size="small"
                        options={ORDER_STATUSES.map((s) => ({ value: s, label: s }))}
                      />
                    </Form.Item>
                    <Form.Item name="season_id" label="Season" style={{ marginBottom: 8 }}>
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        placeholder="Select season"
                        size="small"
                        options={seasons.map((s) => ({ value: s.id, label: s.year ? `${s.name} (${s.year})` : s.name }))}
                      />
                    </Form.Item>
                    <Form.Item name="customer_po" label="Customer PO" style={{ marginBottom: 8 }}>
                      <Input placeholder="PO number" size="small" />
                    </Form.Item>
                    <Form.Item name="customer_id" label="Customer" style={{ marginBottom: 8 }}>
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        placeholder="Select customer"
                        size="small"
                        options={customers.map((c) => ({ value: c.id, label: c.name }))}
                      />
                    </Form.Item>
                    <Form.Item name="brand_id" label="Brand" style={{ marginBottom: 8 }}>
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        placeholder="Auto-filled or select"
                        size="small"
                        options={allBrands.map((b) => ({ value: b.id, label: b.name }))}
                      />
                    </Form.Item>
                    {showParentOrder && (
                      <Form.Item name="parent_order_id" label="Parent Order" style={{ marginBottom: 8, gridColumn: '1 / -1' }}>
                        <Select
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          placeholder="Link to parent order"
                          size="small"
                          options={allOrders
                            .filter((o) => !editTarget || o.id !== editTarget.id)
                            .map((o) => ({ value: o.id, label: o.name }))}
                        />
                      </Form.Item>
                    )}
                    <Form.Item name="description" label="Description" style={{ marginBottom: 8, gridColumn: '1 / -1' }}>
                      <Input.TextArea rows={2} placeholder="Optional notes" size="small" />
                    </Form.Item>
                  </div>
                  <Space style={{ justifyContent: 'flex-end', width: '100%', marginTop: 4 }}>
                    {editTarget && (
                      <Popconfirm
                        title={`Delete "${editTarget.name}"?`}
                        description="All lines will also be deleted."
                        onConfirm={handleDelete}
                        okText="Delete" okButtonProps={{ danger: true }}
                      >
                        <Button size="small" danger>Delete</Button>
                      </Popconfirm>
                    )}
                    <Button size="small" onClick={() => { setModalOpen(false); form.resetFields() }}>Cancel</Button>
                    <Button size="small" type="primary" htmlType="submit" loading={submitting}>
                      {editTarget ? 'Save Changes' : 'Create Order'}
                    </Button>
                  </Space>
                </Form>
              ),
            },
            {
              key: 'lines',
              label: `Lines${editTarget ? ` (${editTarget.line_count ?? 0})` : ''}`,
              disabled: !editTarget,
              children: editTarget ? (
                <LinesPanel
                  order={editTarget}
                  token={token}
                  allColors={colors}
                  sizes={sizes}
                  uoms={uoms}
                  allProducts={allProducts}
                  categories={categories}
                  subCategories={subCategories}
                />
              ) : null,
            },
            {
              key: 'history',
              label: 'History',
              disabled: !editTarget,
              children: (
                <AuditLogTab
                  fetchFn={editTarget ? (t) => fetchOrderAuditLog(t, editTarget.id) : null}
                  token={token}
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
        onDone={() => load(page, pageSize, search, filterStatus, filterCustomer, filterSeason)}
        entityName="Orders"
        onPreview={(file) => previewOrderImport(token, file)}
        onConfirm={(rows) => confirmOrderImport(token, rows)}
        onTemplate={() => downloadOrderTemplate(token)}
      />
    </div>
  )
}
