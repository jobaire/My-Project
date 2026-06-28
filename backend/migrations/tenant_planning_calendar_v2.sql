-- Add start_time to factory_calendars (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'factory_calendars' AND column_name = 'start_time'
    ) THEN
        ALTER TABLE factory_calendars
            ADD COLUMN start_time TIME NOT NULL DEFAULT '08:00:00';
    END IF;
END $$;
