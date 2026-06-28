-- Variable capacity: WH overrides, learning curves, per-schedule manpower — idempotent

-- WH offset overrides per line per date range (positive = overtime, negative = short day)
CREATE TABLE IF NOT EXISTS line_wh_overrides (
    id          SERIAL PRIMARY KEY,
    line_id     INTEGER NOT NULL REFERENCES production_lines(id) ON DELETE CASCADE,
    start_date  DATE NOT NULL,
    end_date    DATE NOT NULL,
    wh_offset   DECIMAL(4,2) NOT NULL,
    notes       VARCHAR(200),
    CONSTRAINT chk_lwho_dates CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS ix_lwho_line_dates ON line_wh_overrides(line_id, start_date, end_date);

-- User-defined learning curve presets
CREATE TABLE IF NOT EXISTS learning_curve_presets (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

-- Stages: day_number = 1-based working day from planned_start
-- Days beyond the last entry use 100% efficiency
CREATE TABLE IF NOT EXISTS learning_curve_stages (
    id              SERIAL PRIMARY KEY,
    preset_id       INTEGER NOT NULL REFERENCES learning_curve_presets(id) ON DELETE CASCADE,
    day_number      INTEGER NOT NULL CHECK (day_number >= 1),
    efficiency_pct  DECIMAL(5,2) NOT NULL CHECK (efficiency_pct > 0 AND efficiency_pct <= 100),
    UNIQUE(preset_id, day_number)
);

-- Per-schedule overrides
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='order_schedule' AND column_name='manpower') THEN
        ALTER TABLE order_schedule ADD COLUMN manpower INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='order_schedule' AND column_name='learning_curve_id') THEN
        ALTER TABLE order_schedule
            ADD COLUMN learning_curve_id INTEGER REFERENCES learning_curve_presets(id) ON DELETE SET NULL;
    END IF;
END $$;
