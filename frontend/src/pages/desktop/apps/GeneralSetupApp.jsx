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
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import { useEffect, useState } from 'react'
import { DATE_FORMAT_OPTIONS, getDateFormat, setDateFormat } from '../../../utils/dateFormat'
import { useResizableModal } from '../../../hooks/useResizableModal'
import {
  createCategory, createColor, createSize, createSizeSet, createSubCategory,
  deleteCategory, deleteColor, deleteSize, deleteSizeSet, deleteSubCategory,
  fetchCategories, fetchColors, fetchSizes, fetchSizeSets, fetchSubCategories,
  updateCategory, updateColor, updateSize, updateSizeSet, updateSubCategory,
} from '../../../services/setup'

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

const nameCol = {
  title: 'Name', dataIndex: 'name',
  sorter: (a, b) => a.name.localeCompare(b.name),
  render: (v) => <span style={{ color: '#1677ff', fontSize: 12 }}>{v}</span>,
}

// ─── Categories tab ────────────────────────────────────────────────────────────

function CategoriesTab({ token }) {
  const [cats, setCats]               = useState([])
  const [loadingCat, setLoadingCat]   = useState(true)
  const [selectedCatId, setSelectedCatId] = useState(null)
  const [subs, setSubs]               = useState([])
  const [loadingSub, setLoadingSub]   = useState(false)
  const [selectedSubId, setSelectedSubId] = useState(null)

  const [catModalOpen, setCatModalOpen] = useState(false)
  const [catTarget, setCatTarget]       = useState(null)
  const [catSaving, setCatSaving]       = useState(false)
  const [catForm] = Form.useForm()
  const { modalWidth: cW, bodyHeight: cH, resetSize: cRS } =
    useResizableModal({ defaultWidth: 340, defaultHeight: 180, minWidth: 260, minHeight: 140 })

  const [subModalOpen, setSubModalOpen] = useState(false)
  const [subTarget, setSubTarget]       = useState(null)
  const [subSaving, setSubSaving]       = useState(false)
  const [subForm] = Form.useForm()
  const { modalWidth: sW, bodyHeight: sH, resetSize: sRS } =
    useResizableModal({ defaultWidth: 340, defaultHeight: 180, minWidth: 260, minHeight: 140 })

  const loadCats = () => {
    setLoadingCat(true)
    fetchCategories(token).then(setCats).catch(() => message.error('Failed to load categories')).finally(() => setLoadingCat(false))
  }
  const loadSubs = (catId) => {
    setLoadingSub(true)
    fetchSubCategories(token, catId).then(setSubs).catch(() => message.error('Failed to load sub-categories')).finally(() => setLoadingSub(false))
  }

  useEffect(() => { loadCats() }, [])
  useEffect(() => { setSelectedSubId(null); setSubs([]); if (selectedCatId) loadSubs(selectedCatId) }, [selectedCatId])

  const selectedCat = cats.find((c) => c.id === selectedCatId) ?? null
  const selectedSub = subs.find((s) => s.id === selectedSubId) ?? null

  const openCatCreate = () => { setCatTarget(null); catForm.resetFields(); cRS(); setCatModalOpen(true) }
  const openCatEdit   = () => { if (!selectedCat) return; setCatTarget(selectedCat); catForm.setFieldsValue({ name: selectedCat.name }); cRS(); setCatModalOpen(true) }
  const handleCatFinish = async (values) => {
    setCatSaving(true)
    try {
      if (catTarget) { await updateCategory(token, catTarget.id, values); message.success('Category updated') }
      else { await createCategory(token, values); message.success('Category added') }
      setCatModalOpen(false); setSelectedCatId(null); loadCats()
    } catch (err) { message.error(err.message) } finally { setCatSaving(false) }
  }
  const handleCatDelete = async () => {
    if (!selectedCat) return
    try { await deleteCategory(token, selectedCat.id); message.success(`"${selectedCat.name}" deleted`); setSelectedCatId(null); loadCats() }
    catch (err) { message.error(err.message) }
  }

  const openSubCreate = () => { setSubTarget(null); subForm.resetFields(); sRS(); setSubModalOpen(true) }
  const openSubEdit   = () => { if (!selectedSub) return; setSubTarget(selectedSub); subForm.setFieldsValue({ name: selectedSub.name }); sRS(); setSubModalOpen(true) }
  const handleSubFinish = async (values) => {
    setSubSaving(true)
    try {
      if (subTarget) { await updateSubCategory(token, subTarget.id, { name: values.name }); message.success('Sub-category updated') }
      else { await createSubCategory(token, { category_id: selectedCatId, name: values.name }); message.success('Sub-category added') }
      setSubModalOpen(false); setSelectedSubId(null); loadSubs(selectedCatId)
    } catch (err) { message.error(err.message) } finally { setSubSaving(false) }
  }
  const handleSubDelete = async () => {
    if (!selectedSub) return
    try { await deleteSubCategory(token, selectedSub.id); message.success(`"${selectedSub.name}" deleted`); setSelectedSubId(null); loadSubs(selectedCatId) }
    catch (err) { message.error(err.message) }
  }

  const simpleTable = (data, loading, selectedId, onSelect, emptyText) => (
    <Table size="small" dataSource={data} loading={loading} rowKey="id" columns={[nameCol]}
      locale={{ emptyText }}
      rowSelection={{ type: 'radio', selectedRowKeys: selectedId ? [selectedId] : [], onChange: ([k]) => onSelect(k ?? null), columnWidth: 36 }}
      onRow={(r) => ({ onClick: () => onSelect((p) => p === r.id ? null : r.id), style: { cursor: 'pointer' } })}
      pagination={{ pageSize: 15, showSizeChanger: false }}
    />
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* Categories */}
      <div>
        <div style={{ fontWeight: 600, fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Categories</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Space size={4}>
            <ToolBtn icon={<PlusOutlined />} onClick={openCatCreate} title="Add" />
            <ToolBtn icon={<EditOutlined />} onClick={openCatEdit} disabled={!selectedCatId} title="Edit" />
            <Popconfirm title={`Delete "${selectedCat?.name}"?`} onConfirm={handleCatDelete} okText="Delete" okButtonProps={{ danger: true }} disabled={!selectedCatId}>
              <span><ToolBtn icon={<DeleteOutlined />} disabled={!selectedCatId} title="Delete" /></span>
            </Popconfirm>
          </Space>
          <ToolBtn icon={<ReloadOutlined />} onClick={loadCats} title="Refresh" />
        </div>
        {simpleTable(cats, loadingCat, selectedCatId, setSelectedCatId, 'No categories')}
        <Modal title={catTarget ? 'Edit Category' : 'Add Category'} open={catModalOpen} onCancel={() => { setCatModalOpen(false); catForm.resetFields() }} footer={null} width={cW} destroyOnHidden draggable styles={{ body: { maxHeight: cH, overflowY: 'auto' } }}>
          <Form form={catForm} layout="vertical" onFinish={handleCatFinish} style={{ marginTop: 12 }}>
            <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]} style={{ marginBottom: 8 }}>
              <Input size="small" placeholder="e.g. Tops" autoFocus />
            </Form.Item>
            <Space style={{ justifyContent: 'flex-end', width: '100%', marginTop: 4 }}>
              <Button size="small" onClick={() => { setCatModalOpen(false); catForm.resetFields() }}>Cancel</Button>
              <Button size="small" type="primary" htmlType="submit" loading={catSaving}>{catTarget ? 'Save' : 'Add'}</Button>
            </Space>
          </Form>
        </Modal>
      </div>

      {/* Sub-categories */}
      <div style={{ opacity: selectedCatId ? 1 : 0.45 }}>
        <div style={{ fontWeight: 600, fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
          Sub-Categories{selectedCat ? ` — ${selectedCat.name}` : ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Space size={4}>
            <ToolBtn icon={<PlusOutlined />} onClick={openSubCreate} disabled={!selectedCatId} title="Add" />
            <ToolBtn icon={<EditOutlined />} onClick={openSubEdit} disabled={!selectedSubId} title="Edit" />
            <Popconfirm title={`Delete "${selectedSub?.name}"?`} onConfirm={handleSubDelete} okText="Delete" okButtonProps={{ danger: true }} disabled={!selectedSubId}>
              <span><ToolBtn icon={<DeleteOutlined />} disabled={!selectedSubId} title="Delete" /></span>
            </Popconfirm>
          </Space>
          <ToolBtn icon={<ReloadOutlined />} onClick={() => { if (selectedCatId) loadSubs(selectedCatId) }} title="Refresh" />
        </div>
        {simpleTable(subs, loadingSub, selectedSubId, setSelectedSubId, selectedCatId ? 'No sub-categories' : 'Select a category first')}
        <Modal title={subTarget ? 'Edit Sub-Category' : 'Add Sub-Category'} open={subModalOpen} onCancel={() => { setSubModalOpen(false); subForm.resetFields() }} footer={null} width={sW} destroyOnHidden draggable styles={{ body: { maxHeight: sH, overflowY: 'auto' } }}>
          <Form form={subForm} layout="vertical" onFinish={handleSubFinish} style={{ marginTop: 12 }}>
            <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]} style={{ marginBottom: 8 }}>
              <Input size="small" placeholder="e.g. T-Shirts" autoFocus />
            </Form.Item>
            <Space style={{ justifyContent: 'flex-end', width: '100%', marginTop: 4 }}>
              <Button size="small" onClick={() => { setSubModalOpen(false); subForm.resetFields() }}>Cancel</Button>
              <Button size="small" type="primary" htmlType="submit" loading={subSaving}>{subTarget ? 'Save' : 'Add'}</Button>
            </Space>
          </Form>
        </Modal>
      </div>
    </div>
  )
}

