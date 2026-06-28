import {
  CalendarOutlined,
  CheckOutlined,
  DownOutlined,
  OrderedListOutlined,
  RedoOutlined,
  ReloadOutlined,
  SaveOutlined,
  SettingOutlined,
  UndoOutlined,
  UpOutlined,
} from '@ant-design/icons'
import {
  Badge,
  Button,
  DatePicker,
  InputNumber,
  Modal,
  Popover,
  Select,
  Typography,
  App,
} from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  addDays,
  apiFetch,
  blockLeft,
  blockWidth,
  calcEndTime,
  calcEndTimeLC,
  pixelToDate,
  toISO,
  toLocalDT,
  totalWidth,
} from '../../../utils/planningUtils'
import OrderBlock          from '../../../components/planning/OrderBlock'
import PendingOrdersModal  from '../../../components/planning/PendingOrdersModal'
import PlanQtyPanel        from '../../../components/planning/PlanQtyPanel'
import DayDropCell         from '../../../components/planning/DayDropCell'
import ZoomTimeAxis        from '../../../components/planning/ZoomTimeAxis'
import DetailModal         from '../../../components/planning/DetailModal'
import PlanningSetupModal  from '../../../components/planning/setup/PlanningSetupModal'
import HoverInfoPanel, {
  INFO_FIELD_SECTIONS,
  INFO_FIELD_DEFS,
  INFO_SECTION_LABEL,
  INFO_BAR_LS_KEY,
  loadInfoBarConfig,
} from '../../../components/planning/HoverInfoPanel'

const { Text } = Typography

const STATUS_COLOR = {
  Confirmed:          '#16a34a',
  Forecast:           '#2563eb',
  Projection:         '#0891b2',
  'Under Projection': '#d97706',
}

const ROW_HEIGHT_DEFAULT = 50
const HEADER_H           = 50
const LINE_PANEL_W = 150

const ZOOM_CONFIG = {
  quarter: { label: 'Quarter', colPx: 16,  colsPerDay: 1,  viewDays: 182, step: 30 },
  week:    { label: 'Week',    colPx: 36,  colsPerDay: 1,  viewDays: 42,  step: 7  },
  day:     { label: 'Day',     colPx: 80,  colsPerDay: 1,  viewDays: 14,  step: 1  },
  hour:    { label: 'Hour',    colPx: 44,  colsPerDay: 24, viewDays: 4,   step: 1  },
}
const ZOOM_ORDER = ['quarter', 'week', 'day', 'hour']

