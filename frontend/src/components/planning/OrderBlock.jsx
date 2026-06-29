import {
  DeleteOutlined,
  FileTextOutlined,
  PushpinFilled,
  PushpinOutlined,
  ScissorOutlined,
  TagOutlined,
} from '@ant-design/icons'
import { Dropdown, Typography } from 'antd'
import { useRef } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { blockLeft, blockWidth } from '../../utils/planningUtils'

const { Text } = Typography

const STRIP_SHADOW = '0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05)'

const ROW_HEIGHT_DEFAULT = 50

export default function OrderBlock({
  sched, viewStart, zoom, onRemove, onHover, onOpenPanel, onManpower,
  onAssignLC, onOverrideLineWH, onSplit, onSplitModal, onToggleKeepSeparate,
  hasSiblings, overlayWidth, rowHeight = ROW_HEIGHT_DEFAULT, isOverlay = false,
  laneTop, laneHeight, displayWidth, displayLeft, onPin, pinnedSchedId,
  isSelected = false, selectionRank = 0, onCtrlClick, hideDuringDrag = false,
}) {
  const left  = isOverlay ? 0 : (displayLeft !== undefined ? displayLeft : blockLeft(sched.planned_start, viewStart, zoom))
  const naturalW = sched.planned_end
    ? Math.max(blockWidth(sched.planned_start, sched.planned_end, zoom), 2)
    : Math.max((sched.daily_capacity > 0 ? sched.planned_qty / sched.daily_capacity : 1) * zoom.colsPerDay * zoom.colPx, 2)
  const width = isOverlay ? (overlayWidth ?? naturalW) : (displayWidth !== undefined ? Math.max(displayWidth, zoom.colPx) : naturalW)
  const stripH = isOverlay ? Math.round(rowHeight * 0.5) : (laneHeight ?? Math.round(rowHeight * 0.5))

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `sched_${sched.id}`,
    data: { type: 'scheduled', sched, displayLeft: isOverlay ? undefined : left },
    disabled: isOverlay,
  })
  const splitFractionRef = useRef(0.5)

  const contextItems = [
    { key: 'style', label: 'Style', icon: <TagOutlined />, onClick: () => onOpenPanel?.('style', sched) },
    { key: 'order', label: 'Order', icon: <FileTextOutlined />, onClick: () => onOpenPanel?.('order', sched) },
    { type: 'divider' },
    { key: 'manpower', label: `Manpower${sched.manpower ? `: ${sched.manpower}` : ' (line default)'}`, onClick: () => onManpower?.(sched) },
    { key: 'lc', label: sched.learning_curve_id ? 'Change Learning Curve' : 'Assign Learning Curve', onClick: () => onAssignLC?.(sched) },
    { key: 'wh', label: 'Override Line Hours', onClick: () => onOverrideLineWH?.(sched) },
    { type: 'divider' },
    { key: 'split_here', label: 'Split here', icon: <ScissorOutlined />, disabled: sched.planned_qty < 2, onClick: () => onSplit?.(sched, splitFractionRef.current) },
    { key: 'split_qty', label: 'Split by qty…', icon: <ScissorOutlined />, disabled: sched.planned_qty < 2, onClick: () => onSplitModal?.(sched, splitFractionRef.current) },
    ...(hasSiblings ? [{ key: 'keep_sep', label: sched.keep_separate ? '✓ Keep Separate' : 'Keep Separate', onClick: () => onToggleKeepSeparate?.(sched) }] : []),
    { type: 'divider' },
    { key: 'pin', label: pinnedSchedId === sched.id ? 'Unpin' : 'Pin', icon: <PushpinOutlined />, onClick: () => onPin?.(pinnedSchedId === sched.id ? null : sched) },
    { type: 'divider' },
    { key: 'unload', label: 'Unload', danger: true, icon: <DeleteOutlined />, onClick: () => onRemove(sched.id) },
  ]

  const progress = sched.order_qty > 0 ? Math.min(1, sched.planned_qty / sched.order_qty) : null

  const isLate = !!sched.delivery_date && !!(sched._effectiveEnd || sched.planned_end) &&
    new Date(sched._effectiveEnd || sched.planned_end) > new Date(sched.delivery_date)
  const isTnA  = !!sched.has_tna_issue
  const hasLC  = !!sched.learning_curve_id

  let stripBg    = '#fff'
  let borderLeft = '3px solid var(--c-teal)'
  let borderEdge = 'rgba(11,158,148,0.35)'
  let labelColor = 'var(--c-navy)'

  if (isLate && isTnA) {
    stripBg    = 'repeating-linear-gradient(135deg, #f87171, #f87171 8px, #fcd34d 8px, #fcd34d 16px)'
    borderLeft = '3px solid transparent'
    borderEdge = 'rgba(220,38,38,0.5)'
    labelColor = '#7f1d1d'
  } else if (isLate) {
    stripBg    = '#f87171'
    borderLeft = '3px solid #dc2626'
    borderEdge = 'rgba(220,38,38,0.6)'
    labelColor = '#7f1d1d'
  } else if (isTnA) {
    stripBg    = '#fcd34d'
    borderLeft = '3px solid #d97706'
    borderEdge = 'rgba(217,119,6,0.6)'
    labelColor = '#78350f'
  }

  const hoverRing = isLate ? 'rgba(220,38,38,0.45)' : isTnA ? 'rgba(217,119,6,0.45)' : 'rgba(11,158,148,0.45)'

  const block = (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      data-sched-id={sched.id}
      onClick={(e) => { if (e.ctrlKey || e.metaKey) { e.stopPropagation(); onCtrlClick?.(sched.id) } else { e.stopPropagation() } }}
      onMouseEnter={(e) => {
        if (!isDragging && onHover) onHover(sched)
        if (!isDragging) {
          e.currentTarget.style.transform = 'translateY(-1px)'
          e.currentTarget.style.boxShadow = `0 4px 12px rgba(0,0,0,0.12), 0 0 0 2px ${hoverRing}`
        }
      }}
      onMouseLeave={(e) => {
        if (onHover) onHover(null)
        e.currentTarget.style.transform = ''
        e.currentTarget.style.boxShadow = STRIP_SHADOW
      }}
      onContextMenu={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        splitFractionRef.current = Math.max(0.01, Math.min(0.99, (e.clientX - rect.left) / rect.width))
      }}
      style={{
        position: isOverlay ? 'relative' : 'absolute',
        left,
        top: isOverlay ? undefined : (laneTop ?? Math.round(rowHeight * 0.25)),
        width,
        height: stripH,
        background: stripBg,
        border: `1px solid ${borderEdge}`,
        borderLeft,
        borderRadius: 'var(--r-sm)',
        padding: '0 5px 0 6px',
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging || hideDuringDrag ? 0 : 1,
        userSelect: 'none',
        boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start',
        minWidth: 0, zIndex: 2, overflow: 'hidden',
        boxShadow: STRIP_SHADOW,
        transition: 'transform 0.12s, box-shadow 0.12s',
        outline: isSelected ? '2px solid var(--c-teal)' : 'none',
        outlineOffset: isSelected ? 1 : 0,
      }}
    >
      {isLate && isTnA && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'repeating-linear-gradient(180deg, #dc2626 0px, #dc2626 4px, #d97706 4px, #d97706 8px)', borderRadius: 'var(--r-sm) 0 0 var(--r-sm)', pointerEvents: 'none' }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0, gap: 3 }}>
        {hasLC && (
          <svg width="11" height="13" viewBox="0 0 11 13" style={{ flexShrink: 0, marginRight: 2, display: 'block' }}>
            <polygon points="11,0 11,13 0,13" fill="none" stroke="#9333ea" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        )}
        <Text style={{ fontSize: 12, fontWeight: 600, color: labelColor, lineHeight: 1.2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>
          {sched.order_name} :: {String(sched.line_number ?? 1).padStart(2, '0')}
        </Text>
        {pinnedSchedId === sched.id && (
          <PushpinFilled style={{ fontSize: 9, color: 'var(--c-teal)', flexShrink: 0 }} />
        )}
      </div>
      {progress !== null && stripH >= 20 && (
        <div style={{ position: 'absolute', bottom: 0, left: 3, right: 0, height: 2, background: 'rgba(0,0,0,0.05)' }}>
          <div style={{ height: '100%', width: `${progress * 100}%`, background: 'var(--c-teal)', opacity: 0.55 }} />
        </div>
      )}
      {isSelected && selectionRank > 0 && (
        <div style={{
          position: 'absolute', top: 2, right: 3,
          width: 14, height: 14, borderRadius: '50%',
          background: 'var(--c-teal)', color: '#fff',
          fontSize: 9, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1, zIndex: 3, pointerEvents: 'none',
        }}>{selectionRank}</div>
      )}
    </div>
  )

  if (isOverlay) return block

  return (
    <Dropdown menu={{ items: contextItems }} trigger={['contextMenu']}>
      {block}
    </Dropdown>
  )
}
