---
name: project-filaminto
description: "Filaminto project overview — garment industry SaaS, current state, stack, credentials, feature status"
metadata:
  node_type: memory
  type: project
---

Full-stack multi-tenant SaaS for the garment industry. Located at `e:\Filaminto`.
Name history: SmartPlan → SeamlessApps → ThreadOS → **Filaminto** (current).

---

## Stack

- **Frontend:** Vite + React 19, Ant Design v6, @dnd-kit, React Router v6 — runs on `http://127.0.0.1:5173`
- **Backend:** FastAPI (Python 3.11), SQLAlchemy, psycopg2, Uvicorn — runs on `http://127.0.0.1:8000`
- **Database:** PostgreSQL 18 — port `5432`
- **Email:** Zoho Mail SMTP — `no-reply@filaminto.com`, credentials in `backend/.env`
- **Run locally:** `Start filaminto.bat` at project root

---

## Credentials

| Item | Value |
|---|---|
| DB user | `app_db` |
| DB password | `AppSecure2024!` |
| Platform DB | `platform_db` (renamed from `master_db`) |
| Shared tenant DB | `tenants_db` |
| Legacy tenant DB | `apparel_db` (dedicated, premium model) |
| Super admin | `admin@filaminto.com` / `Admin@1234` |
| SMTP user | `no-reply@filaminto.com` |
| psql superuser | `postgres` / `admin123` |
| App URL (dev) | `http://127.0.0.1:5173` |

---

## Naming Convention (standardised)

**Use "tenant" everywhere in code** — "company" was the old term. Key mapping:

| Old (do not use) | New (correct) |
|---|---|
| `companies` table | `tenants` |
| `company_roles` table | `tenant_roles` |
| `sub_companies` table | `sub_tenants` |
| `user_sub_companies` table | `user_sub_tenants` |
| `company_id` (JWT/code) | `tenant_id` |
| `company_name` | `tenant_name` |
| `sub_company_ids` | `sub_tenant_ids` |
| `company_provisioning.py` | `tenant_provisioning.py` |
| `/platform/companies` route | `/platform/tenants` |

User-facing UI text ("Company name" label, "your company") stays unchanged — those are fine for UX.

---

## Multi-Tenancy Architecture

```
platform_db (identity & access control)
├── tenants            ← tenant registry
├── users              ← all users (tenant_id FK)
├── user_roles         ← user ↔ role assignments (was MISSING, now created)
├── tenant_roles       ← role definitions per tenant
├── module_permissions ← role ↔ module access (tenant_id scoped)
├── sub_tenants        ← divisions within a tenant
├── user_sub_tenants   ← user ↔ sub-tenant assignments
├── refresh_tokens
└── password_reset_tokens

tenants_db (shared standard tier)
└── co_N schemas       ← each tenant gets a schema (liz_fashion_industry, etc.)
    ├── products, styles, orders, customers...
    └── audit_log, notifications

apparel_db (legacy/premium dedicated DB)
└── full dedicated database (unchanged)
```

- `tenant_manager.py` → `get_tenant_db(tenant_id)` — dual path: schema-per-tenant OR dedicated DB
- `ensure_tenant_schema()` runs idempotent SQL migrations on first connection
- Tenant SQL files (in order): `tenant_product_setup.sql`, `tenant_style_v2.sql`, `tenant_orders_setup.sql`, `tenant_planning_setup.sql`, `tenant_planning_datetime.sql`, `tenant_planning_hours.sql`, `tenant_planning_daily_view.sql`

**IMPORTANT:** When creating tables in tenant DBs manually (psql as `postgres`), always `ALTER TABLE x OWNER TO app_db` afterwards. See [[feedback_tenant_table_ownership]].

---

## Authentication & Permissions

