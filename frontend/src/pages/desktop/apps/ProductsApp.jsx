import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  DeleteOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Checkbox,
  Divider,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Popover,
  Select,
  Space,
  Table,
  Tabs,
  Typography,
} from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useResizableModal } from '../../../hooks/useResizableModal'
import AuditLogTab from '../../../components/AuditLogTab'
import ImportModal from '../../../components/ImportModal'
import { fetchProductAuditLog } from '../../../services/audit'
import { confirmProductImport, downloadProductTemplate, previewProductImport } from '../../../services/importService'
import SavedViewsBtn from '../../../components/SavedViewsBtn'
import { fetchAllBrands, fetchAllCustomers } from '../../../services/customers'
import {
  createProduct,
  createVersion,
  createVersionStep,
  deleteProduct,
  deleteVersion,
  deleteVersionStep,
  fetchColorSizes,
  fetchProducts,
  fetchVersions,
  fetchVersionSteps,
  reorderVersionSteps,
  saveColorSizes,
  updateProduct,
  updateVersionStep,
} from '../../../services/products'
import {
  fetchCategories,
  fetchColors,
  fetchProcesses,
  fetchSizes,
  fetchSizeSets,
  fetchSubCategories,
} from '../../../services/setup'

const { Text } = Typography

const ALL_COLS = [
  { key: 'name',              label: 'Name',         fixed: true },
  { key: 'department',        label: 'Department' },
  { key: 'category_name',     label: 'Category' },
  { key: 'sub_category_name', label: 'Sub-Category' },
  { key: 'customer_name',     label: 'Customer' },
  { key: 'brand_name',        label: 'Brand' },
  { key: 'sku',               label: 'SKU' },
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

// ─── Shared ───────────────────────────────────────────────────────────────────

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
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = '#1e3a5f' }}>
      {icon}
    </button>
  )
}

const iconBtnStyle = (bg) => ({
  width: 22, height: 22, borderRadius: 4, background: bg,
  border: 'none', color: '#fff', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
})

const thStyle = (w) => ({
  padding: '6px 8px', fontWeight: 600, fontSize: 11, color: '#555',
  textAlign: 'left', ...(w ? { width: w } : {}),
})
const tdStyle = (w) => ({
  padding: '4px 8px', fontSize: 12, verticalAlign: 'middle',
  borderBottom: '1px solid #f0f0f0', ...(w ? { width: w } : {}),
})

// ─── Sortable step row ────────────────────────────────────────────────────────

