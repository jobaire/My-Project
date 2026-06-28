import { useDroppable } from '@dnd-kit/core'

const ROW_HEIGHT_DEFAULT = 50

export default function DayDropCell({ id, left, width, rowHeight = ROW_HEIGHT_DEFAULT, isNonWorking = false, isPast = false, dateNum, dayLetter, wh, mp }) {
  const { setNodeRef } = useDroppable({ id })
  let bg = 'transparent'
  if (isPast)            bg = 'rgba(220,38,38,0.07)'
  else if (isNonWorking) bg = 'rgba(0,0,0,0.09)'
  const labelStyle = { fontSize: 8, lineHeight: 1, color: 'rgba(0,0,0,0.22)', pointerEvents: 'none', userSelect: 'none' }
  return (
    <div ref={setNodeRef} style={{ position: 'absolute', left, width, height: rowHeight, background: bg, borderRight: '1px solid #dde8ed', boxSizing: 'border-box' }}>
      {dateNum != null && width >= 30 && (
        <div style={{ position: 'absolute', top: 2, left: 2, right: 2, display: 'flex', justifyContent: 'space-between', pointerEvents: 'none', userSelect: 'none', overflow: 'hidden' }}>
          <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.22)', lineHeight: 1 }}>{dateNum}</span>
          {dayLetter && <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.22)', lineHeight: 1 }}>{dayLetter}</span>}
        </div>
      )}
      {wh != null && width >= 28 && (
        <span style={{ ...labelStyle, position: 'absolute', top: 2, left: 2 }}>{wh}h</span>
      )}
      {mp != null && width >= 28 && (
        <span style={{ ...labelStyle, position: 'absolute', bottom: 2, left: 2 }}>×{mp}</span>
      )}
    </div>
  )
}
