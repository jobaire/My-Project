import { MailOutlined } from '@ant-design/icons'
import { Alert, Button, Form, Input, Modal, Result, Space, Typography } from 'antd'
import { useState } from 'react'

const { Text } = Typography

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

async function requestReset(email) {
  const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.detail ?? 'Request failed. Please try again.')
  }
}

export default function ForgotPasswordModal({ open, onClose }) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [sent, setSent] = useState(false)

  function handleClose() {
    form.resetFields()
    setErrorMessage('')
    setSent(false)
    onClose()
  }

  async function handleFinish(values) {
    setErrorMessage('')
    setSubmitting(true)
    try {
      await requestReset(values.email.trim())
      setSent(true)
    } catch (err) {
      setErrorMessage(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Reset your password"
      open={open}
      onCancel={handleClose}
      footer={null}
      width={400}
      destroyOnHidden
    >
      {sent ? (
        <Result
          status="success"
          title="Check your email"
          subTitle="If that address is registered, you'll receive a reset link shortly."
          extra={<Button type="primary" onClick={handleClose}>Close</Button>}
        />
      ) : (
        <Form form={form} layout="vertical" onFinish={handleFinish} style={{ marginTop: 8 }}>
          {errorMessage && (
            <Form.Item style={{ marginBottom: 16 }}>
              <Alert title={errorMessage} type="error" showIcon />
            </Form.Item>
          )}
          <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 14 }}>
            Enter your email address and we'll send you a link to reset your password.
          </Text>
          <Form.Item
            name="email"
            label="Email address"
            rules={[
              { required: true, message: 'Enter your email address.' },
              { type: 'email', message: 'Enter a valid email address.' },
            ]}
          >
            <Input
              prefix={<MailOutlined style={{ color: '#bbb' }} />}
              placeholder="you@company.com"
              size="large"
              disabled={submitting}
              autoComplete="email"
            />
          </Form.Item>
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={handleClose} disabled={submitting}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              Send Reset Link
            </Button>
          </Space>
        </Form>
      )}
    </Modal>
  )
}
