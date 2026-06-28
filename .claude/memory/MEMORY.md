# Memory Index — Filaminto

- [Filaminto Project Overview](project_filaminto.md) — Stack, credentials, architecture, naming (tenant not company), features, gotchas
- [Planning Board Feature](project_planning_board.md) — Full state: DB schema, capacity formula, zoom levels, layout, drag rules, Setup modal tabs
- [Tenant Table Ownership Bug](feedback_tenant_table_ownership.md) — Manual psql tables must be `ALTER TABLE x OWNER TO app_db`
- [Subscription Middleware Pattern](feedback_subscription_middleware.md) — Never open DB connections in middleware; embed data in JWT
- [Rename Pitfalls](feedback_rename_pitfalls.md) — Junction table columns + missing tables when doing large renames
- [Dev Preferences](feedback_dev_preferences.md) — User prefers direct execution; skip confirmation for clear tasks
- [Planning Board Rules](feedback_planning_rules.md) — Strip width from timestamps, no rounding, no gap, SMV from routing, FieldCard pattern, Setup as modal