export default function PlanningBoardApp({ session }) {
  const { message } = App.useApp()
  const token = session.access_token

  const today    = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [])
  const [zoomKey,   setZoomKey]   = useState('week')
  const [lines,       setLines]       = useState([])

  const boardShiftHours = useMemo(() => {
    const lc = lines.find(l => l.calendar_id)
    return lc ? Math.max(1, Math.round(Number(lc.working_hours))) : null
  }, [lines])

  const boardShiftStart = useMemo(() => {
    const lc = lines.find(l => l.calendar_id && l.calendar_start_time)
    if (!lc) return null
    return parseInt((lc.calendar_start_time || '00:00').split(':')[0])
  }, [lines])

  const boardBreaks = useMemo(() => {
    const lc = lines.find(l => l.calendar_id && l.calendar_breaks?.length)
    if (!lc) return []
    return (lc.calendar_breaks || []).map(b => ({
      id:        b.id,
      startHour: parseInt((b.break_start || '00:00').split(':')[0]),
      duration:  Number(b.break_duration) || 1,
    }))
  }, [lines])

  const lineWHOverrides = useMemo(() => {
    const map = {}
    lines.forEach(l => { map[l.id] = l.wh_overrides || [] })
    return map
  }, [lines])

  const zoom = useMemo(() => {
    const base = ZOOM_CONFIG[zoomKey]
    if (zoomKey !== 'hour' || boardShiftHours === null) {
      return boardShiftStart != null && boardShiftHours != null
        ? { ...base, boardShiftStart, boardShiftHours }
        : base
    }
    const totalBreakHours = boardBreaks.reduce((s, b) => s + b.duration, 0)
    return {
      ...base,
      colsPerDay: boardShiftHours + totalBreakHours,  // total columns including break
      workHours:  boardShiftHours,                     // working hours only for duration calc
      shiftStart: boardShiftStart ?? 0,
    }
  }, [zoomKey, boardShiftHours, boardShiftStart, boardBreaks])

  const [viewStart, setViewStart] = useState(() => { const d = new Date(today); d.setDate(d.getDate() - 3); return d })
  const viewDays = zoom.viewDays
  const [schedules,   setSchedules]   = useState([])
  const [unscheduled, setUnscheduled] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [setupOpen,     setSetupOpen]     = useState(false)
  const [pendingOpen,         setPendingOpen]         = useState(false)
  const [draggingFromPending, setDraggingFromPending] = useState(false)
  const [activeItem,    setActiveItem]    = useState(null)
  const [hoveredSched,  setHoveredSched]  = useState(null)
  const [detailPanel,   setDetailPanel]   = useState(null)   // { type, sched }
  const [infoPanelOpen, setInfoPanelOpen] = useState(true)
  const [infoBarVisible, setInfoBarVisible] = useState(() => loadInfoBarConfig())
  const toggleInfoField = useCallback(key => {
    setInfoBarVisible(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      localStorage.setItem(INFO_BAR_LS_KEY, JSON.stringify([...next]))
      return next
    })
  }, [])
  const [qtyPanelOpen,  setQtyPanelOpen]  = useState(true)
  const [hoveredDate,   setHoveredDate]   = useState(null)   // ISO date string for hour-view column
  const hoveredDayRef = useRef(null)
  const [dragOverLineId,  setDragOverLineId]  = useState(null)
  const [rowHeight,       setRowHeight]       = useState(ROW_HEIGHT_DEFAULT)
  const [nonWorkingDays,  setNonWorkingDays]  = useState({})
  const [currentTime,     setCurrentTime]     = useState(() => new Date())
  const [boardSettings,   setBoardSettings]   = useState({ week_start: 1 })
  const [learningCurves,  setLearningCurves]  = useState([])
  const [planUnits,       setPlanUnits]       = useState([])
  const [savedScheds,     setSavedScheds]     = useState([])
  const [schedHistory,    setSchedHistory]    = useState([])
  const [schedFuture,     setSchedFuture]     = useState([])
  const [pinnedSched,     setPinnedSched]     = useState(null)
  const [saving,          setSaving]          = useState(false)
  const [mpModal,         setMpModal]         = useState(null)  // { sched } | null
  const [lcModal,         setLcModal]         = useState(null)  // { sched } | null
  const [whModal,         setWhModal]         = useState(null)  // { sched } | null
  const [splitModal,      setSplitModal]      = useState(null)  // { sched, qty } | null
  const [mpValue,         setMpValue]         = useState(null)
  const [lcValue,         setLcValue]         = useState(null)
  const [whRange,         setWhRange]         = useState(null)
  const [whOffset,        setWhOffset]        = useState(0)
  const schedulesRef = useRef([])
  useEffect(() => { schedulesRef.current = schedules }, [schedules])
  const draggingFromPendingRef = useRef(false)

  // Keep current-time bar in sync — update every minute
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  // Load common planning settings
  useEffect(() => {
    apiFetch('/planning/settings', token).then(setBoardSettings).catch(() => {})
  }, [token])

  const weekStart = boardSettings.week_start ?? 1

  // Resizable left panel
  const [linePanelW, setLinePanelW] = useState(LINE_PANEL_W)
  const isResizingRef  = useRef(false)
  const startXRef      = useRef(0)
  const startWRef      = useRef(LINE_PANEL_W)
  const livePointerX     = useRef(0)
  const dragIndicatorRef = useRef(null)
  const dragLabelRef        = useRef(null)
  const dragEndIndicatorRef = useRef(null)
  const dragEndLabelRef     = useRef(null)
  const dragGrabOffsetX  = useRef(0)
  const ganttScrollRef   = useRef(null)
  const dragDayRef       = useRef(null)  // last emitted day index (throttle)
  const [dragLiveStart,  setDragLiveStart]  = useState(null)  // ISO datetime, updated as user drags

  const onResizeMouseDown = useCallback((e) => {
    isResizingRef.current = true
    startXRef.current     = e.clientX
    startWRef.current     = linePanelW
    e.preventDefault()
  }, [linePanelW])

  useEffect(() => {
    const onMove = (e) => {
      if (!isResizingRef.current) return
      const newW = Math.max(120, Math.min(400, startWRef.current + (e.clientX - startXRef.current)))
      setLinePanelW(newW)
    }
    const onUp = () => { isResizingRef.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const loadNonWorking = useCallback(async (vs, vd) => {
    const start = toISO(vs)
    const end   = toISO(addDays(vs, vd))
    try {
      const result = await apiFetch(`/planning/non-working?start=${start}&end=${end}`, token)
      const sets = {}
      Object.entries(result).forEach(([lineId, dates]) => {
        sets[parseInt(lineId)] = new Set(dates)
      })
      setNonWorkingDays(sets)
    } catch { /* non-critical — board still works without shading */ }
  }, [token])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [l, s, u, pu] = await Promise.all([
        apiFetch('/planning/lines', token),
        apiFetch('/planning/schedule', token),
        apiFetch('/planning/unscheduled', token),
        apiFetch('/planning/plan-units', token),
      ])
      setLines(l.filter(x => x.is_active))
      setSchedules(s)
      setSavedScheds(s)
      setSchedHistory([])
      setSchedFuture([])
      setUnscheduled(u)
      setPlanUnits(pu)
      return s
    } catch { message.error('Failed to load planning data') }
    finally { setLoading(false) }
    apiFetch('/planning/learning-curves', token).then(setLearningCurves).catch(() => {})
  }, [token])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadNonWorking(viewStart, viewDays) }, [loadNonWorking, viewStart, viewDays])

  const days = useMemo(() => Array.from({ length: viewDays }, (_, i) => addDays(viewStart, i)), [viewStart, viewDays])

  const currentUserEmail = useMemo(() => {
    try { return JSON.parse(atob(token.split('.')[1])).email || null } catch { return null }
  }, [token])

  const unitByLineId = useMemo(() => {
    const unitMap = Object.fromEntries(planUnits.map(u => [u.id, u]))
    const m = {}
    lines.forEach(l => { if (l.plan_unit_id) m[l.id] = unitMap[l.plan_unit_id] })
    return m
  }, [planUnits, lines])

  const canEditLine = useCallback((lineId) => {
    const unit = unitByLineId[lineId]
    if (!unit) return true
    if (!unit.editors || unit.editors.length === 0) return true
    return unit.editors.includes(currentUserEmail)
  }, [unitByLineId, currentUserEmail])

  const groupedLines = useMemo(() => {
    const regularLines  = lines.filter(l => !l.is_subtotal)
    const subtotalLines = lines.filter(l => l.is_subtotal)
    // Primary order: planUnits sorted by display_order (already ordered by API)
    const knownIds  = planUnits.map(u => u.id)
    const extraIds  = [...new Set(regularLines.map(l => l.plan_unit_id).filter(id => !knownIds.includes(id)))]
    const unitOrder = [...knownIds, ...extraIds]
    const result = []
    unitOrder.forEach(uid => {
      const linesInUnit = regularLines.filter(l => l.plan_unit_id === uid)
      if (linesInUnit.length === 0 && !subtotalLines.some(l => l.plan_unit_id === uid)) return
      const unit = planUnits.find(u => u.id === uid)
      if (unit) result.push({ type: 'unit-header', unit, unitId: uid })
      linesInUnit.forEach(l => result.push({ type: 'line', line: l }))
      if (subtotalLines.some(l => l.plan_unit_id === uid)) result.push({ type: 'subtotal', unitId: uid })
    })
    return result
  }, [lines, planUnits])

  // Virtual row rendering — only mount lines visible in the scroll viewport
  const renderableLines = useMemo(
    () => [...groupedLines.filter(item => item.type !== 'unit-header'), { type: 'grandtotal' }],
    [groupedLines]
  )
  const [ganttScrollTop, setGanttScrollTop] = useState(0)
  useEffect(() => {
    const el = ganttScrollRef.current
    if (!el) return
    let ticking = false
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => { setGanttScrollTop(el.scrollTop); ticking = false })
        ticking = true
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const VIRT_BUFFER = 4
  const visibleLineRange = useMemo(() => {
    const containerH = ganttScrollRef.current?.clientHeight ?? 700
    const contentTop = Math.max(0, ganttScrollTop - HEADER_H)
    const first = Math.max(0, Math.floor(contentTop / rowHeight) - VIRT_BUFFER)
    const last  = Math.min(renderableLines.length - 1, Math.ceil((contentTop + containerH) / rowHeight) + VIRT_BUFFER)
    return { first, last }
  }, [ganttScrollTop, rowHeight, renderableLines.length])

  // During drag, show dragged strip's data — period/duration update live as position changes
  const displaySched = useMemo(() => {
    if (activeItem?.type === 'scheduled' && activeItem.sched) {
      const s      = activeItem.sched
      const start  = dragLiveStart || s.planned_start
      const lineId = dragOverLineId || s.line_id
      const line   = lines.find(l => l.id === lineId)
      // Use schedule's own manpower override if set, otherwise line default
      const mp = (s.manpower != null) ? s.manpower : (line?.machines_count ?? 1)

      // Recompute daily_capacity for the target line (matches backend formula)
      let dailyCap = s.daily_capacity
      if (line && s.smv) {
        const smv = parseFloat(s.smv)
        if (smv > 0) dailyCap = (mp * parseFloat(line.working_hours) * 60 * (parseFloat(line.efficiency_pct) / 100)) / smv
      }

      // Walk working days forward — mirrors _calc_planned_end_variable so hover matches drop
      let effectiveEnd = null
      if (start && dailyCap > 0 && s.planned_qty) {
        const fracDays = s.planned_qty / dailyCap
        const shiftH   = line ? parseFloat(line.working_hours) : (boardShiftHours ?? 8)
        const startH   = new Date(start).getHours()
        const lineNW   = nonWorkingDays[lineId] || new Set()
        const endD = new Date(start); endD.setHours(0, 0, 0, 0)
        let rem = fracDays
        for (let guard = 0; guard < 365 * 3; guard++) {
          if (!lineNW.has(toISO(endD))) {
            if (rem <= 1) break   // last (possibly partial) working day reached
            rem -= 1
          }
          endD.setDate(endD.getDate() + 1)
        }
        const frac = Math.min(1, rem)
        endD.setHours(startH, 0, 0, 0)
        endD.setTime(endD.getTime() + frac * shiftH * 3600000)
        effectiveEnd = `${toISO(endD)}T${String(endD.getHours()).padStart(2,'0')}:${String(endD.getMinutes()).padStart(2,'0')}:00`
      }

      return {
        ...s,
        planned_start:  start,
        planned_end:    null,
        _effectiveEnd:  effectiveEnd,
        line_id:        lineId,
        line_name:      line?.name || s.line_name,
        daily_capacity: dailyCap,
      }
    }
    // Hover (non-drag): pin locks the panel; hover overrides only when nothing is pinned.
    const source = pinnedSched ?? hoveredSched
    if (source) {
      const line = lines.find(l => l.id === source.line_id)
      if (line && source.smv) {
        const smv = parseFloat(source.smv)
        if (smv > 0) {
          const mp = (source.manpower != null) ? source.manpower : (line.machines_count ?? 1)
          const dailyCap = (mp * parseFloat(line.working_hours) * 60 * (parseFloat(line.efficiency_pct) / 100)) / smv
          return { ...source, daily_capacity: dailyCap }
        }
      }
    }
    return source
  }, [activeItem, hoveredSched, pinnedSched, dragLiveStart, dragOverLineId, lines, boardShiftHours, nonWorkingDays])

  const schedByLine = useMemo(() => {
    const m = {}
    schedules.forEach(s => { if (!m[s.line_id]) m[s.line_id] = []; m[s.line_id].push(s) })
    Object.values(m).forEach(arr => arr.sort((a, b) => new Date(a.planned_start) - new Date(b.planned_start)))
    return m
  }, [schedules])

  const viewEnd = useMemo(() => addDays(viewStart, viewDays), [viewStart, viewDays])


  const pushHistory = (newSchedules) => {
    setSchedHistory(h => [...h, schedulesRef.current])
    setSchedFuture([])
    setSchedules(newSchedules)
  }

  const undo = () => {
    setSchedHistory(h => {
      if (!h.length) return h
      const prev = h[h.length - 1]
      setSchedFuture(f => [schedulesRef.current, ...f])
      setSchedules(prev)
      return h.slice(0, -1)
    })
  }

  const redo = () => {
    setSchedFuture(f => {
      if (!f.length) return f
      setSchedHistory(h => [...h, schedulesRef.current])
      setSchedules(f[0])
      return f.slice(1)
    })
  }

  useEffect(() => {
    const onKey = (e) => {
      if (!e.ctrlKey && !e.metaKey) return
      if (e.key === 'z' || e.key === 'Z') {
        if (e.shiftKey) { e.preventDefault(); redo() }
        else            { e.preventDefault(); undo() }
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault(); redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const handleManpowerSave = async () => {
    if (!mpModal) return
    try {
      await apiFetch(`/planning/schedule/${mpModal.sched.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ manpower: mpValue || null }),
      })
      await load()
      setMpModal(null)
    } catch (e) { message.error(e.message) }
  }

  const handleLCSave = async () => {
    if (!lcModal) return
    try {
      await apiFetch(`/planning/schedule/${lcModal.sched.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ learning_curve_id: lcValue || null }),
      })
      await load()
      setLcModal(null)
    } catch (e) { message.error(e.message) }
  }

  const handleWHOverrideSave = async () => {
    if (!whModal || !whRange) return
    try {
      await apiFetch(`/planning/lines/${whModal.sched.line_id}/wh-overrides`, token, {
        method: 'POST',
        body: JSON.stringify({
          start_date: whRange[0].format('YYYY-MM-DD'),
          end_date:   whRange[1].format('YYYY-MM-DD'),
          wh_offset:  whOffset,
        }),
      })
      await load()
      setWhModal(null)
      setWhRange(null)
      setWhOffset(0)
    } catch (e) { message.error(e.message) }
  }

  const saveChanges = async () => {
    setSaving(true)
    try {
      const savedIds   = new Set(savedScheds.map(s => s.id))
      const currentIds = new Set(schedules.map(s => s.id))
      const deletes = savedScheds.filter(s => !currentIds.has(s.id)).map(s => s.id)
      const creates = schedules
        .filter(s => typeof s.id === 'string' && s.id.startsWith('tmp_'))
        .map(s => ({
          tmp_id:            s.id,
          order_id:          s.order_id,
          order_line_id:     s.order_line_id ?? null,
          line_id:           s.line_id,
          planned_start:     s.planned_start,
          planned_end:       s.planned_end ?? null,
          planned_qty:       s.planned_qty,
          smv:               s.smv,
          manpower:          s.manpower ?? null,
          learning_curve_id: s.learning_curve_id ?? null,
          keep_separate:     s.keep_separate ?? false,
        }))
      const updates = schedules.filter(s => {
        if (!savedIds.has(s.id)) return false
        const orig = savedScheds.find(o => o.id === s.id)
        return orig && (
          orig.line_id       !== s.line_id       ||
          orig.planned_start !== s.planned_start ||
          orig.planned_qty   !== s.planned_qty   ||
          Boolean(orig.keep_separate) !== Boolean(s.keep_separate)
        )
      }).map(s => ({
        id:            s.id,
        line_id:       s.line_id,
        planned_start: s.planned_start,
        planned_end:   s.planned_end ?? null,
        planned_qty:   s.planned_qty,
        keep_separate: s.keep_separate ?? false,
      }))

      if (!deletes.length && !creates.length && !updates.length) return

      const result = await apiFetch('/planning/schedule/bulk', token, {
        method: 'PATCH',
        body: JSON.stringify({ updates, creates, deletes }),
      })

      // Reconcile tmp_ IDs with real IDs returned from backend
      if (result?.created?.length) {
        const idMap = {}
        result.created.forEach(({ tmp_id, schedule }) => { idMap[tmp_id] = schedule.id })
        setSchedules(prev => prev.map(s => idMap[s.id] ? { ...s, id: idMap[s.id] } : s))
      }

      const freshScheds = await load()
      setHoveredSched(null)
      if (pinnedSched && freshScheds) {
        const fresh = freshScheds.find(s => s.id === pinnedSched.id)
        setPinnedSched(fresh ? { ...fresh, _effectiveEnd: fresh.planned_end || pinnedSched._effectiveEnd } : null)
      }
      message.success('Schedule saved')
    } catch (e) { message.error(e.message) }
    finally { setSaving(false) }
  }

  const hasUnsaved = useMemo(() => {
    if (schedules.length !== savedScheds.length) return true
    const savedMap = new Map(savedScheds.map(s => [s.id, s]))
    return schedules.some(s => {
      const orig = savedMap.get(s.id)
      return !orig || orig.line_id !== s.line_id || orig.planned_start !== s.planned_start || orig.planned_qty !== s.planned_qty || Boolean(orig.keep_separate) !== Boolean(s.keep_separate)
    })
  }, [schedules, savedScheds])

  const handleDragStart = ({ active, activatorEvent }) => {
    const pointerX = activatorEvent?.clientX ?? 0
    livePointerX.current = pointerX
    let grabOffset = 0
    const data = active.data.current
    if (data?.displayLeft != null && ganttScrollRef.current) {
      const scrollEl  = ganttScrollRef.current
      const stripClientX = scrollEl.getBoundingClientRect().left + linePanelW + 5 + data.displayLeft - scrollEl.scrollLeft
      grabOffset = pointerX - stripClientX
    }
    dragGrabOffsetX.current = grabOffset
    if (dragIndicatorRef.current && ganttScrollRef.current) {
      const gr = ganttScrollRef.current.getBoundingClientRect()
      dragIndicatorRef.current.style.top    = `${gr.top}px`
      dragIndicatorRef.current.style.height = `${gr.height}px`
      dragIndicatorRef.current.style.left   = `${pointerX - grabOffset}px`
      dragIndicatorRef.current.style.display = 'block'
    }
    if (dragLabelRef.current && ganttScrollRef.current) {
      const gr = ganttScrollRef.current.getBoundingClientRect()
      dragLabelRef.current.style.top     = `${gr.top + 4}px`
      dragLabelRef.current.style.display = 'block'
    }
    if (dragEndIndicatorRef.current && ganttScrollRef.current) {
      const gr = ganttScrollRef.current.getBoundingClientRect()
      dragEndIndicatorRef.current.style.top    = `${gr.top}px`
      dragEndIndicatorRef.current.style.height = `${gr.height}px`
      dragEndIndicatorRef.current.style.display = 'block'
    }
    if (dragEndLabelRef.current && ganttScrollRef.current) {
      const gr = ganttScrollRef.current.getBoundingClientRect()
      dragEndLabelRef.current.style.top     = `${gr.bottom - 22}px`
      dragEndLabelRef.current.style.display = 'block'
    }
    dragDayRef.current = null
    setDragLiveStart(null)
    setActiveItem(active.data.current)
    setHoveredSched(null)
    if (active.data.current?.type === 'pending_line') {
      draggingFromPendingRef.current = true
      setDraggingFromPending(true)
    }
  }

  const handleDragOver = useCallback(({ over }) => {
    if (!over) { setDragOverLineId(null); return }
    const m = String(over.id).match(/^line_(\d+)_dt_(.+)$/)
    if (m) {
      setDragOverLineId(parseInt(m[1]))
      // Hour view: cell id already encodes exact datetime — use it as live start
      if (zoom.shiftStart !== undefined) setDragLiveStart(m[2])
    } else {
      setDragOverLineId(null)
    }
  }, [zoom])

  // Constrain DragOverlay to the planning grid — no ghost outside the gantt area
  const ganttDragModifier = useCallback(({ transform, draggingNodeRect }) => {
    if (draggingFromPendingRef.current) return transform
    if (!ganttScrollRef.current || !draggingNodeRect) return transform
    const el = ganttScrollRef.current
    const gr = el.getBoundingClientRect()
    const gridLeft  = gr.left + linePanelW + 5
    const gridRight = gr.right
    const gridTop   = gr.top
    const gridBot   = gr.bottom
    let { x, y } = transform
    const newLeft  = draggingNodeRect.left  + x
    const newRight = draggingNodeRect.right + x
    if (newLeft  < gridLeft)  x += gridLeft  - newLeft
    if (newRight > gridRight) x -= newRight  - gridRight
    const newTop = draggingNodeRect.top    + y
    const newBot = draggingNodeRect.bottom + y
    if (newTop < gridTop) y += gridTop - newTop
    if (newBot > gridBot) y -= newBot  - gridBot
    return { ...transform, x, y }
  }, [linePanelW])

  const handleDragEnd = ({ active, over }) => {
    setActiveItem(null)
    setDragLiveStart(null)
    dragDayRef.current = null
    draggingFromPendingRef.current = false
    setDraggingFromPending(false)
    if (dragIndicatorRef.current)    dragIndicatorRef.current.style.display    = 'none'
    if (dragLabelRef.current)        dragLabelRef.current.style.display        = 'none'
    if (dragEndIndicatorRef.current) dragEndIndicatorRef.current.style.display = 'none'
    if (dragEndLabelRef.current)     dragEndLabelRef.current.style.display     = 'none'
    setDragOverLineId(null)
    if (!over) return
    const match = String(over.id).match(/^line_(\d+)_dt_(.+)$/)
    if (!match) return
    const lineId = parseInt(match[1]), dateStr = match[2]
    if (!canEditLine(lineId)) {
      message.warning('You are not assigned to this segment')
      return
    }
    const data = active.data.current

    // Compute drop date from indicator position using grid geometry (not over.rect or drop cell).
    // Works for all zoom levels — indicator always shows the strip start, not the cursor.
    const preciseStart = (baseDateStr) => {
      if (!ganttScrollRef.current) return baseDateStr
      const scrollEl    = ganttScrollRef.current
      const gridOriginX = scrollEl.getBoundingClientRect().left + linePanelW + 5 - scrollEl.scrollLeft
      const indicatorX  = livePointerX.current - dragGrabOffsetX.current
      const pixelOffset = Math.max(0, indicatorX - gridOriginX)
      const colTotal    = zoom.colsPerDay * zoom.colPx
      const fracDays    = pixelOffset / colTotal
      const dayIndex    = Math.floor(fracDays)
      const fracInDay   = fracDays - dayIndex
      const d           = addDays(viewStart, dayIndex)
      let hour, minute
      if (zoom.shiftStart !== undefined) {
        const shiftMins = fracInDay * zoom.colsPerDay * 60
        hour   = Math.min(23, Math.floor((zoom.shiftStart ?? 0) + shiftMins / 60))
        minute = Math.floor(shiftMins % 60)
      } else {
        const shiftSt = boardShiftStart ?? 0
        const shiftHr = boardShiftHours ?? 24
        const shiftMs = fracInDay * shiftHr * 60
        hour   = Math.min(23, Math.floor(shiftSt + shiftMs / 60))
        minute = Math.floor(shiftMs % 60)
      }
      return `${toISO(d)}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`
    }

    // Cascade: find where dropped strip actually lands, then push forward any strips that follow it.
    // Rule: if drop position is strictly before an existing strip's start → push that strip forward.
    //       if drop position is at or after an existing strip's start → dropped strip goes after it.
    // shiftHours > 1 means hour view: end times are computed in shift-hours so a half-day strip
    // doesn't block the rest of the day.
    const cascadePush = (baseSchedules, targetLineId, droppedId, newStart, qty, cap, shiftHours, boardSH, boardSS, lcStages) => {
      const nw       = nonWorkingDays[targetLineId] || new Set()
      // effectSH: actual shift hours to use for sub-shift detection (hour view = colsPerDay, else = boardShiftHours)
      const effectSH = shiftHours > 1 ? shiftHours : (boardSH ?? 0)
      const effectSS = shiftHours > 1 ? (zoom.shiftStart ?? 0) : (boardSS ?? 0)
      const getDur   = (q, c) => c > 0 ? q / c : 1
      const workDays = getDur(qty, cap)

      const getEnd = (startDate, dur) => {
        const sh = effectSH > 1 ? effectSH : (boardSH ?? 8)
        const ss = effectSH > 1 ? effectSS : (boardSS ?? 0)
        return calcEndTime(startDate, dur * sh, ss, sh, nw)
      }
      const getDroppedEnd = (startDate) => {
        const sh = effectSH > 1 ? effectSH : (boardSH ?? 8)
        const ss = effectSH > 1 ? effectSS : (boardSS ?? 0)
        if (lcStages && lcStages.length && cap > 0) {
          return calcEndTimeLC(startDate, qty, cap, ss, sh, nw, lcStages)
        }
        return calcEndTime(startDate, workDays * sh, ss, sh, nw)
      }
      const toStr = (d) => `${toISO(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`

      const others   = baseSchedules
        .filter(s => s.line_id === targetLineId && s.id !== droppedId && s.planned_start)
        .sort((a, b) => new Date(a.planned_start) - new Date(b.planned_start))

      // Phase 1: find the actual landing position.
      // Stop at any strip that starts AT or AFTER the current candidate — those are pushed by Phase 2.
      let actualStart = new Date(newStart)
      let pushed = false
      for (const s of others) {
        const sStart = new Date(s.planned_start)
        if (sStart >= actualStart) break
        const sEnd = s.planned_end ? new Date(s.planned_end) : getEnd(s.planned_start, getDur(s.planned_qty, s.daily_capacity))
        if (sEnd > actualStart) { actualStart = sEnd; pushed = true }
      }
      // Phase 1b: snap to preceding strip's end if gap ≤ 60 min (covers one full hour-view column)
      const SNAP_MS = 60 * 60 * 1000
      if (!pushed) {
        let bestEnd = null
        let bestGap = SNAP_MS
        for (const s of others) {
          const sEnd = s.planned_end
            ? new Date(s.planned_end)
            : getEnd(s.planned_start, getDur(s.planned_qty, s.daily_capacity))
          const gap = actualStart.getTime() - sEnd.getTime()
          if (gap > 0 && gap < bestGap) { bestGap = gap; bestEnd = sEnd }
        }
        if (bestEnd) { actualStart = bestEnd; pushed = true }
      }
      const actualStartStr = pushed ? toStr(actualStart) : newStart

      // Phase 2: push forward strips that start at or after actualStart and overlap the dropped strip.
      let cursor    = getDroppedEnd(actualStart)
      const updates = {}
      for (const s of others) {
        const sStart = new Date(s.planned_start)
        if (sStart < actualStart) continue
        const sDur = getDur(s.planned_qty, s.daily_capacity)
        if (sStart < cursor) {
          updates[s.id] = toStr(cursor)
          cursor = getEnd(cursor, sDur)
        } else {
          cursor = s.planned_end ? new Date(s.planned_end) : getEnd(sStart, sDur)
        }
      }
      return { actualStart: actualStartStr, actualEnd: toStr(getDroppedEnd(actualStart)), updates }
    }

    if (data.type === 'scheduled') {
      const line = lines.find(l => l.id === lineId)
      const smv = data.sched.smv ? parseFloat(data.sched.smv) : null
      const mp  = (data.sched.manpower != null) ? data.sched.manpower : (line?.machines_count ?? 1)
      const dailyCap = line && smv && smv > 0
        ? Math.round((mp * parseFloat(line.working_hours) * 60 * (parseFloat(line.efficiency_pct) / 100)) / smv)
        : data.sched.daily_capacity
      const newStart    = preciseStart(dateStr)
      const lcStages    = data.sched.learning_curve_id && learningCurves?.length
        ? learningCurves.find(lc => lc.id === data.sched.learning_curve_id)?.stages ?? null
        : null
      const { actualStart, actualEnd, updates: pushUpdates } = cascadePush(schedulesRef.current, lineId, data.sched.id, newStart, data.sched.planned_qty, dailyCap, zoom.colsPerDay ?? 1, boardShiftHours, boardShiftStart, lcStages)

      // Merge check: if the dragged strip lands adjacent to a sibling (same order_line_id, same line),
      // and neither has keep_separate, merge them into one strip.
      const MERGE_GAP_MS = 30 * 60 * 1000
      const sibling = !data.sched.keep_separate
        ? schedulesRef.current.find(s =>
            s.id !== data.sched.id &&
            s.order_line_id != null &&
            s.order_line_id === data.sched.order_line_id &&
            s.line_id === lineId &&
            !s.keep_separate &&
            s.planned_end &&
            Math.abs(new Date(actualStart).getTime() - new Date(s.planned_end).getTime()) < MERGE_GAP_MS
          )
        : null
      if (sibling) {
        const merged = { ...sibling, planned_qty: sibling.planned_qty + data.sched.planned_qty, planned_end: null }
        pushHistory(schedulesRef.current
          .filter(s => s.id !== data.sched.id)
          .map(s => s.id === sibling.id ? merged : s)
        )
        return
      }

      pushHistory(schedulesRef.current.map(s => {
        if (s.id === data.sched.id) return { ...s, line_id: lineId, planned_start: actualStart, planned_end: actualEnd, daily_capacity: dailyCap }
        if (pushUpdates[s.id])      return { ...s, planned_start: pushUpdates[s.id], planned_end: null }
        return s
      }))
    } else if (data.type === 'staged') {
      const order = data.order
      const smv = order.calculated_smv ? parseFloat(order.calculated_smv) : null
      const qty  = parseInt(order.total_qty) > 0 ? parseInt(order.total_qty) : 100
      if (!smv) {
        message.warning(`No SMV found for "${order.name}" — add a planned Sewing operation to the style routing first.`)
        return
      }
      const line = lines.find(l => l.id === lineId)
      const dailyCap = line
        ? (line.machines_count * parseFloat(line.working_hours) * 60 * (parseFloat(line.efficiency_pct) / 100)) / smv
        : null
      const newStart  = preciseStart(dateStr)
      const newId     = `tmp_${order.id}_${lineId}_${newStart}`
      const capRound  = dailyCap ? Math.round(dailyCap) : null
      const { actualStart, actualEnd, updates: pushUpdates } = cascadePush(
        schedulesRef.current, lineId, newId, newStart, qty, capRound ?? 0, zoom.colsPerDay ?? 1, boardShiftHours, boardShiftStart
      )
      const newSched = {
        id: newId,
        order_id: order.order_id,
        order_line_id: order.id,
        order_name: order.name,
        line_id: lineId,
        planned_start: actualStart,
        planned_end: actualEnd,
        planned_qty: qty,
        smv,
        daily_capacity: capRound,
        order_status: order.status ?? 'confirmed',
        customer_name: order.customer_name || null,
      }
      pushHistory([...schedulesRef.current.map(s =>
        pushUpdates[s.id] ? { ...s, planned_start: pushUpdates[s.id], planned_end: null } : s
      ), newSched])
    } else if (data.type === 'pending_line') {
      const line = data.line
      const smv = line.calculated_smv ? parseFloat(line.calculated_smv) : null
      const qty  = parseInt(line.remaining_qty ?? line.delivery_qty) > 0 ? parseInt(line.remaining_qty ?? line.delivery_qty) : 100
      if (!smv) {
        message.warning(`No SMV for "${line.order_name}" — add a planned Sewing operation to the style routing first.`)
        return
      }
      const ganttLine = lines.find(l => l.id === lineId)
      const dailyCap = ganttLine
        ? (ganttLine.machines_count * parseFloat(ganttLine.working_hours) * 60 * (parseFloat(ganttLine.efficiency_pct) / 100)) / smv
        : null
      const newStart = preciseStart(dateStr)
      const newId    = `tmp_${line.id}_${lineId}_${newStart}`
      const capRound = dailyCap ? Math.round(dailyCap) : null
      const { actualStart, updates: pushUpdates } = cascadePush(
        schedulesRef.current, lineId, newId, newStart, qty, capRound ?? 0, zoom.colsPerDay ?? 1, boardShiftHours, boardShiftStart
      )
      const newSched = {
        id: newId,
        order_id: line.order_id,
        order_line_id: line.id,
        order_name: line.order_name + (line.color_name ? ' / ' + line.color_name : ''),
        line_id: lineId,
        planned_start: actualStart,
        planned_end: null,
        planned_qty: qty,
        smv,
        daily_capacity: capRound,
        order_status: line.status ?? 'confirmed',
        customer_name: line.customer_name || null,
      }
      pushHistory([...schedulesRef.current.map(s =>
        pushUpdates[s.id] ? { ...s, planned_start: pushUpdates[s.id], planned_end: null } : s
      ), newSched])
      setUnscheduled(prev => prev.filter(u => u.id !== line.id))
    }
  }


  const removeSchedule = (id) => {
    pushHistory(schedulesRef.current.filter(s => s.id !== id))
  }

  const doSplit = (sched, fraction) => {
    const leftQty  = Math.max(1, Math.min(sched.planned_qty - 1, Math.round(sched.planned_qty * fraction)))
    const rightQty = sched.planned_qty - leftQty
    const startMs  = new Date(sched.planned_start).getTime()
    const nws       = (nonWorkingDays || {})[sched.line_id] || new Set()
    const splitLine = lines.find(l => l.id === sched.line_id)
    const shiftH    = splitLine?.working_hours ?? boardShiftHours ?? 8
    const approxEndMs = (fromISO, qty) => {
      if (!sched.daily_capacity || sched.daily_capacity <= 0) return new Date(fromISO).getTime() + 86400000
      const fracD  = qty / sched.daily_capacity
      const startH = new Date(fromISO).getHours()
      const d      = new Date(fromISO); d.setHours(0, 0, 0, 0)
      let rem = fracD
      for (let g = 0; g < 365 * 3; g++) {
        if (!nws.has(toISO(d))) { if (rem <= 1) break; rem -= 1 }
        d.setDate(d.getDate() + 1)
      }
      d.setHours(startH, 0, 0, 0)
      d.setTime(d.getTime() + Math.min(1, rem) * shiftH * 3600000)
      return d.getTime()
    }
    const totalEndMs = sched.planned_end
      ? new Date(sched.planned_end).getTime()
      : approxEndMs(sched.planned_start, sched.planned_qty)
    const totalMs    = totalEndMs - startMs
    const rightStart = new Date(startMs + (leftQty / sched.planned_qty) * totalMs).toISOString().slice(0, 19)
    const leftSched  = { ...sched, planned_qty: leftQty, planned_end: null }
    const rightSched = {
      id:             `tmp_split_${sched.id}_${leftQty}`,
      order_id:       sched.order_id,
      order_line_id:  sched.order_line_id,
      order_name:     sched.order_name,
      line_id:        sched.line_id,
      planned_start:  rightStart,
      planned_end:    null,
      planned_qty:    rightQty,
      smv:            sched.smv,
      daily_capacity: sched.daily_capacity,
      order_status:   sched.order_status,
      customer_name:  sched.customer_name,
      keep_separate:  false,
    }
    pushHistory([...schedulesRef.current.map(s => s.id === sched.id ? leftSched : s), rightSched])
  }

  const openSplitModal = (sched, fraction) => {
    const defaultQty = Math.max(1, Math.min(sched.planned_qty - 1, Math.round(sched.planned_qty * fraction)))
    setSplitModal({ sched, qty: defaultQty })
  }

  const toggleKeepSeparate = (sched) => {
    pushHistory(schedulesRef.current.map(s => s.id === sched.id ? { ...s, keep_separate: !s.keep_separate } : s))
  }

  const totalGridWidth = totalWidth(viewDays, zoom)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f4f5f7', overflow: 'hidden' }}>

      {/* ── Toolbar — separate from calendar ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e8eaed', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        <Badge count={unscheduled.length} size="small" offset={[-4, 4]}>
          <Button icon={<OrderedListOutlined />} onClick={() => setPendingOpen(true)} size="small">Pending Orders</Button>
        </Badge>
        <div style={{ width: 1, height: 20, background: '#e8eaed', margin: '0 2px' }} />
        <Button size="small" icon={<CalendarOutlined />} onClick={() => setViewStart(() => { const d = new Date(today); d.setDate(d.getDate() - 3); return d })}>Today</Button>
        <Button size="small" onClick={() => setViewStart(d => addDays(d, -zoom.step))}>‹</Button>
        <Button size="small" onClick={() => setViewStart(d => addDays(d, zoom.step))}>›</Button>
        <div style={{ width: 1, height: 20, background: '#e8eaed', margin: '0 2px' }} />
        {/* Zoom */}
        <Text style={{ fontSize: 'var(--fs-xs)', color: '#888' }}>Zoom:</Text>
        <Button size="small" disabled={ZOOM_ORDER.indexOf(zoomKey) === 0}
                onClick={() => setZoomKey(ZOOM_ORDER[ZOOM_ORDER.indexOf(zoomKey) - 1])}>−</Button>
        <Text style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-teal)', minWidth: 40, textAlign: 'center' }}>{zoom.label}</Text>
        <Button size="small" disabled={ZOOM_ORDER.indexOf(zoomKey) === ZOOM_ORDER.length - 1}
                onClick={() => setZoomKey(ZOOM_ORDER[ZOOM_ORDER.indexOf(zoomKey) + 1])}>+</Button>
        <div style={{ width: 1, height: 20, background: '#e8eaed', margin: '0 2px' }} />
        {/* Row height */}
        <Text style={{ fontSize: 'var(--fs-xs)', color: '#888' }}>Row:</Text>
        <Button size="small" disabled={rowHeight <= 40}
                onClick={() => setRowHeight(h => Math.max(40, h - 8))}>−</Button>
        <Text style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-teal)', minWidth: 32, textAlign: 'center' }}>{rowHeight}</Text>
        <Button size="small" disabled={rowHeight >= 160}
                onClick={() => setRowHeight(h => Math.min(160, h + 8))}>+</Button>
        <div style={{ flex: 1 }} />
        <Button size="small" icon={<UndoOutlined />} disabled={!schedHistory.length} onClick={undo} title="Undo" />
        <Button size="small" icon={<RedoOutlined />} disabled={!schedFuture.length} onClick={redo} title="Redo" />
        <Button size="small" type={hasUnsaved ? 'primary' : 'default'} icon={<SaveOutlined />} onClick={saveChanges} loading={saving}>Save</Button>
        <div style={{ width: 1, height: 20, background: '#e8eaed', margin: '0 2px' }} />
        <Button size="small" icon={<SettingOutlined />} onClick={() => setSetupOpen(true)}>Setup</Button>
        <Button size="small" icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
      </div>

      {/* ── Drag cursor indicators + timestamp labels ── */}
      <div ref={dragIndicatorRef}    style={{ position: 'fixed', top: 0, width: 2, height: '100vh', background: '#16a34a', pointerEvents: 'none', zIndex: 9999, display: 'none' }} />
      <div ref={dragLabelRef}        style={{ position: 'fixed', top: 0, background: '#16a34a', color: '#fff', fontSize: 11, lineHeight: 1, padding: '3px 6px', borderRadius: 3, pointerEvents: 'none', zIndex: 9999, display: 'none', whiteSpace: 'nowrap' }} />
      <div ref={dragEndIndicatorRef} style={{ position: 'fixed', top: 0, width: 0, height: '100vh', borderLeft: '2px dashed #16a34a', pointerEvents: 'none', zIndex: 9999, display: 'none' }} />
      <div ref={dragEndLabelRef}     style={{ position: 'fixed', top: 0, background: '#16a34a', color: '#fff', fontSize: 11, lineHeight: 1, padding: '3px 6px', borderRadius: 3, pointerEvents: 'none', zIndex: 9999, display: 'none', whiteSpace: 'nowrap' }} />

      {/* ── Gantt board + right qty panel ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
      <DndContext sensors={sensors} collisionDetection={zoom.shiftStart !== undefined ? pointerWithin : rectIntersection} modifiers={[ganttDragModifier]} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragMove={({ activatorEvent, delta, active: activeInMove }) => {
          const rawX = (activatorEvent?.clientX ?? 0) + (delta?.x ?? 0)
          if (ganttScrollRef.current) {
            const el  = ganttScrollRef.current
            const gr  = el.getBoundingClientRect()
            const minX = gr.left + linePanelW + 5
            const maxX = gr.right
            const ZONE = 80, SPEED = 14
            if (rawX > maxX - ZONE)        el.scrollLeft += SPEED
            else if (rawX < minX + ZONE)   el.scrollLeft = Math.max(0, el.scrollLeft - SPEED)
            livePointerX.current = Math.max(minX, Math.min(maxX, rawX))

            // Update live start for detail panel (non-hour view only; hour view uses handleDragOver)
            if (zoom.shiftStart === undefined && activeInMove?.data?.current?.type === 'scheduled') {
              const gridOriginX = gr.left + linePanelW + 5 - el.scrollLeft
              const indicatorX  = livePointerX.current - dragGrabOffsetX.current
              const pixelOffset = Math.max(0, indicatorX - gridOriginX)
              const frac        = pixelOffset / (zoom.colsPerDay * zoom.colPx)
              const dayIdx      = Math.floor(frac)
              if (dayIdx !== dragDayRef.current) {
                dragDayRef.current = dayIdx
                const hour = Math.min(23, Math.max(0, Math.floor((zoom.boardShiftStart ?? 0) + (frac - dayIdx) * (zoom.boardShiftHours ?? 24))))
                const d    = addDays(viewStart, dayIdx)
                setDragLiveStart(`${toISO(d)}T${String(hour).padStart(2, '0')}:00:00`)
              }
            }
          } else {
            livePointerX.current = rawX
          }
          const barLeft = livePointerX.current - dragGrabOffsetX.current
          if (dragIndicatorRef.current) dragIndicatorRef.current.style.left = `${barLeft}px`
          const fmt12 = (h, m) => { const p = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 || 12; return `${h12}:${String(m).padStart(2,'0')} ${p}` }
          if (dragLabelRef.current && ganttScrollRef.current) {
            const el2 = ganttScrollRef.current
            const gr2 = el2.getBoundingClientRect()
            const gridOriginX2 = gr2.left + linePanelW + 5 - el2.scrollLeft
            const pixelOffset2 = Math.max(0, barLeft - gridOriginX2)
            let labelText = ''
            if (zoom.shiftStart !== undefined) {
              const d2 = pixelToDate(pixelOffset2, viewStart, zoom)
              labelText = `${d2.getDate()} ${d2.toLocaleString('en', { month: 'short' })} ${fmt12(d2.getHours(), d2.getMinutes())}`
            } else {
              const frac2   = pixelOffset2 / (zoom.colsPerDay * zoom.colPx)
              const dayIdx2 = Math.floor(frac2)
              const shiftMs = (frac2 - dayIdx2) * (zoom.boardShiftHours ?? 24)
              const hr      = Math.min(23, Math.floor((zoom.boardShiftStart ?? 0) + shiftMs))
              const mn      = Math.round((shiftMs - Math.floor(shiftMs)) * 60)
              const d2      = addDays(viewStart, dayIdx2)
              d2.setHours(hr, mn, 0, 0)
              labelText = `${d2.getDate()} ${d2.toLocaleString('en', { month: 'short' })} ${fmt12(hr, mn)}`
            }
            dragLabelRef.current.textContent = labelText
            const labelW  = dragLabelRef.current.offsetWidth || 90
            const flipLeft = barLeft + 8 + labelW > window.innerWidth
            dragLabelRef.current.style.left = `${flipLeft ? barLeft - 4 - labelW : barLeft + 4}px`
          }
          if (dragEndIndicatorRef.current || dragEndLabelRef.current) {
            const activeData = activeInMove?.data?.current
            // Match calcOverlayWidth: use current hovered line capacity so end bar == strip right edge
            const overLineE = lines.find(l => l.id === dragOverLineId)
            const qtyE = activeData?.sched?.planned_qty
              ?? (activeData?.line?.remaining_qty ?? activeData?.line?.delivery_qty)
            const smvE = activeData?.sched?.smv ?? activeData?.line?.calculated_smv ?? activeData?.order?.calculated_smv
            let overlayW = 0
            if (overLineE && qtyE && smvE && ganttScrollRef.current) {
              const capE = (overLineE.machines_count * parseFloat(overLineE.working_hours) * 60 * (parseFloat(overLineE.efficiency_pct) / 100)) / parseFloat(smvE)
              if (capE > 0) {
                const shiftSt = boardShiftStart ?? 0
                const shiftHr = boardShiftHours ?? parseFloat(overLineE.working_hours) ?? 8
                const nwSet   = nonWorkingDays[overLineE.id] || new Set()
                const elE0    = ganttScrollRef.current
                const grE0    = elE0.getBoundingClientRect()
                const goE0    = grE0.left + linePanelW + 5 - elE0.scrollLeft
                const pixOffS = Math.max(0, barLeft - goE0)
                const fracS   = pixOffS / (zoom.colsPerDay * zoom.colPx)
                const dIdxS   = Math.floor(fracS)
                const sFrac   = (fracS - dIdxS) * shiftHr
                const hrS     = Math.min(23, Math.floor(shiftSt + sFrac))
                const mnS     = Math.floor((sFrac - Math.floor(sFrac)) * 60)
                const dS      = addDays(viewStart, dIdxS)
                const liveSt  = `${toISO(dS)}T${String(hrS).padStart(2,'0')}:${String(mnS).padStart(2,'0')}:00`
                const endD    = calcEndTime(liveSt, (qtyE / capE) * shiftHr, shiftSt, shiftHr, nwSet)
                const endISO  = `${toISO(endD)}T${String(endD.getHours()).padStart(2,'0')}:${String(endD.getMinutes()).padStart(2,'0')}:00`
                overlayW = Math.max(20, blockWidth(liveSt, endISO, zoom))
              }
            }
            if (!overlayW && activeData?.sched?.planned_end && activeData?.sched?.planned_start) {
              overlayW = blockWidth(activeData.sched.planned_start, activeData.sched.planned_end, zoom)
            }
            const endBarLeft = barLeft + overlayW
            if (dragEndIndicatorRef.current) dragEndIndicatorRef.current.style.left = `${endBarLeft}px`
            if (dragEndLabelRef.current && ganttScrollRef.current) {
              const elE = ganttScrollRef.current
              const grE = elE.getBoundingClientRect()
              const gridOriginE = grE.left + linePanelW + 5 - elE.scrollLeft
              const endPixelOffset = Math.max(0, endBarLeft - gridOriginE)
              let endText = ''
              if (zoom.shiftStart !== undefined) {
                const dE = pixelToDate(endPixelOffset, viewStart, zoom)
                endText = `${dE.getDate()} ${dE.toLocaleString('en', { month: 'short' })} ${fmt12(dE.getHours(), dE.getMinutes())}`
              } else {
                const fracE  = endPixelOffset / (zoom.colsPerDay * zoom.colPx)
                const dIdxE  = Math.floor(fracE)
                const shiftMsE = (fracE - dIdxE) * (zoom.boardShiftHours ?? 24)
                const hrE    = Math.min(23, Math.floor((zoom.boardShiftStart ?? 0) + shiftMsE))
                const mnE    = Math.round((shiftMsE - Math.floor(shiftMsE)) * 60)
                const dE     = addDays(viewStart, dIdxE)
                dE.setHours(hrE, mnE, 0, 0)
                endText = `${dE.getDate()} ${dE.toLocaleString('en', { month: 'short' })} ${fmt12(hrE, mnE)}`
              }
              dragEndLabelRef.current.textContent = endText
              const endLabelW  = dragEndLabelRef.current.offsetWidth || 90
              const endFlip    = endBarLeft + 8 + endLabelW > window.innerWidth
              dragEndLabelRef.current.style.left = `${endFlip ? endBarLeft - 4 - endLabelW : endBarLeft + 4}px`
            }
          }
        }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
          <div ref={ganttScrollRef} style={{ height: '100%', overflowX: 'auto', overflowY: 'auto' }}
            onMouseMove={(e) => {
              if (zoom.shiftStart === undefined) return
              const scrollEl = ganttScrollRef.current; if (!scrollEl) return
              const gridOriginX = scrollEl.getBoundingClientRect().left + linePanelW + 5 - scrollEl.scrollLeft
              const dayIndex = Math.floor(Math.max(0, e.clientX - gridOriginX) / (zoom.colsPerDay * zoom.colPx))
              const iso = toISO(addDays(viewStart, dayIndex))
              if (iso !== hoveredDayRef.current) { hoveredDayRef.current = iso; setHoveredDate(iso) }
            }}
            onMouseLeave={() => { hoveredDayRef.current = null; setHoveredDate(null) }}
          >
            <div style={{ minWidth: linePanelW + 5 + totalGridWidth, position: 'relative' }}>

              {/* Sticky header — SEWING LINES label | drag handle | time axis */}
              <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #d5e3e8', height: HEADER_H }}>
                {/* Left: label — sticky on horizontal scroll, floats above grid */}
                <div style={{ width: linePanelW, flexShrink: 0, display: 'flex', alignItems: 'center', paddingLeft: 14, position: 'sticky', left: 0, zIndex: 20, background: '#e4eef3', boxShadow: 'var(--shadow-panel)' }}>
                  <Text style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: '#4a6e7e', textTransform: 'uppercase', letterSpacing: 0.9 }}>Sewing Lines</Text>
                </div>
                {/* Drag handle — sticky, visually part of the panel */}
                <div
                  onMouseDown={onResizeMouseDown}
                  style={{ width: 5, flexShrink: 0, cursor: 'col-resize', background: '#ccdde5', borderRight: '2px solid #b8cdd8', transition: 'background 0.15s', position: 'sticky', left: linePanelW, zIndex: 20 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(11,158,148,0.45)'}
                  onMouseLeave={e => e.currentTarget.style.background = '#ccdde5'}
                />
                {/* Right: two-row time axis (zoom-aware) */}
                <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
                  <ZoomTimeAxis days={days} viewStart={viewStart} viewDays={viewDays} zoom={zoom} today={today} zoomKey={zoomKey} currentTime={currentTime} weekStart={weekStart} />
                </div>
              </div>


              {/* Line rows */}
              {lines.length === 0
                ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>
                    <SettingOutlined style={{ fontSize: 32, marginBottom: 8, display: 'block' }} />
                    <Text>No production lines yet. Click <strong>Lines</strong> to add some.</Text>
                  </div>
                )
                : (
                <>
                  <div key="virt-top" style={{ height: visibleLineRange.first * rowHeight }} />
                  {renderableLines.slice(visibleLineRange.first, visibleLineRange.last + 1).map(item => {
                  if (item.type === 'subtotal') {
                    const unitLines     = lines.filter(l => !l.is_subtotal && l.plan_unit_id === item.unitId)
                    const totalMachines = unitLines.reduce((s, l) => s + (l.machines_count || 0), 0)
                    const unitName      = planUnits.find(u => u.id === item.unitId)?.name ?? ''
                    const subNonWorking = new Set()
                    unitLines.forEach(l => (nonWorkingDays[l.id] || new Set()).forEach(d => subNonWorking.add(d)))
                    return (
                      <div key={`sub_${item.unitId}`} style={{ display: 'flex', borderBottom: '1px solid #c0d8e4' }}>
                        <div style={{ width: linePanelW, flexShrink: 0, padding: '0 12px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, background: '#e2eef5', position: 'sticky', left: 0, zIndex: 20, boxShadow: 'var(--shadow-panel)', overflow: 'hidden' }}>
                          <Text style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--c-navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
                            {unitName} — Subtotal
                          </Text>
                          <Text style={{ fontSize: 'var(--fs-2xs)', color: '#6a8a98', whiteSpace: 'nowrap', flexShrink: 0 }}>{totalMachines}</Text>
                        </div>
                        <div style={{ width: 5, flexShrink: 0, borderRight: '2px solid #b8cdd8', background: '#ccdde5', position: 'sticky', left: linePanelW, zIndex: 20 }} />
                        <div style={{ position: 'relative', height: rowHeight, flex: 1, minWidth: totalGridWidth }}>
                          {days.map((d, i) => {
                            const dateStr = toISO(d)
                            const isPast = dateStr < toISO(today)
                            const nonWorking = subNonWorking.has(dateStr)
                            const cellW = zoom.colPx * zoom.colsPerDay
                            const usedMachines = !nonWorking && cellW >= 28
                              ? unitLines
                                  .filter(l => (schedByLine[l.id] || []).some(sc => {
                                    const s = toISO(new Date(sc.planned_start))
                                    const e = toISO(new Date(sc._effectiveEnd || sc.planned_end || sc.planned_start))
                                    return dateStr >= s && dateStr < e
                                  }))
                                  .reduce((s, l) => s + (l.machines_count || 0), 0)
                              : null
                            const availMP = usedMachines != null ? totalMachines - usedMachines : null
                            return (
                              <div key={`sb${i}`} style={{
                                position: 'absolute', left: i * cellW,
                                width: cellW, height: rowHeight,
                                background: isPast ? 'rgba(220,38,38,0.07)' : nonWorking ? 'rgba(0,0,0,0.09)' : 'transparent',
                                borderRight: '1px solid rgba(0,0,0,0.06)', boxSizing: 'border-box',
                                display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
                                justifyContent: 'space-between', padding: '3px 3px',
                              }}>
                                {usedMachines != null && (
                                  <>
                                    <span style={{ fontSize: 8, lineHeight: 1, color: '#6a8a98' }}>{totalMachines}</span>
                                    <span style={{ fontSize: 8, lineHeight: 1, color: '#6a8a98' }}>{usedMachines}</span>
                                    <span style={{ fontSize: 8, lineHeight: 1, fontWeight: 600, color: availMP >= 0 ? '#22c55e' : '#ef4444' }}>
                                      {availMP >= 0 ? `+${availMP}` : String(availMP)}
                                    </span>
                                  </>
                                )}
                              </div>
                            )
                          })}
                          {(() => {
                            const barD = new Date(currentTime); barD.setHours(0, 0, 0, 0)
                            const todayL = blockLeft(barD, viewStart, zoom)
                            if (todayL < 0 || todayL > totalGridWidth) return null
                            const sh = zoom.shiftStart
                            const wh = zoom.colsPerDay
                            const workingHour = sh !== undefined
                              ? Math.max(0, Math.min(wh, currentTime.getHours() + currentTime.getMinutes() / 60 - sh))
                              : Math.min(wh, (currentTime.getHours() + currentTime.getMinutes() / 60) / 24 * wh)
                            return <div style={{ position: 'absolute', left: todayL + workingHour * zoom.colPx, top: 0, width: 2, height: rowHeight, background: 'var(--plan-today-bar)', zIndex: 3, pointerEvents: 'none' }} />
                          })()}
                        </div>
                      </div>
                    )
                  }
                  if (item.type === 'grandtotal') {
                    const allLines      = lines.filter(l => !l.is_subtotal)
                    const gtTotal       = allLines.reduce((s, l) => s + (l.machines_count || 0), 0)
                    return (
                      <div key="grandtotal" style={{ display: 'flex', borderTop: '2px solid #7bacc4', borderBottom: '2px solid #7bacc4', background: '#d4e8f2' }}>
                        <div style={{ width: linePanelW, flexShrink: 0, padding: '0 12px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, background: '#c5dced', position: 'sticky', left: 0, zIndex: 20, boxShadow: 'var(--shadow-panel)', overflow: 'hidden' }}>
                          <Text style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--c-navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
                            Grand Total
                          </Text>
                          <Text style={{ fontSize: 'var(--fs-2xs)', color: '#6a8a98', whiteSpace: 'nowrap', flexShrink: 0 }}>{gtTotal}</Text>
                        </div>
                        <div style={{ width: 5, flexShrink: 0, borderRight: '2px solid #7bacc4', background: '#a8cce0', position: 'sticky', left: linePanelW, zIndex: 20 }} />
                        <div style={{ position: 'relative', height: rowHeight, flex: 1, minWidth: totalGridWidth }}>
                          {days.map((d, i) => {
                            const dateStr = toISO(d)
                            const isPast  = dateStr < toISO(today)
                            const cellW   = zoom.colPx * zoom.colsPerDay
                            const usedMachines = cellW >= 28
                              ? allLines
                                  .filter(l => (schedByLine[l.id] || []).some(sc => {
                                    const s = toISO(new Date(sc.planned_start))
                                    const e = toISO(new Date(sc._effectiveEnd || sc.planned_end || sc.planned_start))
                                    return dateStr >= s && dateStr < e
                                  }))
                                  .reduce((s, l) => s + (l.machines_count || 0), 0)
                              : null
                            const availMP = usedMachines != null ? gtTotal - usedMachines : null
                            return (
                              <div key={`gt${i}`} style={{
                                position: 'absolute', left: i * cellW,
                                width: cellW, height: rowHeight,
                                background: isPast ? 'rgba(220,38,38,0.07)' : 'transparent',
                                borderRight: '1px solid rgba(0,0,0,0.06)', boxSizing: 'border-box',
                                display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
                                justifyContent: 'space-between', padding: '3px 3px',
                              }}>
                                {usedMachines != null && (
                                  <>
                                    <span style={{ fontSize: 8, lineHeight: 1, color: '#6a8a98' }}>{gtTotal}</span>
                                    <span style={{ fontSize: 8, lineHeight: 1, color: '#6a8a98' }}>{usedMachines}</span>
                                    <span style={{ fontSize: 8, lineHeight: 1, fontWeight: 600, color: availMP >= 0 ? '#22c55e' : '#ef4444' }}>
                                      {availMP >= 0 ? `+${availMP}` : String(availMP)}
                                    </span>
                                  </>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  }
                  const line = item.line
                  const editable = canEditLine(line.id)
                  const lineScheds = schedByLine[line.id] || []
                  const lineNonWorking = nonWorkingDays[line.id] || new Set()
                  return (
                    <div key={line.id} style={{ display: 'flex', borderBottom: '1px solid #dde8ed', background: '#fff', opacity: editable ? 1 : 0.6 }}>
                      {/* Line name panel — sticky, floats above order blocks */}
                      <div style={{ width: linePanelW, flexShrink: 0, padding: '0 6px 0 12px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, background: editable ? 'var(--plan-line-edit)' : 'var(--plan-line-readonly)', position: 'sticky', left: 0, zIndex: 20, boxShadow: 'var(--shadow-panel)', overflow: 'hidden' }}>
                        <Text strong style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{line.name}</Text>
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignSelf: 'stretch', paddingTop: 5, paddingBottom: 5, flexShrink: 0, alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 8, lineHeight: 1, color: '#6a8a98' }}>
                            {zoom.shiftStart !== undefined
                              ? `${boardShiftStart ?? '?'}–${(boardShiftStart ?? 0) + Math.round(Number(line.working_hours) || 0)}h`
                              : `${Math.round(Number(line.working_hours) || 0)}H`}
                          </Text>
                          <Text style={{ fontSize: 8, lineHeight: 1, color: '#6a8a98' }}>
                            {`×${line.machines_count}`}
                          </Text>
                        </div>
                      </div>
                      {/* Drag handle spacer — sticky, aligns with header drag handle */}
                      <div style={{ width: 5, flexShrink: 0, borderRight: '2px solid #b8cdd8', background: '#ccdde5', position: 'sticky', left: linePanelW, zIndex: 20 }} />
                      {/* Order blocks — overflow hidden prevents blocks bleeding into left panel */}
                      <div style={{ position: 'relative', height: rowHeight, flex: 1, minWidth: totalGridWidth, overflow: 'hidden' }}>
                        {days.flatMap((d, i) => {
                          const dateStr    = toISO(d)
                          const dayLeft    = i * zoom.colPx * zoom.colsPerDay
                          const dayWidth   = zoom.colPx * zoom.colsPerDay
                          const nonWorking = lineNonWorking.has(dateStr)
                          const isPast     = dateStr < toISO(today)
                          let effectiveWH = null
                          let mpForDay    = null
                          if (!nonWorking) {
                            const ovs = lineWHOverrides[line.id] || []
                            const ov  = ovs.find(o => dateStr >= o.start_date && dateStr <= o.end_date)
                            effectiveWH = Math.round(Number(line.working_hours) + (ov ? Number(ov.wh_offset) : 0))
                            const hasStrip = lineScheds.some(s => {
                              const startISO = toISO(new Date(s.planned_start))
                              if (dateStr < startISO) return false
                              if (s.planned_end != null) return toISO(new Date(s.planned_end)) >= dateStr
                              if (s.daily_capacity > 0 && s.planned_qty > 0)
                                return toISO(new Date(new Date(s.planned_start).getTime() + (s.planned_qty / s.daily_capacity) * 86400000)) >= dateStr
                              return startISO === dateStr
                            })
                            if (hasStrip) mpForDay = line.machines_count
                          }
                          return [<DayDropCell
                            key={`d${i}`}
                            id={`line_${line.id}_dt_${dateStr}T00:00:00`}
                            left={dayLeft}
                            width={dayWidth}
                            rowHeight={rowHeight}
                            isNonWorking={nonWorking}
                            isPast={isPast}
                            wh={zoom.colsPerDay > 1 ? effectiveWH : null}
                            mp={mpForDay}
                          />]
                        })}
                        {/* Hour labels inside row — behind strips, top-left of each column */}
                        {zoom.shiftStart !== undefined && days.map((d, i) =>
                          Array.from({ length: Math.round(zoom.colsPerDay) }, (_, h) => {
                            const actualH = (zoom.shiftStart ?? 0) + h
                            const label = actualH === 12 ? '12P' : actualH < 12 ? `${actualH}A` : `${actualH - 12}P`
                            const dayLeft = i * zoom.colPx * zoom.colsPerDay
                            return (
                              <div key={`lbl_${i}_${h}`} style={{
                                position: 'absolute', left: dayLeft + h * zoom.colPx + 2, top: 2,
                                fontSize: 7, color: '#9db8c4', lineHeight: 1,
                                pointerEvents: 'none', zIndex: 1, userSelect: 'none',
                              }}>
                                {label}
                              </div>
                            )
                          })
                        )}
                        {/* Break hour overlays */}
                        {zoom.shiftStart !== undefined && boardBreaks.length > 0 && days.map((d, i) => (
                          boardBreaks.map(b => {
                            const dayLeft = i * zoom.colPx * zoom.colsPerDay
                            const breakLeft = dayLeft + (b.startHour - (boardShiftStart ?? 0)) * zoom.colPx
                            return (
                              <div key={`brk_${i}_${b.startHour}`} style={{
                                position: 'absolute', left: breakLeft, top: 0,
                                width: b.duration * zoom.colPx, height: '100%',
                                background: 'var(--plan-break-overlay)', pointerEvents: 'none', zIndex: 2,
                              }} />
                            )
                          })
                        ))}
                        {/* Current-time indicator */}
                        {(() => {
                          const barD = new Date(currentTime); barD.setHours(0, 0, 0, 0)
                          const todayL = blockLeft(barD, viewStart, zoom)
                          if (todayL < 0 || todayL > totalGridWidth) return null
                          const sh = zoom.shiftStart
                          const wh = zoom.colsPerDay
                          const workingHour = sh !== undefined
                            ? Math.max(0, Math.min(wh, currentTime.getHours() + currentTime.getMinutes() / 60 - sh))
                            : Math.min(wh, (currentTime.getHours() + currentTime.getMinutes() / 60) / 24 * wh)
                          return <div style={{ position: 'absolute', left: todayL + workingHour * zoom.colPx, top: 0, width: 2, height: rowHeight, background: 'var(--plan-today-bar)', zIndex: 3, pointerEvents: 'none' }} />
                        })()}
                        {(() => {
                          const sorted = lineScheds.filter(s => s.planned_start)
                          const blockH = Math.round(rowHeight * 0.5)
                          const lt = Math.round((rowHeight - blockH) / 2)
                          // cursor tracks the rightmost pixel used; strips are pushed right if needed
                          let cursor = -Infinity
                          return sorted.map((sched) => {
                            const naturalLeft = blockLeft(sched.planned_start, viewStart, zoom)
                            const effectiveEnd = (() => {
                              if (sched.planned_end) return new Date(sched.planned_end)
                              const sh  = boardShiftHours ?? 8
                              const ss  = boardShiftStart ?? 0
                              if (sched.learning_curve_id && sched.daily_capacity > 0) {
                                const preset = learningCurves?.find(lc => lc.id === sched.learning_curve_id)
                                if (preset?.stages?.length) {
                                  return calcEndTimeLC(new Date(sched.planned_start), sched.planned_qty, sched.daily_capacity, ss, sh, lineNonWorking, preset.stages)
                                }
                              }
                              const dur = sched.daily_capacity > 0 && isFinite(sched.daily_capacity)
                                ? sched.planned_qty / sched.daily_capacity : 1
                              return calcEndTime(new Date(sched.planned_start), dur * sh, ss, sh, lineNonWorking)
                            })()
                            const naturalW = Math.max(0, blockLeft(effectiveEnd, viewStart, zoom) - naturalLeft)
                            const w = Math.max(naturalW, zoom.colPx)
                            // Push this strip right if it would start inside the previous strip
                            const displayLeft = Math.max(naturalLeft, cursor)
                            cursor = displayLeft + w
                            if (effectiveEnd < viewStart || new Date(sched.planned_start) > viewEnd) return null
                            if (displayLeft > totalGridWidth || displayLeft + w < 0) return null
                            return <OrderBlock key={sched.id} sched={sched} viewStart={viewStart} zoom={zoom} onRemove={removeSchedule} onHover={s => setHoveredSched({ ...s, _effectiveEnd: toLocalDT(effectiveEnd) })} onOpenPanel={(type, s) => setDetailPanel({ type, sched: s })} onManpower={s => { setMpModal({ sched: s }); setMpValue(s.manpower ?? null) }} onAssignLC={s => { setLcModal({ sched: s }); setLcValue(s.learning_curve_id ?? null) }} onOverrideLineWH={s => { setWhModal({ sched: s }); setWhOffset(0); setWhRange(null) }} onSplit={doSplit} onSplitModal={openSplitModal} onToggleKeepSeparate={toggleKeepSeparate} hasSiblings={sched.order_line_id ? schedules.filter(ss => ss.order_line_id === sched.order_line_id).length > 1 : schedules.filter(ss => !ss.order_line_id && ss.order_id === sched.order_id).length > 1} rowHeight={rowHeight} laneTop={lt} laneHeight={blockH} displayWidth={w} displayLeft={displayLeft} onPin={s => s ? setPinnedSched({ ...s, _effectiveEnd: toLocalDT(effectiveEnd) }) : setPinnedSched(null)} pinnedSchedId={pinnedSched?.id ?? null} />
                          })
                        })()}
                      </div>
                    </div>
                    )
                  })}
                  <div key="virt-bot" style={{ height: Math.max(0, renderableLines.length - 1 - visibleLineRange.last) * rowHeight }} />
                </>
                )
              }
            </div>
          </div>

          <DragOverlay dropAnimation={null}>
            {(() => {
              if (!activeItem) return null
              // Find the line being hovered — use it for live capacity recalculation
              const overLine = dragOverLineId ? lines.find(l => l.id === dragOverLineId) : null

              function calcOverlayWidth(qty, smv) {
                if (!overLine || !qty || !smv) return 200
                const dailyCap = (overLine.machines_count * parseFloat(overLine.working_hours) * 60 * (parseFloat(overLine.efficiency_pct) / 100)) / parseFloat(smv)
                const exactDays = qty / dailyCap   // fractional — no ceiling
                return Math.max(20, exactDays * zoom.colsPerDay * zoom.colPx)
              }

              if (activeItem.type === 'scheduled') {
                let ow = 0
                const qty = activeItem.sched.planned_qty
                const smv = activeItem.sched.smv
                if (overLine && qty && smv) {
                  const dailyCap = (overLine.machines_count * parseFloat(overLine.working_hours) * 60 * (parseFloat(overLine.efficiency_pct) / 100)) / parseFloat(smv)
                  if (dailyCap > 0) {
                    const shiftSt = boardShiftStart ?? 0
                    const shiftHr = boardShiftHours ?? parseFloat(overLine.working_hours) ?? 8
                    const nwSet   = nonWorkingDays[overLine.id] || new Set()
                    const start   = dragLiveStart || activeItem.sched.planned_start
                    const endD    = calcEndTime(start, (qty / dailyCap) * shiftHr, shiftSt, shiftHr, nwSet)
                    const endISO  = `${toISO(endD)}T${String(endD.getHours()).padStart(2,'0')}:${String(endD.getMinutes()).padStart(2,'0')}:00`
                    ow = Math.max(20, blockWidth(start, endISO, zoom))
                  }
                }
                if (!ow) ow = calcOverlayWidth(qty, smv)
                return <OrderBlock sched={activeItem.sched} viewStart={viewStart} zoom={zoom} onRemove={() => {}} isOverlay overlayWidth={ow} rowHeight={rowHeight} />
              }

              if (activeItem.type === 'staged') {
                const order = activeItem.order
                const ow = calcOverlayWidth(parseInt(order.total_qty) || 100, order.calculated_smv)
                const color = STATUS_COLOR[order.status] ?? 'var(--c-teal)'
                return (
                  <div style={{ width: ow, height: Math.round(rowHeight * 0.5), background: `${color}22`, border: `2px solid ${color}`, borderRadius: 6, padding: '4px 8px', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxSizing: 'border-box' }}>
                    <Text strong style={{ fontSize: 'var(--fs-xs)', color, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{order.name}</Text>
                    <Text style={{ fontSize: 'var(--fs-2xs)', color: '#666', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{order.customer_name || '—'} · {order.total_qty} pcs</Text>
                  </div>
                )
              }
              if (activeItem.type === 'pending_line') {
                const line = activeItem.line
                const ow = calcOverlayWidth(parseInt(line.delivery_qty) || 100, line.calculated_smv)
                const color = STATUS_COLOR[line.status] ?? 'var(--c-teal)'
                return (
                  <div style={{ width: ow, height: Math.round(rowHeight * 0.5), background: `${color}22`, border: `2px solid ${color}`, borderRadius: 6, padding: '4px 8px', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxSizing: 'border-box' }}>
                    <Text strong style={{ fontSize: 'var(--fs-xs)', color, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{line.order_name}{line.color_name ? ' / ' + line.color_name : ''}</Text>
                    <Text style={{ fontSize: 'var(--fs-2xs)', color: '#666', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{line.customer_name || '—'} · {line.delivery_qty} pcs</Text>
                  </div>
                )
              }
              return null
            })()}
          </DragOverlay>
          </div>{/* end gantt inner flex */}
          <PendingOrdersModal
            open={pendingOpen}
            orders={unscheduled}
            onClose={() => setPendingOpen(false)}
            draggingFromPending={draggingFromPending}
          />
        </DndContext>
        <PlanQtyPanel
          sched={displaySched}
          zoom={zoom}
          nonWorkingSet={nonWorkingDays[displaySched?.line_id] ?? new Set()}
          boardShiftHours={boardShiftHours}
          boardShiftStart={boardShiftStart}
          boardBreaks={boardBreaks}
          lineWHOverrides={lineWHOverrides}
          learningCurves={learningCurves}
          open={qtyPanelOpen}
          onToggle={() => setQtyPanelOpen(o => !o)}
          hoveredDate={hoveredDate}
        />
      </div>{/* end gantt + right panel row */}

      {/* ── Hover info panel — collapsible ── */}
      <div style={{
        flexShrink: 0,
        height: infoPanelOpen ? 96 : 22,
        transition: 'height 0.2s ease',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: displaySched ? '#f8fbfc' : '#fafbfc',
        borderTop: `2px solid ${displaySched ? '#b8d8e4' : '#e8eef2'}`,
      }}>
        {/* Toggle tab */}
        <div style={{ height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', paddingLeft: 12, paddingRight: 8, gap: 5, borderBottom: infoPanelOpen ? '1px solid #e8eef2' : 'none', userSelect: 'none' }}>
          <div onClick={() => setInfoPanelOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
            {infoPanelOpen ? <DownOutlined style={{ fontSize: 9, color: 'var(--c-text-placeholder)' }} /> : <UpOutlined style={{ fontSize: 9, color: 'var(--c-text-placeholder)' }} />}
          </div>
          <div onClick={() => setInfoPanelOpen(o => !o)} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer' }}>
            <Text style={{ fontSize: 'var(--fs-2xs)', color: 'var(--c-text-placeholder)', letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 600 }}>Details</Text>
          </div>
          <Popover
            trigger="click"
            placement="topRight"
            content={
              <div style={{ display: 'flex', gap: 24, padding: '4px 0' }}>
                {INFO_FIELD_SECTIONS.map(section => (
                  <div key={section}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#93a3ae', letterSpacing: 0.8, marginBottom: 8 }}>
                      {INFO_SECTION_LABEL[section]}
                    </div>
                    {INFO_FIELD_DEFS.filter(f => f.section === section).map(f => (
                      <div
                        key={f.key}
                        onClick={() => toggleInfoField(f.key)}
                        style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, cursor: 'pointer' }}
                      >
                        <div style={{ width: 14, height: 14, border: `1.5px solid ${infoBarVisible.has(f.key) ? '#0e7490' : '#b0bec5'}`, borderRadius: 3, background: infoBarVisible.has(f.key) ? '#0e7490' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {infoBarVisible.has(f.key) && <CheckOutlined style={{ fontSize: 8, color: '#fff' }} />}
                        </div>
                        <Text style={{ fontSize: 12, color: '#2d4a5a' }}>{f.label}</Text>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            }
          >
            <SettingOutlined
              onClick={e => e.stopPropagation()}
              style={{ fontSize: 11, color: 'var(--c-text-placeholder)', cursor: 'pointer', padding: '2px 4px' }}
            />
          </Popover>
        </div>
        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <HoverInfoPanel sched={displaySched} nonWorkingSet={nonWorkingDays[displaySched?.line_id] ?? new Set()} visibleFields={infoBarVisible} />
        </div>
      </div>

      {/* Modals */}
      <PlanningSetupModal open={setupOpen} token={token} onClose={() => setSetupOpen(false)} onSaved={load} />

      {/* Split modal */}
      <Modal
        title="Split Strip"
        open={!!splitModal}
        onOk={() => {
          if (splitModal) {
            doSplit(splitModal.sched, splitModal.qty / splitModal.sched.planned_qty)
            setSplitModal(null)
          }
        }}
        onCancel={() => setSplitModal(null)}
        okText="Split"
        width={340}
      >
        {splitModal && (
          <div style={{ padding: '8px 0' }}>
            <Text style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
              Split <Text strong>{splitModal.sched.order_name}</Text> ({splitModal.sched.planned_qty.toLocaleString()} pcs)
            </Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12, color: '#6a8a98', flexShrink: 0 }}>Left part:</Text>
              <InputNumber
                min={1}
                max={splitModal.sched.planned_qty - 1}
                value={splitModal.qty}
                onChange={v => setSplitModal(m => ({ ...m, qty: v ?? 1 }))}
                style={{ width: 100 }}
              />
              <Text style={{ fontSize: 12, color: '#6a8a98' }}>pcs</Text>
              <Text style={{ fontSize: 12, color: '#6a8a98', marginLeft: 8 }}>
                · Right: <Text strong>{splitModal.sched.planned_qty - splitModal.qty} pcs</Text>
              </Text>
            </div>
          </div>
        )}
      </Modal>

      <DetailModal
        type={detailPanel?.type}
        sched={detailPanel?.sched ?? null}
        token={token}
        onClose={() => setDetailPanel(null)}
      />

      {/* Manpower modal */}
      <Modal
        title="Set Manpower"
        open={!!mpModal}
        onOk={handleManpowerSave}
        onCancel={() => setMpModal(null)}
        okText="Save"
        width={320}
      >
        <div style={{ padding: '12px 0' }}>
          <Text style={{ fontSize: 'var(--fs-sm)', color: '#666', display: 'block', marginBottom: 8 }}>
            Operators for <Text strong>{mpModal?.sched?.order_name}</Text>. Leave blank to use line default.
          </Text>
          <InputNumber
            value={mpValue}
            onChange={setMpValue}
            min={1}
            max={999}
            placeholder="Line default"
            style={{ width: '100%' }}
          />
        </div>
      </Modal>

      {/* Assign Learning Curve modal */}
      <Modal
        title="Assign Learning Curve"
        open={!!lcModal}
        onOk={handleLCSave}
        onCancel={() => setLcModal(null)}
        okText="Save"
        width={360}
      >
        <div style={{ padding: '12px 0' }}>
          <Text style={{ fontSize: 'var(--fs-sm)', color: '#666', display: 'block', marginBottom: 8 }}>
            Learning curve for <Text strong>{lcModal?.sched?.order_name}</Text>
          </Text>
          <Select
            value={lcValue}
            onChange={setLcValue}
            placeholder="None (100% efficiency)"
            allowClear
            style={{ width: '100%' }}
            options={[
              ...learningCurves.map(lc => ({
                value: lc.id,
                label: `${lc.name} (${lc.stages?.length ?? 0} stages)`,
              })),
            ]}
          />
        </div>
      </Modal>

      {/* WH Override modal */}
      <Modal
        title="Override Line Working Hours"
        open={!!whModal}
        onOk={handleWHOverrideSave}
        onCancel={() => { setWhModal(null); setWhRange(null); setWhOffset(0) }}
        okText="Save"
        width={400}
      >
        <div style={{ padding: '12px 0' }}>
          <Text style={{ fontSize: 'var(--fs-sm)', color: '#666', display: 'block', marginBottom: 8 }}>
            Adjust working hours for this line on specific dates. Applies to all orders on that line.
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <Text style={{ fontSize: 'var(--fs-sm)', display: 'block', marginBottom: 4 }}>Date Range</Text>
              <DatePicker.RangePicker value={whRange} onChange={setWhRange} style={{ width: '100%' }} />
            </div>
            <div>
              <Text style={{ fontSize: 'var(--fs-sm)', display: 'block', marginBottom: 4 }}>Offset (hours, e.g. +2 or -1)</Text>
              <InputNumber value={whOffset} onChange={setWhOffset} min={-12} max={12} step={0.5} style={{ width: '100%' }} prefix={whOffset >= 0 ? '+' : ''} />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

