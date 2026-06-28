---
name: feedback-planning-rules
description: Technical and UI rules confirmed during planning board development — do not violate these
metadata:
  type: feedback
---

## Strip Width Source of Truth
Use `(new Date(sched.planned_end) - new Date(sched.planned_start)) / 86400000` for rendered block width. Never recalculate from `qty / daily_capacity` for placed blocks.

**Why:** Independent recalculation diverges from stored `planned_end`, causing visual overlap even when the DB overlap check passes. The drag overlay can still use capacity formula (no stored end yet).

## No Rounding on Position / Width
No `Math.round`, `Math.ceil`, or `+1` anywhere in `blockLeft` or width calculations.

**Why:** User confirmed: "strip length should reflect actual time — if 3.4 days then 3.4 column widths." Rounding creates gaps or visual overlap.

## Overlap Shift — No Day Gap
`_find_available_start` must set `current_start = conflict["planned_end"]` (no `+ timedelta(days=1)`).

**Why:** User: "no gap if planned one after another." With timestamp precision, a +1 day shift wastes capacity.

## SMV Source — Style Routing Only
SMV comes from `style_version_steps` JOIN `processes` WHERE `planned=TRUE AND name LIKE '%sew%'`. Never defined at the line level.

**Why:** User explicitly: "Forget about 20 SMV — it will never be defined in line level."

## No Visual Gap Between Back-to-Back Strips
Block width = `exactDays × colPx` (no `- 2` subtracted). Strips that share an endpoint should share a border pixel.

**Why:** User: "remove the gap — there should not be any gap if planned one after another."

## Dragged Block Opacity = 0
When `isDragging`, the original block has `opacity: 0` (not `0.4`). Only the DragOverlay should be visible.

**Why:** User: "when I move a strip it should move entirely, not a shadow left behind."

## Line Panel Shows Name + Machines Only — One Line
Left panel contains only `{line.name}` (bold, ellipsis) + `{machines_count}m` (right-aligned), both on one horizontal row. No efficiency %, no capacity bar.

**Why:** User: "Line should only contain line name and machine — remove rest" and "make it in one line so it can decrease more."

## Routing Values — Never Summed
Routing Operations section title shows count only: "Routing Operations (N)". No total SMV.

**Why:** User: "does not make any sense — they are in different UOM."

## Detail Drawer — FieldCard Pattern
Use custom `FieldCard` (9px uppercase label above, 11px bold value below, #f8fafc background) + `FieldGrid` + `DrawerSectionTitle`. Do not use Ant Design `Descriptions bordered`.

**Why:** User found Descriptions visually hard to read — label and value were indistinguishable.

## Setup Opens as Modal, Not Page
Planning setup opens as `PlanningSetupModal` (940px modal with left-side tabs). The toolbar button is "Setup" (not "Lines").

**Why:** User: "Setup should open a new window."

## Derived Data — Use Views, Not Redundant Tables
When a dataset can be fully derived from an existing table by aggregation (e.g. daily qty from hourly rows), use a `CREATE OR REPLACE VIEW` rather than a separate physical table with populate/sync code.

**Why:** Views are always in sync, require zero application code to maintain, and `CREATE OR REPLACE VIEW` is idempotent — safe for `ensure_tenant_schema` re-runs. Physical tables introduce sync risk and extra backend logic for no real gain at typical planning volumes.

**How to apply:** `order_schedule_daily` is a view over `order_schedule_hours`. If a future "weekly summary" is needed, make it a view too.
