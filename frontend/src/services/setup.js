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

// Processes
export const fetchProcesses  = (token)          => apiFetch('/setup/processes', token)
export const createProcess   = (token, data)    => apiFetch('/setup/processes', token, { method: 'POST',  body: JSON.stringify(data) })
export const updateProcess   = (token, id, data) => apiFetch(`/setup/processes/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteProcess   = (token, id)      => del(`/setup/processes/${id}`, token)

// Categories
export const fetchCategories    = (token)          => apiFetch('/setup/categories', token)
export const createCategory     = (token, data)    => apiFetch('/setup/categories', token, { method: 'POST',  body: JSON.stringify(data) })
export const updateCategory     = (token, id, data) => apiFetch(`/setup/categories/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteCategory     = (token, id)      => del(`/setup/categories/${id}`, token)

// Sub-categories
export const fetchSubCategories = (token, categoryId) =>
  apiFetch(`/setup/sub-categories${categoryId ? `?category_id=${categoryId}` : ''}`, token)
export const createSubCategory  = (token, data)    => apiFetch('/setup/sub-categories', token, { method: 'POST',  body: JSON.stringify(data) })
export const updateSubCategory  = (token, id, data) => apiFetch(`/setup/sub-categories/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteSubCategory  = (token, id)      => del(`/setup/sub-categories/${id}`, token)

// Colors
export const fetchColors  = (token)          => apiFetch('/setup/colors', token)
export const createColor  = (token, data)    => apiFetch('/setup/colors', token, { method: 'POST',  body: JSON.stringify(data) })
export const updateColor  = (token, id, data) => apiFetch(`/setup/colors/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteColor  = (token, id)      => del(`/setup/colors/${id}`, token)

// Sizes
export const fetchSizes  = (token)          => apiFetch('/setup/sizes', token)
export const createSize  = (token, data)    => apiFetch('/setup/sizes', token, { method: 'POST',  body: JSON.stringify(data) })
export const updateSize  = (token, id, data) => apiFetch(`/setup/sizes/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteSize  = (token, id)      => del(`/setup/sizes/${id}`, token)

// Size sets
export const fetchSizeSets  = (token)          => apiFetch('/setup/size-sets', token)
export const createSizeSet  = (token, data)    => apiFetch('/setup/size-sets', token, { method: 'POST',  body: JSON.stringify(data) })
export const updateSizeSet  = (token, id, data) => apiFetch(`/setup/size-sets/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteSizeSet  = (token, id)      => del(`/setup/size-sets/${id}`, token)

// Seasons
export const fetchSeasons  = (token)           => apiFetch('/setup/seasons', token)
export const createSeason  = (token, data)     => apiFetch('/setup/seasons', token, { method: 'POST',  body: JSON.stringify(data) })
export const updateSeason  = (token, id, data) => apiFetch(`/setup/seasons/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteSeason  = (token, id)       => del(`/setup/seasons/${id}`, token)

// Units of Measure
export const fetchUoM  = (token)           => apiFetch('/setup/uom', token)
export const createUoM = (token, data)     => apiFetch('/setup/uom', token, { method: 'POST',  body: JSON.stringify(data) })
export const updateUoM = (token, id, data) => apiFetch(`/setup/uom/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteUoM = (token, id)       => del(`/setup/uom/${id}`, token)
