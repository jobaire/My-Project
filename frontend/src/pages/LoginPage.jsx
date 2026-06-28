import { LockOutlined, MailOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Divider,
  Form,
  Input,
  Row,
  Space,
  Typography,
} from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ForgotPasswordModal from '../components/ForgotPasswordModal'
import { APP_NAME, BRAND } from '../config/constants'

const { Title, Text } = Typography

function LoginPage({
  errorMessage,
  isSubmitting,
  loginForm,
  onFinish,
  onRememberChange,
  remember,
}) {
  const [forgotOpen, setForgotOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f7f8fa',
      padding: '2rem 1.5rem',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Logo / App name */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo-white.svg" alt={APP_NAME} style={{ height: 60, marginBottom: 10 }} />
          <Text type="secondary" style={{ fontSize: 13, display: 'block' }}>
            Supply Chain OS
          </Text>
        </div>

        <Card
          style={{
            borderRadius: 20,
            boxShadow: '0 4px 6px rgba(0,0,0,0.04), 0 16px 48px rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.07)',
          }}
          styles={{ body: { padding: '28px 28px 24px' } }}
        >
          <Space orientation="vertical" size={4} style={{ marginBottom: 24 }}>
            <Text style={{
              fontSize: 11, textTransform: 'uppercase',
              letterSpacing: '0.14em', fontWeight: 700, color: BRAND.primaryColor,
            }}>
              Secure Sign In
            </Text>
            <Title level={3} style={{ margin: 0 }}>Welcome back</Title>
          </Space>

          <Form form={loginForm} layout="vertical" onFinish={onFinish}>
            {errorMessage && (
              <Form.Item style={{ marginBottom: 16 }}>
                <Alert title={errorMessage} type="error" showIcon />
              </Form.Item>
            )}

            <Form.Item
              label="Email address"
              name="email"
              rules={[
                { required: true, message: 'Enter your email address.' },
                { type: 'email', message: 'Enter a valid email address.' },
              ]}
            >
              <Input
                prefix={<MailOutlined style={{ color: '#bbb' }} />}
                placeholder="you@company.com"
                size="large"
                disabled={isSubmitting}
                autoComplete="email"
              />
            </Form.Item>

            <Form.Item
              label="Password"
              name="password"
              rules={[{ required: true, message: 'Enter your password.' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#bbb' }} />}
                placeholder="Enter your password"
                size="large"
                disabled={isSubmitting}
                autoComplete="current-password"
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 12 }}>
              <Row justify="space-between" align="middle">
                <Checkbox
                  checked={remember}
                  onChange={(e) => onRememberChange(e.target.checked)}
                  disabled={isSubmitting}
                >
                  <Text style={{ fontSize: 13 }}>Keep me signed in</Text>
                </Checkbox>
                <Button type="link" size="small" disabled={isSubmitting}
                        style={{ padding: 0, fontSize: 13 }}
                        onClick={() => setForgotOpen(true)}>
                  Forgot password?
                </Button>
              </Row>
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button block type="primary" htmlType="submit" size="large"
                      loading={isSubmitting}
                      style={{ borderRadius: 10, height: 44 }}>
                Sign In
              </Button>
            </Form.Item>
          </Form>

          <Divider style={{ margin: '20px 0 16px' }} />

          <div style={{ textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 13 }}>New to {APP_NAME}? </Text>
            <Button type="link" style={{ padding: 0, fontSize: 13 }}
                    onClick={() => navigate('/signup')}>
              Start a free trial
            </Button>
          </div>
        </Card>

        <ForgotPasswordModal open={forgotOpen} onClose={() => setForgotOpen(false)} />
      </div>
    </div>
  )
}

export default LoginPage
