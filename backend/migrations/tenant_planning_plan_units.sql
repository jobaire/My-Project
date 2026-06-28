-- Plan units (groups/segments for production lines) — idempotent
CREATE TABLE IF NOT EXISTS plan_units (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE production_lines ADD COLUMN IF NOT EXISTS plan_unit_id INTEGER REFERENCES plan_units(id) ON DELETE SET NULL;
