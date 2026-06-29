import { ScheduleOutlined } from '@ant-design/icons'
import { Typography } from 'antd'
import { Fragment, useCallback, useMemo, useState } from 'react'
import { toISO } from '../../utils/planningUtils'
import { formatDate, formatDateTime } from '../../utils/dateFormat'

const { Text } = Typography

const STATUS_COLOR = {
  Confirmed:          '#16a34a',
  Forecast:           '#2563eb',
  Projection:         '#0891b2',
  'Under Projection': '#d97706',
}

export const INFO_FIELD_SECTIONS = ['customer', 'style', 'plan', 'warning']
export const INFO_SECTION_LABEL  = { customer: 'Customer', style: 'Style', plan: 'Plan', warning: 'Warning' }

export const INFO_FIELD_DEFS = [
  { key: 'customer_name',    section: 'customer', label: 'Customer',      wide: true,  render: (s)    => s.customer_name   || '—' },
  { key: 'customer_group',   section: 'customer', label: 'Cust. Group',   wide: false, render: (s)    => s.customer_group  || '—' },
  { key: 'product_name',     section: 'style',    label: 'Style',         wide: true,  render: (s)    => s.product_name    || '—' },
  { key: 'smv',              section: 'style',    label: 'Work Content',  wide: false, render: (s)    => s.smv ? `${Number(s.smv).toFixed(2)} min` : '—' },
  { key: 'order_line_str',   section: 'style',    label: 'Order Line',    wide: true,  render: (s)    => s.order_name ? `${s.order_name} :: ${String(s.line_number ?? 1).padStart(2, '0')}` : '—' },
  { key: 'order_status',     section: 'style',    label: 'Status',        wide: false, render: null },
  { key: 'color_name',       section: 'style',    label: 'Color',         wide: false, render: (s)    => s.color_name      || '—' },
  { key: 'order_qty',        section: 'style',    label: 'Order Qty',     wide: false, render: (s)    => s.order_qty != null ? `${Number(s.order_qty).toLocaleString()} pcs` : '—' },
  { key: 'delivery_date',    section: 'style',    label: 'Delivery Date', wide: false, render: (s)    => formatDate(s.delivery_date) },
  { key: 'planned_qty',      section: 'plan',     label: 'Plan Qty',      wide: false, render: (s)    => s.planned_qty ? `${Number(s.planned_qty).toLocaleString()} pcs` : '—' },
  { key: 'production_start', section: 'plan',     label: 'Prod. Start',   wide: true,  render: (s)    => formatDateTime(s.planned_start) },
  { key: 'production_end',   section: 'plan',     label: 'Prod. End',     wide: true,  render: (_, x) => x.endDateTime },
  { key: 'production_hr',    section: 'plan',     label: 'Prod. Hr',      wide: false, render: (s, x) => x.workDays != null && s.working_hours > 0 ? `${(x.workDays * Number(s.working_hours)).toFixed(1)} hr` : '—' },
  { key: 'production_days',  section: 'plan',     label: 'Prod. Days',    wide: false, render: (_, x) => x.workDays != null ? `${x.workDays.toFixed(1)} days` : '—' },
  { key: 'calendar_days',    section: 'plan',     label: 'Cal. Days',     wide: false, render: (_, x) => x.calDays  != null ? `${Math.ceil(x.calDays)} days` : '—' },
  { key: 'line_name',        section: 'plan',     label: 'Line',          wide: false, render: (s)    => s.line_name       || '—' },
  { key: 'delivery_warn',    section: 'warning',  label: 'Delivery',      wide: false, render: null },
  // Legacy fields kept for saved configs
  { key: 'order_name',       section: 'style',    label: 'Order',         wide: true,  render: (s)    => s.order_name      || '—' },
  { key: 'notes',            section: 'style',    label: 'Notes',         wide: true,  render: (s)    => s.notes           || '—' },
  { key: 'period',           section: 'plan',     label: 'Period',        wide: true,  render: (_, x) => x.periodStr },
  { key: 'duration',         section: 'plan',     label: 'Duration',      wide: false, render: (_, x) => x.workDays != null ? `${x.workDays.toFixed(2)} WD` : '—',
                                                                           sub:   (_, x) => x.calDays != null ? `${x.calDays.toFixed(2)} CD` : null },
  { key: 'daily_capacity',   section: 'plan',     label: 'Daily Cap',     wide: false, render: (s)    => s.daily_capacity != null ? `${Math.round(s.daily_capacity)} pcs/day` : '—' },
  { key: 'learning_curve',   section: 'plan',     label: 'Lrn. Curve',    wide: false, render: (s)    => s.lc_name || '—' },
]

