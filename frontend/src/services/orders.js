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

const del = (path, token) =>
  fetch(`${API_BASE_URL}${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    .then((r) => { if (!r.ok) throw new Error('Delete failed') })

// Orders
export function fetchOrders(token, params = {}) {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', params.page)
  if (params.page_size) qs.set('page_size', params.page_size)
  if (params.search) qs.set('search', params.search)
  if (params.status) qs.set('status', params.status)
  if (params.customer_id) qs.set('customer_id', params.customer_id)
  if (params.season_id) qs.set('season_id', params.season_id)
  const query = qs.toString()
  return apiFetch(`/orders/${query ? `?${query}` : ''}`, token)
}

export const createOrder  = (token, data)      => apiFetch('/orders/', token, { method: 'POST',  body: JSON.stringify(data) })
export const getOrder     = (token, id)        => apiFetch(`/orders/${id}`, token)
export const updateOrder  = (token, id, data)  => apiFetch(`/orders/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteOrder  = (token, id)        => del(`/orders/${id}`, token)

// Order Lines
export const fetchOrderLines    = (token, orderId)              => apiFetch(`/orders/${orderId}/lines`, token)
export const createOrderLine    = (token, orderId, data)        => apiFetch(`/orders/${orderId}/lines`, token, { method: 'POST',  body: JSON.stringify(data) })
export const updateOrderLine    = (token, orderId, lineId, data) => apiFetch(`/orders/${orderId}/lines/${lineId}`, token, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteOrderLine    = (token, orderId, lineId)      => del(`/orders/${orderId}/lines/${lineId}`, token)

// Audit
export const fetchOrderAuditLog = (token, orderId) => apiFetch(`/audit/order/${orderId}`, token)
