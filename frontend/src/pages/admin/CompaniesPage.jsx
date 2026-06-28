import {
  BankOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'

import { useEffect, useState } from 'react'
import { useResizableModal } from '../../hooks/useResizableModal'
import { createTenant, deactivateCompany, fetchCompanies } from '../../services/platform'

const { Title, Text } = Typography

export default function CompaniesPage({ session }) {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()
  const { modalWidth, bodyHeight, resetSize } = useResizableModal({ defaultWidth: 520, defaultHeight: 320, minWidth: 380, minHeight: 220 })

  const load = () => {
    setLoading(true)
    fetchCompanies(session.access_token)
      .then(setCompanies)
      .catch(() => message.error('Failed to load companies'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (values) => {
    setSubmitting(true)
    try {
      await createTenant(session.access_token, {
        tenant_name: values.tenant_name.trim(),
        database_name: values.database_name.trim(),
      })
      message.success(`${values.tenant_name} created successfully`)
      form.resetFields()
      setModalOpen(false)
      load()
    } catch (err) {
      message.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeactivate = async (id, name) => {
    try {
      await deactivateCompany(session.access_token, id)
      message.success(`${name} deactivated`)
      load()
    } catch {
      message.error('Failed to deactivate company')
    }
  }

  const columns = [
    {
      title: 'Company',
      dataIndex: 'name',
      key: 'name',
      render: (name) => (
        <Space>
          <BankOutlined style={{ color: '#a78bfa' }} />
          <Text strong>{name}</Text>
        </Space>
      ),
    },
    {
      title: 'Contact email',
      dataIndex: 'contact_email',
      key: 'contact_email',
      render: (v) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (v) => (
        <Tag color={v ? 'green' : 'default'}>{v ? 'Active' : 'Inactive'}</Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_, record) => (
        <Popconfirm
          title={`Deactivate ${record.name}?`}
          description="The database will be kept. This cannot be undone easily."
          onConfirm={() => handleDeactivate(record.id, record.name)}
          okText="Deactivate"
          okButtonProps={{ danger: true }}
        >
          <Button danger icon={<DeleteOutlined />} size="small" type="text" />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div style={{ padding: 28 }}>
      <Space style={{ marginBottom: 20, width: '100%', justifyContent: 'space-between' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Companies</Title>
          <Text type="secondary">Manage tenant company workspaces</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
          <Button icon={<PlusOutlined />} type="primary" onClick={() => { resetSize(); setModalOpen(true) }}>
            New Company
          </Button>
        </Space>
      </Space>

      <Table
        columns={columns}
        dataSource={companies}
        loading={loading}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title="Create company workspace"
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
            name="tenant_name"
            label="Company name"
            rules={[{ required: true, message: 'Enter company name' }]}
          >
            <Input placeholder="Example Garments Ltd" />
          </Form.Item>
          <Form.Item
            name="database_name"
            label="Database name"
            rules={[
              { required: true, message: 'Enter database name' },
              { pattern: /^[a-z][a-z0-9_]*$/, message: 'Lowercase letters, numbers and underscores only' },
            ]}
          >
            <Input placeholder="example_garments_db" />
          </Form.Item>
          <Alert
            message="A dedicated PostgreSQL database will be provisioned for this company. Add users afterwards from the Users page."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => { setModalOpen(false); form.resetFields() }}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              Create Company
            </Button>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}
