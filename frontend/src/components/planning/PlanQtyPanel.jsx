import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import { Typography } from 'antd'
import { useMemo } from 'react'
import { toISO } from '../../utils/planningUtils'

const { Text } = Typography

export default function PlanQtyPanel({
  sched, zoom, nonWorkingSet, boardShiftHours, boardShiftStart, boardBreaks,
  lineWHOverrides, learningCurves, open, onToggle, hoveredDate,
}) {
  const isHour = zoom?.shiftStart !== undefined

  const rows = useMemo(() => {
    if (!sched) return []
    const baseCap = sched.daily_capacity
    if (!baseCap || baseCap <= 0) return []

    const getEffWH = (iso) => {
      if (!boardShiftHours) return boardShiftHours
      const overrides = (lineWHOverrides || {})[sched.line_id] || []
      const ov = overrides.find(o => iso >= o.start_date && iso <= o.end_date)
      return boardShiftHours + (ov ? Number(ov.wh_offset) : 0)
    }

    const getLCFactor = (workingDay) => {
      if (!sched.learning_curve_id || !learningCurves?.length) return 1
      const preset = learningCurves.find(lc => lc.id === sched.learning_curve_id)
      if (!preset?.stages?.length) return 1
      const sorted = [...preset.stages].sort((a, b) => b.day_number - a.day_number)
      const match = sorted.find(s => s.day_number <= workingDay)
      return match ? match.efficiency_pct / 100 : 1
    }

    const startDt  = new Date(sched.planned_start)
    const startISO = toISO(startDt)
    const startH   = startDt.getHours() + startDt.getMinutes() / 60

    const getDayCap = (iso, workingDay) => {
      const effWH = getEffWH(iso)
      if (!boardShiftHours || !effWH || effWH <= 0) return baseCap * getLCFactor(workingDay)
      let wh = effWH
      if (iso === startISO && boardShiftStart != null && startH > boardShiftStart) {
        wh = Math.max(0, boardShiftStart + effWH - startH)
      }
      return baseCap * (wh / boardShiftHours) * getLCFactor(workingDay)
    }

    if (isHour) {
      if (!boardShiftHours || boardShiftStart == null) return []
      const totalBreakH = (boardBreaks || []).reduce((s, b) => s + b.duration, 0)
      const shiftEnd  = boardShiftStart + boardShiftHours + totalBreakH
      const totalCols = boardShiftHours + totalBreakH
      const targetISO = hoveredDate ?? toISO(new Date(sched.planned_start))

      const walkD = new Date(sched.planned_start); walkD.setHours(0, 0, 0, 0)
      const walkEnd = new Date(sched._effectiveEnd || sched.planned_end || sched.planned_start)
      let remaining = Number(sched.planned_qty) || 0
      let dayQty = 0
      let firstH = boardShiftStart
      let lastH  = shiftEnd
      let workingDay = 0

      while (walkD < walkEnd && remaining > 0) {
        const iso = toISO(walkD)
        const working = !nonWorkingSet.has(iso)
        if (iso === targetISO) {
          if (working) {
            workingDay++
            const dayCap = getDayCap(iso, workingDay)
            const effWH  = Math.max(1, getEffWH(iso) || boardShiftHours)
            const startDt = new Date(sched.planned_start)
            if (iso === toISO(startDt) && startDt.getHours() > boardShiftStart)
              firstH = startDt.getHours()
            const endDt = new Date(sched._effectiveEnd || sched.planned_end || sched.planned_start)
            if (iso === toISO(endDt) && endDt.getHours() > 0 && endDt.getHours() < boardShiftStart + totalCols)
              lastH = endDt.getHours()
            const effectiveHours = Math.max(1, lastH - firstH)
            dayQty = Math.min(Math.round(dayCap * effectiveHours / effWH), remaining)
          }
          break
        }
        if (working) {
          workingDay++
          remaining -= Math.min(Math.round(getDayCap(iso, workingDay)), remaining)
        }
        walkD.setDate(walkD.getDate() + 1)
      }

      const workHours = Math.max(1, lastH - firstH)
      const hourQty   = dayQty / workHours
      const dayEff    = Math.round(getLCFactor(workingDay) * 100)
      const isBreak = (h) => (boardBreaks || []).some(b => h >= b.startHour && h < b.startHour + b.duration)
      return Array.from({ length: Math.round(totalCols) }, (_, i) => {
        const h = boardShiftStart + i
        const label = h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`
        const brk   = isBreak(h)
        const worked = !brk && h >= firstH && h < lastH
        return { label, qty: worked && dayQty > 0 ? Math.round(hourQty) : 0, isBreak: brk, efficiency: worked ? dayEff : null }
      })
    }

    // daily
    const result = []
    const d = new Date(sched.planned_start); d.setHours(0, 0, 0, 0)
    const end = new Date(sched._effectiveEnd || sched.planned_end || sched.planned_start)
    let remaining = Number(sched.planned_qty) || 0
    let workingDay = 0
    while (d < end && result.length < 120) {
      const iso = toISO(d)
      const working = !nonWorkingSet.has(iso)
      if (working) {
        workingDay++
        const dayCap = getDayCap(iso, workingDay)
        const qty = Math.min(Math.round(dayCap), remaining)
        result.push({ label: iso.slice(5).replace('-', '/'), qty, isBreak: false, efficiency: Math.round(getLCFactor(workingDay) * 100) })
        remaining -= qty
        if (remaining <= 0) break
      } else {
        result.push({ label: iso.slice(5).replace('-', '/'), qty: 0, isBreak: false, efficiency: null })
      }
      d.setDate(d.getDate() + 1)
    }
    return result
  }, [sched, isHour, boardShiftHours, boardShiftStart, boardBreaks, lineWHOverrides, learningCurves, nonWorkingSet, hoveredDate])

  return (
    <div style={{ width: open ? 175 : 22, flexShrink: 0, transition: 'width 0.2s ease', borderLeft: '1px solid #8d9296', display: 'flex', flexDirection: 'row', overflow: 'hidden', background: '#fafbfc', position: 'relative' }}>
      <div onClick={onToggle} style={{ width: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRight: open ? '1px solid #e8eef2' : 'none', background: '#f4f6f8', userSelect: 'none' }} title={open ? 'Collapse' : 'Expand'}>
        {open
          ? <RightOutlined style={{ fontSize: 9, color: 'var(--c-text-placeholder)' }} />
          : <LeftOutlined  style={{ fontSize: 9, color: 'var(--c-text-placeholder)' }} />}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: 8, paddingTop: 4, paddingBottom: 4, minHeight: 28, borderBottom: '1px solid #e8eef2', background: '#f4f6f8' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--c-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {isHour ? 'Hourly Plan' : 'Daily Plan'}
            </Text>
            {isHour && (hoveredDate || sched) && (
              <Text style={{ fontSize: 'var(--fs-2xs)', color: '#94a3b8' }}>
                {(hoveredDate ?? toISO(new Date(sched.planned_start))).slice(5).replace('-', '/')}
              </Text>
            )}
          </div>
          {sched?.order_name && (
              <div style={{ fontSize: 'var(--fs-2xs)', color: '#64748b', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 6 }}>
                {sched.order_name}{sched.line_number != null ? ` · ${String(sched.line_number).padStart(2, '0')}` : ''}
              </div>
          )}
        </div>
        {!sched ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 'var(--fs-2xs)', color: '#c8d2da' }}>Hover a strip</Text>
          </div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div style={{ display: 'flex', padding: '3px 8px', borderBottom: '1px solid #f0f2f4', background: '#f8f9fb' }}>
              <Text style={{ flex: 1, fontSize: 'var(--fs-2xs)', fontWeight: 600, color: '#94a3b8' }}>{isHour ? 'Time' : 'Date'}</Text>
              <Text style={{ fontSize: 'var(--fs-2xs)', fontWeight: 600, color: '#94a3b8', textAlign: 'right', width: 34 }}>Eff.</Text>
              <Text style={{ fontSize: 'var(--fs-2xs)', fontWeight: 600, color: '#94a3b8', textAlign: 'right', width: 40 }}>Qty</Text>
            </div>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', padding: '2px 8px', borderBottom: '1px solid #f4f6f8', background: r.isBreak ? 'rgba(15,23,42,0.1)' : i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                <Text style={{ flex: 1, fontSize: 'var(--fs-xs)', color: r.isBreak ? 'var(--c-text-secondary)' : r.qty === 0 ? '#c8d2da' : '#374151', fontStyle: r.isBreak ? 'italic' : 'normal' }}>{r.label}{r.isBreak ? ' ☕' : ''}</Text>
                <Text style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, textAlign: 'right', width: 34, color: r.isBreak || r.efficiency == null ? '#c8d2da' : r.efficiency < 100 ? 'var(--c-teal)' : '#94a3b8' }}>
                  {r.isBreak || r.efficiency == null ? '—' : `${r.efficiency}%`}
                </Text>
                <Text style={{ fontSize: 'var(--fs-xs)', fontWeight: r.qty > 0 ? 600 : 400, color: r.isBreak ? '#94a3b8' : r.qty === 0 ? '#c8d2da' : '#0f172a', textAlign: 'right', width: 40 }}>
                  {r.isBreak ? 'break' : r.qty > 0 ? r.qty.toLocaleString() : '—'}
                </Text>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
