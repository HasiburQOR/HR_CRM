# HR CRM

> All-in-one HR & Office Management platform — Employees, Attendance, Payroll, Leave, Tasks, Reminders, Expenses, **Inventory (Equipment + Supplies)**, Backups, Activity Logs, and Excel Reports — with FastAPI + SQLAlchemy backend and React 18 + Vite + Tailwind + shadcn/ui frontend, fully orchestrated with Docker Compose + Nginx.

---

## ✨ Features

| Module | What it does |
|---|---|
| 🔐 **Authentication** | JWT login with role-based access (Admin / HR / CEO / Employee). bcrypt password hashing. Tokens configurable 30-day TTL. |
| 📊 **Dashboard** | 12 stat cards (Employees, Attendance Today, Pending Leaves, Payroll, Pending Tasks/Expenses/Reminders, **Inventory Items / Assigned / Low Stock / Value**) + 4-tab Pending Requests (Leaves, Expenses, Salaries, Tasks) with approve/reject inline. Every employee row shows **Name + Employee ID** in a two-line format so identical names never get confused. |
| 👥 **Employees** | Full CRUD, with Employee ID (auto/manual), NID, DOB, Designation, Department, Date of Joining, Salary, Address, Status (Active / Inactive). Ranked search: **Exact Employee ID matches first**, then name/email/phone. One-click multi-sheet Excel report per employee. |
| ⏰ **Attendance** | Manual check-in / check-out, quick-mark, filter by date / month / year / range, status (Present / Absent / Late / Half Day / Leave). Lunch-break auto detection. Excel export. |
| 💰 **Salary / Payroll** | Basic + Allowances − Deductions = Net. Month/Year payment tracking, approval workflow, Excel export. |
| 🏖️ **Leave Requests** | Submit leave (Sick / Casual / Annual / Maternity / Paternity / LWP / Other), approve/reject with notes, date-range validation. |
| ✅ **Tasks** | Assign tasks to employees with EmployeeSelect (ID-first search), priority (High/Medium/Low), due date, status, completion %. |
| 🔔 **Reminders** | One-off or recurring, per-employee or global, email-style reminder_at calculation. |
| 🧾 **Expenses** | 17 categories (Office, Travel, People, catch-all **"Other"** with custom-category + description box), approval/rejection workflow, receipt reference field. Excel export. |
| 📦 **Inventory (NEW)** | Track **office equipment assigned to employees** (laptops, phones, access cards, keys, furniture) AND **general consumables** (stationery, kitchen, cleaning). 30-column schema: item_code, name, category, 8 item types, condition, qty / min_stock_alert, unit_cost/total_value, serial/model/manufacturer, purchase/warranty dates, employee FK + assignment notes. Full search, 6-column filter bar (Search / Category / Type / Status / Assigned-only / Low-stock-only), Assign / Unassign per row, low-stock amber badges, per-page Excel export. |
| 📈 **Reports (Excel)** | 5 reports — Employees, Attendance, Salary, Expenses, **Inventory**. Configure by Day/Month/Year/Range + optional employee filter, or 1-click Quick Download. Single-employee multi-sheet workbook (Profile + Attendance + Salary + Leave + Expenses + **Inventory** tab). All generated server-side with openpyxl via StreamingResponse (.xlsx). |
| 💾 **Backups** | Manual one-click or APScheduler auto-backups of SQLite DB + uploads. Download .zip, restore from any snapshot. |
| 🧑‍💼 **User Management** | Link System Users → Employee records, assign roles, reset passwords. |
| 📜 **Activity Logs** | Immutable audit trail of every Create/Update/Delete action via middleware — who, what, when, IP. |
| ⚙️ **Settings** | Company profile, attendance rules, salary components, leave policies — all in one place. |

---

## 🏗️ Architecture & Tech Stack

```
                 ┌──────────────────────────────┐
   Browser ─────►│  Nginx (port $WEB_PORT)      │
                 │                              │
                 │  ├── SPA fallback /         │
                 │  │   (frontend build)       │
                 │  │                           │
                 │  └── /api/*  ───────────────┼────► FastAPI  :8000
                 │                              │         │
                 └──────────────────────────────┘         ▼
                                                    SQLAlchemy ORM
                                                         │
                                              SQLite  (default, file db)
                                              ─ or ─
                                              PostgreSQL (production swap-in)
```

