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

const del = async (path, token) => {
  const r = await fetch(`${API_BASE_URL}${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) {
    let detail = 'Delete failed'
    try { detail = (await r.json())?.detail ?? detail } catch { /* empty */ }
    throw new Error(detail)
  }
}

// Products
export const fetchProducts = (token, { page = 1, pageSize = 25, search = '', categoryId = null, customerId = null, brandId = null } = {}) => {
  const qs = new URLSearchParams({ page, page_size: pageSize })
  if (search) qs.set('search', search)
  if (categoryId) qs.set('category_id', categoryId)
  if (customerId) qs.set('customer_id', customerId)
  if (brandId) qs.set('brand_id', brandId)
  return apiFetch(`/products/?${qs}`, token)
}
export const createProduct  = (token, data)     => apiFetch('/products/', token, { method: 'POST',  body: JSON.stringify(data) })
export const updateProduct  = (token, id, data) => apiFetch(`/products/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteProduct  = (token, id)       => del(`/products/${id}`, token)

// Versions
export const fetchVersions  = (token, pid)           => apiFetch(`/products/${pid}/versions`, token)
export const createVersion  = (token, pid, data)     => apiFetch(`/products/${pid}/versions`, token, { method: 'POST',  body: JSON.stringify(data) })
export const updateVersion  = (token, pid, vid, data) => apiFetch(`/products/${pid}/versions/${vid}`, token, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteVersion  = (token, pid, vid)      => del(`/products/${pid}/versions/${vid}`, token)

// Version steps
export const fetchVersionSteps  = (token, pid, vid)               => apiFetch(`/products/${pid}/versions/${vid}/steps`, token)
export const createVersionStep  = (token, pid, vid, data)         => apiFetch(`/products/${pid}/versions/${vid}/steps`, token, { method: 'POST',  body: JSON.stringify(data) })
export const updateVersionStep  = (token, pid, vid, sid, data)    => apiFetch(`/products/${pid}/versions/${vid}/steps/${sid}`, token, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteVersionStep  = (token, pid, vid, sid)          => del(`/products/${pid}/versions/${vid}/steps/${sid}`, token)
export const reorderVersionSteps = (token, pid, vid, order)       => apiFetch(`/products/${pid}/versions/${vid}/steps/reorder`, token, { method: 'PATCH', body: JSON.stringify(order) })

// Color-Size matrix
export const fetchColorSizes = (token, pid)        => apiFetch(`/products/${pid}/color-sizes`, token)
export const saveColorSizes  = (token, pid, entries) => apiFetch(`/products/${pid}/color-sizes`, token, { method: 'PUT', body: JSON.stringify(entries) })
