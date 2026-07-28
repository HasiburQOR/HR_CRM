# HR CRM — Complete Deployment & Hosting Guide

This document covers **every** way to run the HR CRM app, from a single command on your laptop to a production cluster. Two paths are described in depth:

- **Part A — Without Docker** (bare-metal / native OS)
  - 1. Local development (Windows / macOS / Linux)
  - 2. Production on a cheap VPS (Ubuntu + nginx + systemd)
  - 3. Managed PaaS (Vercel + Render.com, no servers at all)
- **Part B — With Docker** (containers, reproducible builds)
  - 4. One-click local stack with `docker compose`
  - 5. Individual containers (`docker build` / `docker run`)
  - 6. Production container hosts (Fly.io / Render Containers / AWS ECS)
  - 7. Swarm / single-host Compose on a VPS
  - 8. **Dockploy** — Compose + Traefik + Let's Encrypt with a custom domain (e.g. `hrcrm.devhasib.lol`)

---

## Quick Reference — Where Do I Start?

| I want to… | Go to | Time |
|---|---|---|
| Run it on my laptop now, no setup | §4 Docker Compose | ~5 min |
| Classic native install (IDE, hot reload) | §1 Local native | ~10 min |
| Host it on the internet for free | §3 Vercel + Render | ~15 min |
| **Deploy on Dockploy with auto-HTTPS + custom domain** | **§8 Dockploy (Part B)** | **~10 min** |
| Host it on a $5 VPS properly with SSL | §2 VPS nginx/systemd | ~25 min |
| Ship containers to any cloud | §5 + §6 Docker/Fly | ~20 min |

---

## Project Layout

```
HR_CRM_Project_Documentation/
├── backend/                 FastAPI + SQLAlchemy + SQLite/PostgreSQL
│   ├── app/                 Routes, models, services, config
│   ├── seed.py              Creates default admin/hr/ceo users
│   ├── hr_crm.db            SQLite DB (auto-created first run)
│   ├── requirements.txt
│   ├── .env
│   └── Dockerfile
├── frontend/                React 18 + Vite + Tailwind + TS
│   ├── src/                 Pages, components, services
│   ├── package.json
│   ├── vite.config.ts
│   ├── nginx.conf           Production web-server + /api proxy
│   ├── Dockerfile
│   └── vercel.json          SPA rewrites + /api proxy to Render
├── docker-compose.yml       * One command: frontend + backend *
├── .env.example             Copy → .env for compose
└── RUNNING_AND_DEPLOYMENT.md   This file
```

### Default Users (auto-seeded)

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Admin |
| `hr`    | `hr123`    | HR    |
| `ceo`   | `ceo123`   | CEO   |

Change these in production! Go to **Users** page in the app.

---

---

# 🅰️ PART A — DEPLOY WITHOUT DOCKER

Use this when you want the simplest debugging path, the fastest hot-reload, or a host where Docker isn't available (shared hosting, managed Python buildpacks, etc.).

---

## 1. Local Native Install (Development, Windows / macOS / Linux)

### 1.1 Prerequisites

| Tool | Min version |
|---|---|
| Python | 3.11+ (3.12 recommended) |
| Node.js | 20+ (22/24 fine) |
| npm (bundled with Node) | 9+ |

Verify:

```bash
python --version     # Python 3.11.x / 3.12.x
node --version       # v20.x+
npm --version
```

> **Windows PowerShell**: PowerShell blocks `.ps1` script files by default — use `.cmd` variants:
> `npm.cmd`, `npx.cmd`, `pip.exe`.

### 1.2 First-time Setup

**Terminal 1 — Backend:**

```bash
cd backend
python -m venv .venv

# Windows (PowerShell 5) — activate:
.venv\Scripts\activate.bat
# Windows (PowerShell 7+) — if execution policy allows:
# .venv\Scripts\Activate.ps1
# macOS / Linux:
# source .venv/bin/activate

pip install -r requirements.txt
python seed.py                          # seeds admin / hr / ceo users
```

**Terminal 2 — Frontend:**

```bash
cd frontend
npm.cmd install        # or `npm install` on mac/linux
```

### 1.3 Start the App

**Terminal 1 — Backend on http://localhost:8000**

