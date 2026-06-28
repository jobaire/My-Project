-- Upgrade planned_start / planned_end from DATE to TIMESTAMP for sub-day scheduling.
-- Guarded: only runs the ALTER if the columns are still of type 'date'.
-- Safe to re-run on every connection (ensure_tenant_schema pattern).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'order_schedule'
      AND column_name = 'planned_start'
      AND data_type   = 'date'
  ) THEN
    ALTER TABLE order_schedule
      ALTER COLUMN planned_start TYPE TIMESTAMP USING planned_start::TIMESTAMP,
      ALTER COLUMN planned_end   TYPE TIMESTAMP USING planned_end::TIMESTAMP;
  END IF;
END $$;
