const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

export async function fetchNewsFeed() {
  const res = await fetch(`${API_BASE_URL}/news/feed`)
  if (!res.ok) throw new Error('Failed to fetch news feed')
  return res.json()
}
