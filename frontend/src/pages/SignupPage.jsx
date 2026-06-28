import { LockOutlined, MailOutlined, ShopOutlined, UserOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Result, Space, Typography } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { APP_NAME, BRAND } from '../config/constants'

const { Title, Text } = Typography

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

async function doSignup(values) {
  const res = await fetch(`${API_BASE_URL}/onboarding/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_name: values.tenant_name,
      admin_name: values.admin_name,
      email: values.email,
      password: values.password,
    }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.detail ?? 'Signup failed. Please try again.')
  return data
}

export default function SignupPage() {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [done, setDone] = useState(null)
  const navigate = useNavigate()

  async function handleFinish(values) {
    setErrorMessage('')
    setSubmitting(true)
    try {
      const result = await doSignup(values)
      setDone(result)
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
          title="Account created!"
          subTitle={done.message}
          extra={
            <Button type="primary" size="large" onClick={() => navigate('/')}
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
      <div style={{ width: '100%', maxWidth: 460 }}>

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/logo-white.svg" alt={APP_NAME} style={{ height: 60, marginBottom: 8 }} />
          <Text type="secondary" style={{ fontSize: 13, display: 'block' }}>
            Start your 14-day free trial — no credit card required
          </Text>
        </div>

        <Card style={{ borderRadius: 20, boxShadow: '0 4px 6px rgba(0,0,0,0.04), 0 16px 48px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.07)' }}
              styles={{ body: { padding: '28px 28px 24px' } }}>

          <Space orientation="vertical" size={4} style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 700, color: BRAND.primaryColor }}>
              Create Account
            </Text>
            <Title level={3} style={{ margin: 0 }}>Set up your company</Title>
          </Space>

          <Form form={form} layout="vertical" onFinish={handleFinish}>
            {errorMessage && (
              <Form.Item style={{ marginBottom: 16 }}>
                <Alert title={errorMessage} type="error" showIcon />
              </Form.Item>
            )}

            <Form.Item name="tenant_name" label="Company name"
              rules={[{ required: true, message: 'Enter your company name.' }, { min: 2, message: 'At least 2 characters.' }]}>
              <Input prefix={<ShopOutlined style={{ color: '#bbb' }} />} placeholder="Acme Garments Ltd" size="large" autoComplete="organization" />
            </Form.Item>

            <Form.Item name="admin_name" label="Your name"
              rules={[{ required: true, message: 'Enter your full name.' }]}>
              <Input prefix={<UserOutlined style={{ color: '#bbb' }} />} placeholder="Jane Smith" size="large" autoComplete="name" />
            </Form.Item>

            <Form.Item name="email" label="Work email"
              rules={[{ required: true, type: 'email', message: 'Enter a valid email.' }]}>
              <Input prefix={<MailOutlined style={{ color: '#bbb' }} />} placeholder="you@company.com" size="large" autoComplete="email" />
            </Form.Item>

            <Form.Item name="password" label="Password"
              rules={[
                { required: true, message: 'Enter a password.' },
                { min: 8, message: 'At least 8 characters.' },
                { pattern: /[A-Z]/, message: 'At least one uppercase letter.' },
                { pattern: /[0-9]/, message: 'At least one number.' },
                { pattern: /[^A-Za-z0-9]/, message: 'At least one special character.' },
              ]}>
              <Input.Password prefix={<LockOutlined style={{ color: '#bbb' }} />}
                placeholder="Min 8 chars, uppercase, number, special char"
                size="large" autoComplete="new-password" />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button block type="primary" htmlType="submit" size="large" loading={submitting}
                style={{ borderRadius: 10, height: 44, background: BRAND.primaryColor, borderColor: BRAND.primaryColor }}>
                Create Free Account
              </Button>
            </Form.Item>
          </Form>
        </Card>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>Already have an account? </Text>
          <Button type="link" onClick={() => navigate('/')} style={{ fontSize: 13, padding: 0 }}>Sign in</Button>
        </div>
      </div>
    </div>
  )
}
