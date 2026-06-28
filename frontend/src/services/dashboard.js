const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

export const fetchDashboardStats = (token) =>
  fetch(`${API_BASE_URL}/dashboard/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => { if (!r.ok) throw new Error('Failed to load stats'); return r.json() })
