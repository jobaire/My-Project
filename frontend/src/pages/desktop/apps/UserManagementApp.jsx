import {
  DeleteOutlined,
  EditOutlined,
  LockOutlined,
  MailOutlined,
  PlusOutlined,
  ReloadOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import { useEffect, useState } from 'react'
import { useResizableModal } from '../../../hooks/useResizableModal'
import {
  createRole,
  createSubCompany,
  createUser,
  deleteRole,
  deleteSubCompany,
  deleteUser,
  fetchModulePermissions,
  fetchRoles,
  fetchSubCompanies,
  fetchUsers,
  resendInvite,
  updateModulePermission,
  updateRole,
  updateSubCompany,
  updateUser,
} from '../../../services/users'

const { Text } = Typography

const MODULE_LIST = [
  { value: 'orders',    label: 'Orders' },
  { value: 'products',  label: 'Products' },
  { value: 'customers', label: 'Customers' },
  { value: 'setup',     label: 'Setup' },
]

// ── Users Tab ──────────────────────────────────────────────────────────────────

function UsersTab({ session, companyRoles }) {
  const [users,        setUsers]        = useState([])
  const [subCompanies, setSubCompanies] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [createOpen,   setCreateOpen]   = useState(false)
  const [editTarget,   setEditTarget]   = useState(null)
  const [submitting,   setSubmitting]   = useState(false)
  const [createForm]   = Form.useForm()
  const [editForm]     = Form.useForm()

  const { modalWidth: cW, bodyHeight: cH, resetSize: cRS } =
    useResizableModal({ defaultWidth: 500, defaultHeight: 500, minWidth: 380, minHeight: 320 })
  const { modalWidth: eW, bodyHeight: eH, resetSize: eRS } =
    useResizableModal({ defaultWidth: 480, defaultHeight: 440, minWidth: 360, minHeight: 280 })

  const load = () => {
    setLoading(true)
    Promise.all([
      fetchUsers(session.access_token),
      fetchSubCompanies(session.access_token),
    ])
      .then(([u, sc]) => { setUsers(u); setSubCompanies(sc) })
      .catch(() => message.error('Failed to load data'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  const roleOptions = companyRoles.map((r) => ({ value: r.name, label: r.label }))
  const roleMap     = Object.fromEntries(companyRoles.map((r) => [r.name, r]))
  const scOptions   = subCompanies.map((sc) => ({ value: sc.id, label: sc.name }))
  const scMap       = Object.fromEntries(subCompanies.map((sc) => [sc.id, sc.name]))

  const handleResendInvite = async (id, email) => {
    try {
      await resendInvite(session.access_token, id)
      message.success(`Invite resent to ${email}`)
    } catch {
      message.error('Failed to resend invite')
    }
  }

  const handleCreate = async (values) => {
    setSubmitting(true)
    try {
      await createUser(session.access_token, {
        email:           values.email.trim(),
        full_name:       values.full_name?.trim() || null,
        roles:           values.roles ?? ['data_entry'],
        department:      values.department?.trim() || null,
        designation:     values.designation?.trim() || null,
        sub_tenant_ids: values.sub_tenant_ids ?? [],
      })
      message.success('Invite sent — user will receive an email to set their password')
      createForm.resetFields()
      setCreateOpen(false)
      load()
    } catch (err) {
      message.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const openEdit = (user) => {
    eRS()
    setEditTarget(user)
    editForm.setFieldsValue({
      full_name:       user.full_name,
      roles:           user.roles?.length ? user.roles : (user.role ? [user.role] : []),
      department:      user.department,
      designation:     user.designation,
      sub_tenant_ids: user.sub_tenant_ids ?? [],
    })
  }

  const handleEdit = async (values) => {
    setSubmitting(true)
    try {
      await updateUser(session.access_token, editTarget.id, {
        full_name:       values.full_name?.trim() || null,
        roles:           values.roles,
        department:      values.department?.trim() || null,
        designation:     values.designation?.trim() || null,
        sub_tenant_ids: values.sub_tenant_ids,
      })
      message.success('User updated')
      setEditTarget(null)
      load()
    } catch (err) {
      message.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id, email) => {
    try {
      await deleteUser(session.access_token, id)
      message.success(`${email} removed`)
      load()
    } catch {
      message.error('Failed to remove user')
    }
  }

  const columns = [
    {
      title: 'User',
      key: 'user',
      render: (_, r) => (
        <Space>
          <UserOutlined style={{ color: r.is_activated ? '#0b5e57' : '#bbb' }} />
          <div>
            <Space size={6} style={{ display: 'flex', alignItems: 'center' }}>
              <Text strong style={{ display: 'block', fontSize: 13 }}>{r.full_name || r.email}</Text>
              {!r.is_activated && <Tag color="orange" style={{ fontSize: 10, margin: 0 }}>Invite pending</Tag>}
            </Space>
            {r.full_name && <Text type="secondary" style={{ fontSize: 11 }}>{r.email}</Text>}
          </div>
        </Space>
      ),
    },
    {
      title: 'Roles',
      key: 'roles',
      width: 280,
      render: (_, r) => {
        const roles = r.roles?.length ? r.roles : (r.role ? [r.role] : [])
        return roles.map((v) => (
          <Tag key={v} color={roleMap[v]?.is_system ? 'blue' : 'purple'} style={{ borderRadius: 20, marginBottom: 2 }}>
            {roleMap[v]?.label ?? v}
          </Tag>
        ))
      },
    },
    {
      title: 'Sub-Companies',
      key: 'sub_companies',
      width: 200,
      render: (_, r) => {
        const ids = r.sub_tenant_ids ?? []
        if (!ids.length) return <Text type="secondary" style={{ fontSize: 12 }}>All</Text>
        return ids.map((id) => (
          <Tag key={id} style={{ borderRadius: 20, marginBottom: 2 }}>{scMap[id] ?? id}</Tag>
        ))
      },
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_, record) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" type="text" onClick={() => openEdit(record)} />
          {!record.is_activated && (
            <Button icon={<MailOutlined />} size="small" type="text"
                    title="Resend invite" onClick={() => handleResendInvite(record.id, record.email)} />
          )}
          {record.id !== session.user_id && (
            <Popconfirm
              title={`Remove ${record.email}?`}
              onConfirm={() => handleDelete(record.id, record.email)}
              okText="Remove" okButtonProps={{ danger: true }}
            >
              <Button danger icon={<DeleteOutlined />} size="small" type="text" />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Text type="secondary">Manage users, roles, and sub-company access for {session.tenant_name}</Text>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
          <Button icon={<PlusOutlined />} type="primary" onClick={() => { cRS(); setCreateOpen(true) }}>
            Add User
          </Button>
        </Space>
      </Space>

      <Table columns={columns} dataSource={users} loading={loading} rowKey="id" size="small" pagination={{ pageSize: 15 }} />

      {/* Create modal */}
      <Modal title="Add user" open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields() }}
        footer={null} width={cW} destroyOnHidden draggable
        styles={{ body: { maxHeight: cH, overflowY: 'auto' } }}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
            <Input placeholder="user@company.com" autoComplete="off" />
          </Form.Item>
          <Form.Item name="full_name" label="Full name">
            <Input placeholder="Optional" autoComplete="off" />
          </Form.Item>
          <Form.Item name="roles" label="Roles" initialValue={['data_entry']}>
            <Select mode="multiple" options={roleOptions} placeholder="Select roles" />
          </Form.Item>
          <Form.Item name="sub_tenant_ids" label="Sub-Company Access" initialValue={[]}>
            <Select mode="multiple" options={scOptions} placeholder="Leave empty for all sub-companies" />
          </Form.Item>
          <Form.Item name="department" label="Department">
            <Input placeholder="Optional" />
          </Form.Item>
          <Form.Item name="designation" label="Designation">
            <Input placeholder="Optional" />
          </Form.Item>
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => { setCreateOpen(false); createForm.resetFields() }}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>Send Invite</Button>
          </Space>
        </Form>
      </Modal>

      {/* Edit modal */}
      <Modal title="Edit user" open={!!editTarget}
        onCancel={() => setEditTarget(null)}
        footer={null} width={eW} destroyOnHidden draggable
        styles={{ body: { maxHeight: eH, overflowY: 'auto' } }}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit} style={{ marginTop: 16 }}>
          <Form.Item name="full_name" label="Full name">
            <Input placeholder="Optional" />
          </Form.Item>
          <Form.Item name="roles" label="Roles" rules={[{ required: true, message: 'Assign at least one role' }]}>
            <Select mode="multiple" options={roleOptions} placeholder="Select roles" />
          </Form.Item>
          <Form.Item name="sub_tenant_ids" label="Sub-Company Access">
            <Select mode="multiple" options={scOptions} placeholder="Leave empty for all sub-companies" />
          </Form.Item>
          <Form.Item name="department" label="Department">
            <Input placeholder="Optional" />
          </Form.Item>
          <Form.Item name="designation" label="Designation">
            <Input placeholder="Optional" />
          </Form.Item>
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>Save Changes</Button>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}

// ── Roles & Permissions Tab ────────────────────────────────────────────────────

function RolesPermissionsTab({ session, companyRoles, onRolesChanged }) {
  const [matrix,  setMatrix]  = useState({})
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState({})

  // Role management state
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [createForm] = Form.useForm()
  const [editForm]   = Form.useForm()
  const { modalWidth: cW, bodyHeight: cH, resetSize: cRS } =
    useResizableModal({ defaultWidth: 380, defaultHeight: 220, minWidth: 300, minHeight: 180 })
  const { modalWidth: eW, bodyHeight: eH, resetSize: eRS } =
    useResizableModal({ defaultWidth: 380, defaultHeight: 180, minWidth: 300, minHeight: 160 })

  const loadMatrix = () => {
    setLoading(true)
    fetchModulePermissions(session.access_token)
      .then((rows) => {
        const m = {}
        rows.forEach(({ role, module, can_read, can_write, can_admin }) => {
          if (!m[role]) m[role] = {}
          m[role][module] = { can_read, can_write, can_admin }
        })
        setMatrix(m)
      })
      .catch(() => message.error('Failed to load permissions'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadMatrix() }, [companyRoles]) // reload when roles change // eslint-disable-line

  const handleToggle = async (role, mod, field, val) => {
    const key     = `${role}|${mod}`
    const current = matrix[role]?.[mod] ?? { can_read: false, can_write: false, can_admin: false }
    const updated = { ...current, [field]: val }
    setMatrix((prev) => ({ ...prev, [role]: { ...prev[role], [mod]: updated } }))
    setSaving((prev) => ({ ...prev, [key]: true }))
    try {
      await updateModulePermission(session.access_token, role, mod, updated)
    } catch {
      message.error(`Failed to update ${role}/${mod}`)
      setMatrix((prev) => ({ ...prev, [role]: { ...prev[role], [mod]: current } }))
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }))
    }
  }

  const handleCreateRole = async (values) => {
    setSubmitting(true)
    try {
      await createRole(session.access_token, { name: values.name.trim(), label: values.label.trim() })
      message.success('Role created')
      createForm.resetFields()
      setCreateOpen(false)
      onRolesChanged()
    } catch (err) {
      message.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const openEditRole = (role) => {
    eRS()
    setEditTarget(role)
    editForm.setFieldsValue({ label: role.label })
  }

  const handleEditRole = async (values) => {
    setSubmitting(true)
    try {
      await updateRole(session.access_token, editTarget.name, { label: values.label.trim() })
      message.success('Role updated')
      setEditTarget(null)
      onRolesChanged()
    } catch (err) {
      message.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteRole = async (name, label) => {
    try {
      await deleteRole(session.access_token, name)
      message.success(`"${label}" deleted`)
      onRolesChanged()
    } catch (err) {
      message.error(err.message)
    }
  }

  // ── Roles list table ──────────────────────────────────────────────────────────
  const roleColumns = [
    {
      title: 'Key (name)',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (v) => <code style={{ fontSize: 12, color: '#555' }}>{v}</code>,
    },
    {
      title: 'Display Label',
      dataIndex: 'label',
      key: 'label',
      render: (v, r) => (
        <Space size={4}>
          <Text style={{ fontSize: 12 }}>{v}</Text>
          {r.is_system && (
            <Tag icon={<LockOutlined />} color="default" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>system</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_, record) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" type="text" onClick={() => openEditRole(record)} />
          {!record.is_system && (
            <Popconfirm
              title={`Delete role "${record.label}"?`}
              description="Users with this role must be reassigned first."
              onConfirm={() => handleDeleteRole(record.name, record.label)}
              okText="Delete" okButtonProps={{ danger: true }}
            >
              <Button danger icon={<DeleteOutlined />} size="small" type="text" />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  // ── Permissions matrix — flat rows: one row per module×role, module cell spans ─
  const matrixData = MODULE_LIST.flatMap(({ value: mod, label: modLabel }) =>
    companyRoles.map((role, idx) => ({
      key:          `${mod}|${role.name}`,
      module:       mod,
      moduleLabel:  modLabel,
      roleSpan:     companyRoles.length,
      isFirstRole:  idx === 0,
      role:         role.name,
      roleLabel:    role.label,
      is_system:    role.is_system,
    }))
  )

  const matrixColumns = [
    {
      title: 'Module',
      key: 'module',
      width: 100,
      onCell: (row) => ({ rowSpan: row.isFirstRole ? row.roleSpan : 0 }),
      render: (_, row) => (
        <Text strong style={{ fontSize: 12 }}>{row.moduleLabel}</Text>
      ),
    },
    {
      title: 'Role',
      key: 'role',
      width: 180,
      render: (_, row) => (
        <Space size={4}>
          <Text style={{ fontSize: 12 }}>{row.roleLabel}</Text>
          {row.is_system && <Tag icon={<LockOutlined />} color="default" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>system</Tag>}
        </Space>
      ),
    },
    ...['can_read', 'can_write', 'can_delete'].map((field, i) => ({
      title: <span style={{ fontSize: 12 }}>{['Read', 'Write', 'Delete'][i]}</span>,
      key: field,
      width: 70,
      align: 'center',
      render: (_, row) => {
        const k    = `${row.role}|${row.module}`
        const cell = matrix[row.role]?.[row.module] ?? { can_read: false, can_write: false, can_delete: false }
        const busy = saving[k]
        return (
          <Checkbox
            checked={cell[field]}
            disabled={busy}
            onChange={(e) => handleToggle(row.role, row.module, field, e.target.checked)}
          />
        )
      },
    })),
  ]

  return (
    <div>
      {/* ── Roles management ── */}
      <div style={{ marginBottom: 28 }}>
        <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
          <Text strong style={{ fontSize: 14 }}>Roles</Text>
          <Space>
            <Button icon={<ReloadOutlined />} size="small" onClick={onRolesChanged}>Reload</Button>
            <Button icon={<PlusOutlined />} type="primary" size="small"
              onClick={() => { cRS(); setCreateOpen(true) }}>
              Add Role
            </Button>
          </Space>
        </Space>
        <Table
          columns={roleColumns}
          dataSource={companyRoles}
          rowKey="name"
          size="small"
          pagination={false}
        />
      </div>

      {/* ── Permissions matrix ── */}
      <div>
        <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
          <Text strong style={{ fontSize: 14 }}>Module Permissions</Text>
          <Button icon={<ReloadOutlined />} size="small" onClick={loadMatrix}>Refresh</Button>
        </Space>
        <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 11 }}>
          Changes are saved immediately.
        </Text>
        <Table
          columns={matrixColumns}
          dataSource={matrixData}
          loading={loading}
          rowKey="key"
          pagination={false}
          size="small"
          style={{ fontSize: 12 }}
        />
      </div>

      {/* Create role modal */}
      <Modal title="Add role" open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields() }}
        footer={null} width={cW} destroyOnHidden draggable
        styles={{ body: { maxHeight: cH, overflowY: 'auto' } }}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateRole} style={{ marginTop: 16 }}>
          <Form.Item name="label" label="Display label"
            rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="e.g. Quality Control" />
          </Form.Item>
          <Form.Item name="name" label="Key (snake_case, cannot be changed later)"
            rules={[
              { required: true, message: 'Required' },
              { pattern: /^[a-z][a-z0-9_]*$/, message: 'Lowercase letters, numbers, underscores only' },
            ]}
          >
            <Input placeholder="e.g. quality_control" />
          </Form.Item>
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => { setCreateOpen(false); createForm.resetFields() }}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>Add Role</Button>
          </Space>
        </Form>
      </Modal>

      {/* Edit role label modal */}
      <Modal title="Edit role label" open={!!editTarget}
        onCancel={() => setEditTarget(null)}
        footer={null} width={eW} destroyOnHidden draggable
        styles={{ body: { maxHeight: eH, overflowY: 'auto' } }}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditRole} style={{ marginTop: 16 }}>
          <Form.Item name="label" label="Display label" rules={[{ required: true, message: 'Required' }]}>
            <Input />
          </Form.Item>
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>Save</Button>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}

// ── Sub-Companies Tab ──────────────────────────────────────────────────────────

function SubCompaniesTab({ session }) {
  const [items,      setItems]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [createForm] = Form.useForm()
  const [editForm]   = Form.useForm()

  const { modalWidth: cW, bodyHeight: cH, resetSize: cRS } =
    useResizableModal({ defaultWidth: 400, defaultHeight: 280, minWidth: 300, minHeight: 200 })
  const { modalWidth: eW, bodyHeight: eH, resetSize: eRS } =
    useResizableModal({ defaultWidth: 400, defaultHeight: 280, minWidth: 300, minHeight: 200 })

  const load = () => {
    setLoading(true)
    fetchSubCompanies(session.access_token)
      .then(setItems)
      .catch(() => message.error('Failed to load sub-companies'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  const handleCreate = async (values) => {
    setSubmitting(true)
    try {
      await createSubCompany(session.access_token, {
        name:      values.name.trim(),
        code:      values.code?.trim() || null,
        is_active: values.is_active ?? true,
      })
      message.success('Sub-company created')
      createForm.resetFields()
      setCreateOpen(false)
      load()
    } catch (err) {
      message.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const openEdit = (item) => {
    eRS()
    setEditTarget(item)
    editForm.setFieldsValue({ name: item.name, code: item.code, is_active: item.is_active })
  }

  const handleEdit = async (values) => {
    setSubmitting(true)
    try {
      await updateSubCompany(session.access_token, editTarget.id, {
        name:      values.name.trim(),
        code:      values.code?.trim() || null,
        is_active: values.is_active,
      })
      message.success('Sub-company updated')
      setEditTarget(null)
      load()
    } catch (err) {
      message.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id, name) => {
    try {
      await deleteSubCompany(session.access_token, id)
      message.success(`${name} deleted`)
      load()
    } catch {
      message.error('Failed to delete sub-company')
    }
  }

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (v) => <Text strong style={{ fontSize: 13 }}>{v}</Text>,
    },
    {
      title: 'Code',
      dataIndex: 'code',
      key: 'code',
      width: 120,
      render: (v) => v ? <Tag>{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Active',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (v) => <Tag color={v ? 'success' : 'default'}>{v ? 'Active' : 'Inactive'}</Tag>,
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_, record) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" type="text" onClick={() => openEdit(record)} />
          <Popconfirm
            title={`Delete "${record.name}"?`}
            onConfirm={() => handleDelete(record.id, record.name)}
            okText="Delete" okButtonProps={{ danger: true }}
          >
            <Button danger icon={<DeleteOutlined />} size="small" type="text" />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Text type="secondary">Manufacturing units or subsidiaries within {session.tenant_name}</Text>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
          <Button icon={<PlusOutlined />} type="primary" onClick={() => { cRS(); setCreateOpen(true) }}>
            Add Sub-Company
          </Button>
        </Space>
      </Space>

      <Table columns={columns} dataSource={items} loading={loading} rowKey="id" size="small" pagination={{ pageSize: 15 }} />

      <Modal title="Add sub-company" open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields() }}
        footer={null} width={cW} destroyOnHidden draggable
        styles={{ body: { maxHeight: cH, overflowY: 'auto' } }}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}
          initialValues={{ is_active: true }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. Factory A" />
          </Form.Item>
          <Form.Item name="code" label="Code">
            <Input placeholder="Short code (optional)" />
          </Form.Item>
          <Form.Item name="is_active" label="Status" valuePropName="checked">
            <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
          </Form.Item>
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => { setCreateOpen(false); createForm.resetFields() }}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>Add</Button>
          </Space>
        </Form>
      </Modal>

      <Modal title="Edit sub-company" open={!!editTarget}
        onCancel={() => setEditTarget(null)}
        footer={null} width={eW} destroyOnHidden draggable
        styles={{ body: { maxHeight: eH, overflowY: 'auto' } }}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label="Code">
            <Input placeholder="Short code (optional)" />
          </Form.Item>
          <Form.Item name="is_active" label="Status" valuePropName="checked">
            <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
          </Form.Item>
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>Save Changes</Button>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function UserManagementApp({ session }) {
  const isAdmin = session.roles?.includes('admin') || session.role === 'admin'

  const [companyRoles,    setCompanyRoles]    = useState([])
  const [rolesLoading,    setRolesLoading]    = useState(true)

  const loadRoles = () => {
    setRolesLoading(true)
    fetchRoles(session.access_token)
      .then(setCompanyRoles)
      .catch(() => message.error('Failed to load roles'))
      .finally(() => setRolesLoading(false))
  }

  useEffect(() => { loadRoles() }, []) // eslint-disable-line

  const items = [
    {
      key: 'users',
      label: 'Users',
      children: rolesLoading
        ? null
        : <UsersTab session={session} companyRoles={companyRoles} />,
    },
    ...(isAdmin ? [
      {
        key: 'permissions',
        label: 'Roles & Permissions',
        children: (
          <RolesPermissionsTab
            session={session}
            companyRoles={companyRoles}
            onRolesChanged={loadRoles}
          />
        ),
      },
      {
        key: 'sub-companies',
        label: 'Sub-Companies',
        children: <SubCompaniesTab session={session} />,
      },
    ] : []),
  ]

  return (
    <div style={{ padding: '20px 28px' }}>
      <Tabs defaultActiveKey="users" items={items} />
    </div>
  )
}
