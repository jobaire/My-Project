const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

async function apiFetch(path, token, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
  let payload = null
  try { payload = await res.json() } catch { /* empty */ }
  if (!res.ok) throw new Error(payload?.detail ?? 'Request failed')
  return payload
}

export const fetchCompanies = (token) =>
  apiFetch('/platform/tenants', token)

export const createTenant = (token, data) =>
  apiFetch('/platform/tenants', token, { method: 'POST', body: JSON.stringify(data) })

export const deactivateCompany = (token, id) =>
  fetch(`${API_BASE_URL}/platform/tenants/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => { if (!r.ok) throw new Error('Failed to deactivate company') })