### Backend
| Stack | Version |
|---|---|
| Python | 3.11+ |
| FastAPI | latest |
| Uvicorn (standard) | HTTP server |
| SQLAlchemy 2.x + pydantic v2 | ORM & validation |
| SQLite (default) / PostgreSQL (prod) | Database |
| python-jose + bcrypt | JWT auth |
| openpyxl | Excel exports |
| APScheduler | Automatic backups |
| pydantic-settings + python-dotenv | Environment config |

### Frontend
| Stack | Version |
|---|---|
| React | 18.3.1 |
| TypeScript | 5.3+ |
| Vite | 5.x |
| Tailwind CSS | 3.4+ |
| shadcn/ui (Radix UI primitives) | Buttons, Dialogs, Table, Tabs, Select, Switch, Toast, ... |
| lucide-react | Icons |
| React Router 6 | Routing + auth-guarded layout |
| Axios | API client (`/api/*` via Nginx proxy, or `VITE_API_URL` for split hosting) |
| date-fns | Date formatting |
| recharts | Charts on dashboard |
| React Hook Form + zod | Form validation |

### Infrastructure
- **Docker**: multi-stage builds (frontend `node:20 build` → `nginx:alpine`), separate `python:3.11-slim` for API.
- **Docker Compose**: `api` + `web` services with Nginx reverse proxy, `/api` → `api:8000` over Docker internal DNS (no CORS or `VITE_API_URL` needed).
- **Healthchecks**: Nginx `depends_on: condition: service_healthy` so it doesn't 502 on startup before FastAPI is ready.
- **Volumes**: Named Docker volume `api-data` keeps SQLite durable. Bind mounts for `backend/uploads` and `backend/backups`.
- **PaaS-ready**: `frontend/vercel.json` (SPA fallback) for Vercel; backend Dockerfile for Render Containers / Fly.io / ECS / any VPS.

---

## 🚀 Quick Start — Docker Compose (Recommended)

Docker Desktop on Windows / macOS / Linux is required. On Windows, WSL2 backend is recommended.

### 1. Clone the repo
```bash
git clone https://github.com/HasiburQOR/HR_CRM.git
cd HR_CRM
```

### 2. Create your `.env`
Copy the example and — **critical** — set a strong random `API_SECRET_KEY`:
```bash
# Linux / macOS / Git Bash
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

Generate a 64-char secret:
```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```
Paste the output into `.env` → `API_SECRET_KEY=...`.

Optional defaults you can tweak in `.env`:
| Variable | Default | Purpose |
|---|---|---|
| `WEB_PORT` | `8080` | Browser-accessible port for the UI. Change to `80` for default HTTP. |
| `API_PORT` | `8000` | Direct FastAPI port (OpenAPI docs at `http://localhost:8000/docs`). |
| `TOKEN_EXPIRE_MINUTES` | `43200` | 30 days JWT lifetime. |
| `DATABASE_URL` | `sqlite+pysqlite:////data/hr_crm.db` | SQLite in Docker volume. For Postgres see **Production** section below. |

### 3. Build & start
```bash
docker compose build
docker compose up -d
```
Wait 15–30 seconds for the API healthcheck to pass. Verify:
```bash
docker compose ps
# api    → Up (healthy)   0.0.0.0:8000->8000
# web    → Up             0.0.0.0:8080->80
```

### 4. Seed default users (one-time, on empty DB)
```bash
docker compose exec api python seed.py
```
You'll see:
```
Admin:  admin / admin123
HR:     hr    / hr123
CEO:    ceo   / ceo123
```

### 5. Open the app
👉 **http://localhost:8080** (or whatever `WEB_PORT` you set)

### 6. (Optional) Try the API docs
👉 **http://localhost:8000/docs** — Swagger UI. Authenticate with the `/auth/login` "Try it out" button and use the returned `access_token` for Authorize.

---

## 💻 Local Development (No Docker)

Useful for debugging, hot-reload, or if you don't want to install Docker.

### Prerequisites
- Python 3.11+
- Node.js 20+
- npm (ships with Node) or pnpm/yarn

### Backend
```bash
cd backend
python -m venv .venv

# Git Bash / Linux
source .venv/Scripts/activate
# PowerShell
.venv\Scripts\Activate.ps1

pip install -r requirements.txt

# Create .env in backend/ if you want custom settings
# (Otherwise app uses sensible defaults.)

cd ..
python -m uvicorn app.main:app --reload --port 8000
```
Then seed:
```bash
cd backend
python seed.py
```
Backend runs on **http://localhost:8000** (docs at `/docs`, `/redoc`).