- JWT claims use `tenant_id`, `tenant_name`, `sub_tenant_ids`, `sub_tenant_all`
- Refresh tokens (30 days) stored in `platform_db.refresh_tokens`
- `plan` and `trial_ends_at` embedded in JWT — subscription middleware reads from JWT (no DB query)
- Login rate limited: 10 attempts/minute (slowapi)
- Password strength: min 8 chars + uppercase + number + special char
- **Permissions: zero-trust default** — new users see only Dashboard until admin grants access
  - `module_permissions` in `platform_db` (tenant-specific rows only, no global NULL defaults)
  - Frontend hides nav items based on `session.perms`
  - Admin (`isAdmin=true`) always bypasses permission checks

---

## UI Architecture

HubSpot-inspired layout (`#2b3547` sidebar):
- React Router-driven navigation
- Top bar: `AppTopBar.jsx` (search + AI button + bell + avatar dropdown)
- Trial banner at ≤ 5 days remaining
- **Login page:** Simple centered card, white logo (`/logo-white.svg`), no left panel

**React Router routes:**
- `/dashboard`, `/customers`, `/styles`, `/orders`, `/setup/*` → AppShell
- `/admin/companies`, `/admin/users` → AdminApp (super_admin)
- `/set-password`, `/signup` → public

**Deleted dead files (cleaned up):**
- `pages/DashboardPage.jsx` (was unused, `DashboardApp.jsx` is the real one)
- `pages/tenant-admin/` folder (TenantAdminApp, TenantUsersPage — never routed to)
- `components/AppLayout.jsx` (obsolete wrapper)
- `backend/create_superadmin.py` (superseded by `/signup`)
- `backend/app/models/companies.py` → replaced by `models/tenants.py`

---

## Features Status

### Done ✅
- Multi-tenant architecture (schema-per-tenant + dedicated DB)
- Tenant self-signup at `/signup` (14-day trial, auto-provisioned schema)
- JWT + refresh token auth + invite flow + forgot password
- Email: Zoho SMTP, all async (ThreadPoolExecutor)
- HubSpot-style UI + React Router
- Permission system (zero-trust, admin grants access per module)
- Rate limiting, error boundaries, code splitting, Sentry wired
- Orders DB tables created (`uom`, `seasons`, `orders`, `order_lines`, `order_line_sizes`)
- In-app notifications (bell icon + tenant DB table)
- Tenant migration runner: `backend/scripts/migrate_tenants.py`
- company → tenant naming standardisation throughout
- Codebase cleaned up (dead files removed, bugs fixed, Ant Design deprecations fixed)
- **Planning Board** — FastReactPlan-style Gantt at `/planning` (see [[project-planning-board]])
  - Sewing lines as rows, order strips, drag-and-drop scheduling
  - SMV-based fractional capacity, hour-precision timestamps
  - Zoom levels: Quarter / Week / Day / Hour
  - Right-click: Style drawer + Order drawer
  - Hover info panel, adjustable row height, Planning Setup modal (multi-tab)

### Pending ❌
- Orders module fully working end-to-end (tables exist, frontend exists, needs testing)
- Stripe billing (stubs ready, need `STRIPE_SECRET_KEY`)
- File/document storage (Cloudflare R2 recommended)
- CI/CD + HTTPS (deploy to server)
- Schema-per-tenant migration for `apparel_db` (optional, leave as dedicated)

---

## Known Gotchas

1. **`user_roles` table** was missing from migrations — created manually. It must exist in `platform_db` for any user login to work.
2. **`user_sub_tenants.sub_tenant_id`** column — the table was renamed but the column needed a separate `ALTER COLUMN` (done manually).
3. **Tenant table ownership** — tables created via psql as `postgres` need `ALTER TABLE x OWNER TO app_db`.
4. **JWT breaking change** — renaming `company_id` → `tenant_id` invalidates all existing sessions. Users must log in again after this change was deployed.
5. **`SET LOCAL search_path`** resets on `db.commit()` — use `checkout` event on the schema engine instead (already fixed in `tenant_manager.py`).
6. **`send_invite` import** — `users.py` must import both `send_invite` AND `send_invite_async` from `email_service.py`. Missing `send_invite` breaks the resend-invite endpoint.