function SortableStepRow({ step, processes, token, productId, versionId, onDeleted, onUpdated, isDragging }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: step.id })
  const [editing, setEditing] = useState(false)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const rowStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    background: '#fff',
  }

  const startEdit = () => {
    form.setFieldsValue({
      process_name: step.process_name,
      unit_of_measurement: step.unit_of_measurement ?? '',
      work_content: step.work_content ?? '',
    })
    setEditing(true)
  }

  const save = async () => {
    const vals = await form.validateFields()
    setSaving(true)
    try {
      const updated = await updateVersionStep(token, productId, versionId, step.id, {
        process_name: vals.process_name,
        unit_of_measurement: vals.unit_of_measurement || null,
        work_content: vals.work_content || null,
      })
      onUpdated(updated)
      setEditing(false)
    } catch (err) { message.error(err.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    try {
      await deleteVersionStep(token, productId, versionId, step.id)
      onDeleted(step.id)
    } catch (err) { message.error(err.message) }
  }

  if (editing) {
    return (
      <tr ref={setNodeRef} style={rowStyle}>
        <td style={{ ...tdStyle(28), color: '#bbb' }}><HolderOutlined /></td>
        <td style={{ ...tdStyle(36), color: '#999', textAlign: 'center' }}>{step.sequence}</td>
        <td style={tdStyle()}>
          <Form form={form} component={false}>
            <Form.Item name="process_name" noStyle rules={[{ required: true }]}>
              <Select showSearch size="small" style={{ width: '100%' }} placeholder="Process"
                options={processes.map((p) => ({ value: p.name, label: p.name, uom: p.work_content_unit }))}
                onChange={(val, opt) => form.setFieldValue('unit_of_measurement', opt.uom ?? '')}
              />
            </Form.Item>
          </Form>
        </td>
        <td style={tdStyle(140)}>
          <Form form={form} component={false}>
            <Form.Item name="unit_of_measurement" noStyle>
              <Input size="small" placeholder="UoM" />
            </Form.Item>
          </Form>
        </td>
        <td style={tdStyle(120)}>
          <Form form={form} component={false}>
            <Form.Item name="work_content" noStyle>
              <Input size="small" placeholder="0.000" />
            </Form.Item>
          </Form>
        </td>
        <td style={tdStyle(80)}>
          <Space size={4}>
            <Button size="small" type="primary" loading={saving} onClick={save} style={{ fontSize: 11 }}>Save</Button>
            <Button size="small" onClick={() => { setEditing(false); form.resetFields() }} style={{ fontSize: 11 }}>✕</Button>
          </Space>
        </td>
      </tr>
    )
  }

  return (
    <tr ref={setNodeRef} style={rowStyle}>
      <td style={{ ...tdStyle(28), cursor: 'grab', color: '#aaa' }} {...attributes} {...listeners}>
        <HolderOutlined />
      </td>
      <td style={{ ...tdStyle(36), color: '#999', textAlign: 'center' }}>{step.sequence}</td>
      <td style={{ ...tdStyle(), color: '#1677ff' }}>{step.process_name}</td>
      <td style={tdStyle(140)}>{step.unit_of_measurement || <Text type="secondary">—</Text>}</td>
      <td style={tdStyle(120)}>{step.work_content || <Text type="secondary">—</Text>}</td>
      <td style={tdStyle(80)}>
        <Space size={4}>
          <button onClick={startEdit} title="Edit" style={iconBtnStyle('#1e3a5f')}><EditOutlined /></button>
          <Popconfirm title="Delete this step?" onConfirm={handleDelete} okText="Delete" okButtonProps={{ danger: true }}>
            <button title="Delete" style={iconBtnStyle('#c0392b')}><DeleteOutlined /></button>
          </Popconfirm>
        </Space>
      </td>
    </tr>
  )
}

// ─── Routing Tab ──────────────────────────────────────────────────────────────

function RoutingTab({ productId, token, processes }) {
  const [versions, setVersions]     = useState([])
  const [activeVid, setActiveVid]   = useState(null)
  const [steps, setSteps]           = useState([])
  const [loadingV, setLoadingV]     = useState(true)
  const [loadingS, setLoadingS]     = useState(false)
  const [dragId, setDragId]         = useState(null)
  const [addingStep, setAddingStep] = useState(false)
  const [addForm] = Form.useForm()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const loadVersions = useCallback(async () => {
    setLoadingV(true)
    try {
      const vers = await fetchVersions(token, productId)
      setVersions(vers)
      setActiveVid((prev) => prev ?? (vers[0]?.id ?? null))
    } catch { message.error('Failed to load versions') }
    finally { setLoadingV(false) }
  }, [token, productId])

  useEffect(() => { loadVersions() }, [loadVersions])

  const loadSteps = useCallback(async (vid) => {
    if (!vid) return
    setLoadingS(true)
    try { setSteps(await fetchVersionSteps(token, productId, vid)) }
    catch { message.error('Failed to load steps') }
    finally { setLoadingS(false) }
  }, [token, productId])

  useEffect(() => { loadSteps(activeVid) }, [activeVid, loadSteps])

  const deleteVer = async (vid) => {
    if (versions.length <= 1) return message.warning('Cannot delete the only version.')
    try {
      await deleteVersion(token, productId, vid)
      const remaining = versions.filter((v) => v.id !== vid)
      setVersions(remaining)
      if (activeVid === vid) setActiveVid(remaining[0]?.id ?? null)
    } catch (err) { message.error(err.message) }
  }

  const addVersion = async () => {
    if (versions.length >= 5) return
    const name = `V${versions.length + 1}`
    try {
      const ver = await createVersion(token, productId, { name })
      for (const s of steps) {
        await createVersionStep(token, productId, ver.id, {
          process_name: s.process_name,
          unit_of_measurement: s.unit_of_measurement,
          work_content: s.work_content,
        })
      }
      setVersions((prev) => [...prev, ver])
      setActiveVid(ver.id)
    } catch (err) { message.error(err.message) }
  }

  const handleDragStart = ({ active }) => setDragId(active.id)

  const handleDragEnd = async ({ active, over }) => {
    setDragId(null)
    if (!over || active.id === over.id) return
    const oldIdx = steps.findIndex((s) => s.id === active.id)
    const newIdx = steps.findIndex((s) => s.id === over.id)
    const reordered = arrayMove(steps, oldIdx, newIdx).map((s, i) => ({ ...s, sequence: i + 1 }))
    setSteps(reordered)
    try { await reorderVersionSteps(token, productId, activeVid, reordered.map((s) => s.id)) }
    catch (err) { message.error(err.message); loadSteps(activeVid) }
  }

  const onStepDeleted = (id) => setSteps((prev) => prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, sequence: i + 1 })))
  const onStepUpdated = (updated) => setSteps((prev) => prev.map((s) => s.id === updated.id ? updated : s))

  const submitAddStep = async (vals) => {
    try {
      const step = await createVersionStep(token, productId, activeVid, {
        process_name: vals.process_name,
        unit_of_measurement: vals.unit_of_measurement || null,
        work_content: vals.work_content || null,
      })
      setSteps((prev) => [...prev, step])
      addForm.resetFields()
      setAddingStep(false)
    } catch (err) { message.error(err.message) }
  }

  const activeStep = steps.find((s) => s.id === dragId)

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Version pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {loadingV ? <Text type="secondary" style={{ fontSize: 11 }}>Loading…</Text> : (
          <>
            {versions.map((v) => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <button onClick={() => setActiveVid(v.id)} style={{
                  padding: '3px 10px 3px 14px', borderRadius: versions.length > 1 ? '14px 0 0 14px' : 14,
                  border: '1px solid', borderRight: versions.length > 1 ? 'none' : undefined,
                  fontSize: 12, cursor: 'pointer', transition: 'all 0.12s',
                  background: activeVid === v.id ? '#1e3a5f' : '#f0f4f8',
                  color: activeVid === v.id ? '#fff' : '#1e3a5f',
                  borderColor: activeVid === v.id ? '#1e3a5f' : '#d0d7de',
                  fontWeight: activeVid === v.id ? 600 : 400,
                }}>
                  {v.name}
                </button>
                {versions.length > 1 && (
                  <button onClick={() => deleteVer(v.id)} style={{
                    padding: '3px 7px', borderRadius: '0 14px 14px 0',
                    border: '1px solid', fontSize: 10, cursor: 'pointer',
                    background: activeVid === v.id ? '#1e3a5f' : '#f0f4f8',
                    color: activeVid === v.id ? 'rgba(255,255,255,0.7)' : '#999',
                    borderColor: activeVid === v.id ? '#1e3a5f' : '#d0d7de',
                    lineHeight: 1,
                  }}>
                    ×
                  </button>
                )}
              </div>
            ))}
            {versions.length < 5 && (
              <button onClick={addVersion} style={{
                padding: '3px 12px', borderRadius: 14,
                border: '1px dashed #1e3a5f', fontSize: 12,
                cursor: 'pointer', background: 'transparent', color: '#1e3a5f',
              }}>
                + Add Version
              </button>
            )}
          </>
        )}
      </div>

      {/* Steps table */}
      {activeVid && (
        <div style={{ border: '1px solid #e8ecf0', borderRadius: 6, overflow: 'hidden' }}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e8ecf0' }}>
                  <th style={thStyle(28)}></th>
                  <th style={thStyle(36)}>#</th>
                  <th style={thStyle()}>Process Name</th>
                  <th style={thStyle(140)}>Unit of Measurement</th>
                  <th style={thStyle(120)}>Work Content</th>
                  <th style={thStyle(80)}></th>
                </tr>
              </thead>
              <tbody>
                {loadingS ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 16, color: '#999' }}>Loading…</td></tr>
                ) : (
                  <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                    {steps.map((step) => (
                      <SortableStepRow
                        key={step.id} step={step} processes={processes}
                        token={token} productId={productId} versionId={activeVid}
                        onDeleted={onStepDeleted} onUpdated={onStepUpdated}
                        isDragging={dragId === step.id}
                      />
                    ))}
                  </SortableContext>
                )}
                {/* Inline add row */}
                {addingStep && (
                  <tr style={{ background: '#f8fafc' }}>
                    <td style={tdStyle(28)}></td>
                    <td style={{ ...tdStyle(36), color: '#999', textAlign: 'center' }}>{steps.length + 1}</td>
                    <td style={tdStyle()}>
                      <Form form={addForm} component={false} onFinish={submitAddStep}>
                        <Form.Item name="process_name" noStyle rules={[{ required: true, message: '' }]}>
                          <Select showSearch autoFocus size="small" style={{ width: '100%' }}
                            placeholder="Select process…"
                            options={processes.map((p) => ({ value: p.name, label: p.name, uom: p.work_content_unit }))}
                            onChange={(val, opt) => addForm.setFieldValue('unit_of_measurement', opt.uom ?? '')}
                          />
                        </Form.Item>
                      </Form>
                    </td>
                    <td style={tdStyle(140)}>
                      <Form form={addForm} component={false}>
                        <Form.Item name="unit_of_measurement" noStyle>
                          <Input size="small" placeholder="UoM" />
                        </Form.Item>
                      </Form>
                    </td>
                    <td style={tdStyle(120)}>
                      <Form form={addForm} component={false}>
                        <Form.Item name="work_content" noStyle>
                          <Input size="small" placeholder="0.000" />
                        </Form.Item>
                      </Form>
                    </td>
                    <td style={tdStyle(80)}>
                      <Space size={4}>
                        <Button size="small" type="primary" onClick={() => addForm.validateFields().then(submitAddStep).catch(() => {})} style={{ fontSize: 11 }}>Add</Button>
                        <Button size="small" onClick={() => { setAddingStep(false); addForm.resetFields() }} style={{ fontSize: 11 }}>✕</Button>
                      </Space>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <DragOverlay>
              {activeStep && (
                <table style={{ width: '100%', background: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', borderRadius: 4 }}>
                  <tbody>
                    <tr>
                      <td style={{ ...tdStyle(28), color: '#aaa' }}><HolderOutlined /></td>
                      <td style={{ ...tdStyle(36), textAlign: 'center', color: '#999' }}>{activeStep.sequence}</td>
                      <td style={{ ...tdStyle(), color: '#1677ff' }}>{activeStep.process_name}</td>
                      <td style={tdStyle(140)}>{activeStep.unit_of_measurement || '—'}</td>
                      <td style={tdStyle(120)}>{activeStep.work_content || '—'}</td>
                      <td style={tdStyle(80)}></td>
                    </tr>
                  </tbody>
                </table>
              )}
            </DragOverlay>
          </DndContext>

          {!addingStep && (
            <div style={{ padding: '6px 10px', borderTop: '1px solid #f0f0f0' }}>
              <button onClick={() => setAddingStep(true)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#1677ff', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <PlusOutlined /> Add Step
              </button>
            </div>
          )}
        </div>
      )}

      {!loadingV && versions.length === 0 && (
        <div style={{ textAlign: 'center', padding: 24, color: '#999', fontSize: 12 }}>
          No versions yet — click "+ Add Version" to start building the routing.
        </div>
      )}
    </div>
  )
}

// ─── Color-Size Matrix Tab ────────────────────────────────────────────────────

function ColorSizeTab({ productId, token }) {
  const [allColors, setAllColors]     = useState([])
  const [allSizes, setAllSizes]       = useState([])
  const [sizeSets, setSizeSets]       = useState([])
  const [columnSizes, setColumnSizes] = useState([])
  const [colorRows, setColorRows]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [addColorId, setAddColorId]   = useState(null)

  useEffect(() => {
    Promise.all([fetchColors(token), fetchSizes(token), fetchSizeSets(token), fetchColorSizes(token, productId)])
      .then(([colors, sizes, sets, existing]) => {
        setAllColors(colors)
        setAllSizes(sizes)
        setSizeSets(sets)
        const sizeMap = Object.fromEntries(sizes.map((s) => [s.id, s]))
        const usedSizeIds = [...new Set(existing.flatMap((r) => r.size_ids))]
        setColumnSizes(
          usedSizeIds.map((id) => sizeMap[id]).filter(Boolean)
            .sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name))
        )
        setColorRows(existing.map((r) => ({ colorId: r.color_id, colorName: r.color_name, activeIds: new Set(r.size_ids) })))
      })
      .catch(() => message.error('Failed to load color-size data'))
      .finally(() => setLoading(false))
  }, [token, productId])

  const addColor = () => {
    if (!addColorId || colorRows.some((r) => r.colorId === addColorId)) return
    const color = allColors.find((c) => c.id === addColorId)
    if (color) { setColorRows((prev) => [...prev, { colorId: color.id, colorName: color.name, activeIds: new Set() }]); setAddColorId(null) }
  }

  const toggleCell = (colorId, sizeId) => {
    setColorRows((prev) => prev.map((r) => {
      if (r.colorId !== colorId) return r
      const next = new Set(r.activeIds)
      next.has(sizeId) ? next.delete(sizeId) : next.add(sizeId)
      return { ...r, activeIds: next }
    }))
  }

  const loadSizeSet = (setId) => {
    const found = sizeSets.find((s) => s.id === setId)
    if (!found) return
    const existing = new Set(columnSizes.map((s) => s.id))
    const toAdd = found.sizes.filter((s) => !existing.has(s.id))
    setColumnSizes((prev) => [...prev, ...toAdd].sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name)))
  }

  const addSizeColumn = (sizeId) => {
    if (columnSizes.some((s) => s.id === sizeId)) return
    const size = allSizes.find((s) => s.id === sizeId)
    if (size) setColumnSizes((prev) => [...prev, size].sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name)))
  }

  const removeSizeColumn = (sizeId) => {
    setColumnSizes((prev) => prev.filter((s) => s.id !== sizeId))
    setColorRows((prev) => prev.map((r) => { const n = new Set(r.activeIds); n.delete(sizeId); return { ...r, activeIds: n } }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveColorSizes(token, productId, colorRows.map((r) => ({ color_id: r.colorId, size_ids: [...r.activeIds] })))
      message.success('Color-Size matrix saved')
    } catch (err) { message.error(err.message) }
    finally { setSaving(false) }
  }

  const usedColorIds = new Set(colorRows.map((r) => r.colorId))
  const availableColors = allColors.filter((c) => !usedColorIds.has(c.id))

  if (loading) return <div style={{ padding: 24, color: '#999', fontSize: 12 }}>Loading…</div>

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Size selector row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 11, color: '#555', fontWeight: 600, flexShrink: 0 }}>SIZES:</Text>
        {columnSizes.map((s) => (
          <span key={s.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: '#f0f4f8', border: '1px solid #d0d7de',
            borderRadius: 12, padding: '2px 10px', fontSize: 12,
          }}>
            {s.name}
            <button onClick={() => removeSizeColumn(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 11, padding: 0, lineHeight: 1 }}>×</button>
          </span>
        ))}
        <Select size="small" placeholder="+ Add size" showSearch style={{ width: 120 }} value={null}
          options={allSizes.filter((s) => !columnSizes.some((c) => c.id === s.id)).map((s) => ({ value: s.id, label: s.name }))}
          onChange={addSizeColumn}
        />
        {sizeSets.length > 0 && (
          <Select size="small" placeholder="Load set…" style={{ width: 120 }} value={null}
            options={sizeSets.map((s) => ({ value: s.id, label: s.name }))}
            onChange={loadSizeSet}
          />
        )}
      </div>

      {/* Grid */}
      {columnSizes.length > 0 ? (
        <div style={{ border: '1px solid #e8ecf0', borderRadius: 6, overflow: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ ...thStyle(160), borderBottom: '1px solid #e8ecf0' }}>Color</th>
                {columnSizes.map((s) => (
                  <th key={s.id} style={{ ...thStyle(70), textAlign: 'center', borderBottom: '1px solid #e8ecf0' }}>{s.name}</th>
                ))}
                <th style={{ ...thStyle(36), borderBottom: '1px solid #e8ecf0' }}></th>
              </tr>
            </thead>
            <tbody>
              {colorRows.map((row) => (
                <tr key={row.colorId}>
                  <td style={{ ...tdStyle(160), color: '#1677ff', fontWeight: 500 }}>{row.colorName}</td>
                  {columnSizes.map((s) => (
                    <td key={s.id} style={{ ...tdStyle(70), textAlign: 'center' }}>
                      <Checkbox checked={row.activeIds.has(s.id)} onChange={() => toggleCell(row.colorId, s.id)} />
                    </td>
                  ))}
                  <td style={tdStyle(36)}>
                    <button onClick={() => setColorRows((prev) => prev.filter((r) => r.colorId !== row.colorId))} title="Remove" style={iconBtnStyle('#c0392b')}><DeleteOutlined /></button>
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ padding: '6px 8px' }} colSpan={columnSizes.length + 2}>
                  <Space size={6}>
                    <Select size="small" showSearch placeholder="Add color…" style={{ width: 160 }}
                      value={addColorId} onChange={setAddColorId}
                      options={availableColors.map((c) => ({ value: c.id, label: c.name }))}
                    />
                    <Button size="small" type="primary" disabled={!addColorId} onClick={addColor}>Add</Button>
                  </Space>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 24, color: '#999', fontSize: 12 }}>
          Select sizes above to define the matrix columns, then add colors.
        </div>
      )}

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" loading={saving} onClick={handleSave}>Save Matrix</Button>
      </div>
    </div>
  )
}

