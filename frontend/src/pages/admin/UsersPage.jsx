import {
  DeleteOutlined,
  MailOutlined,
  PlusOutlined,
  ReloadOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { useEffect, useState } from 'react'
import { useResizableModal } from '../../hooks/useResizableModal'
import { COMPANY_ROLES, roleColor, roleLabel } from '../../config/roles'
import { fetchCompanies } from '../../services/platform'
import { createUser, deleteUser, fetchUsers, resendInvite } from '../../services/users'

const { Title, Text } = Typography

const PLATFORM_ROLE_COLOR = { super_admin: 'purple' }

export default function UsersPage({ session }) {
  const [users, setUsers] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()
  const { modalWidth, bodyHeight, resetSize } = useResizableModal({ defaultWidth: 480, defaultHeight: 420, minWidth: 380, minHeight: 280 })

  const load = () => {
    setLoading(true)
    Promise.all([
      fetchUsers(session.access_token),
      fetchCompanies(session.access_token),
    ])
      .then(([u, c]) => { setUsers(u); setCompanies(c) })
      .catch(() => message.error('Failed to load data'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (values) => {
    setSubmitting(true)
    try {
      await createUser(session.access_token, {
        email:      values.email.trim(),
        full_name:  values.full_name?.trim() || null,
        roles:      [values.role],
        tenant_id: values.tenant_id,
      })
      message.success('Invite sent — user will receive an email to set their password')
      form.resetFields()
      setModalOpen(false)
      load()
    } catch (err) {
      message.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleResendInvite = async (id, email) => {
    try {
      await resendInvite(session.access_token, id)
      message.success(`Invite resent to ${email}`)
    } catch {
      message.error('Failed to resend invite')
    }
  }

  const handleDelete = async (id, email) => {
    try {
      await deleteUser(session.access_token, id)
      message.success(`${email} deleted`)
      load()
    } catch {
      message.error('Failed to delete user')
    }
  }

  const companyName = (id) => companies.find((c) => c.id === id)?.name ?? '—'

  const columns = [
    {
      title: 'User',
      key: 'user',
      render: (_, r) => (
        <Space>
          <UserOutlined style={{ color: r.is_activated ? '#a78bfa' : '#bbb' }} />
          <div>
            <Space size={6} style={{ display: 'flex', alignItems: 'center' }}>
              <Text strong style={{ display: 'block' }}>{r.full_name || r.email}</Text>
              {!r.is_activated && <Tag color="orange" style={{ fontSize: 10, margin: 0 }}>Invite pending</Tag>}
            </Space>
            {r.full_name && <Text type="secondary" style={{ fontSize: 12 }}>{r.email}</Text>}
          </div>
        </Space>
      ),
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (v) => (
        <Tag color={PLATFORM_ROLE_COLOR[v] ?? roleColor(v)} style={{ borderRadius: 20 }}>
          {v === 'super_admin' ? 'Super Admin' : roleLabel(v)}
        </Tag>
      ),
    },
    {
      title: 'Company',
      dataIndex: 'tenant_id',
      key: 'tenant_id',
      render: (id) => id ? companyName(id) : <Text type="secondary">Platform</Text>,
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_, record) => (
        <Space>
          {!record.is_activated && (
            <Button icon={<MailOutlined />} size="small" type="text"
                    title="Resend invite" onClick={() => handleResendInvite(record.id, record.email)} />
          )}
          <Popconfirm
            title={`Delete ${record.email}?`}
            onConfirm={() => handleDelete(record.id, record.email)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<DeleteOutlined />} size="small" type="text" />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 28 }}>
      <Space style={{ marginBottom: 20, width: '100%', justifyContent: 'space-between' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Users</Title>
          <Text type="secondary">Manage platform and company users</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
          <Button icon={<PlusOutlined />} type="primary" onClick={() => { resetSize(); setModalOpen(true) }}>
            New User
          </Button>
        </Space>
      </Space>

      <Table
        columns={columns}
        dataSource={users}
        loading={loading}
        rowKey="id"
        pagination={{ pageSize: 15 }}
      />

      <Modal
        title="Create user"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        footer={null}
        width={modalWidth}
        destroyOnHidden
        draggable
        styles={{ body: { maxHeight: bodyHeight, overflowY: 'auto' } }}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
          >
            <Input placeholder="user@company.com" autoComplete="off" />
          </Form.Item>
          <Form.Item name="full_name" label="Full name">
            <Input placeholder="Optional" autoComplete="off" />
          </Form.Item>
          <Form.Item name="role" label="Role" initialValue="data_entry">
            <Select options={COMPANY_ROLES} />
          </Form.Item>
          <Form.Item
            name="tenant_id"
            label="Company"
            rules={[{ required: true, message: 'Select a company' }]}
          >
            <Select
              placeholder="Select company"
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => { setModalOpen(false); form.resetFields() }}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>Send Invite</Button>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}
