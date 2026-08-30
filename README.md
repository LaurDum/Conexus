# Conexus Creator Platform

A creator collaboration and networking platform — **vanilla JS frontend**,
**Spring Boot 2.7** REST API, **PostgreSQL** for persistence.

---

## Architecture

| Component | Technology | URL | Source |
|---|---|---|---|
| Frontend | HTML + CSS + vanilla JS (no build step) | http://localhost:5500 | `index.html`, `js/app.js`, `css/style.css` |
| Backend API | Spring Boot 2.7 (Java 11) | http://localhost:8080 | `backend/` |
| Database | PostgreSQL (`conexus_db`) | localhost:5432 | — |

The frontend has no framework and no build step: the files you edit are the
files the browser loads. Refresh to see changes.

---

## First-time setup

Database credentials are **not** in version control. Create your local copy:

```bash
cp backend/application-local.properties.example backend/application-local.properties
```

Then edit that file. For a local PostgreSQL you only need the password:

```properties
DB_PASSWORD=your-postgres-password
```

To use a **hosted** database instead (so nothing has to run on your machine),
set all three — no code change required:

```properties
DB_URL=jdbc:postgresql://YOUR-HOST/YOUR-DB?sslmode=require
DB_USER=your-db-user
DB_PASSWORD=your-db-password
```

Spring Boot imports this file at startup; the values fill the `${DB_URL}`,
`${DB_USER}` and `${DB_PASSWORD}` placeholders in `application.properties`,
which otherwise default to `localhost:5432`. Real environment variables of the
same names work too, which is what you would use when deploying.

---

## Running it

**One click:** double-click [`start-all.bat`](start-all.bat) — launches the
backend and frontend in separate windows.

Or start them manually in two terminals:

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

```powershell
npm start
```

`npm start` runs a small dependency-free static server
([`tools/dev-server.js`](tools/dev-server.js)) — there is nothing to `npm install`.
The VS Code "Go Live" extension works too; both serve the same files on port 5500.

---

## Trial accounts

Seeded automatically on first run:

| Username | Password | Type |
|---|---|---|
| `alex_creates` | `test123` | Creator |
| `brand_techgear` | `test123` | Business |

---

## Deploying

The app is three independently hosted pieces:

| Piece | Suggested host | What it needs |
|---|---|---|
| Frontend (static files) | Netlify, Cloudflare Pages, GitHub Pages | `js/config.js` pointing at the backend URL |
| Backend | Render, Railway, Fly.io | `backend/Dockerfile`, plus the env vars below |
| Database | Neon, Supabase | nothing — the backend creates its own schema |

**Frontend:** set the backend's public URL in [`js/config.js`](js/config.js).
Left empty it assumes port 8080 on the host serving the page, which is right for
local development and wrong for a real deployment.

```js
window.CONEXUS_API_BASE = "https://your-backend.onrender.com";
```

**Backend:** build from `backend/Dockerfile` and set these environment variables
on the host. Never commit them.

| Variable | Purpose |
|---|---|
| `DB_URL` | `jdbc:postgresql://HOST/DB?sslmode=require` |
| `DB_USER` | Database user |
| `DB_PASSWORD` | Database password |
| `CORS_ALLOWED_ORIGINS` | Your frontend's URL, e.g. `https://your-site.netlify.app` |

`PORT` is supplied by the platform automatically; the app reads it and falls
back to 8080 locally.

---

## Documentation

- **[SERVICES_GUIDE.md](SERVICES_GUIDE.md)** — startup, database management,
  troubleshooting, and the full API reference.
- **`backend/db/*.sql`** — one-off migration scripts, each documenting the
  problem it fixes.