### Frontend (Vite dev server)
In another terminal:
```bash
cd frontend
npm install

# OPTIONAL: only needed if API is NOT at /api on same host
#   VITE_API_URL=http://localhost:8000
# Usually not needed with Vite dev proxy in vite.config.ts.

npm run dev
```
Frontend runs on **http://localhost:5173** with HMR. API calls proxy to `http://localhost:8000` via Vite dev-server proxy (no CORS issues).

### Production frontend build
```bash
cd frontend
npm run build
# Outputs to frontend/dist → served by Nginx in Docker.
```

---

## ☁️ Deployment Options

See the full step-by-step guide in **`RUNNING_AND_DEPLOYMENT.md`** — it includes:

| Section | Path |
|---|---|
| **No-Docker local native** | Part A.1 |
| **Cheap VPS (Ubuntu 22.04 + nginx + systemd + Certbot)** | Part A.2 |
| **Vercel (frontend) + Render (backend PaaS)** | Part A.3 |
| **docker compose on a VPS** | Part B.1 |
| **Fly.io individual containers** | Part B.2 |
| **Render Containers / ECS / Fargate** | Part B.3 / B.4 |

Quick decision table:

| Scenario | Recommendation |
|---|---|
| Just testing on my machine | Docker Compose above ✅ |
| $5/mo VPS, same-origin HTTPS | **nginx + systemd** in Part A.2 — or docker compose + Caddy/Nginx reverse |
| Zero-ops serverless | Vercel (SPA) + Render Free Tier (backend) |
| Need to scale containers / many employees | Fly.io or Render Containers |
| Enterprise AWS | ECS Fargate + ALB + RDS Postgres |

### 🔁 How to swap SQLite → PostgreSQL
For production on Render/Fly/RDS:

1. Install the Postgres driver: `pip install psycopg2-binary` (add to `backend/requirements.txt`).
2. In `.env` / service env vars set:
   ```
   DATABASE_URL=postgresql+psycopg2://user:password@db-host:5432/hr_crm
   ```
3. Rebuild/restart. All `Base.metadata.create_all()` + manual migrations apply the same schema to Postgres automatically.
4. Restore data from an Excel export, or use `sqlite3` → `pgloader` ETL.

---

## 📁 Project Structure

