-- Subtotal row support: one summary row per plan unit showing total machine count
ALTER TABLE production_lines ADD COLUMN IF NOT EXISTS is_subtotal BOOLEAN NOT NULL DEFAULT FALSE;
