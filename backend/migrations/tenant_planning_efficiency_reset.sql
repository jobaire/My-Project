-- Reset efficiency_pct to 100 for lines still at the old default of 65
-- Guard: only run once per schema (skips if any line already has a non-65 efficiency value)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM production_lines WHERE efficiency_pct != 65 LIMIT 1) THEN
        -- Schema already has real data, skip destructive update
        NULL;
    ELSE
        UPDATE production_lines SET efficiency_pct = 100 WHERE efficiency_pct = 65;
    END IF;
END $$;
