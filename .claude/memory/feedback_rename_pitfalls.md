---
name: feedback-rename-pitfalls
description: "When doing a large rename (company→tenant), batch string replace misses junction table columns and implicit table references"
metadata:
  type: feedback
---

During the company→tenant rename, two issues were missed by the batch string replace:

**1. Junction table column not renamed**
`user_sub_companies` was renamed to `user_sub_tenants` (table), but the column `sub_company_id` inside it was NOT renamed to `sub_tenant_id`. The batch replace only caught the column in `sub_tenants.company_id` but not in `user_sub_tenants.sub_company_id`.

**Why:** The batch replace script did `('sub_company_id', 'sub_tenant_id')` but that string only appeared in code referring to the junction table — the actual DB column needed a separate `ALTER COLUMN`.

**Fix:** After any rename involving junction tables, always check ALL columns in EVERY renamed table:
```sql
SELECT table_name, column_name FROM information_schema.columns 
WHERE table_schema='public' AND (column_name LIKE '%company%' OR column_name LIKE '%old_name%');
```

**2. Missing `user_roles` table**
The `user_roles` table was referenced throughout the code (`SELECT role FROM user_roles`, `INSERT INTO user_roles`) but was never in any Alembic migration. It existed on the original system but was never formally defined. After a rename/migration session, it was absent.

**How to apply:** Before any large DB refactor, verify ALL tables referenced in the code actually exist:
```python
# Check all table references in SQL strings vs actual DB tables
```
Always create `user_roles` if it doesn't exist:
```sql
CREATE TABLE IF NOT EXISTS user_roles (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role    VARCHAR(100) NOT NULL,
    PRIMARY KEY (user_id, role)
);
```
