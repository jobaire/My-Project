const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` })

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function postFile(path, token, file) {
  const form = new FormData()
  form.append('file', file)
  const r = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: form,
  })
  if (!r.ok) throw new Error('Failed to parse file')
  return r.json()
}

async function postJson(path, token, body) {
  const r = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error('Import failed')
  return r.json()
}

async function downloadTemplate(path, token, filename) {
  const r = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders(token) })
  if (!r.ok) throw new Error('Failed to download template')
  triggerDownload(await r.blob(), filename)
}

// ── Customers ──────────────────────────────────────────────────────────────────

export const previewCustomerImport  = (token, file) => postFile('/customers/import/preview', token, file)
export const confirmCustomerImport  = (token, rows) => postJson('/customers/import/confirm', token, rows)
export const downloadCustomerTemplate = (token)    => downloadTemplate('/customers/import/template', token, 'customers_template.csv')

// ── Products ───────────────────────────────────────────────────────────────────

export const previewProductImport   = (token, file) => postFile('/products/import/preview', token, file)
export const confirmProductImport   = (token, rows) => postJson('/products/import/confirm', token, rows)
export const downloadProductTemplate = (token)     => downloadTemplate('/products/import/template', token, 'products_template.csv')

// ── Orders ─────────────────────────────────────────────────────────────────────

export const previewOrderImport    = (token, file) => postFile('/orders/import/preview', token, file)
export const confirmOrderImport    = (token, rows) => postJson('/orders/import/confirm', token, rows)
export const downloadOrderTemplate = (token)       => downloadTemplate('/orders/import/template', token, 'orders_template.csv')
