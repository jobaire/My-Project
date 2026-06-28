-- Allow multiple schedules per order_line (splits: one order line can be spread across several production lines)
DROP INDEX IF EXISTS uq_order_schedule_order_line;

-- When true, adjacent sibling strips with the same order_line_id will NOT auto-merge on drag-drop
ALTER TABLE order_schedule
  ADD COLUMN IF NOT EXISTS keep_separate BOOLEAN NOT NULL DEFAULT FALSE;
