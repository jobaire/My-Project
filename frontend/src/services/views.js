const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

async function apiFetch(path, token, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
  })
  let payload = null
  try { payload = await res.json() } catch { /* empty */ }
  if (!res.ok) throw new Error(payload?.detail ?? 'Request failed')
  return payload
}

export const fetchViews  = (token, viewKey)                  => apiFetch(`/views/${viewKey}`, token)
export const createView  = (token, viewKey, name, config)    => apiFetch(`/views/${viewKey}`, token, { method: 'POST', body: JSON.stringify({ name, config }) })
export const updateView  = (token, viewKey, id, data)        => apiFetch(`/views/${viewKey}/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteView  = (token, viewKey, id)              =>
  fetch(`${API_BASE_URL}/views/${viewKey}/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    .then((r) => { if (!r.ok) throw new Error('Delete failed') })
