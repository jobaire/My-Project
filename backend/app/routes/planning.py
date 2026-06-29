"""
Production planning board — sewing line management and order scheduling.
"""
import json
from datetime import date as date_type, datetime, time, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, Body, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _daily_capacity(machines: int, hours: float, efficiency: float, smv: float) -> float:
    """SMV-based daily capacity in pieces (uniform — used for display/compat)."""
    if smv <= 0:
        return 0
    return (machines * hours * 60 * (efficiency / 100)) / smv


def _calc_end_datetime(start: datetime, planned_qty: int, daily_cap: float) -> datetime:
    """Exact (fractional) end datetime — no ceiling, preserves sub-day precision."""
    if daily_cap <= 0:
        return start
    exact_days = planned_qty / daily_cap
    return start + timedelta(days=exact_days)


def _get_non_working_set_for_line(db, line_id: int) -> set:
    """Returns set of ISO date strings that are non-working for a line's calendar."""
    row = db.execute(text("""
        SELECT fc.id AS cal_id
        FROM production_lines pl
        JOIN factory_calendars fc ON fc.id = pl.calendar_id
        WHERE pl.id = :lid
    """), {"lid": line_id}).first()
    if not row:
        return set()  # no calendar → assume all days are working

    cal_id = row[0]
    working_days = {r[0] for r in db.execute(
        text("SELECT day_of_week FROM calendar_working_days WHERE calendar_id = :cid"),
        {"cid": cal_id},
    ).all()}
    holidays = {str(r[0]) for r in db.execute(
        text("SELECT holiday_date FROM calendar_holidays WHERE calendar_id = :cid"),
        {"cid": cal_id},
    ).all()}

    non_working: set = set()
    d = date_type.today() - timedelta(days=30)
    end = date_type.today() + timedelta(days=365 * 3)
    while d <= end:
        if d.weekday() not in working_days or str(d) in holidays:
            non_working.add(str(d))
        d += timedelta(days=1)
    return non_working


def _get_wh_for_date(db, line_id: int, base_wh: float, date) -> float:
    """Effective working hours for a line on a date (calendar base + any day override)."""
    row = db.execute(text("""
        SELECT wh_offset FROM line_wh_overrides
        WHERE line_id = :lid AND start_date <= :dt AND end_date >= :dt
        ORDER BY id DESC LIMIT 1
    """), {"lid": line_id, "dt": date}).first()
    return max(0.0, base_wh + (float(row[0]) if row else 0.0))


def _get_lc_factor(db, lc_id, working_day: int) -> float:
    """Learning-curve efficiency multiplier (0–1) for the N-th working day of a schedule."""
    if not lc_id:
        return 1.0
    row = db.execute(text("""
        SELECT efficiency_pct FROM learning_curve_stages
        WHERE preset_id = :pid AND day_number <= :dn
        ORDER BY day_number DESC LIMIT 1
    """), {"pid": lc_id, "dn": working_day}).first()
    return float(row[0]) / 100.0 if row else 1.0


def _calc_planned_end_variable(
    db,
    planned_start: datetime,
    planned_qty: int,
    line_id: int,
    base_wh: float,
    mp: int,
    efficiency_pct: float,
    smv: float,
    lc_id,
    non_working_set: set,
    shift_start_h: float = 0,
) -> datetime:
    """Walk day-by-day with variable WH + learning curve to find exact planned_end."""
    if planned_qty <= 0 or smv <= 0:
        return planned_start

    start_h_frac = planned_start.hour + planned_start.minute / 60
    remaining = float(planned_qty)
    working_day = 0
    d = planned_start.date()
    last_date = d
    last_cap = 0.0
    last_available_h = base_wh
    first_day = True

    for _ in range(365 * 3):   # safety cap
        if remaining <= 0:
            break
        if str(d) in non_working_set:
            d += timedelta(days=1)
            continue
        working_day += 1
        wh = _get_wh_for_date(db, line_id, base_wh, d)
        if wh <= 0:
            d += timedelta(days=1)
            continue
        lc = _get_lc_factor(db, lc_id, working_day)
        if first_day:
            available_h = max(0.0, shift_start_h + wh - start_h_frac)
            first_day = False
        else:
            available_h = wh
        cap = (mp * available_h * 60 * (efficiency_pct / 100) * lc) / smv
        if cap <= 0:
            d += timedelta(days=1)
            continue
        remaining -= cap
        last_date = d
        last_cap = cap
        last_available_h = available_h
        d += timedelta(days=1)

    if last_cap <= 0:
        return planned_start

    # Fraction of available hours on last day actually used
    fraction = 1.0 + remaining / last_cap   # remaining <= 0 here
    hours_used = fraction * last_available_h
    if last_date == planned_start.date():
        # Strip fits within the starting day — offset from the exact planned_start time
        end_dt = planned_start + timedelta(hours=hours_used)
    else:
        # Last day starts at shift start
        end_dt = datetime.combine(last_date, time(int(shift_start_h), int((shift_start_h % 1) * 60))) + timedelta(hours=hours_used)
    return end_dt


def _generate_hour_breakdown(
    db,
    schedule_id: int,
    planned_start: datetime,
    planned_end: datetime,
    planned_qty: int,
) -> None:
    """Delete and re-insert proportional hourly rows.
    Does NOT commit — caller commits to keep schedule + hours in one transaction."""
    db.execute(
        text("DELETE FROM order_schedule_hours WHERE schedule_id = :sid"),
        {"sid": schedule_id},
    )
    total_secs = (planned_end - planned_start).total_seconds()
    if total_secs <= 0 or planned_qty <= 0:
        return

    pps = planned_qty / total_secs   # pieces per second
    rows: list[tuple] = []
    current = planned_start
    while current < planned_end:
        next_hour = current.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
        bucket_end = min(next_hour, planned_end)
        qty = pps * (bucket_end - current).total_seconds()
        rows.append((current.replace(minute=0, second=0, microsecond=0), qty))
        current = next_hour

    # Single multi-row INSERT
    placeholders = ", ".join(f"(:sid, :h{i}, :q{i})" for i in range(len(rows)))
    params: dict = {"sid": schedule_id}
    for i, (h, q) in enumerate(rows):
        params[f"h{i}"] = h
        params[f"q{i}"] = q
    db.execute(
        text(
            f"INSERT INTO order_schedule_hours (schedule_id, hour_start, planned_qty) "
            f"VALUES {placeholders}"
        ),
        params,
    )


