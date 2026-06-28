# Filaminto

Filaminto is a multi-tenant SaaS platform for garment industry planning and operations.

- `backend`: FastAPI on `http://localhost:8000`
- `frontend`: Vite + React on `http://localhost:5173`
- `db`: PostgreSQL 18 on `localhost:5432`

## Prerequisites

- Python venv set up under `backend/venv`
- Node modules installed under `frontend/node_modules`
- PostgreSQL 18 running locally

## Run Locally

Double-click **Start filaminto.bat** in the project root, or run manually:

**Backend** (from `backend/`):
```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Frontend** (from `frontend/`):
```powershell
npm run dev -- --host 127.0.0.1 --port 5173
```

Open:

- App: `http://127.0.0.1:5173`
- Backend API docs: `http://localhost:8000/docs`

## Docker (optional, deferred)

```powershell
docker compose up --build
```

## Default Accounts

| Role | Email | Password |
|---|---|---|
| Super Admin | admin@filaminto.com | Admin@1234 |
| Company Admin (test) | admin@apparel.com | Admin@1234 |

## Rename Reference

See `docs/rename-sop.md` to safely rename the app, DB credentials, or databases.
