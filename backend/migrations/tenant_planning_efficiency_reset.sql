-- Reset efficiency_pct to 100 for lines still at the old default of 65
UPDATE production_lines SET efficiency_pct = 100 WHERE efficiency_pct = 65;