// ─── Product Modal ────────────────────────────────────────────────────────────

function ProductModal({ open, editTarget, onClose, onSaved, onDelete, token }) {
  const [form] = Form.useForm()
  const [saving, setSaving]             = useState(false)
  const [activeTab, setActiveTab]       = useState('general')
  const [categories, setCategories]     = useState([])
  const [subCategories, setSubCats]     = useState([])
  const [customers, setCustomers]       = useState([])
  const [allBrands, setAllBrands]       = useState([])
  const [filteredBrands, setFilteredBrands] = useState([])
  const [processes, setProcesses]       = useState([])
  const [savedProductId, setSavedProductId] = useState(null)
  const { modalWidth, bodyHeight, resetSize } = useResizableModal({ defaultWidth: 740, defaultHeight: 480, minWidth: 520, minHeight: 300 })

  const workingId = editTarget?.id ?? savedProductId

  useEffect(() => {
    if (!open) return
    setActiveTab('general')
    setSavedProductId(null)
    resetSize()
    Promise.all([fetchCategories(token), fetchAllCustomers(token), fetchAllBrands(token), fetchProcesses(token)])
      .then(([cats, custs, brands, procs]) => {
        setCategories(cats ?? [])
        setCustomers(custs ?? [])
        setAllBrands(brands ?? [])
        setFilteredBrands(brands ?? [])
        setProcesses(procs ?? [])
      })
      .catch(() => message.error('Failed to load form data'))

    if (editTarget) {
      form.setFieldsValue({
        name: editTarget.name,
        description: editTarget.description ?? '',
        sku: editTarget.sku ?? '',
        department: editTarget.department ?? '',
        category_id: editTarget.category_id ?? null,
        sub_category_id: editTarget.sub_category_id ?? null,
        customer_id: editTarget.customer_id ?? null,
        brand_id: editTarget.brand_id ?? null,
      })
      if (editTarget.category_id) {
        fetchSubCategories(token, editTarget.category_id).then(setSubCats).catch(() => {})
      }
    } else {
      form.resetFields()
      setSubCats([])
    }
  }, [open, editTarget, token])

  const handleCategoryChange = (val) => {
    form.setFieldValue('sub_category_id', null)
    setSubCats([])
    if (val) fetchSubCategories(token, val).then(setSubCats).catch(() => {})
  }

  const handleBrandChange = (brandId) => {
    const brand = allBrands.find((b) => b.id === brandId)
    if (brand) {
      form.setFieldValue('customer_id', brand.customer_id)
      setFilteredBrands(allBrands.filter((b) => b.customer_id === brand.customer_id))
    }
  }

  const handleCustomerChange = (custId) => {
    form.setFieldValue('brand_id', null)
    setFilteredBrands(custId ? allBrands.filter((b) => b.customer_id === custId) : allBrands)
  }

  const handleFinish = async (values) => {
    setSaving(true)
    try {
      const payload = {
        name: values.name,
        description: values.description || null,
        sku: values.sku || null,
        department: values.department || null,
        category_id: values.category_id ?? null,
        sub_category_id: values.sub_category_id ?? null,
        customer_id: values.customer_id ?? null,
        brand_id: values.brand_id ?? null,
      }
      let product
      if (editTarget) {
        product = await updateProduct(token, editTarget.id, payload)
        message.success('Style saved')
      } else {
        product = await createProduct(token, payload)
        setSavedProductId(product.id)
        await createVersion(token, product.id, { name: 'V1' })
        message.success('Style created — V1 routing ready')
        setActiveTab('routing')
      }
      onSaved(product)
    } catch (err) { message.error(err.message) }
    finally { setSaving(false) }
  }

  const tabs = [
    {
      key: 'general',
      label: 'General',
      children: (
        <Form form={form} layout="vertical" onFinish={handleFinish} style={{ paddingTop: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]} style={{ gridColumn: '1 / -1', marginBottom: 8 }}>
              <Input size="small" placeholder="e.g. Summer Polo Shirt" />
            </Form.Item>
            <Form.Item name="description" label="Description" style={{ gridColumn: '1 / -1', marginBottom: 8 }}>
              <Input.TextArea size="small" rows={1} placeholder="Optional description" />
            </Form.Item>
            <Form.Item name="category_id" label="Product / Style Category" style={{ marginBottom: 8 }}>
              <Select size="small" showSearch placeholder="Select category" allowClear
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
                onChange={handleCategoryChange}
              />
            </Form.Item>
            <Form.Item name="sub_category_id" label="Sub-Category" style={{ marginBottom: 8 }}>
              <Select size="small" showSearch placeholder="Select sub-category" allowClear
                options={subCategories.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Form.Item>
            <Form.Item name="sku" label="SKU" style={{ marginBottom: 8 }}>
              <Input size="small" placeholder="From ERP (optional)" />
            </Form.Item>
            <Form.Item name="department" label="Department" style={{ marginBottom: 8 }}>
              <Input size="small" placeholder="e.g. Womenswear" />
            </Form.Item>
            <Form.Item name="brand_id" label="Brand" style={{ marginBottom: 8 }}>
              <Select size="small" showSearch placeholder="Select brand (auto-fills customer)" allowClear
                options={filteredBrands.map((b) => ({ value: b.id, label: b.name }))}
                onChange={handleBrandChange}
              />
            </Form.Item>
            <Form.Item name="customer_id" label="Customer" style={{ marginBottom: 8 }}>
              <Select size="small" showSearch placeholder="Auto-filled from brand" allowClear
                options={customers.map((c) => ({ value: c.id, label: c.name }))}
                onChange={handleCustomerChange}
              />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <Space>
              {editTarget && onDelete && (
                <Popconfirm title={`Delete "${editTarget.name}"?`} onConfirm={onDelete}
                  okText="Delete" okButtonProps={{ danger: true }}>
                  <Button size="small" danger>Delete</Button>
                </Popconfirm>
              )}
              <Button size="small" onClick={onClose}>Cancel</Button>
              <Button size="small" type="primary" htmlType="submit" loading={saving}>
                {editTarget ? 'Save Changes' : 'Create Style'}
              </Button>
            </Space>
          </div>
        </Form>
      ),
    },
    {
      key: 'routing',
      label: 'Routing',
      disabled: !workingId,
      children: workingId
        ? <RoutingTab productId={workingId} token={token} processes={processes} />
        : <div style={{ padding: 24, color: '#999', fontSize: 12 }}>Save the style first to manage routing.</div>,
    },
    {
      key: 'color-size',
      label: 'Color-Size Matrix',
      disabled: !workingId,
      children: workingId
        ? <ColorSizeTab productId={workingId} token={token} />
        : <div style={{ padding: 24, color: '#999', fontSize: 12 }}>Save the style first to manage colors and sizes.</div>,
    },
    {
      key: 'history',
      label: 'History',
      disabled: !workingId,
      children: (
        <AuditLogTab
          fetchFn={workingId ? (token) => fetchProductAuditLog(token, workingId) : null}
          token={token}
          active={activeTab === 'history'}
        />
      ),
    },
    {
      key: 'material',
      label: 'Material',
      disabled: true,
      children: <div style={{ padding: 24, color: '#999', fontSize: 12 }}>Will be built later.</div>,
    },
    {
      key: 'time-action',
      label: 'Time & Action',
      disabled: true,
      children: <div style={{ padding: 24, color: '#999', fontSize: 12 }}>Will be built later.</div>,
    },
  ]

  return (
    <Modal
      title={editTarget ? `Edit — ${editTarget.name}` : 'Add Style'}
      open={open}
      onCancel={onClose}
      footer={null}
      width={modalWidth}
      destroyOnHidden
      draggable
      styles={{ body: { height: bodyHeight, overflowY: 'auto' } }}
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab} size="small" items={tabs} style={{ marginTop: -8 }} />
    </Modal>
  )
}

