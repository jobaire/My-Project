-- order_schedule_daily: view aggregating hourly rows to calendar-day granularity.
-- Always consistent with order_schedule_hours — no populate/sync code needed.
-- CREATE OR REPLACE VIEW is idempotent; safe to re-run on every tenant connection.

CREATE OR REPLACE VIEW order_schedule_daily AS
SELECT
    osh.schedule_id,
    os.order_id,
    os.line_id,
    DATE_TRUNC('day', osh.hour_start)::DATE AS plan_date,
    SUM(osh.planned_qty)                    AS planned_qty
FROM order_schedule_hours osh
JOIN order_schedule os ON os.id = osh.schedule_id
GROUP BY osh.schedule_id, os.order_id, os.line_id,
         DATE_TRUNC('day', osh.hour_start)::DATE;
