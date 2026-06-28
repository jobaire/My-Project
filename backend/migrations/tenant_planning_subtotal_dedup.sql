-- Remove duplicate subtotal rows (keep the lowest id per plan_unit_id)
DELETE FROM production_lines
WHERE is_subtotal = TRUE
  AND id NOT IN (
    SELECT MIN(id)
    FROM   production_lines
    WHERE  is_subtotal = TRUE
    GROUP  BY plan_unit_id
  );

-- Enforce one subtotal per plan unit at the DB level
CREATE UNIQUE INDEX IF NOT EXISTS uq_lines_one_subtotal_per_unit
  ON production_lines (plan_unit_id)
  WHERE is_subtotal = TRUE;