```
HR_CRM/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, routers, startup migrations
│   │   ├── config.py               # pydantic-settings env loader
│   │   ├── database.py             # SQLAlchemy engine/session
│   │   ├── middleware/             # audit_middleware, auth_middleware
│   │   ├── models/                 # SQLAlchemy models (13 tables)
│   │   │   ├── employee.py, attendance.py, salary.py, leave.py
│   │   │   ├── task.py, reminder.py, expense.py, user.py, role.py
│   │   │   ├── activity_log.py, backup.py, setting.py
│   │   │   └── inventory.py        # 📦 NEW 30-col inventory model
│   │   ├── schemas/                # Pydantic v2 request/response models
│   │   ├── repositories/           # Generic BaseRepository + per-table queries
│   │   ├── services/               # Business logic + validations
│   │   │   └── dashboard.py        # (includes inventory_total_items/value/assigned/low_stock)
│   │   ├── routes/                 # FastAPI routers per module
│   │   │   ├── auth.py, dashboard.py, employee.py, attendance.py
│   │   │   ├── salary.py, leave.py, task.py, reminder.py, expense.py
│   │   │   ├── inventory.py        # 📦 CRUD + /stats + /categories + /export + /assign /unassign
│   │   │   ├── reports.py          # 5x StreamingResponse Excel + employee multi-sheet
│   │   │   ├── backup.py, setting.py, user.py, role.py, activity_log.py
│   │   └── utils/                  # response helpers, security, timezone, audit, deps
│   ├── uploads/                    # Attachments (bind mount in compose)
│   ├── backups/                    # DB backup zips (bind mount in compose)
│   ├── alembic/                    # (optional) migrations via Alembic
│   ├── seed.py                     # Default users: admin/hr/ceo
│   ├── requirements.txt
│   └── Dockerfile                  # python:3.11-slim, uvicorn 0.0.0.0:8000
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                 # Routes + auth/tooltip/toaster providers
│   │   ├── main.tsx
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx       # 12 stat cards + 4-tab Pending Requests
│   │   │   ├── Employees.tsx       # Ranked EmployeeSelect search, per-row report
│   │   │   ├── Attendance.tsx, Salary.tsx, Leave.tsx, Tasks.tsx
│   │   │   ├── Reminders.tsx, Expenses.tsx
│   │   │   ├── Inventory.tsx       # 📦 4 stats + 6 filters + add/edit/assign/unassign/delete/export
│   │   │   ├── Reports.tsx         # 5 report cards + configure dialog
│   │   │   ├── Backups.tsx, Settings.tsx, ActivityLogs.tsx, Users.tsx
│   │   ├── components/
│   │   │   ├── layout/ (AppLayout, Sidebar, ProtectedRoute)
│   │   │   ├── ui/                 # shadcn primitives (button, dialog, table, ...)
│   │   │   └── EmployeeSelect.tsx  # Shared ranked combobox (Exact Employee ID → name/email)
│   │   ├── services/               # Per-module axios wrappers
│   │   │   ├── inventory.service.ts  # 📦 getAll/getStats/getCategories/CRUD/assign/unassign/export
│   │   │   └── reports.service.ts  # 5 blob downloads + employee individual
│   │   ├── contexts/AuthContext.tsx
│   │   ├── lib/ (axios, utils)
│   │   └── types/index.ts          # All TypeScript interfaces incl. InventoryItem
│   ├── Dockerfile                  # node:20 build → nginx:alpine (~25 MB)
│   ├── nginx.conf                  # /api proxy + SPA fallback + gzip + 20M body
│   ├── vercel.json                 # SPA rewrite rules for Vercel
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── tsconfig.json
│
├── docker-compose.yml              # api + web, healthchecks, volumes, env vars
├── .env.example
├── .gitignore                      # Secrets, venv, node_modules, DB, build artifacts
├── RUNNING_AND_DEPLOYMENT.md       # Full deploy guide (700+ lines)
├── DATABASE.md / FEATURES.md / PROJECT_RULES.md / ROADMAP.md / CHANGELOG.md
└── README.md                       # ← you are here
```

---

## 📦 Inventory Module — Quick Tour

> Added 2026. Use it to track **assigned equipment** (laptops, monitors, phones, chairs, access cards, keys) and **consumable stock** (pens, paper, toner, first-aid, etc.).

### In the UI (Sidebar → Inventory)
1. **New Item** → Fill code, name, category, type, qty, min-stock, cost, serial/model/manufacturer, dates...
2. **Assign** to an employee via the purple 👤 button on any row → uses EmployeeSelect (ID-first search).
3. **Unassign** via red ➖ button when they return it.
4. **Low-stock amber badge + filter toggle** → immediately see what needs reordering.
5. **Export Excel** → 28 columns with full detail, or use the Reports page for employee-filtered exports.

### Default Item Types
`equipment`, `supplies`, `furniture`, `devices`, `consumable`, `access_card`, `key`, `other`

### Default Seeded Categories
IT Equipment, Office Furniture, Stationery, Kitchen Supplies, Cleaning Supplies, Safety Equipment, Access Control, Other.

### Inventory shows up in:
- Dashboard — 4 stat cards (Items / Assigned / Low Stock / Value)
- Reports page — 5th violet "Inventory Report" card (Quick Download OR Configure → filter by employee)
- Individual Employee multi-sheet report — **Inventory** tab (everything assigned to them)
- `/reports/inventory` API endpoint — 21-column Excel, query params: `category`, `item_type`, `status`, `employee_id`, `assigned`, `low_stock`

---

## 🔐 Default Accounts & Roles

After running `seed.py`:

| Username | Password | Role | Can do |
|---|---|---|---|
| `admin` | `admin123` | **Admin** | Everything (all CRUD, settings, users, backups) |
| `hr` | `hr123` | **HR** | Employees, Attendance, Leave, Salary, Expenses, Inventory, Reports |
| `ceo` | `ceo123` | **CEO** | Read-only views + reports + approvals |
| — | (per-employee) | **Employee** | Own attendance, leave requests, assigned tasks, reminders, profile |

⚠️ **Production MUST DOs:**
- Change all default passwords from the Users page after first login.
- Set `API_SECRET_KEY` to a long random string (never commit `.env` to git — already ignored by `.gitignore`).
- Use HTTPS (Certbot for VPS, automatic on Vercel/Render/Fly).
- Set `TOKEN_EXPIRE_MINUTES` to something smaller (e.g. 480 = 8 hours) for compliance.

