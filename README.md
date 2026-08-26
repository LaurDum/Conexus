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

The database password is **not** in version control. Create your local copy:

```bash
cp backend/application-local.properties.example backend/application-local.properties
```

Then edit that file and set your own PostgreSQL password. Spring Boot imports it
automatically at startup.

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

## Documentation

- **[SERVICES_GUIDE.md](SERVICES_GUIDE.md)** — startup, database management,
  troubleshooting, and the full API reference.
- **`backend/db/*.sql`** — one-off migration scripts, each documenting the
  problem it fixes.