// ─── Colors tab ────────────────────────────────────────────────────────────────

function ColorsTab({ token }) {
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [modalOpen, setModalOpen]   = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [saving, setSaving]         = useState(false)
  const [form] = Form.useForm()
  const { modalWidth, bodyHeight, resetSize } =
    useResizableModal({ defaultWidth: 340, defaultHeight: 180, minWidth: 260, minHeight: 140 })

  const load = () => {
    setLoading(true)
    fetchColors(token).then(setItems).catch(() => message.error('Failed to load colors')).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const selected = items.find((i) => i.id === selectedId) ?? null
  const openCreate = () => { setEditTarget(null); form.resetFields(); resetSize(); setModalOpen(true) }
  const openEdit   = () => { if (!selected) return; setEditTarget(selected); form.setFieldsValue({ name: selected.name }); resetSize(); setModalOpen(true) }
  const handleFinish = async (values) => {
    setSaving(true)
    try {
      if (editTarget) { await updateColor(token, editTarget.id, values); message.success('Color updated') }
      else { await createColor(token, values); message.success('Color added') }
      setModalOpen(false); setSelectedId(null); load()
    } catch (err) { message.error(err.message) } finally { setSaving(false) }
  }
  const handleDelete = async () => {
    if (!selected) return
    try { await deleteColor(token, selected.id); message.success(`"${selected.name}" deleted`); setSelectedId(null); load() }
    catch (err) { message.error(err.message) }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Space size={4}>
          <ToolBtn icon={<PlusOutlined />} onClick={openCreate} title="Add color" />
          <ToolBtn icon={<EditOutlined />} onClick={openEdit} disabled={!selectedId} title="Edit color" />
          <Popconfirm title={`Delete "${selected?.name}"?`} onConfirm={handleDelete} okText="Delete" okButtonProps={{ danger: true }} disabled={!selectedId}>
            <span><ToolBtn icon={<DeleteOutlined />} disabled={!selectedId} title="Delete" /></span>
          </Popconfirm>
        </Space>
        <ToolBtn icon={<ReloadOutlined />} onClick={load} title="Refresh" />
      </div>
      <Table size="small" dataSource={items} loading={loading} rowKey="id" columns={[nameCol]}
        rowSelection={{ type: 'radio', selectedRowKeys: selectedId ? [selectedId] : [], onChange: ([k]) => setSelectedId(k ?? null), columnWidth: 36 }}
        onRow={(r) => ({ onClick: () => setSelectedId((p) => p === r.id ? null : r.id), style: { cursor: 'pointer' } })}
        pagination={{ pageSize: 15, showSizeChanger: false, showTotal: (t, [f, l]) => `${f}–${l} of ${t}` }}
      />
      <Modal title={editTarget ? 'Edit Color' : 'Add Color'} open={modalOpen} onCancel={() => { setModalOpen(false); form.resetFields() }} footer={null} width={modalWidth} destroyOnHidden draggable styles={{ body: { maxHeight: bodyHeight, overflowY: 'auto' } }}>
        <Form form={form} layout="vertical" onFinish={handleFinish} style={{ marginTop: 12 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]} style={{ marginBottom: 8 }}>
            <Input size="small" placeholder="e.g. Navy Blue" autoFocus />
          </Form.Item>
          <Space style={{ justifyContent: 'flex-end', width: '100%', marginTop: 4 }}>
            <Button size="small" onClick={() => { setModalOpen(false); form.resetFields() }}>Cancel</Button>
            <Button size="small" type="primary" htmlType="submit" loading={saving}>{editTarget ? 'Save' : 'Add'}</Button>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}

// ─── Sizes tab ─────────────────────────────────────────────────────────────────

function SizesTab({ token }) {
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [modalOpen, setModalOpen]   = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [saving, setSaving]         = useState(false)
  const [form] = Form.useForm()
  const { modalWidth, bodyHeight, resetSize } =
    useResizableModal({ defaultWidth: 340, defaultHeight: 220, minWidth: 260, minHeight: 160 })

  const load = () => {
    setLoading(true)
    fetchSizes(token).then(setItems).catch(() => message.error('Failed to load sizes')).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const selected = items.find((i) => i.id === selectedId) ?? null
  const openCreate = () => { setEditTarget(null); form.resetFields(); form.setFieldsValue({ sequence: 0 }); resetSize(); setModalOpen(true) }
  const openEdit   = () => { if (!selected) return; setEditTarget(selected); form.setFieldsValue({ name: selected.name, sequence: selected.sequence }); resetSize(); setModalOpen(true) }
  const handleFinish = async (values) => {
    setSaving(true)
    try {
      if (editTarget) { await updateSize(token, editTarget.id, values); message.success('Size updated') }
      else { await createSize(token, values); message.success('Size added') }
      setModalOpen(false); setSelectedId(null); load()
    } catch (err) { message.error(err.message) } finally { setSaving(false) }
  }
  const handleDelete = async () => {
    if (!selected) return
    try { await deleteSize(token, selected.id); message.success(`"${selected.name}" deleted`); setSelectedId(null); load() }
    catch (err) { message.error(err.message) }
  }

  const columns = [
    nameCol,
    { title: 'Sequence', dataIndex: 'sequence', width: 100, align: 'right', sorter: (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0), render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Space size={4}>
          <ToolBtn icon={<PlusOutlined />} onClick={openCreate} title="Add size" />
          <ToolBtn icon={<EditOutlined />} onClick={openEdit} disabled={!selectedId} title="Edit size" />
          <Popconfirm title={`Delete "${selected?.name}"?`} onConfirm={handleDelete} okText="Delete" okButtonProps={{ danger: true }} disabled={!selectedId}>
            <span><ToolBtn icon={<DeleteOutlined />} disabled={!selectedId} title="Delete" /></span>
          </Popconfirm>
        </Space>
        <ToolBtn icon={<ReloadOutlined />} onClick={load} title="Refresh" />
      </div>
      <Table size="small" dataSource={items} loading={loading} rowKey="id" columns={columns}
        rowSelection={{ type: 'radio', selectedRowKeys: selectedId ? [selectedId] : [], onChange: ([k]) => setSelectedId(k ?? null), columnWidth: 36 }}
        onRow={(r) => ({ onClick: () => setSelectedId((p) => p === r.id ? null : r.id), style: { cursor: 'pointer' } })}
        pagination={{ pageSize: 15, showSizeChanger: false, showTotal: (t, [f, l]) => `${f}–${l} of ${t}` }}
      />
      <Modal title={editTarget ? 'Edit Size' : 'Add Size'} open={modalOpen} onCancel={() => { setModalOpen(false); form.resetFields() }} footer={null} width={modalWidth} destroyOnHidden draggable styles={{ body: { maxHeight: bodyHeight, overflowY: 'auto' } }}>
        <Form form={form} layout="vertical" onFinish={handleFinish} style={{ marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]} style={{ marginBottom: 8 }}>
              <Input size="small" placeholder="e.g. XS" autoFocus />
            </Form.Item>
            <Form.Item name="sequence" label="Sequence" style={{ marginBottom: 8 }}>
              <InputNumber size="small" min={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Space style={{ justifyContent: 'flex-end', width: '100%', marginTop: 4 }}>
            <Button size="small" onClick={() => { setModalOpen(false); form.resetFields() }}>Cancel</Button>
            <Button size="small" type="primary" htmlType="submit" loading={saving}>{editTarget ? 'Save' : 'Add'}</Button>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}

// ─── Size Sets tab ─────────────────────────────────────────────────────────────

function SizeSetsTab({ token }) {
  const [sizeSets, setSizeSets] = useState([])
  const [allSizes, setAllSizes] = useState([])
  const [loading, setLoading]   = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [modalOpen, setModalOpen]   = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [saving, setSaving]         = useState(false)
  const [form] = Form.useForm()
  const { modalWidth, bodyHeight, resetSize } =
    useResizableModal({ defaultWidth: 420, defaultHeight: 260, minWidth: 340, minHeight: 180 })

  const load = () => {
    setLoading(true)
    Promise.all([fetchSizeSets(token), fetchSizes(token)])
      .then(([sets, sizes]) => { setSizeSets(sets); setAllSizes(sizes) })
      .catch(() => message.error('Failed to load size sets'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const selected = sizeSets.find((s) => s.id === selectedId) ?? null
  const openCreate = () => { setEditTarget(null); form.resetFields(); resetSize(); setModalOpen(true) }
  const openEdit   = () => {
    if (!selected) return
    setEditTarget(selected)
    form.setFieldsValue({ name: selected.name, size_ids: selected.sizes.map((s) => s.id) })
    resetSize()
    setModalOpen(true)
  }
  const handleFinish = async (values) => {
    setSaving(true)
    try {
      const payload = { name: values.name, size_ids: values.size_ids ?? [] }
      if (editTarget) { await updateSizeSet(token, editTarget.id, payload); message.success('Size set updated') }
      else { await createSizeSet(token, payload); message.success('Size set created') }
      setModalOpen(false); setSelectedId(null); load()
    } catch (err) { message.error(err.message) } finally { setSaving(false) }
  }
  const handleDelete = async () => {
    if (!selected) return
    try { await deleteSizeSet(token, selected.id); message.success(`"${selected.name}" deleted`); setSelectedId(null); load() }
    catch (err) { message.error(err.message) }
  }

  const columns = [
    nameCol,
    {
      title: 'Sizes', dataIndex: 'sizes', width: 320,
      render: (sizes) => sizes.length
        ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{sizes.map((s) => <Tag key={s.id} style={{ fontSize: 11, margin: 0 }}>{s.name}</Tag>)}</div>
        : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Space size={4}>
          <ToolBtn icon={<PlusOutlined />} onClick={openCreate} title="Add size set" />
          <ToolBtn icon={<EditOutlined />} onClick={openEdit} disabled={!selectedId} title="Edit size set" />
          <Popconfirm title={`Delete "${selected?.name}"?`} onConfirm={handleDelete} okText="Delete" okButtonProps={{ danger: true }} disabled={!selectedId}>
            <span><ToolBtn icon={<DeleteOutlined />} disabled={!selectedId} title="Delete" /></span>
          </Popconfirm>
        </Space>
        <ToolBtn icon={<ReloadOutlined />} onClick={load} title="Refresh" />
      </div>
      <Table size="small" dataSource={sizeSets} loading={loading} rowKey="id" columns={columns}
        rowSelection={{ type: 'radio', selectedRowKeys: selectedId ? [selectedId] : [], onChange: ([k]) => setSelectedId(k ?? null), columnWidth: 36 }}
        onRow={(r) => ({ onClick: () => setSelectedId((p) => p === r.id ? null : r.id), style: { cursor: 'pointer' } })}
        pagination={{ pageSize: 15, showSizeChanger: false, showTotal: (t, [f, l]) => `${f}–${l} of ${t}` }}
      />
      <Modal title={editTarget ? 'Edit Size Set' : 'Add Size Set'} open={modalOpen} onCancel={() => { setModalOpen(false); form.resetFields() }} footer={null} width={modalWidth} destroyOnHidden draggable styles={{ body: { maxHeight: bodyHeight, overflowY: 'auto' } }}>
        <Form form={form} layout="vertical" onFinish={handleFinish} style={{ marginTop: 12 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]} style={{ marginBottom: 8 }}>
            <Input size="small" placeholder="e.g. Standard Sizes" autoFocus />
          </Form.Item>
          <Form.Item name="size_ids" label="Sizes" style={{ marginBottom: 8 }}>
            <Select mode="multiple" size="small" placeholder="Select sizes to include…" allowClear
              options={allSizes.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Form.Item>
          <Space style={{ justifyContent: 'flex-end', width: '100%', marginTop: 4 }}>
            <Button size="small" onClick={() => { setModalOpen(false); form.resetFields() }}>Cancel</Button>
            <Button size="small" type="primary" htmlType="submit" loading={saving}>{editTarget ? 'Save' : 'Add'}</Button>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

// ─── General tab ──────────────────────────────────────────────────────────────

function GeneralTab() {
  const [dateFormat, setDateFormatState] = useState(getDateFormat)

  const handleDateFormatChange = (val) => {
    setDateFormat(val)
    setDateFormatState(val)
  }

  return (
    <div style={{ maxWidth: 480, paddingTop: 8 }}>
      <div style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 12, fontWeight: 600, color: '#1e3a5f', display: 'block', marginBottom: 12 }}>
          Display Preferences
        </Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Text style={{ fontSize: 12, color: '#374151', minWidth: 100 }}>Date Format</Text>
          <Select
            value={dateFormat}
            onChange={handleDateFormatChange}
            options={DATE_FORMAT_OPTIONS}
            style={{ width: 260 }}
            size="small"
          />
        </div>
      </div>
    </div>
  )
}

export default function GeneralSetupApp({ session }) {
  const token = session.access_token
  return (
    <div style={{ padding: '10px 14px', fontSize: 12 }}>
      <Tabs
        size="small"
        items={[
          { key: 'general',    label: 'General',     children: <GeneralTab /> },
          { key: 'categories', label: 'Categories',  children: <CategoriesTab token={token} /> },
          { key: 'colors',     label: 'Colors',      children: <ColorsTab     token={token} /> },
          { key: 'sizes',      label: 'Sizes',        children: <SizesTab      token={token} /> },
          { key: 'size-sets',  label: 'Size Sets',    children: <SizeSetsTab   token={token} /> },
        ]}
      />
    </div>
  )
}
