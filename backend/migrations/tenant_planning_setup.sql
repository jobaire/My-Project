BEGIN;

-- Production lines (sewing lines in the factory)
CREATE TABLE IF NOT EXISTS production_lines (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    machines_count  INTEGER NOT NULL DEFAULT 40,
    working_hours   DECIMAL(4,2) NOT NULL DEFAULT 8.0,
    efficiency_pct  DECIMAL(5,2) NOT NULL DEFAULT 65.0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    display_order   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_production_lines_active ON production_lines(is_active, display_order);

-- Order schedule (assigns orders to lines with dates)
-- UNIQUE(order_id) enforces one schedule per order
CREATE TABLE IF NOT EXISTS order_schedule (
    id             SERIAL PRIMARY KEY,
    order_id       INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    line_id        INTEGER NOT NULL REFERENCES production_lines(id) ON DELETE CASCADE,
    planned_start  DATE NOT NULL,
    planned_end    DATE NOT NULL,
    planned_qty    INTEGER NOT NULL DEFAULT 0,
    smv            DECIMAL(8,4) NOT NULL DEFAULT 20.0,
    notes          TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_order_schedule_order UNIQUE(order_id)
);
CREATE INDEX IF NOT EXISTS ix_order_schedule_line  ON order_schedule(line_id);
CREATE INDEX IF NOT EXISTS ix_order_schedule_dates ON order_schedule(planned_start, planned_end);

COMMIT;
