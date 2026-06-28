import { addDays, daysBetween, parseDate } from '../../utils/planningUtils'

export default function CapacityBar({ line, schedules, viewStart, viewDays }) {
  const weeks = Math.ceil(viewDays / 7)
  return (
    <div style={{ display: 'flex', height: 6, gap: 1, marginTop: 2 }}>
      {Array.from({ length: weeks }).map((_, wi) => {
        const wStart = addDays(viewStart, wi * 7)
        const wEnd   = addDays(wStart, 6)
        let totalQty = 0
        schedules.forEach(s => {
          const sS = parseDate(s.planned_start), sE = parseDate(s.planned_end)
          if (sE < wStart || sS > wEnd) return
          const od = Math.min(daysBetween(wStart, sE), 4) - Math.max(0, daysBetween(wStart, sS)) + 1
          const dc = (line.machines_count * line.working_hours * 60 * line.efficiency_pct / 100) / (s.smv || 20)
          totalQty += Math.max(0, od) * dc
        })
        const weekCap = line.machines_count * line.working_hours * 60 * (line.efficiency_pct / 100) / 20 * 5
        const pct = weekCap > 0 ? totalQty / weekCap : 0
        const color = pct >= 1 ? '#ef4444' : pct >= 0.8 ? '#f59e0b' : '#22c55e'
        return (
          <div key={wi} style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, pct * 100)}%`, background: color, borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
        )
      })}
    </div>
  )
}
