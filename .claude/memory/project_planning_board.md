---
name: project-planning-board
description: Full state of the Planning Board feature — files, DB, design decisions, component map
metadata:
  type: project
---

Planning Board (`/planning`) — FastReactPlan-inspired Gantt for garment factories. Sewing lines as rows, order strips on a scrollable date axis.

## Files
- `frontend/src/pages/desktop/apps/PlanningBoardApp.jsx` — entire frontend (~1200 lines)
- `backend/app/routes/planning.py` — all API routes
- `backend/migrations/tenant_planning_setup.sql` — creates `production_lines` + `order_schedule`
- `backend/migrations/tenant_planning_datetime.sql` — ALTERs `planned_start`/`planned_end` to `TIMESTAMP`
- `backend/migrations/tenant_planning_hours.sql` — creates `order_schedule_hours` table
- `backend/migrations/tenant_planning_daily_view.sql` — creates `order_schedule_daily` view
- `backend/migrations/tenant_planning_calendar.sql` — creates `factory_calendars`, `calendar_working_days`, `calendar_holidays`; adds `calendar_id` FK to `production_lines`

All migration files are in `_TENANT_SQL_FILES` in `tenant_schema.py` (in order).

## Database Tables & Views
```sql
production_lines      (id, name, machines_count, working_hours, efficiency_pct, is_active, display_order)
order_schedule        (id, order_id, line_id, planned_start TIMESTAMP, planned_end TIMESTAMP, planned_qty, smv, notes)
order_schedule_hours  (id, schedule_id FK→order_schedule CASCADE, hour_start TIMESTAMP, planned_qty DECIMAL(12,4))
order_schedule_daily  VIEW — aggregates order_schedule_hours by calendar date
                      columns: schedule_id, order_id, line_id, plan_date DATE, planned_qty
```

`planned_start`/`planned_end` are `TIMESTAMP` (not DATE) — hour-precision scheduling.
`order_schedule_hours` is populated/replaced atomically on every POST/PATCH via `_generate_hour_breakdown()`.
`order_schedule_daily` is a `CREATE OR REPLACE VIEW` — always in sync, no code needed, idempotent.

## Planning API Endpoints
```
GET  /planning/lines                      list production lines
POST /planning/lines                      create line
PATCH/DELETE /planning/lines/{id}         update / deactivate

GET  /planning/schedule                   all scheduled orders (with line + capacity info)
POST /planning/schedule                   place order on a line
PATCH/DELETE /planning/schedule/{id}      move / unload order

GET  /planning/schedule/{id}/hours        hourly breakdown for one order
GET  /planning/schedule/{id}/daily        daily breakdown for one order (reads view)
GET  /planning/daily                      cross-line daily totals, optional ?start_date=&end_date=

GET  /planning/unscheduled               orders not yet scheduled (with calculated SMV)
```

## Capacity Formula
```
daily_capacity (pcs/day) = (machines × working_hours × 60 × efficiency%) / SMV
exact_days = planned_qty / daily_capacity          ← fractional, no ceil
planned_end = planned_start + timedelta(days=exact_days)
```
SMV comes from `style_version_steps` JOIN `processes` WHERE `planned=TRUE AND name LIKE '%sew%'`. Never from the line level.

## Key Design Rules (confirmed by user)
- **Strip width** = `(planned_end − planned_start) / 86400000 × colPx` — always from stored timestamps, NOT recalculated from capacity formula. Prevents visual overlap.
- **No rounding** — no `Math.round`, `Math.ceil`, or `+1` anywhere in position/width math.
- **No gap** between back-to-back strips — overlap shift snaps to `conflict.planned_end` exactly (no `+timedelta(days=1)`).
- **Drag overlay width** recalculates from target line capacity in real-time via `onDragOver` → `dragOverLineId` state.
- **Original block opacity** = 0 while dragging (not 0.4) so only the overlay is visible.

## Zoom Levels
```js
ZOOM_CONFIG = {
  quarter: { colPx: 10,  colsPerDay: 1,  viewDays: 182 },
  week:    { colPx: 36,  colsPerDay: 1,  viewDays: 42  },
  day:     { colPx: 80,  colsPerDay: 1,  viewDays: 14  },
  hour:    { colPx: 44,  colsPerDay: 24, viewDays: 4   },
}
```
Drop ID format: `line_{lineId}_dt_{datetimeStr}` (e.g. `line_2_dt_2026-06-15T07:00:00`).
Hour zoom: 24 `DayDropCell` per day. Day/week/quarter: 1 cell per day at `T00:00:00`.

## Layout Structure
```
Outer flex-column (height: 100%)
├── Toolbar bar (flexShrink:0) — Pending | Today | ‹› | Zoom−label+ | Row−N+ | Setup | Refresh
├── Gantt (flex:1, overflow:hidden)
│   └── DndContext
│       └── Scroll container
│           ├── Sticky header row (top:0, zIndex:10)
│           │   ├── Line panel label (sticky left:0, zIndex:20, background:#e4eef3, boxShadow)
│           │   ├── Resize handle (sticky left:linePanelW, zIndex:20)
│           │   └── ZoomTimeAxis
│           ├── Staging row (when staged orders present)
│           └── Line rows (one per production line)
│               ├── Line panel (sticky left:0, zIndex:20, background:#eaf2f6, boxShadow)
│               │   └── name + machine count — ONE LINE, no efficiency %, no capacity bar
│               ├── Resize handle spacer (sticky left:linePanelW)
│               └── Grid area (position:relative, height:rowHeight, overflow:hidden)
│                   ├── DayDropCell × N (droppable)
│                   ├── Today highlight
│                   └── OrderBlock × N (draggable, absolute positioned)
└── HoverInfoPanel (height:76, always visible, shows hovered strip details)
```

## Right-click Menu on Strip
- **Style** → `DetailDrawer` type='style': fetches order → gets version_id → fetches routing steps
- **Order** → `DetailDrawer` type='order': fetches order details + order lines
- **Unload** → DELETE schedule entry

## Planning Setup Modal (940px, left-tab layout)
Tabs: **Calendar** (full CRUD) | Plan Segment (placeholder) | **Plan Mc/Lines** (full CRUD) | Customer Profile (placeholder) | Line Skill Matrix (placeholder)

## State in Main Component
`rowHeight` (default 64, range 40–160, step 8) — adjustable via +/− toolbar buttons.
`linePanelW` (default 200, range 120–400) — resizable via drag handle.
`dragOverLineId` — tracks hovered line during drag for live overlay width.
`hoveredSched` — set on mouseenter of strip, cleared on mouseleave, shown in HoverInfoPanel.
`detailPanel` — `{ type, sched }` for the right-click Detail Drawer.
`stagedOrders` — orders selected in PendingOrdersModal waiting to be placed.
