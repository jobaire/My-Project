import { SESSION_KEY } from '../config/constants'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

export async function login(credentials) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.detail ?? 'Login failed. Please try again.')
  return payload
}

export async function refreshSession(refreshToken) {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!response.ok) return null
  return response.json()
}

export async function logout(refreshToken) {
  if (!refreshToken) return
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  }).catch(() => {})
}

export async function createTenant(session, company) {
  const response = await fetch(`${API_BASE_URL}/platform/tenants`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(company),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.detail ?? 'Company creation failed.')
  return payload
}

export function persistSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function getStoredSession() {
  const rawValue = localStorage.getItem(SESSION_KEY)
  if (!rawValue) return null
  try {
    return JSON.parse(rawValue)
  } catch {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

export async function updateMyProfile(token, fields) {
  const response = await fetch(`${API_BASE_URL}/users/me`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(fields),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.detail ?? 'Update failed')
  }
  return response.json()
}
