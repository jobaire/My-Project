---
name: feedback-tenant-table-ownership
description: "When manually creating tables in tenant DBs as postgres superuser, always transfer ownership to app_db"
metadata:
  type: feedback
---

When creating tables in a tenant DB manually (e.g. via psql as the `postgres` superuser), the table is owned by `postgres`. The app connects as `app_db`. When `ensure_tenant_schema()` later runs at server startup and tries to `CREATE INDEX` on a table owned by `postgres`, it fails with `InsufficientPrivilege: must be owner of table`. This unhandled exception propagates past the CORSMiddleware, causing the browser to see ERR_FAILED with no CORS headers on ALL tenant requests.

**Why:** Unhandled exceptions in the tenant middleware bypass CORS headers — fixed in tenant.py with a broad `except Exception` catch returning 503. But the root cause is ownership.

**How to apply:** After any manual `CREATE TABLE` in a tenant DB:
```sql
ALTER TABLE table_name OWNER TO app_db;
```

For automated migrations via `ensure_tenant_schema`, this is not an issue because the app connects as `app_db` and creates tables as that user.
