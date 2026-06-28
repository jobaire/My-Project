-- Break periods within a shift calendar — idempotent
CREATE TABLE IF NOT EXISTS calendar_breaks (
    id              SERIAL PRIMARY KEY,
    calendar_id     INTEGER NOT NULL REFERENCES factory_calendars(id) ON DELETE CASCADE,
    break_start     TIME NOT NULL,           -- e.g. '12:00:00'
    break_duration  DECIMAL(4,2) NOT NULL DEFAULT 1.0   -- hours
);
CREATE INDEX IF NOT EXISTS ix_cal_breaks_cal ON calendar_breaks(calendar_id);
