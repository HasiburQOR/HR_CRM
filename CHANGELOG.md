# HR CRM Project — Complete Change Log

## Project Overview
Full-stack HR CRM built from spec: React+Vite+TypeScript+Tailwind+shadcn/ui (frontend) + FastAPI+SQLAlchemy+SQLite (backend).

---

## 1. Project Generation

Generated the complete project from the documentation spec files (`DATABASE.md`, `FEATURES.md`, `PROJECT_RULES.md`, `ROADMAP.md`).

| Layer | Files | Tech |
|---|---|---|
| Backend | ~79 files | FastAPI, SQLAlchemy, SQLite, JWT+bcrypt, openpyxl, APScheduler |
| Frontend | ~77 source files | React 18, Vite 5, TypeScript, Tailwind CSS, shadcn/ui, Recharts, Axios |

### Architecture
- **Backend**: Service/Repository pattern — models → repositories → services → routes
- **Frontend**: Context-based auth, Axios API layer, protected routes, shadcn/ui component library

---

## 2. Dependency & Build Fixes

### 2.1 PostgreSQL → SQLite switch
- `psycopg2-binary` requires `pg_config` (PostgreSQL dev headers) to compile on Windows
- Python 3.14 has no pre-built wheels for many packages
- **Fix**: Switched to `sqlite+pysqlite:///` (stdlib), removed `psycopg2-binary` and `aiosqlite`
- **Files changed**: `requirements.txt`, `.env`, `app/config.py`, `app/database.py`

### 2.2 Python 3.14 compatibility
- Removed all version pins from `requirements.txt` — lets pip resolve compatible wheels
- Replaced `passlib[bcrypt]` with direct `bcrypt` usage (passlib incompatible with newer bcrypt)
- Installed `email-validator` separately (pydantic email validation)
- **Files changed**: `requirements.txt`, `app/utils/security.py`

### 2.3 Database path fixed to absolute
- `config.py` used relative path `./hr_crm.db` — database location depended on CWD
- **Fix**: `BASE_DIR = Path(__file__).resolve().parent.parent` → absolute path
- **Files changed**: `app/config.py`, `.env`

### 2.4 NPM dependency fixes
- Added `@types/node` for Vite config
- Frontend build passes cleanly: `tsc -b && vite build`

---

## 3. UUID Type Resolution

Backend originally used PostgreSQL `UUID` column type; switched to `String(36)` for SQLite.

### Changes across all layers:
| Layer | Before | After |
|---|---|---|
| Model base | `UUID(as_uuid=True)` | `String(36)` |
| Pydantic schemas | `uuid.UUID` | `str` |
| Service/Repo type hints | `uuid.UUID` | `str` |
| Route path params | `uuid.UUID` | `str` |
| Frontend TypeScript | `number` | `string` |

**Files changed**: All model files, all schema files, all service files, all repository files, all route files, `database.py`, `security.py`, `audit.py`, `dependencies.py`, frontend `types/index.ts`, all service `.ts` files, all page `.tsx` files.

---

## 4. Backend Field Name Alignment

Frontend sent one set of field names; backend expected different ones. Pydantic rejected requests with 422.

