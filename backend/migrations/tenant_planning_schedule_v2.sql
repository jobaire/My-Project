-- Add order_line_id so individual order lines can be scheduled independently
ALTER TABLE order_schedule
  ADD COLUMN IF NOT EXISTS order_line_id INTEGER REFERENCES order_lines(id) ON DELETE CASCADE;

-- Drop the old one-per-order constraint (new model: one schedule per order LINE)
ALTER TABLE order_schedule
  DROP CONSTRAINT IF EXISTS uq_order_schedule_order;

-- New: one schedule per order line (partial index, leaves old NULL rows unrestricted)
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_schedule_order_line
  ON order_schedule (order_line_id)
  WHERE order_line_id IS NOT NULL;
