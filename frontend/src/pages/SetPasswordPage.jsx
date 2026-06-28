import { LockOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Result, Space, Typography } from 'antd'
import { useState } from 'react'
import { APP_NAME, BRAND } from '../config/constants'

const { Title, Text } = Typography

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

async function doSetPassword(token, purpose, newPassword) {
  const res = await fetch(`${API_BASE_URL}/auth/set-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, purpose, new_password: newPassword }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.detail ?? 'Something went wrong. Please try again.')
  }
}

export default function SetPasswordPage({ token, purpose, onBackToLogin }) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [done, setDone] = useState(false)

  const isInvite = purpose === 'invite'

  async function handleFinish(values) {
    setErrorMessage('')
    setSubmitting(true)
    try {
      await doSetPassword(token, purpose, values.new_password)
      setDone(true)
    } catch (err) {
      setErrorMessage(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f8fa' }}>
        <Result
          status="success"
          title="Password set successfully!"
          subTitle="You can now sign in with your new password."
          extra={
            <Button type="primary" size="large" onClick={onBackToLogin}
                    style={{ background: BRAND.primaryColor, borderColor: BRAND.primaryColor, borderRadius: 8 }}>
              Go to Sign In
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f8fa', padding: '2rem 1.5rem' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={4} style={{ margin: 0, color: '#0d1b2a' }}>{APP_NAME}</Title>
        </div>

        <Card
          style={{ borderRadius: 20, boxShadow: '0 4px 6px rgba(0,0,0,0.04), 0 16px 48px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.07)' }}
          styles={{ body: { padding: '28px 28px 24px' } }}
        >
          <Space orientation="vertical" size={4} style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 700, color: BRAND.primaryColor }}>
              {isInvite ? 'Account Activation' : 'Password Reset'}
            </Text>
            <Title level={3} style={{ margin: 0 }}>
              {isInvite ? 'Set your password' : 'Reset your password'}
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {isInvite
                ? `Welcome to ${APP_NAME}. Choose a secure password to activate your account.`
                : `Enter a new password for your ${APP_NAME} account.`}
            </Text>
          </Space>

          <Form form={form} layout="vertical" onFinish={handleFinish}>
            {errorMessage && (
              <Form.Item style={{ marginBottom: 16 }}>
                <Alert title={errorMessage} type="error" showIcon />
              </Form.Item>
            )}

            <Form.Item
              label="New password"
              name="new_password"
              rules={[
                { required: true, message: 'Enter a password.' },
                { min: 8, message: 'At least 8 characters.' },
                { pattern: /[A-Z]/, message: 'At least one uppercase letter.' },
                { pattern: /[0-9]/, message: 'At least one number.' },
                { pattern: /[^A-Za-z0-9]/, message: 'At least one special character.' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#bbb' }} />}
                placeholder="Min 8 chars, uppercase, number, special char"
                size="large"
                disabled={submitting}
                autoComplete="new-password"
              />
            </Form.Item>

            <Form.Item
              label="Confirm password"
              name="confirm_password"
              dependencies={['new_password']}
              rules={[
                { required: true, message: 'Please confirm your password.' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('new_password') === value) return Promise.resolve()
                    return Promise.reject(new Error('Passwords do not match.'))
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#bbb' }} />}
                placeholder="Re-enter your password"
                size="large"
                disabled={submitting}
                autoComplete="new-password"
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                block type="primary" htmlType="submit" size="large" loading={submitting}
                style={{ borderRadius: 10, height: 44, background: BRAND.primaryColor, borderColor: BRAND.primaryColor }}
              >
                {isInvite ? 'Activate Account' : 'Reset Password'}
              </Button>
            </Form.Item>
          </Form>
        </Card>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button type="link" onClick={onBackToLogin} style={{ fontSize: 13 }}>
            Back to Sign In
          </Button>
        </div>
      </div>
    </div>
  )
}