### Employee model/schema
| Frontend field | Backend field (before) | Backend field (after) |
|---|---|---|
| `employee_id` | `employee_code` | `employee_id` |
| `designation` | `position` | `designation` |
| `date_of_joining` | `hire_date` | `date_of_joining` |
| `date_of_birth` | *(didn't exist)* | `date_of_birth` (added) |
| `address` | *(didn't exist)* | `address` (added) |

**Files changed**: `models/employee.py`, `schemas/employee.py`, `repositories/employee.py`, `services/employee.py`

### User schema
- `UserUpdate` was missing `username`, `password`, `role_id` fields — updates silently did nothing
- **Fix**: Added missing fields, added password hashing on update
- **Files changed**: `schemas/user.py`, `services/user.py`

---

## 5. API URL Path Alignment

Frontend services used wrong URL paths; all calls returned 404.

| Service | Frontend called | Backend expects | Fix |
|---|---|---|---|
| Dashboard | `/dashboard/stats` | `/dashboard/summary` | Changed frontend |
| Attendance | `/attendance/...` | `/attendances/...` | Changed frontend |
| Leave | `/leave/...` | `/leaves/...` | Changed frontend |
| Salary | `/salary/...` | `/salaries/...` | Changed frontend |
| Settings key lookup | `/settings/${key}` | `/settings/by-key/${key}` | Changed frontend |

**Files changed**: `dashboard.service.ts`, `attendance.service.ts`, `leave.service.ts`, `salary.service.ts`, `settings.service.ts`

---

## 6. Removed Frontend Calls to Missing Endpoints

These endpoints didn't exist on the backend — removed the frontend calls:

| Removed function | Service file | Also removed from page |
|---|---|---|
| `toggleAttendance` | `attendance.service.ts` | `Attendance.tsx` |
| `getTodayAttendance` | `attendance.service.ts` | `Attendance.tsx` |
| `approveLeave` / `rejectLeave` | `leave.service.ts` | `Leave.tsx` |
| `generatePayroll` | `salary.service.ts` | `Salary.tsx` |
| `restoreBackup` / `downloadBackup` | `backup.service.ts` | `Backups.tsx` |
| `toggleReminder` | `reminder.service.ts` | `Reminders.tsx` |
| `logout` API call | `auth.service.ts` | — (now only clears localStorage) |

---

## 7. Vite Proxy Fix

Frontend sends requests to `/api/...` but Vite proxy forwarded them as-is to the backend, which doesn't have an `/api` prefix.

```
Before: /api/auth/login → http://localhost:8000/api/auth/login  (404)
After:  /api/auth/login → http://localhost:8000/auth/login      (200)
```

**Fix**: Added `rewrite: (path) => path.replace(/^\/api/, '')` to Vite proxy config.
**File changed**: `vite.config.ts`

---

## 8. Backend Trailing Slash Redirect Fix

Backend routes used `@router.get("/")` which requires a trailing slash. Requests without it (e.g., `GET /employees`) triggered a 307 redirect that dropped the `Authorization` header, causing 401.

**Fix**: Changed all `@router.xxx("/")` → `@router.xxx("")` in 11 route files.
**Files changed**: `routes/employee.py`, `attendance.py`, `leave.py`, `salary.py`, `task.py`, `reminder.py`, `backup.py`, `setting.py`, `user.py`, `activity_log.py`, `role.py`

---

## 9. API Response Wrapping

This was the root cause of "created successfully but nothing shows up."

### Problem
- Backend returned raw data: bare lists `[obj, obj]`, bare objects `{...}`, or `{"success": true}`
- Frontend expected wrapped responses: `{success, data, total, page, per_page, total_pages}`

### Fix: Created `app/utils/response.py`
```python
success_response(data, message)        # → {"success": true, "message": "...", "data": ...}
paginated_response(data, total, ...)   # → {"success": true, "data": [...], "total": N, ...}
error_response(message, status_code)   # → JSONResponse with 4xx/5xx status
```

### Updated all 14 route files:
| Endpoint type | Before | After |
|---|---|---|
| List (GET /) | Bare list `[...]` | `paginated_response(data, total, page, per_page)` |
| Single (GET /{id}) | Bare object | `success_response(data=obj)` |
| Create (POST /) | Bare object | `success_response(data=obj)` |
| Update (PUT /{id}) | Bare object | `success_response(data=obj)` |
| Delete (DELETE /{id}) | `{"success": bool}` | `success_response(data=None)` |
| Auth register | `{access_token, token_type}` | `success_response(data={token, user})` |
| Dashboard | Bare dict | `success_response(data={...})` |
| Expense approve/reject | Bare object | `success_response(data=obj)` |

---

## 10. New Feature: Daily Expense Tracking

### Backend
| File | Purpose |
|---|---|
| `models/expense.py` | Model: employee_id, category, amount, description, expense_date, status, approved_by, soft-delete |
| `schemas/expense.py` | Pydantic: ExpenseBase, ExpenseCreate, ExpenseUpdate, ExpenseResponse |
| `repositories/expense.py` | CRUD + get_filtered, get_by_employee, get_by_category, get_by_date_range, get_summary_by_category |
| `services/expense.py` | Business logic + approve/reject with status validation |
| `routes/expense.py` | 8 endpoints: list (with pagination/filters), get, create, update, delete, approve, reject, summary |

### Frontend
| File | Purpose |
|---|---|
| `services/expense.service.ts` | API service with 8 functions |
| `pages/Expenses.tsx` | Full page: DataTable, summary cards, date/category filters, approve/reject buttons, status badges, delete confirmation, toast notifications |
| `types/index.ts` | Added `Expense` interface |
| `App.tsx` | Added `/expenses` route |
| `components/layout/Sidebar.tsx` | Added Expenses nav item (Receipt icon) |

---

## 11. Admin Seeder

Created `backend/seed.py` — run once to create database tables and initial admin user:
- **Username**: `admin`
- **Email**: `admin@hrcrm.com`
- **Password**: `admin123`
- **Role**: Superuser (full admin access)

---

## 12. Summary of All Files Changed

| Category | Count | Files |
|---|---|---|
| Backend models | 1 | `employee.py`, `expense.py` (new) |
| Backend schemas | 2 | `employee.py`, `user.py` |
| Backend repositories | 1 | `employee.py` |
| Backend services | 2 | `employee.py`, `user.py` |
| Backend routes | 14 | All route files updated |
| Backend utils | 1 | `response.py` (new) |
| Backend config | 2 | `config.py`, `database.py` |
| Frontend types | 1 | `types/index.ts` |
| Frontend services | 11 | All service `.ts` files |
| Frontend pages | 10 | Page `.tsx` files |
| Frontend config | 2 | `vite.config.ts`, `package.json` |
| Config/scripts | 3 | `requirements.txt`, `.env`, `seed.py` |
| **Total** | **~50 files** | |

---

## 13. How to Run

```bash
# Terminal 1 — Backend
cd backend
venv\Scripts\activate
pip install -r requirements.txt
python seed.py
uvicorn app.main:app --reload

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` and login with **admin** / **admin123**.