---

## 📥 Exports & Reports (all `.xlsx`, server-side)

Generated with `openpyxl` and streamed via `StreamingResponse`. No client-side Excel libraries — works offline, small bundle, consistent formatting.

| Report / Trigger | What's in it |
|---|---|
| **Employees Report** (Reports page) | Employee ID, Name, Email, NID, DOB, Designation, Department, DoJ, Address, Salary, Status |
| **Attendance Report** | Period-filterable, Employee ID, Name, Date, Clock-in/out, Status, Notes |
| **Salary Report** | Period-filterable, Basic, Allowances, Deductions, Net, Payment Date, Status |
| **Expenses Report** | Period-filterable, Category, Amount, Description, Date, Status |
| **Inventory Report** (NEW) | Filter by Category/Type/Status/Employee/Assigned-only/Low-stock. 21 columns: Code, Name, Category, Type, Condition, Location, Qty, Min Stock, Low Stock Y/N, Unit Cost, Total Value, Serial#, Model#, Manufacturer, Purchase, Warranty, Employee ID, Name, Dept, Assigned On, Assignment Notes, Status, Description |
| **Single Employee** (Employees page → 📊 icon) | 6-TAB WORKBOOK — Profile · Attendance · Salary · Leave · Expenses · **Inventory (NEW)** |
| **Inventory page → Export Excel** | Same 28 columns as above, honors active filters |

---

## 🛠️ Common Tasks / FAQ

### How do I reset the database completely?
```bash
docker compose down -v          # -v DELETES the named volume (all data)
docker compose up -d
docker compose exec api python seed.py
```
⚠️ Irreversible. Take a backup zip from the Backups page first if you need data.

### Employees with the SAME name — how are they not confused?
- Every table cell that shows an employee name uses a **two-line layout**:
  - Bold: Full name
  - Small muted: `ID: EMP-00123`
- Shared `EmployeeSelect` search component **ranks exact Employee ID matches first**, then name/email/phone.

### The app shows 502 Bad Gateway for 10 seconds after `docker compose up -d`
This is expected on first start — Nginx waits for the API `healthcheck` (hits `/docs` every 30s, up to 5 retries). After the first 20s `start_period` it will come up.

### Can I use PostgreSQL instead of SQLite?
Yes — see **Production / SQLite → Postgres** above. The app uses pure SQLAlchemy + manual `ALTER` migrations that work on both SQLite and Postgres.

### Uploads and backups directories
Stored at:
- `backend/uploads/` (bind mount in compose — survives container rebuilds)
- `backend/backups/` (same)
Both have `.gitkeep` in the repo so empty dirs are cloned correctly.

### The API secret env variable names mismatch?
The app supports **both** names for compatibility:
- Docker compose uses `SECRET_KEY` → [config.py](backend/app/config.py) aliases it to the JWT secret internally.
- `.env.example` uses `API_SECRET_KEY` (user-friendly). The config also reads it.
- Either (or both) work — pick one and be consistent.

---

## 🧪 Diagnostics & Logs

```bash
# All container logs, tail mode
docker compose logs -f

# Just API
docker compose logs api --tail 200

# Just Nginx/web
docker compose logs web --tail 100

# Health of containers
docker compose ps

# Enter API container for manual SQL / debugging
docker compose exec api python
>>> from app.database import SessionLocal
>>> from app.models.user import User
>>> db = SessionLocal()
>>> db.query(User).all()
```

If SQLite file is needed directly, it's at `/data/hr_crm.db` inside the api container. Copy it out:
```bash
docker cp hr-crm-api:/data/hr_crm.db ./hr_crm_backup.db
```

---

## 🧱 Built With Love For

- Fast-growing SMEs (5–500 employees)
- HR / Admin teams that hate paperwork
- Excel addicts who need beautiful structured exports
- Zero-devops-budget shops (Docker Compose on a $5 VPS works forever)

---

## 📄 License

Use this project as you like. Credit is appreciated but not required. If you build something on top, tell me — I'd love to see it 🎉

---

## 🆘 Need help?

- Deployment & hosting step-by-step: **`RUNNING_AND_DEPLOYMENT.md`**
- Database schema notes: **`DATABASE.md`**
- Roadmap / changelog: **`ROADMAP.md`** · **`CHANGELOG.md`**
- Project conventions & rules: **`PROJECT_RULES.md`**