```bash
cd backend
.venv\Scripts\activate.bat      # if needed
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Swagger / interactive API:  **http://localhost:8000/docs**
- OpenAPI schema:              **http://localhost:8000/openapi.json**

**Terminal 2 — Frontend on http://localhost:5173**

```bash
cd frontend
npm.cmd run dev
```

Open http://localhost:5173 → log in with `admin / admin123`.

How it works locally: [vite.config.ts](frontend/vite.config.ts#L12-L21) proxies every `/api/*` request to `http://localhost:8000/*`.

### 1.4 Preview the Production Build

```bash
cd frontend
npm.cmd run build        # compiles to dist/
npm.cmd run preview      # serves dist/ on :4173
```

### 1.5 Common Local-Run Problems

| Symptom | Fix |
|---|---|
| PowerShell `PSSecurityException` | Use `npm.cmd` / `.cmd` scripts |
| Port 8000 / 5173 in use | `netstat -ano \| findstr :8000` → `taskkill /F /PID <pid>` |
| Dashboard 500 first run | Restart uvicorn once so migrations in [main.py](backend/app/main.py#L39) add missing columns |
| Reminders 500 first run | Same — table rebuild runs on startup |
| Blank page, `/api/... 404` | Backend isn't running or Vite proxy is wrong. Check Terminal 1 |

---

## 2. Production on a Cheap VPS (Ubuntu 24.04 — $5 DigitalOcean/Hetzner)

Goal: One server runs **frontend via nginx on port 80/443** and **backend via uvicorn + systemd on 127.0.0.1:8000**, with free Let's Encrypt SSL via `certbot`.

### 2.0 Provision & Connect

Create a Ubuntu 24.04 VPS with ≥1 GB RAM, note its public IP, then:

```bash
ssh ubuntu@<YOUR_VPS_IP>
```

### 2.1 Install Dependencies

```bash
sudo apt update && sudo apt install -y \
  git python3.12 python3.12-venv python3-pip \
  nodejs npm nginx certbot python3-certbot-nginx

# Make sure Node is v20+ (Ubuntu apt ships an older one sometimes):
# curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
# sudo apt install -y nodejs
```

### 2.2 Deploy the Backend

```bash
# Prepare app folder
sudo mkdir -p /opt/hr-crm && sudo chown ubuntu:ubuntu /opt/hr-crm
git clone <YOUR_GIT_REPO_URL> /opt/hr-crm/app

cd /opt/hr-crm/app/backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Seed users + set a strong SECRET_KEY
python seed.py
echo 'SECRET_KEY='$(python -c "import secrets; print(secrets.token_urlsafe(64))") >> .env
echo 'ACCESS_TOKEN_EXPIRE_MINUTES=43200' >> .env
cat .env
```

### 2.3 Systemd Service (keeps backend alive forever)

```bash
sudo tee /etc/systemd/system/hr-crm-api.service <<'EOF'
[Unit]
Description=HR CRM FastAPI backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/hr-crm/app/backend
EnvironmentFile=/opt/hr-crm/app/backend/.env
ExecStart=/opt/hr-crm/app/backend/.venv/bin/uvicorn app.main:app \
    --host 127.0.0.1 --port 8000 \
    --forwarded-allow-ips "*" --workers 2
Restart=always
RestartSec=3
User=ubuntu

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now hr-crm-api
systemctl status hr-crm-api      # confirm: active (running)
```

Smoke-test locally on the VPS:
```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/docs
# → expect 200
```

### 2.4 Build the Frontend (no external API URL — same-domain proxy!)

```bash
cd /opt/hr-crm/app/frontend
npm install
# VITE_API_URL is left EMPTY on purpose: we proxy /api on the same domain.
npm run build
ls dist/     # should show index.html, assets/, etc.
```

### 2.5 Nginx: Serve SPA + Proxy `/api`

Point `hr.yourdomain.com` DNS A-record → VPS public IP first.

```bash
sudo tee /etc/nginx/sites-available/hr-crm <<'EOF'
server {
    listen 80;
    server_name hr.yourdomain.com;

    root /opt/hr-crm/app/frontend/dist;
    index index.html;

    client_max_body_size 20M;

    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_read_timeout 60s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/hr-crm /etc/sites-enabled/hr-crm
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 2.6 Free HTTPS with Certbot

```bash
sudo certbot --nginx -d hr.yourdomain.com --redirect --non-interactive --agree-tos -m you@yourdomain.com
```

Visit **https://hr.yourdomain.com** → log in `admin / admin123` → done 🎉.

### 2.7 Deploying Updates Later

```bash
cd /opt/hr-crm/app
git pull

# Backend deps + restart
cd backend
source .venv/bin/activate
pip install -r requirements.txt
python seed.py     # safe, idempotent
deactivate
sudo systemctl restart hr-crm-api

# Frontend rebuild
cd ../frontend
npm install
npm run build     # dist/ is already served by nginx — no reload needed
```

---

## 3. Managed PaaS (No Servers At All: Vercel + Render.com)

This is the lowest-maintenance option. Recommended for production when you don't want to touch Linux.

### 3.1 Deploy Backend to Render.com

1. Push repo to GitHub/GitLab.
2. Render → **New → Web Service**, pick repo.
3. Settings:
   - **Root Directory**  → `backend`
   - **Runtime**         → `Python 3.12`
   - **Build Command**   → `pip install -r requirements.txt && python seed.py`
   - **Start Command**   → `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Environment Variables:
   ```
   SECRET_KEY                <paste output of:
                              python -c "import secrets; print(secrets.token_urlsafe(64))">
   ACCESS_TOKEN_EXPIRE_MINUTES  43200
   ```
5. **Create Web Service** → wait ~1 min → you get `https://hr-crm-api-XXXX.onrender.com`.
6. ✅ Smoke test: open `https://hr-crm-api-XXXX.onrender.com/docs` → Swagger loads.

> **SQLite vs Postgres on Render**: Render's disk is ephemeral on free tier — SQLite vanishes each deploy. For **permanent data**, provision a free Render Postgres instance and add:
> ```
> DATABASE_URL=postgresql://user:pass@....render.com:5432/hr_crm
> ```
> Rebuild. Tables auto-create.

### 3.2 Deploy Frontend to Vercel (proxies `/api` to Render)

1. Update [vercel.json](frontend/vercel.json) — replace the placeholder domain:
   ```json
   {
     "rewrites": [
       { "source": "/api/:path*", "destination": "https://hr-crm-api-XXXX.onrender.com/:path*" },
       { "source": "/(.*)",       "destination": "/index.html" }
     ]
   }
   ```
   (Because of this rewrite, **no `VITE_API_URL` is needed** — same-domain feel on two hosts.)
2. Vercel → **New Project** → pick repo → **Root Directory** → `frontend`.
3. Framework = Vite (auto-detected). Leave env vars empty (rewrites handle API).
4. **Deploy** → you get `https://hr-crm.vercel.app`.
5. ✅ Open login → `admin / admin123` → Dashboard loads.

You're live! 🚀.

### 3.3 Single-Provider Alternative: Everything on Render

- **Web Service (Backend)**: root dir `backend`, exactly as §3.1.
- **Static Site (Frontend)**: root dir `frontend`.
  - Build: `npm install && npm run build`
  - Publish: `dist`
  - Build env var on Render Static Site:
    ```
    VITE_API_URL=https://hr-crm-api-XXXX.onrender.com
    ```
  - Add SPA rewrite in site settings → **Rewrites**: `Source /*  →  Destination /index.html`

---

---

# 🅱️ PART B — DEPLOY WITH DOCKER

Use Docker for reproducible builds, identical dev/staging/prod environments, and easy shipping to any container host (Fly.io / ECS / Render Containers / your VPS / Kubernetes).

Two pre-built images:

| Service | Dockerfile | Exposes |
|---|---|---|
| FastAPI backend | [backend/Dockerfile](backend/Dockerfile) | `:8000` |
| React SPA (nginx) | [frontend/Dockerfile](frontend/Dockerfile) + [nginx.conf](frontend/nginx.conf) | `:80` with `/api → api:8000` proxy |

---

## 4. One-Click Full Stack with `docker compose` (Local or VPS)

This is the fastest way to run the **entire app** — nginx + backend + volumes. One command.

### 4.1 Prerequisites

Install Docker Engine 25+ (or Docker Desktop on Windows/macOS). Verify:

```bash
docker --version
docker compose version
```

### 4.2 Configure

```bash
# From the project root
cp .env.example .env
```

Edit `.env` — at minimum set a strong secret:

```bash
# Generate one:
python -c "import secrets; print(secrets.token_urlsafe(64))"
# Paste into .env as API_SECRET_KEY=...
```

Optional variables in `.env`:

| Var | Default | Purpose |
|---|---|---|
| `WEB_PORT` | `8080` | Browser-facing port for nginx UI |
| `API_PORT` | `8000` | Exposed API port (close this in production firewall) |
| `API_SECRET_KEY` | (insecure placeholder) | JWT signing key **MUST CHANGE** |
| `TOKEN_EXPIRE_MINUTES` | `43200` (30 days) | Login session lifetime |
| `DATABASE_URL` | SQLite in `/data` volume | Set to Postgres URL for production |

### 4.3 Start

```bash
docker compose up -d --build
```

Watch logs:
```bash
docker compose logs -f api        # backend logs
docker compose logs -f web        # nginx logs
docker compose ps                 # both should be "Up" + healthy
```

### 4.4 Access

- UI:    **http://localhost:8080** (or `http://<VPS_IP>:8080`)
- API:   **http://localhost:8000/docs** (Swagger)
- Login: `admin / admin123`

### 4.5 Useful Compose Commands

| Action | Command |
|---|---|
| Stop everything (keeps DB) | `docker compose down` |
| Stop + wipe DB volume | `docker compose down -v` |
| Rebuild after code change | `docker compose up -d --build` |
| Shell into backend | `docker compose exec api bash` |
| Run seed again | `docker compose exec api python seed.py` |
| Live logs (both) | `docker compose logs -f` |

### 4.6 Backing Up Data (SQLite on Compose)

```bash
# Direct copy from named volume
docker run --rm -v hr-crm-project-documentation_api-data:/data -v "$(pwd):/backup" \
  alpine cp /data/hr_crm.db /backup/hr_crm_$(date +%F).db
```

Or use the in-app **Backups** page (Admin → Backups) which writes to `./backend/backups/` on the host.

### 4.7 Swap SQLite for Postgres (Production Compose)

Edit `docker-compose.yml`, add a Postgres service, and point `api` at it:

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: hr-crm-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: hr_crm
      POSTGRES_USER: hrcrm
      POSTGRES_PASSWORD: <strong-password>
    volumes:
      - pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hrcrm -d hr_crm"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql+psycopg2://hrcrm:<strong-password>@db:5432/hr_crm
    # … rest of api unchanged

volumes:
  api-data:
  pg-data:
```

Then add `psycopg2-binary` to [backend/requirements.txt](backend/requirements.txt) and rebuild:

```bash
echo psycopg2-binary >> backend/requirements.txt
docker compose up -d --build
```

---

## 5. Run Individual Containers (No Compose)

Useful for testing each image separately, or on container PaaS that only accept a single Dockerfile.

### 5.1 Backend Only

```bash
cd backend

# 1. Build
docker build -t hr-crm-api .

# 2. Generate a SECRET_KEY
export SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(64))")

# 3. Run on :8000
#    - Volume-mounts a host folder for hr_crm.db + uploads
mkdir -p /tmp/hrcrm-data
docker run --name hr-crm-api \
  -p 8000:8000 \
  -e SECRET_KEY=$SECRET_KEY \
  -e ACCESS_TOKEN_EXPIRE_MINUTES=43200 \
  -v /tmp/hrcrm-data:/data \
  -v "$(pwd)/uploads:/app/uploads" \
  -v "$(pwd)/backups:/app/backups" \
  -e DATABASE_URL="sqlite+pysqlite:////data/hr_crm.db" \
  --health-cmd="python -c \"import urllib.request; urllib.request.urlopen('http://localhost:8000/docs')\"" \
  --health-interval=30s \
  --health-start-period=20s \
  -d hr-crm-api

# Seed users (run once after first start)
docker exec hr-crm-api python seed.py

# Verify:
curl -I http://localhost:8000/docs
# HTTP 200 OK
```

### 5.2 Frontend + Nginx Container (with API proxy on same host)

This image **needs to know** where the backend lives at **build time** (`VITE_API_URL`) if you intend to use a **separate** backend domain. For same-host we let nginx proxy `/api` — so leave the arg empty and pass the backend container on the same Docker network:

```bash
# Create a private network so nginx can reach the API container by name
docker network create hr-net

# (Re)start the api container on that network
docker rm -f hr-crm-api
docker run --name hr-crm-api --network hr-net \
  -e SECRET_KEY=$SECRET_KEY -d hr-crm-api

# Build frontend (no build-arg — API URL will be proxied by nginx via same /api path)
cd ../frontend
docker build -t hr-crm-web .

# Before running, re-apply the docker-compose-style nginx.conf that proxies /api → api:8000
# (the one in the repo works; just make sure it's in ./frontend/nginx.conf)
docker run --name hr-crm-web --network hr-net \
  -p 8080:80 \
  -v "$(pwd)/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -d hr-crm-web
```

Visit **http://localhost:8080** → done.

---

## 6. Production Container Hosts (Fly.io / Render Containers)

### 6.1 Fly.io (globally distributed containers, easiest Docker PaaS)

Install `flyctl`: https://fly.io/docs/hands-on/install-flyctl/

```bash
fly auth login
```

#### Backend to Fly.io

```bash
cd backend

# This auto-detects Dockerfile and launches an app. Choose a region (lhr=London, iad=Virginia, etc.)
fly launch --name hr-crm-api --region lhr --no-deploy

# Set secrets (never commit these)
fly secrets set \
  SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(64))") \
  ACCESS_TOKEN_EXPIRE_MINUTES=43200

# Optional: Provision a Postgres (preferred over SQLite on Fly because ephemeral FS)
# fly postgres create --name hr-crm-db --region lhr
# fly postgres attach hr-crm-db -a hr-crm-api

# Deploy
fly deploy

# Open docs
fly open /docs
```

#### Frontend to Fly.io (optional — Vercel is easier for static)

```bash
cd ../frontend
# Before build: if using separate backend, set backend URL in nginx.conf OPTION A, or
# alternatively set VITE_API_URL at build time below.
fly launch --name hr-crm-web --region lhr --no-deploy

# If your backend is on Fly at https://hr-crm-api.fly.dev, set it via docker build-arg via fly.toml:
# In fly.toml add:
#   [build]
#     dockerfile = "Dockerfile"
#   [build.args]
#     VITE_API_URL = "https://hr-crm-api.fly.dev"

fly deploy
fly open
```

### 6.2 Render Containers (Dockerfile deployment)

1. Render → **New → Web Service** → pick repo.
2. **Root Dir** = blank (repo root). Choose **Runtime = Docker**.
3. To run just the backend, tell Render the Dockerfile location:
   - `Dockerfile Path` = `backend/Dockerfile`
   - `Docker Context` = `backend`
   - Env vars same as §3.1.
4. For a combined single service:
   - Use docker-compose-like approach is NOT supported; create **two** separate services (one for each Dockerfile) and set `VITE_API_URL` on the frontend pointing to the backend service URL. Render runs a single image per service.

### 6.3 AWS ECS Fargate / GCP Cloud Run / Azure ACI

Push the two built images to a registry (ECR / GCR / ACR):

```bash
# Tag & push backend
docker tag hr-crm-api 123456789012.dkr.ecr.us-east-1.amazonaws.com/hr-crm-api:latest
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/hr-crm-api:latest

# Tag & push frontend
docker tag hr-crm-web 123456789012.dkr.ecr.us-east-1.amazonaws.com/hr-crm-web:latest
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/hr-crm-web:latest
```

Then create:
- Backend service: `hr-crm-api` image, env vars, target port 8000, attach a persistent volume at `/data` if using SQLite (otherwise RDS Postgres).
- Frontend service: `hr-crm-web` image, target port 80. For `/api` proxying, replace the nginx.conf `proxy_pass http://api:8000` with your backend's internal service DNS, or set `VITE_API_URL` and rebuild the image without the `/api` location at all.
- (Optional) Put both behind an ALB with host-based routing → `hr.yourdomain.com` to frontend, `api.yourdomain.com` to backend.

---

## 7. Docker Compose on a VPS (Production-grade)

Best of both worlds: reproducible containers + single cheap VPS. Use this for ~1000 users or fewer.

### 7.0 VPS Setup

Ubuntu 24.04 ≥ 2 GB RAM. Install Docker per [docs.docker.com/engine/install/ubuntu](https://docs.docker.com/engine/install/ubuntu/) + install the Compose plugin.

### 7.1 Deploy

```bash
ssh ubuntu@<VPS_IP>
sudo mkdir -p /opt/hr-crm && sudo chown ubuntu:ubuntu /opt/hr-crm
git clone <YOUR_GIT_REPO_URL> /opt/hr-crm/app
cd /opt/hr-crm/app

# Configure env
cp .env.example .env
nano .env      # set API_SECRET_KEY, WEB_PORT=80, DATABASE_URL → Postgres or keep SQLite

# Start detached
docker compose up -d --build

# Seed once (idempotent)
docker compose exec api python seed.py
```

### 7.2 Add HTTPS via Caddy (simpler than nginx + certbot for compose)

**Option**: Replace the `web` service with Caddy as a reverse-proxy to get automatic HTTPS. Add a `Caddyfile`:

```
hr.yourdomain.com {
    handle /api/* {
        reverse_proxy api:8000 {
            header_up Host {host}
        }
    }
    handle {
        root * /usr/share/nginx/html
        try_files {path} /index.html
        file_server
    }
}
```

Then in `docker-compose.yml`, swap `web` for `caddy:2-alpine` with both `Caddyfile` and `frontend/dist` mounted, or run Caddy as a third container in front of `web`. Simpler alternative: just run nginx as is, terminate TLS with Cloudflare (orange-clouded DNS) → instant HTTPS without touching certs.

---

---

# 📋 Common Operations (Docker + No-Docker)

## Configuration Reference

### Backend Env Vars ([backend/.env](backend/.env))

| Var | Default | Required for production? |
|---|---|---|
| `SECRET_KEY` | placeholder | **YES** — 64+ random chars |
| `ALGORITHM` | `HS256` | no |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | yes — set to `43200` (30d) or similar |
| `DATABASE_URL` | `sqlite+pysqlite:///./hr_crm.db` | yes — Postgres URL for prod |

Generate a strong `SECRET_KEY`:
```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

### Frontend Env Vars (frontend/.env.local, build-time)

| Var | Purpose |
|---|---|
| `VITE_API_URL=https://api.yourdomain.com` | Only set if frontend is hosted on a **different** domain than the backend, AND you are not using a same-domain `/api` proxy (Vercel rewrites, nginx location, Caddy handle). If you proxy `/api`, **leave unset**. |

> ⚠️ `VITE_*` values are inlined at **build time** — change requires rebuild.

## Production Database: Move Off SQLite

1. Provision Postgres (Supabase free tier / Neon / Render / RDS / local `docker compose`).
2. Set one env var:
   ```
   DATABASE_URL=postgresql+psycopg2://user:password@host:5432/hr_crm
   ```
3. Add the driver to [backend/requirements.txt](backend/requirements.txt):
   ```
   psycopg2-binary
   ```
4. Restart backend. Tables auto-create via `Base.metadata.create_all()` in [main.py](backend/app/main.py), then `_run_sqlite_migrations()` fills missing columns (SQLite legacy compatibility shim — safe no-op on Postgres).
5. `python seed.py` (idempotent).

## Pre-Launch Checklist

- [ ] `SECRET_KEY` is **not** the placeholder.
- [ ] Database is Postgres (unless using compose named-volume backups and single instance).
- [ ] `ACCESS_TOKEN_EXPIRE_MINUTES` is reasonable (e.g. `43200` = 30 days).
- [ ] HTTPS only (Vercel auto; VPS → certbot or Cloudflare orange).
- [ ] Default admin/hr/ceo passwords changed in-app via **Users** page.
- [ ] Regular backups: use the app's Admin → **Backups** page, or schedule a cron job.

## Troubleshooting Deployed Sites

| Problem | Check |
|---|---|
| Login loads but submit does nothing / CORS | CORS origins in [main.py](backend/app/main.py) are `["*"]` (already open). If restricted, add your frontend origin. |
| Dashboard 404 on reload | Vercel/S3/static → ensure `/* → /index.html` SPA rewrite exists. |
| Dashboard 500 in production | Missing DB column — restart backend once (migration runs on boot), then check logs. |
| Tasks Assigned-To empty | Seeded employees have `user_id=NULL` — re-create the employee via the Employees page and link a User. |
| Blank page, `/api/* 404` | nginx/vercel rewrite / reverse proxy `/api` to backend not configured. |
| Compose: `web` 502 Bad Gateway | `api` container not healthy. Run `docker compose ps` + `docker compose logs api`. |
| Compose: Login page blank JS 404 | Rebuilt frontend but browser cached old assets. Hard-refresh (Ctrl+Shift+R). |
| **Dockploy:** 404 at `https://hrcrm.devhasib.lol/api/...` | Verify `traefik.docker.network=dockploy` label is on `api` AND the `external: dockploy` network block in compose. Also ensure router `priority=200` on `/api` route so it beats the catch-all web route. |
| **Dockploy:** 502 Bad Gateway (even after 2 min) | `depends_on: condition: service_healthy` is working — open Dockploy → Stack → `api` → View Logs. Most common: Postgres password mismatch (update env + redeploy), or `DATABASE_URL` malformed. |
| **Dockploy:** "LetsEncrypt certificate failed" | Domain DNS must fully propagate **before** first deploy. If you deployed before DNS was live, delete the stack in Dockploy, wait 1 min, re-deploy (Traefik will retry ACME challenge against the now-correct DNS). |

---

---

# 🪝 PART B — §8 DOCKPLOY DEPLOY (Recommended: Compose + Auto-HTTPS)

> **Why Dockploy?** It's a self-hosted Docker Compose deployment panel with:
> - Built-in **Traefik** reverse proxy
> - Auto **Let's Encrypt HTTPS** on any domain you point at it
> - Per-stack **Environment Variables** editor (no SSH-ing to edit `.env`)
> - GitHub webhook auto-redeploy on every `git push`
> - Container logs, restart, exec-shell, and metrics in one UI
>
> This section uses the example domain **`hrcrm.devhasib.lol`**. Replace it with your own domain everywhere it appears.

## 8.1 Prerequisites

- [x] A VPS with Ubuntu 22.04 / Debian 12 and Dockploy installed (see Dockploy docs).
- [x] A domain / subdomain (e.g. `hrcrm.devhasib.lol`) with DNS **fully propagated** to your Dockploy server's public IP.
- [x] This GitHub repo cloned / pushed (already done at `HasiburQOR/HR_CRM`).
- [x] Port **80** and **443** open in the VPS firewall (`ufw allow 80` / `ufw allow 443`).
- [x] `dockploy` Docker network exists on the host (auto-created by Dockploy install). Verify:
  ```bash
  docker network ls | grep dockploy
  ```

## 8.2 DNS Setup

In your DNS provider (Cloudflare / Namecheap / etc.), add an **A record**:

| Type | Name | Value | TTL |
|---|---|---|---|
| `A` | `hrcrm.devhasib.lol` | `YOUR_DOCKPLOY_SERVER_PUBLIC_IP` | 300 (Auto) |

Wait 5–60 seconds, then **verify propagation** before deploying:
```bash
nslookup hrcrm.devhasib.lol
dig +short hrcrm.devhasib.lol
```
If the answer matches your VPS IP → continue. If not, wait and retry — deploying too early breaks Let's Encrypt issuance.

## 8.3 Project Files (already prepared for you)

The repo was updated for Dockploy. These files matter:

| File | What's Dockploy-specific |
|---|---|
| [docker-compose.yml](docker-compose.yml) | 3 services: `db` (Postgres 16), `api` (FastAPI), `web` (Nginx SPA). Traefik labels for `Host(hrcrm.devhasib.lol)` routing, `/api/*` strip-prefix, `certresolver=letsencrypt`, priority ordering, `dockploy` external network. |
| [backend/requirements.txt](backend/requirements.txt) | **Added `psycopg2-binary`** — Postgres driver required when using the built-in Postgres service (no manual install needed). |
| [.env.example](.env.example) | Now includes `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` examples. |
| [frontend/nginx.conf](frontend/nginx.conf) | Unchanged — still has `/api` fallback proxy for local-Docker use (Dockploy routes via Traefik labels instead, so this is harmlessly redundant). |

### 🔍 Dockploy Compose — key things you don't need to change:
The compose labels encode Dockploy's routing contract:
```yaml
# web service (catch-all, priority 100)
traefik.http.routers.hrcrm-web.rule=Host(`hrcrm.devhasib.lol`)

# api service (/api path FIRST, priority 200 — higher = evaluated first)
traefik.http.routers.hrcrm-api.rule=Host(`hrcrm.devhasib.lol`) && PathPrefix(`/api`)
traefik.http.middlewares.hrcrm-api-strip.stripprefix.prefixes=/api
```
Priority 200 on the `/api` route ensures `/api/login` hits the backend **before** the SPA catch-all route (priority 100) would otherwise swallow it.

## 8.4 Step-by-Step — Deploy from Dockploy UI

### 8.4.1 Create the Stack
1. Open your Dockploy dashboard at `https://<your-dockploy-domain>`.
2. Left menu → **Stacks** → **New Stack**.
3. Choose **Git Repository** (best, for auto-updates).
4. Fill in:
   | Field | Value |
   |---|---|
   | **Name** | `hr-crm` |
   | **Git URL** | `https://github.com/HasiburQOR/HR_CRM.git` (or your fork) |
   | **Git Branch** | `main` |
   | **Compose File** | `docker-compose.yml` |
   | **Auto Deploy** | ✅ ON (webhook redeploy on every push) |

5. **Do NOT click Deploy yet** — set Env vars first, next step.

### 8.4.2 Environment Variables
Inside the Stack create-screen → **Environment** tab → paste these **4 required** keys (one per line, or add via the GUI):

| Key | Value | 🔒 Required? |
|---|---|---|
| `API_SECRET_KEY` | Generate a new random secret (see below). **Do NOT reuse other project secrets.** | ✅ YES |
| `TOKEN_EXPIRE_MINUTES` | `43200` (= 30 days). For strict compliance: `480` (8 hours). | ✅ YES |
| `POSTGRES_PASSWORD` | Another long random password. Keep it saved — this is your DB root password. | ✅ YES |
| `POSTGRES_USER` | `hrcrm` | (default, change if you want) |
| `POSTGRES_DB` | `hrcrm` | (default, change if you want) |

Generate the two secrets locally (PowerShell / Git Bash / any python):
```bash
# API_SECRET_KEY (use this in Dockploy env)
python -c "import secrets; print(secrets.token_urlsafe(64))"

# POSTGRES_PASSWORD (use this in Dockploy env)
python -c "import secrets; print(secrets.token_urlsafe(40))"
```

### 8.4.3 Deploy!
Click **Deploy / Create Stack**. Dockploy will:
1. Clone the repo.
2. Build `api` and `web` images locally (multi-stage for `web` → 25 MB nginx alpine).
3. Pull `postgres:16-alpine`.
4. Attach containers to the `dockploy` network.
5. Apply Traefik labels → request Let's Encrypt cert for `hrcrm.devhasib.lol`.

### 8.4.4 Wait for healthy
In Dockploy → Stacks → `hr-crm` → Services, watch the state transition:
```
db   → Starting → Healthy  (~20 s)
api  → Starting → Healthy  (~40 s, depends_on db healthy)
web  → Starting → Running  (~10 s, depends_on api healthy)
```
Once all 3 green → proceed.

If you see `Unhealthy` on `api`: open **Logs** for `api`. Common causes:
- `POSTGRES_PASSWORD` env missing → fix env → **Redeploy**.
- Typo in compose labels or `DATABASE_URL` → commit fix → push → Dockploy auto-redeploys.

### 8.4.5 Seed default users (ONE TIME only)
Dockploy → Stacks → `hr-crm` → `api` service → **Console / Exec** → run:
```bash
python seed.py
```
Expected output:
```
Admin:  admin / admin123
HR:     hr    / hr123
CEO:    ceo   / ceo123
Seeded default roles: Admin / HR / CEO / Employee
```
This creates users + roles in the Postgres DB. **Run once**, not on every deploy.

### 8.4.6 Open the app 🎉
👉 **`https://hrcrm.devhasib.lol`**

Login with:
```
Username: admin
Password: admin123
```

#### ⚡ Do this immediately after first login:
1. Admin menu → **Users** → click 🔑 Change Password on `admin`, `hr`, and `ceo`. Pick real passwords.
2. Admin menu → **Settings** → fill in your company name, logo, attendance rules, salary components, leave policies.
3. Employees → Add your first real employees (then link Users to them from the Users page).
4. Inventory → Add your first equipment items + assign them.
5. Backups → Click "Create Backup" now so you have a day-0 snapshot.

## 8.5 Custom Domain — Different Name?

If you want to use `crm.yourcompany.com` instead of `hrcrm.devhasib.lol`:

1. Update the two `Host(...)` labels inside [docker-compose.yml](docker-compose.yml) in both the `api` and `web` services. Search for both occurrences of `hrcrm.devhasib.lol` and replace.
2. Commit & push → Dockploy auto-redeploys.
3. Ensure the new DNS A-record exists and has propagated **before** the redeploy so Let's Encrypt succeeds.

## 8.6 Updates — how to push new code to production

Simple — push to GitHub:
```bash
git add .
git commit -m "feat: whatever"
git push origin main
```
Dockploy's webhook auto-redeploy (if you toggled it in §8.4.1) will:
- Fetch the new commit
- Rebuild changed images
- Rolling-replace containers (zero-downtime-ish, ~15s)

If you turned off auto-deploy → Dockploy → Stack → **Redeploy** button manually.

## 8.7 Data Safety / Backups on Dockploy

The compose file uses:
- A **named volume** `db-data` for Postgres (`/var/lib/postgresql/data`). This survives stack re-deletes in Dockploy (Dockploy does not prune named volumes unless you explicitly click "Delete volumes").
- **Bind mounts** `./backend/uploads` and `./backend/backups` relative to where Dockploy cloned the repo. Find them on the host at something like:
  ```
  /etc/dockploy/stacks/hr-crm/backend/uploads
  /etc/dockploy/stacks/hr-crm/backend/backups
  ```

**Backup plan (choose 1 or all 3):**
1. **In-app Backups** → Admin → Backups → click Create Backup weekly. Download the zip to your PC. This backs up Postgres via `pg_dump` + uploads folder + SQLite fallback.
2. **Dockploy / host cron** → schedule a daily `pg_dump`:
   ```bash
   docker exec hr-crm-db pg_dump -U hrcrm hrcrm > /root/hrcrm-db-$(date +%F).sql
   ```
3. **VPS snapshot** → take a weekly snapshot from Hetzner / DigitalOcean / Vultr panel. 30 seconds, zero config.

## 8.8 Rollback if Something Breaks

1. Dockploy → Stacks → `hr-crm` → **Git** tab → pick the last working commit hash → **Redeploy with this commit**.
2. Or locally, `git revert <bad-sha> && git push` → auto-redeploy.
3. For DB-level mess-ups: restore the latest `pg_dump` or in-app backup zip.

---

Enjoy your HR CRM 🚀.