def _generate_hour_breakdown_bg(tenant_id: int, schedule_id: int, planned_start: datetime, planned_end: datetime, planned_qty: int) -> None:
    """Background-safe version of _generate_hour_breakdown — opens its own DB session."""
    from app.services.tenant_manager import get_tenant_db
    db = get_tenant_db(tenant_id)
    try:
        _generate_hour_breakdown(db, schedule_id, planned_start, planned_end, planned_qty)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def _get_line_or_404(db, line_id: int) -> dict:
    row = db.execute(
        text("""
            SELECT pl.*,
                   COALESCE(fc.shift_hours, pl.working_hours) AS effective_working_hours,
                   COALESCE(EXTRACT(HOUR FROM fc.start_time)::int, 0) AS effective_shift_start
            FROM production_lines pl
            LEFT JOIN factory_calendars fc ON fc.id = pl.calendar_id
            WHERE pl.id = :id
        """),
        {"id": line_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Production line not found")
    return dict(row)


# ── Schemas ───────────────────────────────────────────────────────────────────

class LineCreate(BaseModel):
    name: str = Field(default='Line', min_length=1, max_length=100)
    plan_unit_id: Optional[int] = None
    calendar_id: Optional[int] = None
    is_subtotal: bool = False
    machines_count: int = Field(default=40, ge=0)
    working_hours: float = Field(default=8.0, ge=0.5, le=24.0)
    efficiency_pct: float = Field(default=100.0, ge=1.0, le=100.0)
    external_id: Optional[str] = None
    display_order: int = Field(default=0)


class LineUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    machines_count: Optional[int] = Field(None, ge=1)
    working_hours: Optional[float] = Field(None, ge=0.5, le=24.0)
    efficiency_pct: Optional[float] = Field(None, ge=1.0, le=100.0)
    external_id: Optional[str] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None
    calendar_id: Optional[int] = None
    plan_unit_id: Optional[int] = None


class PlanUnitCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    display_order: int = Field(default=0)


class CalendarCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    shift_hours: float = Field(default=8.0, ge=0.5, le=24.0)
    working_days: list[int] = Field(default=[0, 1, 2, 3, 4, 5])  # 0=Mon … 6=Sun
    start_time: str = Field(default="08:00")                      # "HH:MM" shift start


class CalendarUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    shift_hours: Optional[float] = Field(None, ge=0.5, le=24.0)
    working_days: Optional[list[int]] = None
    start_time: Optional[str] = None


class HolidayCreate(BaseModel):
    holiday_date: Optional[str] = None   # "YYYY-MM-DD" single date
    start_date:   Optional[str] = None   # date range start
    end_date:     Optional[str] = None   # date range end
    name:         Optional[str] = None


class ScheduleCreate(BaseModel):
    order_id: int
    order_line_id: Optional[int] = None
    line_id: int
    planned_start: datetime        # full datetime — supports any hour
    planned_qty: int = Field(ge=0)
    smv: float = Field(default=20.0, ge=0.1)
    notes: Optional[str] = None
    manpower: Optional[int] = Field(None, ge=1)
    learning_curve_id: Optional[int] = None
    keep_separate: bool = False


class ScheduleUpdate(BaseModel):
    line_id: Optional[int] = None
    planned_start: Optional[datetime] = None   # full datetime
    planned_qty: Optional[int] = Field(None, ge=0)
    smv: Optional[float] = Field(None, ge=0.1)
    notes: Optional[str] = None
    manpower: Optional[int] = Field(None, ge=1)
    learning_curve_id: Optional[int] = None
    keep_separate: Optional[bool] = None


class BulkScheduleItem(BaseModel):
    id: int
    line_id: int
    planned_start: datetime
    planned_end: Optional[datetime] = None
    planned_qty: int
    keep_separate: bool = False
    manpower: Optional[int] = Field(None, ge=1)


class BulkCreateItem(BaseModel):
    tmp_id: str
    order_id: int
    order_line_id: Optional[int] = None
    line_id: int
    planned_start: datetime
    planned_end: Optional[datetime] = None
    planned_qty: int
    smv: float = Field(default=20.0, ge=0.1)
    manpower: Optional[int] = Field(None, ge=1)
    learning_curve_id: Optional[int] = None
    keep_separate: bool = False


class BulkSchedulePayload(BaseModel):
    updates: list[BulkScheduleItem] = []
    creates: list[BulkCreateItem] = []
    deletes: list[int] = []


# ── Production Lines ──────────────────────────────────────────────────────────

@router.get("/lines")
def list_lines(request: Request):
    db = request.state.db
    rows = db.execute(
        text("""
            SELECT pl.*,
                   COALESCE(fc.shift_hours, pl.working_hours) AS eff_wh,
                   fc.start_time AS raw_start_time,
                   COALESCE(
                     (SELECT json_agg(json_build_object(
                                'id', cb.id,
                                'break_start', cb.break_start,
                                'break_duration', cb.break_duration)
                              ORDER BY cb.break_start)
                      FROM calendar_breaks cb WHERE cb.calendar_id = pl.calendar_id),
                     '[]'::json
                   ) AS calendar_breaks,
                   COALESCE(
                     (SELECT json_agg(json_build_object(
                                'id', wo.id,
                                'start_date', wo.start_date,
                                'end_date', wo.end_date,
                                'wh_offset', wo.wh_offset,
                                'notes', wo.notes)
                              ORDER BY wo.start_date)
                      FROM line_wh_overrides wo WHERE wo.line_id = pl.id),
                     '[]'::json
                   ) AS wh_overrides,
                   COALESCE(
                     (SELECT json_agg(cwd.day_of_week ORDER BY cwd.day_of_week)
                      FROM calendar_working_days cwd WHERE cwd.calendar_id = pl.calendar_id),
                     '[]'::json
                   ) AS calendar_working_days
            FROM production_lines pl
            LEFT JOIN factory_calendars fc ON fc.id = pl.calendar_id
            ORDER BY pl.display_order, pl.name
        """)
    ).mappings().all()
    result = []
    for r in rows:
        d = dict(r)
        d["working_hours"] = float(d.pop("eff_wh"))
        st = d.pop("raw_start_time", None)
        d["calendar_start_time"] = str(st)[:5] if st else None   # "HH:MM" or None
        for field in ("calendar_breaks", "wh_overrides", "calendar_working_days"):
            val = d.get(field)
            if val is None:
                d[field] = []
            elif isinstance(val, str):
                d[field] = json.loads(val)
        result.append(d)
    return result


@router.post("/lines", status_code=status.HTTP_201_CREATED)
def create_line(payload: LineCreate, request: Request):
    db = request.state.db
    if payload.is_subtotal and payload.plan_unit_id is not None:
        existing = db.execute(
            text("SELECT id FROM production_lines WHERE plan_unit_id = :pu AND is_subtotal = TRUE"),
            {"pu": payload.plan_unit_id},
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="A subtotal row already exists for this plan unit")
    row = db.execute(
        text("""
            INSERT INTO production_lines (name, machines_count, working_hours, efficiency_pct,
                                          external_id, display_order, plan_unit_id, is_subtotal, calendar_id)
            VALUES (:name, :mc, :wh, :eff, :ext, :do, :pu, :sub, :cal)
            RETURNING *
        """),
        {"name": payload.name, "mc": payload.machines_count,
         "wh": payload.working_hours, "eff": payload.efficiency_pct,
         "ext": payload.external_id, "do": payload.display_order,
         "pu": payload.plan_unit_id, "sub": payload.is_subtotal,
         "cal": payload.calendar_id},
    ).mappings().first()
    db.commit()
    return dict(row)


@router.patch("/lines/{line_id}")
def update_line(line_id: int, payload: LineUpdate, request: Request):
    db = request.state.db
    _get_line_or_404(db, line_id)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return _get_line_or_404(db, line_id)
    col_map = {"machines_count": "mc", "working_hours": "wh",
               "efficiency_pct": "eff", "display_order": "do",
               "is_active": "ia", "name": "nm", "calendar_id": "cal",
               "external_id": "ext", "plan_unit_id": "pu"}
    set_parts = []
    params: dict = {"id": line_id}
    for col, val in updates.items():
        alias = col_map.get(col, col)
        set_parts.append(f"{col} = :{alias}")
        params[alias] = val
    db.execute(
        text(f"UPDATE production_lines SET {', '.join(set_parts)} WHERE id = :id"),
        params,
    )
    db.commit()
    return _get_line_or_404(db, line_id)


@router.delete("/lines/{line_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_line(line_id: int, request: Request):
    db = request.state.db
    _get_line_or_404(db, line_id)
    db.execute(
        text("UPDATE production_lines SET is_active = FALSE WHERE id = :id"),
        {"id": line_id},
    )
    db.commit()


# ── WH Overrides ─────────────────────────────────────────────────────────────

class WHOverrideCreate(BaseModel):
    start_date: str   # "YYYY-MM-DD"
    end_date: str
    wh_offset: float
    notes: Optional[str] = None


@router.get("/lines/{line_id}/wh-overrides")
def list_wh_overrides(line_id: int, request: Request):
    db = request.state.db
    _get_line_or_404(db, line_id)
    rows = db.execute(
        text("SELECT id, start_date, end_date, wh_offset, notes FROM line_wh_overrides WHERE line_id = :lid ORDER BY start_date"),
        {"lid": line_id},
    ).mappings().all()
    return [{"id": r["id"], "start_date": str(r["start_date"]), "end_date": str(r["end_date"]),
             "wh_offset": float(r["wh_offset"]), "notes": r["notes"]} for r in rows]


@router.post("/lines/{line_id}/wh-overrides", status_code=status.HTTP_201_CREATED)
def add_wh_override(line_id: int, payload: WHOverrideCreate, request: Request):
    db = request.state.db
    line = _get_line_or_404(db, line_id)
    row = db.execute(
        text("""INSERT INTO line_wh_overrides (line_id, start_date, end_date, wh_offset, notes)
                VALUES (:lid, :sd, :ed, :wo, :notes) RETURNING id, start_date, end_date, wh_offset, notes"""),
        {"lid": line_id, "sd": payload.start_date, "ed": payload.end_date,
         "wh_offset": payload.wh_offset, "notes": payload.notes},
    ).mappings().first()
    db.commit()

    # Recalculate planned_end for all schedules on this line that overlap the date range
    _recalc_schedules_for_line(db, line_id, payload.start_date, payload.end_date)

    return {"id": row["id"], "start_date": str(row["start_date"]), "end_date": str(row["end_date"]),
            "wh_offset": float(row["wh_offset"]), "notes": row["notes"]}


@router.delete("/lines/{line_id}/wh-overrides/{override_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_wh_override(line_id: int, override_id: int, request: Request):
    db = request.state.db
    ov = db.execute(
        text("DELETE FROM line_wh_overrides WHERE id = :id AND line_id = :lid RETURNING start_date, end_date"),
        {"id": override_id, "lid": line_id},
    ).mappings().first()
    if not ov:
        raise HTTPException(status_code=404, detail="Override not found")
    db.commit()
    _recalc_schedules_for_line(db, line_id, str(ov["start_date"]), str(ov["end_date"]))


def _recalc_schedules_for_line(db, line_id: int, from_date: str, to_date: str):
    """Recalculate planned_end for all schedules on line_id that overlap [from_date, to_date]."""
    line = _get_line_or_404(db, line_id)
    base_wh = float(line.get("effective_working_hours") or line["working_hours"])
    non_working = _get_non_working_set_for_line(db, line_id)

    scheds = db.execute(
        text("""SELECT os.*, s.smv_seconds / 60.0 AS smv_min
                FROM order_schedule os
                JOIN orders o ON os.order_id = o.id
                JOIN styles s ON o.style_id = s.id
                WHERE os.line_id = :lid
                  AND os.planned_start::date <= :to_date::date
                  AND os.planned_end::date   >= :from_date::date"""),
        {"lid": line_id, "from_date": from_date, "to_date": to_date},
    ).mappings().all()

    shift_start = int(line.get("effective_shift_start") or 0)
    for s in scheds:
        mp = int(s["manpower"]) if s.get("manpower") else line["machines_count"]
        smv = float(s["smv_min"]) if s.get("smv_min") else 0
        if smv <= 0:
            continue
        new_end = _calc_planned_end_variable(
            db, s["planned_start"], float(s["planned_qty"]), line_id, base_wh,
            mp, float(line["efficiency_pct"]), smv, s.get("learning_curve_id"), non_working,
            shift_start_h=shift_start,
        )
        db.execute(
            text("UPDATE order_schedule SET planned_end = :pe WHERE id = :id"),
            {"pe": new_end, "id": s["id"]},
        )
    db.commit()


# ── Learning Curve Presets ────────────────────────────────────────────────────

class LCStage(BaseModel):
    day_number: int
    efficiency_pct: float


class LCCreate(BaseModel):
    name: str
    stages: list[LCStage] = []


class LCUpdate(BaseModel):
    name: Optional[str] = None
    stages: Optional[list[LCStage]] = None


@router.get("/learning-curves")
def list_learning_curves(request: Request):
    db = request.state.db
    rows = db.execute(text("""
        SELECT lcp.id, lcp.name, lcs.day_number, lcs.efficiency_pct
        FROM learning_curve_presets lcp
        LEFT JOIN learning_curve_stages lcs ON lcs.preset_id = lcp.id
        ORDER BY lcp.name, lcs.day_number
    """)).mappings().all()
    presets: dict = {}
    for r in rows:
        pid = r["id"]
        if pid not in presets:
            presets[pid] = {"id": pid, "name": r["name"], "stages": []}
        if r["day_number"] is not None:
            presets[pid]["stages"].append({"day_number": r["day_number"], "efficiency_pct": float(r["efficiency_pct"])})
    return list(presets.values())


@router.post("/learning-curves", status_code=status.HTTP_201_CREATED)
def create_learning_curve(payload: LCCreate, request: Request):
    db = request.state.db
    row = db.execute(
        text("INSERT INTO learning_curve_presets (name) VALUES (:name) RETURNING id, name"),
        {"name": payload.name},
    ).mappings().first()
    preset_id = row["id"]
    for s in payload.stages:
        db.execute(
            text("INSERT INTO learning_curve_stages (preset_id, day_number, efficiency_pct) VALUES (:pid, :dn, :ep)"),
            {"pid": preset_id, "dn": s.day_number, "ep": s.efficiency_pct},
        )
    db.commit()
    stages = db.execute(
        text("SELECT day_number, efficiency_pct FROM learning_curve_stages WHERE preset_id = :pid ORDER BY day_number"),
        {"pid": preset_id},
    ).mappings().all()
    return {"id": preset_id, "name": row["name"],
            "stages": [{"day_number": r["day_number"], "efficiency_pct": float(r["efficiency_pct"])} for r in stages]}


@router.patch("/learning-curves/{lc_id}")
def update_learning_curve(lc_id: int, payload: LCUpdate, request: Request):
    db = request.state.db
    existing = db.execute(text("SELECT id FROM learning_curve_presets WHERE id = :id"), {"id": lc_id}).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Learning curve not found")
    if payload.name is not None:
        db.execute(text("UPDATE learning_curve_presets SET name = :n WHERE id = :id"), {"n": payload.name, "id": lc_id})
    if payload.stages is not None:
        db.execute(text("DELETE FROM learning_curve_stages WHERE preset_id = :pid"), {"pid": lc_id})
        for s in payload.stages:
            db.execute(
                text("INSERT INTO learning_curve_stages (preset_id, day_number, efficiency_pct) VALUES (:pid, :dn, :ep)"),
                {"pid": lc_id, "dn": s.day_number, "ep": s.efficiency_pct},
            )
    db.commit()
    stages = db.execute(
        text("SELECT day_number, efficiency_pct FROM learning_curve_stages WHERE preset_id = :pid ORDER BY day_number"),
        {"pid": lc_id},
    ).mappings().all()
    name_row = db.execute(text("SELECT name FROM learning_curve_presets WHERE id = :id"), {"id": lc_id}).first()
    return {"id": lc_id, "name": name_row[0],
            "stages": [{"day_number": r["day_number"], "efficiency_pct": float(r["efficiency_pct"])} for r in stages]}


@router.delete("/learning-curves/{lc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_learning_curve(lc_id: int, request: Request):
    db = request.state.db
    result = db.execute(
        text("DELETE FROM learning_curve_presets WHERE id = :id RETURNING id"),
        {"id": lc_id},
    ).first()
    if not result:
        raise HTTPException(status_code=404, detail="Learning curve not found")
    db.commit()


# ── Plan Units ───────────────────────────────────────────────────────────────

@router.get("/plan-units")
def list_plan_units(request: Request):
    db = request.state.db
    rows = db.execute(text("SELECT * FROM plan_units ORDER BY display_order, name")).mappings().all()
    result = []
    for r in rows:
        editors = db.execute(
            text("SELECT user_email FROM plan_unit_editors WHERE unit_id = :uid ORDER BY user_email"),
            {"uid": r["id"]},
        ).scalars().all()
        result.append({**dict(r), "editors": list(editors)})
    return result

@router.post("/plan-units", status_code=status.HTTP_201_CREATED)
def create_plan_unit(payload: PlanUnitCreate, request: Request):
    db = request.state.db
    row = db.execute(
        text("INSERT INTO plan_units (name, display_order) VALUES (:name, :do) RETURNING *"),
        {"name": payload.name, "do": payload.display_order},
    ).mappings().first()
    db.commit()
    return dict(row)

class PlanUnitUpdate(BaseModel):
    display_order: Optional[int] = None
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)

@router.patch("/plan-units/{unit_id}")
def update_plan_unit(unit_id: int, payload: PlanUnitUpdate, request: Request):
    db = request.state.db
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    parts = [f"{col} = :{col}" for col in updates]
    updates["unit_id"] = unit_id
    row = db.execute(
        text(f"UPDATE plan_units SET {', '.join(parts)} WHERE id = :unit_id RETURNING *"),
        updates,
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Plan unit not found")
    db.commit()
    return dict(row)


@router.delete("/plan-units/{unit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan_unit(unit_id: int, request: Request):
    db = request.state.db
    db.execute(text("UPDATE production_lines SET plan_unit_id = NULL WHERE plan_unit_id = :id"), {"id": unit_id})
    db.execute(text("DELETE FROM plan_units WHERE id = :id"), {"id": unit_id})
    db.commit()


@router.put("/plan-units/{unit_id}/editors", status_code=status.HTTP_204_NO_CONTENT)
def set_unit_editors(unit_id: int, request: Request, emails: list[str] = Body(...)):
    db = request.state.db
    if not db.execute(text("SELECT id FROM plan_units WHERE id = :id"), {"id": unit_id}).first():
        raise HTTPException(status_code=404, detail="Plan unit not found")
    db.execute(text("DELETE FROM plan_unit_editors WHERE unit_id = :uid"), {"uid": unit_id})
    for email in emails:
        db.execute(
            text("INSERT INTO plan_unit_editors (unit_id, user_email) VALUES (:uid, :email)"),
            {"uid": unit_id, "email": email},
        )
    db.commit()


def _actor(request) -> str:
    return request.state.user.get("email") or request.state.user.get("sub")


def _check_unit_permission(db, line_id: int, actor: str) -> None:
    """Raises 403 if actor cannot edit the plan unit that owns this line."""
    row = db.execute(
        text("SELECT plan_unit_id FROM production_lines WHERE id = :lid"),
        {"lid": line_id},
    ).first()
    if not row or not row[0]:
        return
    unit_id = row[0]
    if not db.execute(
        text("SELECT 1 FROM plan_unit_editors WHERE unit_id = :uid LIMIT 1"),
        {"uid": unit_id},
    ).first():
        return  # no editors defined — anyone can edit
    if not db.execute(
        text("SELECT 1 FROM plan_unit_editors WHERE unit_id = :uid AND user_email = :usr LIMIT 1"),
        {"uid": unit_id, "usr": actor},
    ).first():
        raise HTTPException(status_code=403, detail="You are not assigned to this segment")


# ── Schedule ──────────────────────────────────────────────────────────────────

def _find_available_start(
    db, line_id: int, desired_start: datetime, duration_seconds: float, exclude_id: int | None = None
) -> datetime:
    """
    Find the earliest start datetime on line_id where the duration fits without
    overlapping any existing block.  If the desired_start is free, returns it
    unchanged. Otherwise shifts to immediately after the conflicting strip.
    """
    current_start = desired_start
    for _ in range(500):   # safety cap
        current_end = current_start + timedelta(seconds=duration_seconds)
        conflict = db.execute(
            text("""
                SELECT planned_end
                FROM order_schedule
                WHERE line_id = :lid
                  AND planned_start < :end
                  AND planned_end   > :start
                  AND (:exclude IS NULL OR id != :exclude)
                ORDER BY planned_end DESC
                LIMIT 1
            """),
            {"lid": line_id, "start": current_start, "end": current_end, "exclude": exclude_id},
        ).mappings().first()
        if not conflict:
            return current_start   # free slot found
        current_start = conflict["planned_end"]   # start exactly when the conflict ends
    return current_start


def _schedule_row_to_dict(row: dict, line: dict) -> dict:
    eff_wh = float(line.get("effective_working_hours") or line["working_hours"])
    mp = int(row["manpower"]) if row.get("manpower") else line["machines_count"]
    daily_cap = _daily_capacity(mp, eff_wh, float(line["efficiency_pct"]), float(row["smv"]))
    return {**dict(row), "daily_capacity": daily_cap}


@router.get("/schedule")
def get_schedule(request: Request,
                 start_date: Optional[datetime] = None,
                 end_date: Optional[datetime] = None):
    db = request.state.db
    conditions = []
    params: dict = {}
    if start_date:
        conditions.append("os.planned_end >= :start")
        params["start"] = start_date
    if end_date:
        conditions.append("os.planned_start <= :end")
        params["end"] = end_date
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    rows = db.execute(
        text(f"""
            SELECT os.*, o.name AS order_name, o.status AS order_status,
                   o.customer_id, cu.name AS customer_name, cu.customer_group,
                   o.product_id, p.name AS product_name,
                   pl.name AS line_name, pl.machines_count, pl.efficiency_pct,
                   COALESCE(fc.shift_hours, pl.working_hours) AS working_hours,
                   ol.delivery_date, ol.line_number, ol.delivery_qty AS order_qty,
                   co.name AS color_name
            FROM order_schedule os
            JOIN orders o ON o.id = os.order_id
            LEFT JOIN customers cu ON cu.id = o.customer_id
            LEFT JOIN products p ON p.id = o.product_id
            JOIN production_lines pl ON pl.id = os.line_id
            LEFT JOIN factory_calendars fc ON fc.id = pl.calendar_id
            LEFT JOIN order_lines ol ON ol.id = COALESCE(
                os.order_line_id,
                (SELECT id FROM order_lines WHERE order_id = os.order_id ORDER BY line_number LIMIT 1)
            )
            LEFT JOIN colors co ON co.id = ol.color_id
            {where}
            ORDER BY os.planned_start, pl.display_order
        """),
        params,
    ).mappings().all()

    result = []
    for r in rows:
        d = dict(r)
        mp = int(d["manpower"]) if d.get("manpower") else d["machines_count"]
        d["daily_capacity"] = _daily_capacity(mp, float(d["working_hours"]), float(d["efficiency_pct"]), float(d["smv"]))
        result.append(d)
    return result


@router.post("/schedule", status_code=status.HTTP_201_CREATED)
def schedule_order(payload: ScheduleCreate, request: Request, background_tasks: BackgroundTasks):
    db = request.state.db

    # Check line exists
    line = _get_line_or_404(db, payload.line_id)
    _check_unit_permission(db, payload.line_id, _actor(request))

    # Check order exists
    order = db.execute(
        text("SELECT id FROM orders WHERE id = :id"), {"id": payload.order_id}
    ).mappings().first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    mp     = payload.manpower if payload.manpower else line["machines_count"]
    lc_id  = payload.learning_curve_id
    nw_set = _get_non_working_set_for_line(db, payload.line_id)

    # Calculate planned_end using variable capacity (WH overrides + learning curve)
    shift_start = int(line.get("effective_shift_start") or 0)
    planned_end = _calc_planned_end_variable(
        db, payload.planned_start, payload.planned_qty,
        payload.line_id, float(line["effective_working_hours"]),
        mp, float(line["efficiency_pct"]), payload.smv, lc_id, nw_set,
        shift_start_h=shift_start,
    )

    duration_secs = (planned_end - payload.planned_start).total_seconds()
    actual_start = _find_available_start(db, payload.line_id, payload.planned_start, duration_secs, exclude_id=None)
    if actual_start != payload.planned_start:
        planned_end = _calc_planned_end_variable(
            db, actual_start, payload.planned_qty,
            payload.line_id, float(line["effective_working_hours"]),
            mp, float(line["efficiency_pct"]), payload.smv, lc_id, nw_set,
            shift_start_h=shift_start,
        )
    planned_start = actual_start

    row = db.execute(
        text("""
            INSERT INTO order_schedule
                (order_id, order_line_id, line_id, planned_start, planned_end,
                 planned_qty, smv, notes, manpower, learning_curve_id, keep_separate)
            VALUES (:oid, :olid, :lid, :ps, :pe, :pq, :smv, :notes, :mp, :lc, :ks)
            RETURNING *
        """),
        {
            "oid": payload.order_id, "olid": payload.order_line_id,
            "lid": payload.line_id,
            "ps": planned_start, "pe": planned_end,
            "pq": payload.planned_qty, "smv": payload.smv,
            "notes": payload.notes,
            "mp": payload.manpower,
            "lc": lc_id,
            "ks": payload.keep_separate,
        },
    ).mappings().first()

    db.commit()
    tenant_id = int(request.state.user.get("tenant_id"))
    background_tasks.add_task(_generate_hour_breakdown_bg, tenant_id, row["id"], planned_start, planned_end, payload.planned_qty)
    result = dict(row)
    result["daily_capacity"] = _daily_capacity(mp, float(line["effective_working_hours"]), float(line["efficiency_pct"]), payload.smv)
    return result


@router.patch("/schedule/bulk")
def bulk_save_schedules(payload: BulkSchedulePayload, request: Request, background_tasks: BackgroundTasks):
    db = request.state.db
    tenant_id = int(request.state.user.get("tenant_id"))
    actor = _actor(request)
    results: dict = {"updated": [], "created": [], "deleted": []}
    nw_cache: dict = {}  # line_id → non-working set; computed once per line per request

    for sid in payload.deletes:
        db.execute(text("DELETE FROM order_schedule WHERE id = :id"), {"id": sid})
        results["deleted"].append(sid)

    for item in payload.updates:
        existing = db.execute(
            text("""
                SELECT os.*, pl.machines_count, pl.efficiency_pct,
                       COALESCE(fc.shift_hours, pl.working_hours) AS effective_working_hours,
                       COALESCE(EXTRACT(HOUR FROM fc.start_time)::int, 0) AS effective_shift_start
                FROM order_schedule os
                JOIN production_lines pl ON pl.id = os.line_id
                LEFT JOIN factory_calendars fc ON fc.id = pl.calendar_id
                WHERE os.id = :id
            """),
            {"id": item.id},
        ).mappings().first()
        if not existing:
            continue
        _check_unit_permission(db, item.line_id, actor)
        lc_id = existing["learning_curve_id"]
        smv = float(existing["smv"])
        # Resolve line params; use item.manpower if provided, otherwise existing, capped at line machines_count
        if item.line_id != existing["line_id"]:
            target_line = _get_line_or_404(db, item.line_id)
            line_mc     = target_line["machines_count"]
            line_wh     = float(target_line["effective_working_hours"])
            line_eff    = float(target_line["efficiency_pct"])
            shift_start = int(target_line.get("effective_shift_start") or 0)
        else:
            line_mc     = existing["machines_count"]
            line_wh     = float(existing["effective_working_hours"])
            line_eff    = float(existing["efficiency_pct"])
            shift_start = int(existing.get("effective_shift_start") or 0)
        raw_mp  = item.manpower if "manpower" in item.model_fields_set else existing.get("manpower")
        mp      = min(raw_mp, line_mc) if raw_mp else line_mc
        if item.planned_end:
            planned_end = item.planned_end
        else:
            if item.line_id not in nw_cache:
                nw_cache[item.line_id] = _get_non_working_set_for_line(db, item.line_id)
            planned_end = _calc_planned_end_variable(
                db, item.planned_start, item.planned_qty, item.line_id,
                line_wh, mp, line_eff, smv, lc_id, nw_cache[item.line_id],
                shift_start_h=shift_start,
            )
        db.execute(
            text("""
                UPDATE order_schedule
                SET line_id=:lid, planned_start=:ps, planned_end=:pe,
                    planned_qty=:pq, keep_separate=:ks, manpower=:mp
                WHERE id=:id
            """),
            {"lid": item.line_id, "ps": item.planned_start, "pe": planned_end,
             "pq": item.planned_qty, "ks": item.keep_separate,
             "mp": raw_mp, "id": item.id},
        )
        background_tasks.add_task(_generate_hour_breakdown_bg, tenant_id, item.id, item.planned_start, planned_end, item.planned_qty)
        results["updated"].append({
            "id": item.id, "planned_end": planned_end.isoformat(),
            "daily_capacity": _daily_capacity(mp, line_wh, line_eff, smv),
        })

    for item in payload.creates:
        _check_unit_permission(db, item.line_id, actor)
        order = db.execute(text("SELECT id FROM orders WHERE id = :id"), {"id": item.order_id}).mappings().first()
        if not order:
            continue
        line = _get_line_or_404(db, item.line_id)
        mp = item.manpower if item.manpower else line["machines_count"]
        lc_id = item.learning_curve_id
        if item.planned_end:
            planned_end = item.planned_end
        else:
            if item.line_id not in nw_cache:
                nw_cache[item.line_id] = _get_non_working_set_for_line(db, item.line_id)
            shift_start = int(line.get("effective_shift_start") or 0)
            planned_end = _calc_planned_end_variable(
                db, item.planned_start, item.planned_qty, item.line_id,
                float(line["effective_working_hours"]),
                mp, float(line["efficiency_pct"]), item.smv, lc_id, nw_cache[item.line_id],
                shift_start_h=shift_start,
            )
        row = db.execute(
            text("""
                INSERT INTO order_schedule
                    (order_id, order_line_id, line_id, planned_start, planned_end,
                     planned_qty, smv, manpower, learning_curve_id, keep_separate)
                VALUES (:oid, :olid, :lid, :ps, :pe, :pq, :smv, :mp, :lc, :ks)
                RETURNING *
            """),
            {"oid": item.order_id, "olid": item.order_line_id, "lid": item.line_id,
             "ps": item.planned_start, "pe": planned_end, "pq": item.planned_qty,
             "smv": item.smv, "mp": item.manpower, "lc": lc_id, "ks": item.keep_separate},
        ).mappings().first()
        background_tasks.add_task(_generate_hour_breakdown_bg, tenant_id, row["id"], item.planned_start, planned_end, item.planned_qty)
        sched = dict(row)
        sched["daily_capacity"] = _daily_capacity(mp, float(line["effective_working_hours"]), float(line["efficiency_pct"]), item.smv)
        results["created"].append({"tmp_id": item.tmp_id, "schedule": sched})

    db.commit()
    return results


@router.patch("/schedule/{schedule_id}")
def update_schedule(schedule_id: int, payload: ScheduleUpdate, request: Request, background_tasks: BackgroundTasks):
    db = request.state.db

    existing = db.execute(
        text("""
            SELECT os.*, pl.machines_count, pl.working_hours, pl.efficiency_pct,
                   COALESCE(fc.shift_hours, pl.working_hours) AS effective_working_hours
            FROM order_schedule os
            JOIN production_lines pl ON pl.id = os.line_id
            LEFT JOIN factory_calendars fc ON fc.id = pl.calendar_id
            WHERE os.id = :id
        """),
        {"id": schedule_id},
    ).mappings().first()
    if not existing:
        raise HTTPException(status_code=404, detail="Schedule entry not found")

    # Merge updates
    line_id       = payload.line_id or existing["line_id"]
    planned_start = payload.planned_start or existing["planned_start"]
    planned_qty   = payload.planned_qty if payload.planned_qty is not None else existing["planned_qty"]
    smv           = payload.smv or float(existing["smv"])
    notes         = payload.notes if payload.notes is not None else existing["notes"]
    # manpower: if payload explicitly sends a value (including null), use it; if absent, keep existing
    mp_override   = payload.manpower if "manpower" in (payload.model_fields_set or set()) else existing.get("manpower")
    lc_id         = payload.learning_curve_id if payload.learning_curve_id is not None else existing.get("learning_curve_id")

    line = _get_line_or_404(db, line_id)
    _check_unit_permission(db, line_id, _actor(request))
    mp   = mp_override if mp_override else line["machines_count"]
    nw_set = _get_non_working_set_for_line(db, line_id)
    shift_start = int(line.get("effective_shift_start") or 0)

    planned_end = _calc_planned_end_variable(
        db, planned_start, planned_qty, line_id,
        float(line["effective_working_hours"]),
        mp, float(line["efficiency_pct"]), smv, lc_id, nw_set,
        shift_start_h=shift_start,
    )

    duration_secs = (planned_end - planned_start).total_seconds()
    planned_start = _find_available_start(db, line_id, planned_start, duration_secs, exclude_id=schedule_id)
    planned_end   = _calc_planned_end_variable(
        db, planned_start, planned_qty, line_id,
        float(line["effective_working_hours"]),
        mp, float(line["efficiency_pct"]), smv, lc_id, nw_set,
        shift_start_h=shift_start,
    )

    keep_sep = payload.keep_separate if payload.keep_separate is not None else existing.get("keep_separate", False)

    db.execute(
        text("""
            UPDATE order_schedule
            SET line_id=:lid, planned_start=:ps, planned_end=:pe,
                planned_qty=:pq, smv=:smv, notes=:notes,
                manpower=:mp, learning_curve_id=:lc, keep_separate=:ks
            WHERE id=:id
        """),
        {"lid": line_id, "ps": planned_start, "pe": planned_end,
         "pq": planned_qty, "smv": smv, "notes": notes,
         "mp": mp_override, "lc": lc_id, "ks": keep_sep, "id": schedule_id},
    )
    db.commit()
    tenant_id = int(request.state.user.get("tenant_id"))
    background_tasks.add_task(_generate_hour_breakdown_bg, tenant_id, schedule_id, planned_start, planned_end, planned_qty)

    row = db.execute(text("SELECT * FROM order_schedule WHERE id = :id"), {"id": schedule_id}).mappings().first()
    result = dict(row)
    result["daily_capacity"] = _daily_capacity(mp, float(line["effective_working_hours"]), float(line["efficiency_pct"]), smv)
    return result


@router.delete("/schedule/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def unschedule_order(schedule_id: int, request: Request):
    db = request.state.db
    result = db.execute(
        text("DELETE FROM order_schedule WHERE id = :id RETURNING id"), {"id": schedule_id}
    ).mappings().first()
    if not result:
        raise HTTPException(status_code=404, detail="Schedule entry not found")
    db.commit()


@router.get("/schedule/{schedule_id}/daily")
def get_schedule_daily(schedule_id: int, request: Request):
    """Per-order daily breakdown — reads from order_schedule_daily view."""
    db = request.state.db
    if not db.execute(text("SELECT id FROM order_schedule WHERE id = :id"), {"id": schedule_id}).scalar():
        raise HTTPException(status_code=404, detail="Schedule entry not found")
    rows = db.execute(
        text("SELECT plan_date, planned_qty FROM order_schedule_daily WHERE schedule_id = :sid ORDER BY plan_date"),
        {"sid": schedule_id},
    ).mappings().all()
    return [
        {"plan_date": str(r["plan_date"]), "planned_qty": float(r["planned_qty"])}
        for r in rows
    ]


@router.get("/schedule/{schedule_id}/hours")
def get_schedule_hours(schedule_id: int, request: Request):
    db = request.state.db
    if not db.execute(text("SELECT id FROM order_schedule WHERE id = :id"), {"id": schedule_id}).scalar():
        raise HTTPException(status_code=404, detail="Schedule entry not found")
    rows = db.execute(
        text("""
            SELECT hour_start, planned_qty
            FROM order_schedule_hours
            WHERE schedule_id = :sid
            ORDER BY hour_start
        """),
        {"sid": schedule_id},
    ).mappings().all()
    return [
        {"hour_start": r["hour_start"].isoformat(), "planned_qty": float(r["planned_qty"])}
        for r in rows
    ]


@router.get("/daily")
def get_daily_schedule(
    request: Request,
    start_date: Optional[datetime] = None,
    end_date:   Optional[datetime] = None,
):
    """
    Cross-line daily schedule — reads from order_schedule_daily view.
    Returns one row per (line, date). Optionally filter by start_date / end_date (inclusive).
    """
    db = request.state.db
    conditions, params = [], {}
    if start_date:
        conditions.append("d.plan_date >= :start")
        params["start"] = start_date.date() if hasattr(start_date, "date") else start_date
    if end_date:
        conditions.append("d.plan_date <= :end")
        params["end"] = end_date.date() if hasattr(end_date, "date") else end_date
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    rows = db.execute(
        text(f"""
            SELECT pl.id                        AS line_id,
                   pl.name                      AS line_name,
                   d.plan_date,
                   SUM(d.planned_qty)           AS planned_qty,
                   COUNT(DISTINCT d.order_id)   AS order_count
            FROM order_schedule_daily d
            JOIN production_lines pl ON pl.id = d.line_id
            {where}
            GROUP BY pl.id, pl.name, pl.display_order, d.plan_date
            ORDER BY pl.display_order, pl.name, d.plan_date
        """),
        params,
    ).mappings().all()

    return [
        {
            "line_id":     r["line_id"],
            "line_name":   r["line_name"],
            "plan_date":   str(r["plan_date"]),
            "planned_qty": float(r["planned_qty"]),
            "order_count": r["order_count"],
        }
        for r in rows
    ]


# ── Calendars ─────────────────────────────────────────────────────────────────

def _get_calendar_or_404(db, cal_id: int) -> dict:
    row = db.execute(
        text("SELECT * FROM factory_calendars WHERE id = :id AND is_active = TRUE"),
        {"id": cal_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Calendar not found")
    return dict(row)


def _calendar_to_dict(db, cal_id: int) -> dict:
    cal = db.execute(
        text("SELECT * FROM factory_calendars WHERE id = :id"), {"id": cal_id}
    ).mappings().first()
    if not cal:
        return {}
    d = dict(cal)
    if d.get("start_time") is not None:
        d["start_time"] = str(d["start_time"])[:5]   # datetime.time → "HH:MM"
    wd_rows = db.execute(
        text("SELECT day_of_week FROM calendar_working_days WHERE calendar_id = :id ORDER BY day_of_week"),
        {"id": cal_id},
    ).mappings().all()
    d["working_days"] = [r["day_of_week"] for r in wd_rows]
    d["holiday_count"] = db.execute(
        text("SELECT COUNT(*) FROM calendar_holidays WHERE calendar_id = :id"), {"id": cal_id}
    ).scalar()
    return d


@router.get("/calendars")
def list_calendars(request: Request):
    db = request.state.db
    cals = db.execute(
        text("SELECT id FROM factory_calendars WHERE is_active = TRUE ORDER BY name")
    ).mappings().all()
    return [_calendar_to_dict(db, c["id"]) for c in cals]


@router.post("/calendars", status_code=status.HTTP_201_CREATED)
def create_calendar(payload: CalendarCreate, request: Request):
    db = request.state.db
    row = db.execute(
        text("INSERT INTO factory_calendars (name, shift_hours, start_time) VALUES (:name, :sh, :st) RETURNING *"),
        {"name": payload.name, "sh": payload.shift_hours, "st": payload.start_time},
    ).mappings().first()
    cal_id = row["id"]
    if payload.working_days:
        phs = ", ".join(f"(:cid, :d{i})" for i in range(len(payload.working_days)))
        params: dict = {"cid": cal_id}
        for i, d in enumerate(payload.working_days):
            params[f"d{i}"] = d
        db.execute(
            text(f"INSERT INTO calendar_working_days (calendar_id, day_of_week) VALUES {phs}"),
            params,
        )
    db.commit()
    return _calendar_to_dict(db, cal_id)


@router.patch("/calendars/{cal_id}")
def update_calendar(cal_id: int, payload: CalendarUpdate, request: Request):
    db = request.state.db
    _get_calendar_or_404(db, cal_id)
    scalar_updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if k != "working_days"}
    if scalar_updates:
        parts = [f"{k} = :{k}" for k in scalar_updates]
        params: dict = {"id": cal_id, **scalar_updates}
        db.execute(text(f"UPDATE factory_calendars SET {', '.join(parts)} WHERE id = :id"), params)
    if payload.working_days is not None:
        db.execute(text("DELETE FROM calendar_working_days WHERE calendar_id = :id"), {"id": cal_id})
        if payload.working_days:
            phs = ", ".join(f"(:cid, :d{i})" for i in range(len(payload.working_days)))
            params2: dict = {"cid": cal_id}
            for i, d in enumerate(payload.working_days):
                params2[f"d{i}"] = d
            db.execute(
                text(f"INSERT INTO calendar_working_days (calendar_id, day_of_week) VALUES {phs}"),
                params2,
            )
    db.commit()
    return _calendar_to_dict(db, cal_id)


@router.delete("/calendars/{cal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_calendar(cal_id: int, request: Request):
    db = request.state.db
    _get_calendar_or_404(db, cal_id)
    db.execute(text("UPDATE factory_calendars SET is_active = FALSE WHERE id = :id"), {"id": cal_id})
    db.commit()


# ── Holidays ──────────────────────────────────────────────────────────────────

@router.get("/calendars/{cal_id}/holidays")
def list_holidays(cal_id: int, request: Request):
    db = request.state.db
    _get_calendar_or_404(db, cal_id)
    rows = db.execute(
        text("SELECT * FROM calendar_holidays WHERE calendar_id = :id ORDER BY holiday_date"),
        {"id": cal_id},
    ).mappings().all()
    return [{"id": r["id"], "holiday_date": str(r["holiday_date"]), "name": r["name"]} for r in rows]


@router.post("/calendars/{cal_id}/holidays", status_code=status.HTTP_201_CREATED)
def add_holidays(cal_id: int, payload: HolidayCreate, request: Request):
    from datetime import date as date_type, timedelta as td
    db = request.state.db
    _get_calendar_or_404(db, cal_id)
    dates: list = []
    if payload.holiday_date:
        dates = [date_type.fromisoformat(payload.holiday_date)]
    elif payload.start_date and payload.end_date:
        d = date_type.fromisoformat(payload.start_date)
        end = date_type.fromisoformat(payload.end_date)
        while d <= end:
            dates.append(d)
            d += td(days=1)
    if not dates:
        raise HTTPException(status_code=422, detail="Provide holiday_date or start_date+end_date")
    added = 0
    for dt in dates:
        result = db.execute(
            text("""
                INSERT INTO calendar_holidays (calendar_id, holiday_date, name)
                VALUES (:cid, :dt, :name)
                ON CONFLICT (calendar_id, holiday_date) DO NOTHING
                RETURNING id
            """),
            {"cid": cal_id, "dt": dt, "name": payload.name},
        ).mappings().first()
        if result:
            added += 1
    db.commit()
    return {"added": added}


@router.delete("/calendars/{cal_id}/holidays/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_holiday(cal_id: int, holiday_id: int, request: Request):
    db = request.state.db
    result = db.execute(
        text("DELETE FROM calendar_holidays WHERE id = :id AND calendar_id = :cid RETURNING id"),
        {"id": holiday_id, "cid": cal_id},
    ).mappings().first()
    if not result:
        raise HTTPException(status_code=404, detail="Holiday not found")
    db.commit()


# ── Calendar Breaks ──────────────────────────────────────────────────────────

class BreakCreate(BaseModel):
    break_start: str       # "HH:MM"
    break_duration: float = 1.0


@router.get("/calendars/{cal_id}/breaks")
def list_breaks(cal_id: int, request: Request):
    db = request.state.db
    _get_calendar_or_404(db, cal_id)
    rows = db.execute(
        text("SELECT id, break_start, break_duration FROM calendar_breaks WHERE calendar_id = :id ORDER BY break_start"),
        {"id": cal_id},
    ).mappings().all()
    return [{"id": r["id"], "break_start": str(r["break_start"])[:5], "break_duration": float(r["break_duration"])} for r in rows]


@router.post("/calendars/{cal_id}/breaks", status_code=status.HTTP_201_CREATED)
def add_break(cal_id: int, payload: BreakCreate, request: Request):
    db = request.state.db
    _get_calendar_or_404(db, cal_id)
    row = db.execute(
        text("INSERT INTO calendar_breaks (calendar_id, break_start, break_duration) VALUES (:cid, :bs, :bd) RETURNING id, break_start, break_duration"),
        {"cid": cal_id, "bs": payload.break_start, "bd": payload.break_duration},
    ).mappings().first()
    db.commit()
    return {"id": row["id"], "break_start": str(row["break_start"])[:5], "break_duration": float(row["break_duration"])}


@router.delete("/calendars/{cal_id}/breaks/{break_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_break(cal_id: int, break_id: int, request: Request):
    db = request.state.db
    result = db.execute(
        text("DELETE FROM calendar_breaks WHERE id = :id AND calendar_id = :cid RETURNING id"),
        {"id": break_id, "cid": cal_id},
    ).mappings().first()
    if not result:
        raise HTTPException(status_code=404, detail="Break not found")
    db.commit()


# ── Non-working days (for Gantt shading) ─────────────────────────────────────

@router.get("/non-working")
def get_non_working(request: Request, start: str, end: str):
    """Return non-working dates per line in the given range.
    Combines day-of-week rules and specific holidays from each line's calendar."""
    from datetime import date as date_type, timedelta as td
    db = request.state.db
    try:
        start_d = date_type.fromisoformat(start)
        end_d   = date_type.fromisoformat(end)
    except ValueError:
        raise HTTPException(status_code=422, detail="start and end must be YYYY-MM-DD")

    lines = db.execute(text("""
        SELECT id AS line_id, calendar_id
        FROM production_lines
        WHERE is_active = TRUE AND calendar_id IS NOT NULL
    """)).mappings().all()
    if not lines:
        return {}

    cal_ids = list({r["calendar_id"] for r in lines})
    phs = ", ".join(f":c{i}" for i in range(len(cal_ids)))
    p_ids: dict = {f"c{i}": v for i, v in enumerate(cal_ids)}

    wd_rows = db.execute(
        text(f"SELECT calendar_id, day_of_week FROM calendar_working_days WHERE calendar_id IN ({phs})"),
        p_ids,
    ).mappings().all()
    wd_map: dict = {}
    for r in wd_rows:
        wd_map.setdefault(r["calendar_id"], set()).add(r["day_of_week"])

    hol_params = {**p_ids, "start": start_d, "end": end_d}
    hol_rows = db.execute(
        text(f"""
            SELECT calendar_id, holiday_date
            FROM calendar_holidays
            WHERE calendar_id IN ({phs})
              AND holiday_date BETWEEN :start AND :end
        """),
        hol_params,
    ).mappings().all()
    hol_map: dict = {}
    for h in hol_rows:
        hol_map.setdefault(h["calendar_id"], set()).add(str(h["holiday_date"]))

    result: dict = {}
    for line in lines:
        working = wd_map.get(line["calendar_id"], set())
        holidays = hol_map.get(line["calendar_id"], set())
        non_working = []
        d = start_d
        while d <= end_d:
            if d.weekday() not in working or str(d) in holidays:
                non_working.append(str(d))
            d += td(days=1)
        if non_working:
            result[line["line_id"]] = non_working
    return result


@router.get("/unscheduled")
def get_unscheduled(request: Request):
    db = request.state.db
    rows = db.execute(
        text("""
            SELECT
                ol.id                                                         AS id,
                ol.order_id,
                ol.line_number,
                ol.delivery_qty,
                ol.delivery_date,
                c.name                                                        AS color_name,
                o.name                                                        AS order_name,
                o.status,
                o.customer_po,
                cu.name                                                       AS customer_name,
                p.name                                                        AS product_name,
                o.version_id,
                COALESCE((
                    SELECT svs.work_content
                    FROM style_version_steps svs
                    JOIN processes pr
                      ON LOWER(TRIM(pr.name)) = LOWER(TRIM(svs.process_name))
                    WHERE svs.version_id = o.version_id
                      AND pr.planned = TRUE
                      AND svs.work_content ~ '^[0-9]+(\.[0-9]+)?$'
                    ORDER BY svs.sequence
                    LIMIT 1
                ), NULL)                                                       AS calculated_smv,
                COALESCE(SUM(os.planned_qty), 0)                              AS scheduled_qty,
                (ol.delivery_qty - COALESCE(SUM(os.planned_qty), 0))         AS remaining_qty,
                (COALESCE(SUM(os.planned_qty), 0) > 0)                        AS is_partial
            FROM order_lines ol
            JOIN orders o ON o.id = ol.order_id
            LEFT JOIN customers cu ON cu.id = o.customer_id
            LEFT JOIN products p ON p.id = o.product_id
            LEFT JOIN colors c ON c.id = ol.color_id
            LEFT JOIN order_schedule os ON os.order_line_id = ol.id
            WHERE ol.order_id NOT IN (
                SELECT order_id FROM order_schedule WHERE order_line_id IS NULL
            )
            GROUP BY ol.id, ol.order_id, ol.line_number, ol.delivery_qty, ol.delivery_date,
                     c.name, o.name, o.status, o.customer_po, cu.name, p.name, o.version_id
            HAVING (ol.delivery_qty - COALESCE(SUM(os.planned_qty), 0)) > 0
            ORDER BY o.status, cu.name, o.name, ol.line_number
        """),
    ).mappings().all()
    return [dict(r) for r in rows]


# ── Common Planning Settings ───────────────────────────────────────────────────

@router.get("/settings")
def get_settings(request: Request):
    db = request.state.db
    rows = db.execute(text("SELECT key, value FROM planning_settings")).mappings().all()
    result = {r["key"]: r["value"] for r in rows}
    if "week_start" in result:
        result["week_start"] = int(result["week_start"])
    return result


@router.patch("/settings")
def patch_settings(request: Request, payload: Dict[str, Any] = Body(...)):
    db = request.state.db
    for k, v in payload.items():
        db.execute(
            text(
                "INSERT INTO planning_settings (key, value) VALUES (:k, :v) "
                "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
            ),
            {"k": k, "v": str(v)},
        )
    db.commit()
    return get_settings(request)
