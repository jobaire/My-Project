-- Learning curve presets and stages
CREATE TABLE IF NOT EXISTS learning_curve_presets (
    id   SERIAL PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS learning_curve_stages (
    id             SERIAL PRIMARY KEY,
    preset_id      INTEGER NOT NULL REFERENCES learning_curve_presets(id) ON DELETE CASCADE,
    day_number     INTEGER NOT NULL,
    efficiency_pct NUMERIC(5,2) NOT NULL DEFAULT 100,
    UNIQUE (preset_id, day_number)
);

-- Add learning_curve_id to order_schedule if not already present
ALTER TABLE order_schedule
    ADD COLUMN IF NOT EXISTS learning_curve_id INTEGER REFERENCES learning_curve_presets(id) ON DELETE SET NULL;
