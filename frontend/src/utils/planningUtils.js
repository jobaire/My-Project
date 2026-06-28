// Pure planning calculation utilities — no React dependencies

export function shiftNormPos(dateStr, refMidnight, sh, shiftHrs) {
  const totalMs  = new Date(dateStr) - new Date(refMidnight)
  const fullDays = Math.floor(totalMs / 86400000)
  const hourOfDay = (totalMs - fullDays * 86400000) / 3600000
  const shiftFrac = Math.max(0, Math.min(shiftHrs, hourOfDay - sh)) / shiftHrs
  return fullDays + shiftFrac
}

export function blockLeft(startDate, viewStart, zoom) {
  if (zoom.shiftStart !== undefined) {
    const dt = new Date(startDate)
    const vs = new Date(viewStart)
    const totalMs = dt - vs
    const fullDays = Math.floor(totalMs / 86400000)
    const hourOfDay = (totalMs - fullDays * 86400000) / 3600000
    const sh = zoom.shiftStart, wh = zoom.colsPerDay
    const workingHour = Math.max(0, Math.min(wh, hourOfDay - sh))
    return (fullDays * wh + workingHour) * zoom.colPx
  }
  if (zoom.boardShiftStart != null && zoom.boardShiftHours > 0) {
    return shiftNormPos(startDate, viewStart, zoom.boardShiftStart, zoom.boardShiftHours)
      * zoom.colsPerDay * zoom.colPx
  }
  const fractionalDays = (new Date(startDate) - new Date(viewStart)) / 86400000
  return fractionalDays * zoom.colsPerDay * zoom.colPx
}

export function blockWidth(startDate, endDate, zoom) {
  if (zoom.boardShiftStart != null && zoom.boardShiftHours > 0 && zoom.shiftStart === undefined) {
    const ref = String(startDate).slice(0, 10) + 'T00:00:00'
    const w   = shiftNormPos(endDate,   ref, zoom.boardShiftStart, zoom.boardShiftHours)
              - shiftNormPos(startDate, ref, zoom.boardShiftStart, zoom.boardShiftHours)
    return Math.max(w, 0) * zoom.colsPerDay * zoom.colPx
  }
  const days = (new Date(endDate) - new Date(startDate)) / 86400000
  return Math.max(days, 0) * zoom.colsPerDay * zoom.colPx
}

export function pixelToDate(left, viewStart, zoom) {
  if (zoom.shiftStart !== undefined) {
    const totalCols = Math.max(0, Math.round(left / zoom.colPx))
    const fullDays  = Math.floor(totalCols / zoom.colsPerDay)
    const colInDay  = totalCols % zoom.colsPerDay
    const actualH   = zoom.shiftStart + colInDay
    const d = addDays(viewStart, fullDays)
    d.setHours(actualH, 0, 0, 0)
    return d
  }
  const dayIndex = Math.max(0, Math.round(left / (zoom.colsPerDay * zoom.colPx)))
  const d = addDays(viewStart, dayIndex)
  d.setHours(0, 0, 0, 0)
  return d
}

export function calcEndDate(startDate, workDaysNeeded, nonWorkingSet) {
  const d = new Date(startDate)
  d.setHours(0, 0, 0, 0)
  let remaining = Math.max(1, workDaysNeeded)
  for (let i = 0; i < 730 && remaining > 0; i++) {
    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    if (!nonWorkingSet.has(iso)) remaining--
    if (remaining > 0) d.setDate(d.getDate() + 1)
  }
  d.setDate(d.getDate() + 1)
  return d
}

export function calcEndTime(startDate, workHoursNeeded, shiftStart, shiftHours, nonWorkingSet) {
  const shiftEnd = shiftStart + shiftHours
  const d = new Date(startDate)
  let rem = workHoursNeeded
  for (let guard = 0; guard < 365 * 24 && rem > 1e-9; guard++) {
    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    if (nonWorkingSet.has(iso)) {
      d.setDate(d.getDate() + 1); d.setHours(shiftStart, 0, 0, 0); continue
    }
    const nowH = d.getHours() + d.getMinutes() / 60
    if (nowH >= shiftEnd) {
      d.setDate(d.getDate() + 1); d.setHours(shiftStart, 0, 0, 0); continue
    }
    const available = shiftEnd - Math.max(shiftStart, nowH)
    if (rem <= available) {
      d.setTime(d.getTime() + rem * 3600000); rem = 0
    } else {
      rem -= available; d.setDate(d.getDate() + 1); d.setHours(shiftStart, 0, 0, 0)
    }
  }
  return d
}

export function getLCFactorFromStages(stages, workingDay) {
  if (!stages || !stages.length) return 1
  const sorted = [...stages].sort((a, b) => b.day_number - a.day_number)
  const match = sorted.find(s => s.day_number <= workingDay)
  return match ? match.efficiency_pct / 100 : 1
}

export function calcEndTimeLC(startDate, plannedQty, baseDailyCap, shiftStart, shiftHours, nonWorkingSet, lcStages) {
  if (shiftHours <= 0 || baseDailyCap <= 0) return new Date(startDate)
  const shiftEnd  = shiftStart + shiftHours
  const loadPerHr = baseDailyCap / shiftHours
  const d = new Date(startDate)
  let remaining = plannedQty
  let workingDay = 0
  for (let guard = 0; guard < 365 * 24 && remaining > 1e-9; guard++) {
    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    if (nonWorkingSet.has(iso)) {
      d.setDate(d.getDate() + 1); d.setHours(shiftStart, 0, 0, 0); continue
    }
    const nowH = d.getHours() + d.getMinutes() / 60
    if (nowH >= shiftEnd) {
      d.setDate(d.getDate() + 1); d.setHours(shiftStart, 0, 0, 0); continue
    }
    workingDay++
    const rate = loadPerHr * getLCFactorFromStages(lcStages, workingDay)
    if (rate <= 1e-9) { d.setDate(d.getDate() + 1); d.setHours(shiftStart, 0, 0, 0); continue }
    const availableH = shiftEnd - Math.max(shiftStart, nowH)
    const dayMax = rate * availableH
    if (remaining <= dayMax) {
      d.setTime(d.getTime() + (remaining / rate) * 3600000); remaining = 0
    } else {
      remaining -= dayMax; d.setDate(d.getDate() + 1); d.setHours(shiftStart, 0, 0, 0)
    }
  }
  return d
}

export function totalWidth(viewDays, zoom) {
  return viewDays * zoom.colsPerDay * zoom.colPx
}

export function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

export function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000)
}

export function toISO(d) {
  if (!(d instanceof Date)) return String(d).slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export function toLocalDT(d) {
  if (!(d instanceof Date)) return String(d)
  const p = n => String(n).padStart(2, '0')
  return `${toISO(d)}T${p(d.getHours())}:${p(d.getMinutes())}:00`
}

export function parseDate(s) {
  const d = new Date(s); d.setHours(0, 0, 0, 0); return d
}

export function weekLabel(d) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${m[d.getMonth()]} ${d.getDate()}`
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

export async function apiFetch(path, token, opts = {}) {
  const r = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers },
  })
  if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.detail ?? 'Request failed') }
  if (r.status === 204) return null
  return r.json()
}
