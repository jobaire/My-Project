const LS_KEY = 'filaminto.date_format'

export const DATE_FORMAT_OPTIONS = [
  { value: 'DD/MM/YYYY',  label: 'DD/MM/YYYY  ·  25/06/2026'  },
  { value: 'MM/DD/YYYY',  label: 'MM/DD/YYYY  ·  06/25/2026'  },
  { value: 'YYYY-MM-DD',  label: 'YYYY-MM-DD  ·  2026-06-25'  },
  { value: 'DD-MM-YYYY',  label: 'DD-MM-YYYY  ·  25-06-2026'  },
  { value: 'DD MMM YYYY', label: 'DD MMM YYYY  ·  25 Jun 2026' },
]

export const DEFAULT_DATE_FORMAT = 'DD/MM/YYYY'

export function getDateFormat() {
  try { return localStorage.getItem(LS_KEY) || DEFAULT_DATE_FORMAT }
  catch { return DEFAULT_DATE_FORMAT }
}

export function setDateFormat(fmt) {
  localStorage.setItem(LS_KEY, fmt)
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function formatDateTime(dateStr) {
  if (!dateStr) return '—'
  const s = String(dateStr)
  // Extract HH:MM directly from the string — avoids any JS timezone conversion
  const tMatch = s.match(/T(\d{2}):(\d{2})/)
  if (tMatch) {
    const h24 = parseInt(tMatch[1], 10)
    const mn  = tMatch[2]
    const p   = h24 >= 12 ? 'PM' : 'AM'
    const h12 = h24 % 12 || 12
    return `${formatDate(s)} ${h12}:${mn} ${p}`
  }
  return formatDate(s)
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  const iso = String(dateStr).slice(0, 10)
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return iso
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = String(d.getFullYear())
  const mmm  = MONTHS[d.getMonth()]
  // MMM must be replaced before MM to avoid partial overlap
  return getDateFormat()
    .replace('MMM', mmm)
    .replace('DD', dd)
    .replace('MM', mm)
    .replace('YYYY', yyyy)
}
