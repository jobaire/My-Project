import { Typography } from 'antd'
import { blockLeft, toISO } from '../../utils/planningUtils'

const { Text } = Typography

const MONTHS     = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS_SHORT = ['Su','Mo','Tu','We','Th','Fr','Sa']

function weekLabel(d) {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export default function ZoomTimeAxis({ days, viewStart, viewDays, zoom, today, zoomKey, currentTime, weekStart = 1, workingDays = null }) {
  const isWeekend = d => workingDays ? !workingDays.has(d.getDay()) : d.getDay() === 0 || d.getDay() === 6
  const { colPx, colsPerDay } = zoom
  const dayW = colPx * colsPerDay

  const groups = []
  const ticks  = []

  if (zoomKey === 'hour') {
    days.forEach((d, i) => {
      groups.push({ left: i * dayW, label: `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`, key: toISO(d) })
      for (let h = 0; h < colsPerDay; h++) {
        const actualH = (zoom.shiftStart ?? 0) + h
        ticks.push({ left: i * dayW + h * colPx, label: '', key: `${toISO(d)}_${actualH}`, bold: h === 0 })
      }
    })
  } else if (zoomKey === 'quarter') {
    let lastMonth = -1
    days.forEach((d, i) => {
      if (d.getMonth() !== lastMonth) {
        groups.push({ left: i * dayW, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, key: toISO(d) })
        lastMonth = d.getMonth()
      }
      if (d.getDay() === weekStart || i === 0) {
        ticks.push({ left: i * dayW, label: `${d.getDate()}`, key: toISO(d), bold: d.getDate() === 1, today: toISO(d) === toISO(today), weekend: isWeekend(d) })
      }
    })
  } else if (zoomKey === 'day') {
    days.forEach((d, i) => {
      if (d.getDay() === weekStart || i === 0) { groups.push({ left: i * dayW, label: weekLabel(d), key: toISO(d) }) }
      ticks.push({ left: i * dayW, label: `${DAYS_SHORT[d.getDay()]} ${d.getDate()}`, key: toISO(d), bold: d.getDay() === weekStart, weekend: isWeekend(d), today: toISO(d) === toISO(today), dateNum: d.getDate(), dayLetter: 'SMTWTFS'[d.getDay()] })
    })
  } else {
    days.forEach((d, i) => {
      if (d.getDay() === weekStart || i === 0) { groups.push({ left: i * dayW, label: weekLabel(d), key: toISO(d) }) }
      ticks.push({ left: i * dayW, label: `${d.getDate()}`, key: toISO(d), bold: d.getDay() === weekStart, weekend: isWeekend(d), today: toISO(d) === toISO(today), dateNum: d.getDate(), dayLetter: 'SMTWTFS'[d.getDay()] })
    })
  }

  const barDay = new Date(currentTime); barDay.setHours(0, 0, 0, 0)
  const todayLeft = blockLeft(barDay, viewStart, zoom)

  return (
    <>
      <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: '#b8cdd8', zIndex: 1, pointerEvents: 'none' }} />
      {groups.map(g => (
        <div key={g.key} style={{ position: 'absolute', left: g.left, top: 0, height: '50%', display: 'flex', alignItems: 'center', paddingLeft: 6, borderLeft: g.left === 0 ? 'none' : '1px solid #dde8ed' }}>
          <Text style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--c-primary)', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{g.label}</Text>
        </div>
      ))}
      {ticks.map(t => (
        <div key={t.key} style={{
          position: 'absolute', left: t.left, width: zoomKey === 'quarter' ? dayW * 7 : colPx, top: '50%', height: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
          paddingLeft: 4, paddingRight: 1,
          borderLeft: '1px solid #dde8ed',
          background: t.today ? 'rgba(220,38,38,0.07)' : t.weekend ? 'rgba(0,0,0,0.025)' : 'transparent',
          boxSizing: 'border-box', overflow: 'hidden',
        }}>
          {t.dayLetter && colPx >= 30 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, lineHeight: 1, color: t.today ? 'rgba(220,38,38,0.75)' : t.weekend ? '#bbb' : '#8a9aaa' }}>
                {t.dayLetter}
              </span>
              <span style={{ fontSize: 11, fontWeight: t.bold || t.today ? 700 : 400, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums', color: t.today ? 'rgba(220,38,38,0.85)' : t.weekend ? '#b0b8c4' : '#334155' }}>
                {t.dateNum}
              </span>
            </div>
          ) : (
            <Text style={{ fontSize: t.label.length > 2 ? 9 : 10, color: t.today ? 'rgba(220,38,38,0.85)' : t.weekend ? '#aaa' : '#666', fontWeight: t.bold || t.today ? 700 : 400, whiteSpace: 'nowrap' }}>{t.label}</Text>
          )}
        </div>
      ))}
      {(() => {
        if (todayLeft < 0 || todayLeft > viewDays * dayW) return null
        const sh = zoom.shiftStart
        const wh = zoom.colsPerDay
        const workingHour = sh !== undefined
          ? Math.max(0, Math.min(wh, currentTime.getHours() + currentTime.getMinutes() / 60 - sh))
          : Math.min(wh, (currentTime.getHours() + currentTime.getMinutes() / 60) / 24 * wh)
        const nowLeft = todayLeft + workingHour * zoom.colPx
        if (nowLeft < 0 || nowLeft > viewDays * dayW) return null
        return <div style={{ position: 'absolute', left: nowLeft, top: 0, bottom: 0, width: 2, background: 'var(--plan-today-bar)', zIndex: 2, pointerEvents: 'none' }} />
      })()}
    </>
  )
}
