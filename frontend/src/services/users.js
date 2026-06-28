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

export const fetchUsers = (token, tenantId) =>
  apiFetch(tenantId ? `/users/?tenant_id=${tenantId}` : '/users/', token)

export const createUser = (token, data) =>
  apiFetch('/users/', token, { method: 'POST', body: JSON.stringify(data) })

export const updateUser = (token, id, data) =>
  apiFetch(`/users/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) })

export const deleteUser = (token, id) =>
  fetch(`${API_BASE_URL}/users/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => { if (!r.ok) throw new Error('Failed to delete user') })

// ── Sub-companies (via /setup/sub-tenants — uses tenant middleware) ──────────

export const fetchSubCompanies = (token) =>
  apiFetch('/setup/sub-tenants', token)

export const createSubCompany = (token, data) =>
  apiFetch('/setup/sub-tenants', token, { method: 'POST', body: JSON.stringify(data) })

export const updateSubCompany = (token, id, data) =>
  apiFetch(`/setup/sub-tenants/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) })

export const deleteSubCompany = (token, id) =>
  fetch(`${API_BASE_URL}/setup/sub-tenants/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => { if (!r.ok) throw new Error('Failed to delete sub-company') })

// ── Company roles ─────────────────────────────────────────────────────────────

export const fetchRoles = (token) =>
  apiFetch('/setup/roles', token)

export const createRole = (token, data) =>
  apiFetch('/setup/roles', token, { method: 'POST', body: JSON.stringify(data) })

export const updateRole = (token, name, data) =>
  apiFetch(`/setup/roles/${name}`, token, { method: 'PATCH', body: JSON.stringify(data) })

export const deleteRole = (token, name) =>
  fetch(`${API_BASE_URL}/setup/roles/${name}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => { if (!r.ok) return r.json().then((b) => { throw new Error(b.detail ?? 'Failed to delete role') }) })

// ── Module permissions matrix ─────────────────────────────────────────────────

export const fetchModulePermissions = (token) =>
  apiFetch('/setup/module-permissions', token)

export const updateModulePermission = (token, role, module, data) =>
  apiFetch(`/setup/module-permissions/${role}/${module}`, token, { method: 'PUT', body: JSON.stringify(data) })

export const resendInvite = (token, userId) =>
  apiFetch(`/users/${userId}/resend-invite`, token, { method: 'POST' })
