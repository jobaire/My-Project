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

// Customers
export const fetchCustomers = (token, { page = 1, pageSize = 25, search = '', group = '' } = {}) => {
  const qs = new URLSearchParams({ page, page_size: pageSize })
  if (search) qs.set('search', search)
  if (group) qs.set('group', group)
  return apiFetch(`/customers/?${qs}`, token)
}
export const fetchAllCustomers = (token) =>
  apiFetch('/customers/?page=1&page_size=1000', token)
    .then((r) => (Array.isArray(r) ? r : (r?.items ?? [])))
export const fetchCustomerGroups = (token) =>
  apiFetch('/customers/groups', token)
export const createCustomer = (token, data)   => apiFetch('/customers/', token, { method: 'POST',  body: JSON.stringify(data) })
export const updateCustomer = (token, id, data) => apiFetch(`/customers/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteCustomer = (token, id)     => del(`/customers/${id}`, token)

// Brands
export const fetchAllBrands = (token)                => apiFetch('/customers/brands', token)
export const fetchBrands  = (token, custId)          => apiFetch(`/customers/${custId}/brands`, token)
export const createBrand  = (token, custId, data)    => apiFetch(`/customers/${custId}/brands`, token, { method: 'POST',  body: JSON.stringify(data) })
export const updateBrand  = (token, custId, id, data) => apiFetch(`/customers/${custId}/brands/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteBrand  = (token, custId, id)      => del(`/customers/${custId}/brands/${id}`, token)
