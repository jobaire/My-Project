-- Add external_id to production_lines (idempotent)
ALTER TABLE production_lines ADD COLUMN IF NOT EXISTS external_id VARCHAR(50);