// ─── Main ProductsApp ─────────────────────────────────────────────────────────

export default function ProductsApp({ session }) {
  const [products, setProducts]     = useState([])
  const [loading, setLoading]       = useState(true)

  const [modalOpen, setModalOpen]   = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [pageSize, setPageSize]     = useState(25)
  const [search, setSearch]         = useState('')
  const [catFilter, setCatFilter]   = useState(null)
  const [custFilter, setCustFilter] = useState(null)
  const [brandFilter, setBrandFilter] = useState(null)
  const [filterOpts, setFilterOpts] = useState({ categories: [], customers: [], brands: [] })
  const [importOpen, setImportOpen] = useState(false)
  const [visibleCols, setVisibleCols] = useState(
    Object.fromEntries(ALL_COLS.map((c) => [c.key, true]))
  )

  const load = useCallback((p, ps, s, cat = null, cust = null, brand = null) => {
    setLoading(true)
    fetchProducts(session.access_token, { page: p, pageSize: ps, search: s, categoryId: cat, customerId: cust, brandId: brand })
      .then((data) => { setProducts(data.items); setTotal(data.total) })
      .catch(() => message.error('Failed to load styles'))
      .finally(() => setLoading(false))
  }, [session.access_token])

  useEffect(() => { load(1, 25, '') }, [load])

  useEffect(() => {
    Promise.all([fetchCategories(session.access_token), fetchAllCustomers(session.access_token), fetchAllBrands(session.access_token)])
      .then(([cats, custs, brands]) => setFilterOpts({ categories: cats ?? [], customers: custs ?? [], brands: brands ?? [] }))
      .catch(() => {})
  }, [session.access_token])

  const getViewState = useCallback(
    () => ({ columns: visibleCols, filters: { categoryId: catFilter, customerId: custFilter, brandId: brandFilter } }),
    [visibleCols, catFilter, custFilter, brandFilter]
  )

  const applyView = useCallback(({ columns, filters = {} } = {}) => {
    if (columns) setVisibleCols(columns)
    const cat   = filters.categoryId ?? null
    const cust  = filters.customerId ?? null
    const brand = filters.brandId    ?? null
    setCatFilter(cat); setCustFilter(cust); setBrandFilter(brand)
    setPage(1)
    load(1, pageSize, search, cat, cust, brand)
  }, [load, pageSize, search])

  const openCreate = () => { setEditTarget(null); setModalOpen(true) }
  const closeModal = () => { setModalOpen(false); setEditTarget(null) }

  const handleSaved = (product) => {
    load(page, pageSize, search, catFilter, custFilter, brandFilter)
  }

  const handleDelete = async () => {
    if (!editTarget) return
    try {
      await deleteProduct(session.access_token, editTarget.id)
      message.success(`"${editTarget.name}" deleted`)
      setModalOpen(false)
      setEditTarget(null)
      load(page, pageSize, search, catFilter, custFilter, brandFilter)
    } catch (err) { message.error(err.message) }
  }

  const allColumns = [
    {
      key: 'name', title: 'Name', dataIndex: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (v) => <span style={{ color: '#1677ff', fontSize: 12 }}>{v}</span>,
    },
    {
      key: 'department', title: 'Department', dataIndex: 'department', width: 130,
      render: (v) => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      key: 'category_name', title: 'Category', dataIndex: 'category_name', width: 150,
      render: (v) => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      key: 'sub_category_name', title: 'Sub-Category', dataIndex: 'sub_category_name', width: 140,
      render: (v) => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      key: 'customer_name', title: 'Customer', dataIndex: 'customer_name', width: 160,
      render: (v) => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      key: 'brand_name', title: 'Brand', dataIndex: 'brand_name', width: 130,
      render: (v) => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      key: 'sku', title: 'SKU', dataIndex: 'sku', width: 100,
      render: (v) => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
  ]

  const columns = allColumns.filter((c) => visibleCols[c.key])

  const filterSelect = (placeholder, opts, value, setter, field) => (
    <Select
      size="small" allowClear
      placeholder={placeholder}
      style={{ width: 140 }}
      options={opts.map((o) => ({ value: o.id, label: o.name }))}
      value={value ?? undefined}
      onChange={(val) => {
        const v = val ?? null
        setter(v)
        setPage(1)
        const cat   = field === 'cat'   ? v : catFilter
        const cust  = field === 'cust'  ? v : custFilter
        const brand = field === 'brand' ? v : brandFilter
        load(1, pageSize, search, cat, cust, brand)
      }}
    />
  )

  return (
    <div style={{ padding: '10px 14px', fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Space size={4}>
          <ToolBtn icon={<PlusOutlined />}  onClick={openCreate} title="Add style" />
          <div style={{ width: 1, height: 18, background: '#d0d7de', margin: '0 4px' }} />
          <ToolBtn icon={<UploadOutlined />} onClick={() => setImportOpen(true)} title="Import from CSV" />
          <div style={{ width: 1, height: 18, background: '#d0d7de', margin: '0 4px' }} />
          {filterSelect('All Categories', filterOpts.categories, catFilter,   setCatFilter,   'cat')}
          {filterSelect('All Customers',  filterOpts.customers,  custFilter,  setCustFilter,  'cust')}
          {filterSelect('All Brands',     filterOpts.brands,     brandFilter, setBrandFilter, 'brand')}
        </Space>
        <Space size={4}>
          <Input.Search
            allowClear
            placeholder="Search name / SKU…"
            size="small"
            style={{ width: 200 }}
            onSearch={(val) => { const s = val.trim(); setSearch(s); setPage(1); load(1, pageSize, s, catFilter, custFilter, brandFilter) }}
            onChange={(e) => { if (!e.target.value) { setSearch(''); setPage(1); load(1, pageSize, '', catFilter, custFilter, brandFilter) } }}
          />
          <SavedViewsBtn
            token={session.access_token}
            viewKey="styles"
            getState={getViewState}
            onApply={applyView}
          />
          <ToolBtn icon={<ReloadOutlined />} onClick={() => load(page, pageSize, search, catFilter, custFilter, brandFilter)} title="Refresh" />
          <ColumnChooserBtn visibleCols={visibleCols} onChange={setVisibleCols} />
        </Space>
      </div>

      <Table
        size="small"
        columns={columns}
        dataSource={products}
        loading={loading}
        rowKey="id"
        onRow={(record) => ({
          onClick: () => { setEditTarget(record); setModalOpen(true) },
          style: { cursor: 'pointer' },
        })}
        onChange={(pag) => {
          const p = pag.current, ps = pag.pageSize
          setPage(p); setPageSize(ps)
          load(p, ps, search, catFilter, custFilter, brandFilter)
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

      <ProductModal
        open={modalOpen}
        editTarget={editTarget}
        onClose={closeModal}
        onSaved={handleSaved}
        onDelete={handleDelete}
        token={session.access_token}
      />

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={() => load(page, pageSize, search, catFilter, custFilter, brandFilter)}
        entityName="Styles"
        onPreview={(file) => previewProductImport(session.access_token, file)}
        onConfirm={(rows) => confirmProductImport(session.access_token, rows)}
        onTemplate={() => downloadProductTemplate(session.access_token)}
      />
    </div>
  )
}
