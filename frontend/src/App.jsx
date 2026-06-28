import { Form } from 'antd'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useInactivityLogout } from './hooks/useInactivityLogout'
import AdminApp from './pages/admin/AdminApp'
import AppShell from './pages/AppShell'
import LoginPage from './pages/LoginPage'
import SetPasswordPage from './pages/SetPasswordPage'
import SignupPage from './pages/SignupPage'
import { clearSession, getStoredSession, login, logout, persistSession, refreshSession } from './services/auth'

function App() {
  const [loginForm] = Form.useForm()
  const [session, setSession] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [remember, setRemember] = useState(true)

  const [searchParams] = useSearchParams()
  const navigateTo = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const stored = getStoredSession()
    if (!stored) return

    if (stored.refresh_token) {
      // Try to get a fresh access token silently
      refreshSession(stored.refresh_token).then((refreshed) => {
        if (refreshed) {
          const updated = { ...stored, ...refreshed }
          setSession(updated)
          persistSession(updated)
        } else {
          // Refresh failed — token is invalid/expired, force re-login
          clearSession()
          // Don't set session — user will see the login page
        }
      })
    } else {
      // Old session without refresh token — use as-is, will expire naturally
      setSession(stored)
    }
  }, [])

  async function handleLoginFinish(values) {
    setErrorMessage('')
    setIsSubmitting(true)
    try {
      const nextSession = await login({
        email: values.email.trim(),
        password: values.password,
      })
      if (remember) persistSession(nextSession)
      else clearSession()
      setSession(nextSession)
      loginForm.setFieldValue('password', '')
    } catch (err) {
      setErrorMessage(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleLogout() {
    const stored = getStoredSession()
    if (stored?.refresh_token) logout(stored.refresh_token)
    clearSession()
    setSession(null)
    setErrorMessage('')
    loginForm.resetFields()
    navigateTo('/', { replace: true })
  }

  function handleSessionUpdate(updates) {
    const updated = { ...session, ...updates }
    setSession(updated)
    if (getStoredSession()) persistSession(updated)
  }

  function handleBackToLogin() {
    navigateTo('/', { replace: true })
  }

  useInactivityLogout(handleLogout, !!session)

  // Signup route — public
  if (location.pathname === '/signup') return <SignupPage />

  // Set-password / invite flow — public route, works regardless of auth state
  const isSetPasswordRoute = location.pathname === '/set-password'
  const token   = searchParams.get('token')
  const purpose = searchParams.get('purpose')

  if (isSetPasswordRoute && token && (purpose === 'reset' || purpose === 'invite')) {
    return (
      <SetPasswordPage
        token={token}
        purpose={purpose}
        onBackToLogin={handleBackToLogin}
      />
    )
  }

  if (session) {
    if (session.role === 'super_admin') {
      return <AdminApp session={session} onLogout={handleLogout} />
    }
    return <AppShell session={session} onLogout={handleLogout} onSessionUpdate={handleSessionUpdate} />
  }

  return (
    <LoginPage
      errorMessage={errorMessage}
      isSubmitting={isSubmitting}
      loginForm={loginForm}
      onFinish={handleLoginFinish}
      onRememberChange={setRemember}
      remember={remember}
    />
  )
}

export default App
