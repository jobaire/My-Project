-- Hourly quantity breakdown for each scheduled order.
-- Rows are generated/replaced on every POST and PATCH to /planning/schedule.
-- Fully idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS order_schedule_hours (
    id          SERIAL PRIMARY KEY,
    schedule_id INTEGER NOT NULL REFERENCES order_schedule(id) ON DELETE CASCADE,
    hour_start  TIMESTAMP NOT NULL,   -- floor-hour, e.g. 2026-06-15T07:00:00
    planned_qty DECIMAL(12,4) NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_osh_schedule_id ON order_schedule_hours(schedule_id);
CREATE INDEX IF NOT EXISTS ix_osh_hour_start  ON order_schedule_hours(hour_start);
