-- Common planning settings (idempotent key-value store)
CREATE TABLE IF NOT EXISTS planning_settings (
    key   VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);
INSERT INTO planning_settings (key, value) VALUES ('week_start', '1') ON CONFLICT DO NOTHING;
