-- Named factory calendars — reusable, attachable to production lines
CREATE TABLE IF NOT EXISTS factory_calendars (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    shift_hours  DECIMAL(4,2) NOT NULL DEFAULT 8.0,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

-- Which days of week are working for each calendar (0=Mon … 6=Sun)
CREATE TABLE IF NOT EXISTS calendar_working_days (
    calendar_id  INTEGER NOT NULL REFERENCES factory_calendars(id) ON DELETE CASCADE,
    day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    PRIMARY KEY  (calendar_id, day_of_week)
);

-- Specific non-working dates: public holidays and factory shutdowns
CREATE TABLE IF NOT EXISTS calendar_holidays (
    id            SERIAL PRIMARY KEY,
    calendar_id   INTEGER NOT NULL REFERENCES factory_calendars(id) ON DELETE CASCADE,
    holiday_date  DATE NOT NULL,
    name          VARCHAR(200),
    UNIQUE (calendar_id, holiday_date)
);
CREATE INDEX IF NOT EXISTS ix_cal_holidays_date ON calendar_holidays(calendar_id, holiday_date);

-- Attach a calendar to each production line (nullable — no calendar = no day restrictions)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'production_lines' AND column_name = 'calendar_id'
    ) THEN
        ALTER TABLE production_lines
            ADD COLUMN calendar_id INTEGER REFERENCES factory_calendars(id) ON DELETE SET NULL;
    END IF;
END $$;