export const INFO_BAR_DEFAULT_KEYS = [
  'customer_name', 'product_name', 'smv', 'order_line_str', 'order_status',
  'order_qty', 'delivery_date', 'planned_qty', 'production_start', 'production_end',
  'delivery_warn',
]

export const INFO_BAR_LS_KEY = 'planning_infobar_fields_v2'
const COL_WIDTHS_LS_KEY      = 'planning_col_widths_v1'

export function loadInfoBarConfig() {
  try {
    const raw = localStorage.getItem(INFO_BAR_LS_KEY)
    if (raw) {
      const saved = new Set(JSON.parse(raw))
      const validKeys = new Set(INFO_FIELD_DEFS.map(f => f.key))
      const filtered = [...saved].filter(k => validKeys.has(k))
      if (filtered.length) return new Set(filtered)
    }
  } catch {}
  return new Set(INFO_BAR_DEFAULT_KEYS)
}

function loadColWidths() {
  try {
    const raw = localStorage.getItem(COL_WIDTHS_LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return {}
}

// Compact defaults: wide=120, narrow=80 (down from 150/100)
const DEFAULT_W = { wide: 120, narrow: 80 }

function ResizeHandle({ onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: 'absolute', right: -3, top: 0, bottom: 0, width: 6,
        cursor: 'col-resize', zIndex: 5,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{ width: 1, height: '40%', background: 'rgba(0,0,0,0.12)', borderRadius: 1 }} />
    </div>
  )
}

function InfoSection({ fieldKey, label, value, sub, wide, accent, colW, onResizeStart }) {
  return (
    <div style={{
      paddingLeft: 10, paddingRight: 10,
      borderRight: '1px solid rgba(0,0,0,0.07)',
      width: colW, flexShrink: 0,
      position: 'relative', overflow: 'hidden',
    }}>
      <Text style={{ fontSize: 'var(--fs-2xs)', color: 'var(--c-text-placeholder)', textTransform: 'uppercase', letterSpacing: 0.7, display: 'block', marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontSize: 'var(--fs-sm)', fontWeight: 500, color: accent ? 'var(--c-teal)' : 'var(--c-navy)', display: 'block', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</Text>
      {sub && <Text style={{ fontSize: 'var(--fs-sm)', fontWeight: 500, color: 'var(--c-navy)', display: 'block', lineHeight: 1.3 }}>{sub}</Text>}
      <ResizeHandle onMouseDown={(e) => onResizeStart(fieldKey, colW, e)} />
    </div>
  )
}

export default function HoverInfoPanel({ sched, nonWorkingSet, visibleFields, boardShiftHours, boardShiftStart }) {
  const [colWidths, setColWidths] = useState(loadColWidths)

  const startResize = useCallback((key, startW, e) => {
    e.preventDefault()
    const startX = e.clientX
    const onMove = (mv) => {
      const newW = Math.max(60, startW + mv.clientX - startX)
      setColWidths(prev => {
        const next = { ...prev, [key]: newW }
        localStorage.setItem(COL_WIDTHS_LS_KEY, JSON.stringify(next))
        return next
      })
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  const colW = (key, wide) => colWidths[key] ?? (wide ? DEFAULT_W.wide : DEFAULT_W.narrow)

  const endForDisplay = sched ? (sched.planned_end || sched._effectiveEnd || null) : null

  const workDays = useMemo(() => {
    if (!sched?.planned_start || !endForDisplay || !boardShiftHours) {
      return sched?.planned_qty > 0 && sched?.daily_capacity > 0
        ? sched.planned_qty / sched.daily_capacity : null
    }
    const sh = boardShiftHours
    const ss = boardShiftStart ?? 8
    const start = new Date(sched.planned_start)
    const end   = new Date(endForDisplay)
    if (end <= start) return sched.planned_qty > 0 && sched.daily_capacity > 0
      ? sched.planned_qty / sched.daily_capacity : 0
    const nwSet = nonWorkingSet || new Set()
    let workHours = 0
    const cur = new Date(start); cur.setHours(0, 0, 0, 0)
    while (cur < end) {
      if (!nwSet.has(toISO(cur))) {
        const dayStart = new Date(cur); dayStart.setHours(ss, 0, 0, 0)
        const dayEnd   = new Date(cur); dayEnd.setHours(ss + sh, 0, 0, 0)
        const oStart = Math.max(start.getTime(), dayStart.getTime())
        const oEnd   = Math.min(end.getTime(),   dayEnd.getTime())
        if (oEnd > oStart) workHours += (oEnd - oStart) / 3600000
      }
      cur.setDate(cur.getDate() + 1)
    }
    return workHours > 0 ? workHours / sh
      : (sched.planned_qty > 0 && sched.daily_capacity > 0 ? sched.planned_qty / sched.daily_capacity : null)
  }, [sched, endForDisplay, nonWorkingSet, boardShiftHours, boardShiftStart])

  const calDays = useMemo(() => {
    if (!sched || workDays == null || !sched.planned_start || !endForDisplay) return null
    const startMid = new Date(sched.planned_start); startMid.setHours(0, 0, 0, 0)
    const endMid   = new Date(endForDisplay);        endMid.setHours(0, 0, 0, 0)
    let nwCount = 0
    const d = new Date(startMid)
    while (d < endMid) {
      if (nonWorkingSet?.has(toISO(d))) nwCount++
      d.setDate(d.getDate() + 1)
    }
    return workDays + nwCount
  }, [sched, workDays, endForDisplay, nonWorkingSet])

  if (!sched) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
        <ScheduleOutlined style={{ color: '#c8d8e0', fontSize: 14 }} />
        <Text style={{ fontSize: 'var(--fs-xs)', color: '#c8d8e0', letterSpacing: 0.4 }}>Hover over an order strip to see details</Text>
      </div>
    )
  }

  const color = STATUS_COLOR[sched.order_status] ?? '#555'
  const fmt = dt => formatDate(dt)

  const periodStr   = sched.planned_start ? `${fmt(sched.planned_start)} → ${fmt(endForDisplay)}` : '—'
  const endDateTime = formatDateTime(endForDisplay)
  const extra = { periodStr, workDays, calDays, endDate: fmt(endForDisplay), endDateTime }

  const deliveryLate = sched.delivery_date && endForDisplay
    ? new Date(endForDisplay) > new Date(String(sched.delivery_date).slice(0, 10) + 'T23:59:59')
    : null

  return (
    <div style={{ display: 'flex', alignItems: 'center', height: '100%', padding: '0 4px', overflow: 'hidden' }}>
      {INFO_FIELD_SECTIONS.map(section => {
        const sectionFields = INFO_FIELD_DEFS.filter(f => f.section === section && visibleFields?.has(f.key))
        if (!sectionFields.length) return null
        return (
          <Fragment key={section}>
            {sectionFields.map(f => {
              const w = colW(f.key, f.wide)

              if (f.key === 'order_status') {
                return (
                  <div key={f.key} style={{ paddingLeft: 10, paddingRight: 10, borderRight: '1px solid rgba(0,0,0,0.07)', width: w, flexShrink: 0, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                    <Text style={{ fontSize: 'var(--fs-2xs)', color: 'var(--c-text-placeholder)', textTransform: 'uppercase', letterSpacing: 0.7, display: 'block', marginBottom: 3 }}>Status</Text>
                    <div style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 10, fontSize: 'var(--fs-2xs)', fontWeight: 700, background: `${color}20`, color, border: `1px solid ${color}55`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {sched.order_status || 'Unknown'}
                    </div>
                    <ResizeHandle onMouseDown={(e) => startResize(f.key, w, e)} />
                  </div>
                )
              }

              if (f.key === 'delivery_warn') {
                const warnColor = deliveryLate === null ? '#94a3b8' : deliveryLate ? '#dc2626' : '#16a34a'
                const warnLabel = deliveryLate === null ? '—' : deliveryLate ? 'LATE' : 'ON TIME'
                return (
                  <div key={f.key} style={{ paddingLeft: 10, paddingRight: 10, borderRight: '1px solid rgba(0,0,0,0.07)', width: w, flexShrink: 0, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                    <Text style={{ fontSize: 'var(--fs-2xs)', color: 'var(--c-text-placeholder)', textTransform: 'uppercase', letterSpacing: 0.7, display: 'block', marginBottom: 3 }}>Delivery</Text>
                    <div style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 10, fontSize: 'var(--fs-2xs)', fontWeight: 700, background: `${warnColor}20`, color: warnColor, border: `1px solid ${warnColor}55` }}>
                      {warnLabel}
                    </div>
                    <ResizeHandle onMouseDown={(e) => startResize(f.key, w, e)} />
                  </div>
                )
              }

              const value = f.render(sched, extra)
              const sub   = f.sub ? f.sub(sched, extra) : null
              return (
                <InfoSection
                  key={f.key}
                  fieldKey={f.key}
                  label={f.label}
                  value={value}
                  sub={sub}
                  wide={f.wide}
                  accent={f.key === 'production_start' || f.key === 'production_end'}
                  colW={w}
                  onResizeStart={startResize}
                />
              )
            })}
          </Fragment>
        )
      })}
    </div>
  )
}
