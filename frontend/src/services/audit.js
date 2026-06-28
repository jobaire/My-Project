const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

const get = (path, token) =>
  fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => { if (!r.ok) throw new Error('Failed to load history'); return r.json() })

export const fetchAuditLog        = (token, tableName, recordId) => get(`/audit/${tableName}/${recordId}`, token)
export const fetchProductAuditLog = (token, productId)           => get(`/audit/product/${productId}`, token)
export const fetchCustomerAuditLog = (token, customerId)         => get(`/audit/customer/${customerId}`, token)
