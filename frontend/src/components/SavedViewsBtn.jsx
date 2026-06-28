import { CheckOutlined, CloseOutlined, DeleteOutlined, EditOutlined, EyeOutlined, SaveOutlined, SyncOutlined } from '@ant-design/icons'
import { Button, Input, Popover, Space, Tooltip, Typography, message } from 'antd'
import { useEffect, useState } from 'react'
import { createView, deleteView, fetchViews, updateView } from '../services/views'

const { Text } = Typography

export default function SavedViewsBtn({ token, viewKey, getState, onApply }) {
  const [views, setViews]         = useState([])
  const [open, setOpen]           = useState(false)
  const [newName, setNewName]     = useState('')
  const [saving, setSaving]       = useState(false)
  const [activeId, setActiveId]   = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName]   = useState('')

  const load = () => fetchViews(token, viewKey).then(setViews).catch(() => {})

  useEffect(() => { load() }, [viewKey])

  const handleSave = async () => {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    try {
      const state = getState()
      await createView(token, viewKey, name, state)
      message.success(`View "${name}" saved`)
      setNewName('')
      load()
    } catch (err) {
      message.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleApply = (view) => {
    setActiveId(view.id)
    onApply(view.config)
    setOpen(false)
    message.success(`View "${view.name}" applied`)
  }

  const handleDelete = async (e, view) => {
    e.stopPropagation()
    try {
      await deleteView(token, viewKey, view.id)
      if (activeId === view.id) setActiveId(null)
      load()
    } catch (err) {
      message.error(err.message)
    }
  }

  const startEdit = (e, view) => {
    e.stopPropagation()
    setEditingId(view.id)
    setEditName(view.name)
  }

  const cancelEdit = (e) => {
    e?.stopPropagation()
    setEditingId(null)
    setEditName('')
  }

  const commitRename = async (e, view) => {
    e.stopPropagation()
    const name = editName.trim()
    if (!name || name === view.name) { cancelEdit(); return }
    try {
      await updateView(token, viewKey, view.id, { name })
      if (activeId === view.id) {}
      load()
      cancelEdit()
    } catch (err) {
      message.error(err.message)
    }
  }

  const handleUpdateConfig = async (e, view) => {
    e.stopPropagation()
    try {
      const config = getState()
      await updateView(token, viewKey, view.id, { config })
      message.success(`"${view.name}" updated`)
      load()
    } catch (err) {
      message.error(err.message)
    }
  }

  const content = (
    <div style={{ width: 240 }}>
      {views.length === 0 && (
        <Text type="secondary" style={{ fontSize: 11, display: 'block', padding: '4px 0 8px' }}>
          No saved views yet.
        </Text>
      )}

      {views.map((v) => (
        <div
          key={v.id}
          onClick={() => editingId !== v.id && handleApply(v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '5px 6px', borderRadius: 5, cursor: editingId === v.id ? 'default' : 'pointer',
            marginBottom: 2,
            background: activeId === v.id ? 'rgba(11,94,87,0.12)' : 'transparent',
            border: activeId === v.id ? '1px solid rgba(11,94,87,0.3)' : '1px solid transparent',
            transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => { if (activeId !== v.id) e.currentTarget.style.background = '#f5f5f5' }}
          onMouseLeave={(e) => { if (activeId !== v.id) e.currentTarget.style.background = 'transparent' }}
        >
          {editingId === v.id ? (
            <Space size={3} style={{ flex: 1 }} onClick={(e) => e.stopPropagation()}>
              <Input
                size="small"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onPressEnter={(e) => commitRename(e, v)}
                style={{ fontSize: 11, height: 22, flex: 1 }}
                autoFocus
              />
              <Button type="text" size="small" icon={<CheckOutlined style={{ fontSize: 10, color: '#0b5e57' }} />}
                style={{ padding: '0 3px', height: 20 }} onClick={(e) => commitRename(e, v)} />
              <Button type="text" size="small" icon={<CloseOutlined style={{ fontSize: 10 }} />}
                style={{ padding: '0 3px', height: 20 }} onClick={cancelEdit} />
            </Space>
          ) : (
            <>
              <Space size={5} style={{ flex: 1, minWidth: 0 }}>
                <EyeOutlined style={{ color: activeId === v.id ? '#0b5e57' : '#888', fontSize: 11, flexShrink: 0 }} />
                <Text style={{ fontSize: 12, color: activeId === v.id ? '#0b5e57' : '#333' }}
                  ellipsis={{ tooltip: v.name }}>{v.name}</Text>
              </Space>
              <Space size={1}>
                <Tooltip title="Update with current filters">
                  <Button type="text" size="small"
                    icon={<SyncOutlined style={{ fontSize: 10, color: '#888' }} />}
                    onClick={(e) => handleUpdateConfig(e, v)}
                    style={{ padding: '0 3px', height: 20 }} />
                </Tooltip>
                <Tooltip title="Rename">
                  <Button type="text" size="small"
                    icon={<EditOutlined style={{ fontSize: 10, color: '#888' }} />}
                    onClick={(e) => startEdit(e, v)}
                    style={{ padding: '0 3px', height: 20 }} />
                </Tooltip>
                <Tooltip title="Delete">
                  <Button type="text" size="small" danger
                    icon={<DeleteOutlined style={{ fontSize: 10 }} />}
                    onClick={(e) => handleDelete(e, v)}
                    style={{ padding: '0 3px', height: 20 }} />
                </Tooltip>
              </Space>
            </>
          )}
        </div>
      ))}

      <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 6, paddingTop: 8 }}>
        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginBottom: 4 }}>
          Save current filters &amp; sort
        </Text>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            size="small"
            placeholder="View name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onPressEnter={handleSave}
            style={{ fontSize: 12 }}
          />
          <Button
            size="small" type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSave}
            disabled={!newName.trim()}
          />
        </Space.Compact>
      </div>
    </div>
  )

  return (
    <Popover
      content={content}
      title={<span style={{ fontSize: 12 }}>Saved Views</span>}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomLeft"
    >
      <button
        title="Saved views"
        style={{
          width: 28, height: 28, borderRadius: 5,
          background: activeId ? '#0b5e57' : '#1e3a5f',
          border: 'none', color: '#fff',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, transition: 'background 0.15s',
          position: 'relative',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = activeId ? '#0d7a70' : '#27508a' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = activeId ? '#0b5e57' : '#1e3a5f' }}
      >
        <EyeOutlined />
        {views.length > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: '#f59e0b', color: '#fff',
            fontSize: 8, fontWeight: 700, lineHeight: 1,
            padding: '1px 3px', borderRadius: 8, minWidth: 12, textAlign: 'center',
          }}>
            {views.length}
          </span>
        )}
      </button>
    </Popover>
  )
}
