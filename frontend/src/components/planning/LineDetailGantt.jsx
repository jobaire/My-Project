import { Typography } from 'antd'
import { blockLeft, blockWidth, toISO } from '../../utils/planningUtils'

const { Text } = Typography

const MONTHS     = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS_SHORT = ['Su','Mo','Tu','We','Th','Fr','Sa']

const ZOOM    = { colPx: 80, colsPerDay: 1 }
const ROW_H   = 48
const LEFT_W  = 140
const HEADER_H = 44

const STRIP_BG = `repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(11,158,148,0.04) 3px, rgba(11,158,148,0.04) 6px), #fff`

export default function LineDetailGantt({ line, schedules, nonWorkingDays = new Set() }) {
  const lineScheds = [...schedules]
    .filter(s => s.line_id === line.id)
    .sort((a, b) => new Date(a.planned_start) - new Date(b.planned_start))

  if (!lineScheds.length) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--c-text-secondary)', fontSize: 'var(--fs-sm)' }}>
        No strips scheduled for this line.
      </div>
    )
  }

  const firstStart = new Date(lineScheds[0].planned_start)
  const lastSched  = lineScheds[lineScheds.length - 1]
  const lastEnd    = new Date(lastSched.planned_end ?? lastSched.planned_start)

  const vs = new Date(firstStart); vs.setDate(vs.getDate() - 7); vs.setHours(0, 0, 0, 0)
  const ve = new Date(lastEnd);    ve.setDate(ve.getDate() + 7); ve.setHours(0, 0, 0, 0)

  const days = []
  const cur  = new Date(vs)
  while (cur <= ve) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }

  const totalW = days.length * ZOOM.colPx

  // Build header tick data (day zoom style: week groups on top, day ticks on bottom)
  const groups = []
  const ticks  = []
  days.forEach((d, i) => {
    const left = i * ZOOM.colPx
    if (d.getDay() === 1 || i === 0) {
      groups.push({ left, label: `${MONTHS[d.getMonth()]} ${d.getDate()}`, key: toISO(d) })
    }
    ticks.push({
      left,
      label:      `${DAYS_SHORT[d.getDay()]} ${d.getDate()}`,
      key:        toISO(d),
      nonWorking: d.getDay() === 0 || d.getDay() === 6 || nonWorkingDays.has(toISO(d)),
    })
  })

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '62vh' }}>
      <div style={{ minWidth: LEFT_W + totalW }}>

        {/* Sticky date header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', borderBottom: '1px solid #dde8ed', display: 'flex', height: HEADER_H }}>
          <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #dde8ed', display: 'flex', alignItems: 'flex-end', padding: '0 10px 6px' }}>
            <span className="micro-label">Order</span>
          </div>
          <div style={{ position: 'relative', width: totalW, flexShrink: 0 }}>
            {/* Week group labels — top half */}
            {groups.map(g => (
              <div key={g.key} style={{ position: 'absolute', left: g.left, top: 0, height: '50%', display: 'flex', alignItems: 'center', paddingLeft: 6, borderLeft: g.left === 0 ? 'none' : '1px solid #dde8ed' }}>
                <Text style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--c-primary)', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{g.label}</Text>
              </div>
            ))}
            <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: '#b8cdd8' }} />
            {/* Day ticks — bottom half */}
            {ticks.map(t => (
              <div key={t.key} style={{
                position: 'absolute', left: t.left, top: '50%',
                width: ZOOM.colPx, height: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderLeft: '1px solid #dde8ed',
                background: t.nonWorking ? 'rgba(180,210,225,0.18)' : 'transparent',
              }}>
                <Text style={{ fontSize: 9, color: t.nonWorking ? 'var(--c-text-placeholder)' : 'var(--c-text-secondary)', fontWeight: t.nonWorking ? 400 : 500 }}>
                  {t.label}
                </Text>
              </div>
            ))}
          </div>
        </div>

        {/* Strip rows */}
        {lineScheds.map((sched, idx) => {
          const left   = blockLeft(sched.planned_start, vs, ZOOM)
          const width  = sched.planned_end
            ? Math.max(blockWidth(sched.planned_start, sched.planned_end, ZOOM), 2)
            : Math.max(ZOOM.colPx, 2)
          const delivL = sched.delivery_date != null ? blockLeft(sched.delivery_date, vs, ZOOM) : null
          const rowBg  = idx % 2 === 0 ? '#fff' : '#fafcfd'

          return (
            <div key={sched.id} style={{ display: 'flex', height: ROW_H, borderBottom: '1px solid #edf2f7' }}>

              {/* Left label panel */}
              <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #dde8ed', padding: '0 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, background: rowBg, overflow: 'hidden' }}>
                <Text style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--c-navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
                  {sched.order_name}
                </Text>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--c-teal)', color: '#fff', borderRadius: 3, padding: '1px 4px', letterSpacing: 0.5, flexShrink: 0 }}>
                    L{String(sched.line_number ?? 1).padStart(2, '0')}
                  </span>
                  {sched.color_name && (
                    <Text style={{ fontSize: 9, color: 'var(--c-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {sched.color_name}
                    </Text>
                  )}
                </div>
              </div>

              {/* Timeline area */}
              <div style={{ position: 'relative', width: totalW, flexShrink: 0, background: rowBg, overflow: 'hidden' }}>
                {/* Non-working day shading */}
                {ticks.filter(t => t.nonWorking).map(t => (
                  <div key={t.key} style={{ position: 'absolute', left: t.left, top: 0, width: ZOOM.colPx, height: '100%', background: 'var(--plan-break-overlay)', pointerEvents: 'none' }} />
                ))}

                {/* Strip block */}
                <div style={{
                  position: 'absolute',
                  left,
                  top: ROW_H * 0.2,
                  width,
                  height: ROW_H * 0.6,
                  background: STRIP_BG,
                  border: '1px solid rgba(0,0,0,0.07)',
                  borderLeft: '3px solid var(--c-teal)',
                  borderRadius: 'var(--r-sm)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  padding: '0 6px',
                  display: 'flex', alignItems: 'center',
                  overflow: 'hidden', boxSizing: 'border-box',
                }}>
                  <Text style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--c-navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sched.planned_qty != null ? `${sched.planned_qty.toLocaleString()} pcs` : ''}
                  </Text>
                </div>

                {/* Delivery date marker */}
                {delivL !== null && (
                  <div style={{
                    position: 'absolute', left: delivL, top: 0,
                    height: '100%', width: 0,
                    borderLeft: '2px dashed #d97706',
                    pointerEvents: 'none', zIndex: 3,
                  }} />
                )}
              </div>

            </div>
          )
        })}

      </div>
    </div>
  )
}
