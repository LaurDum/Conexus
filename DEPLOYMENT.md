# Deploying Conexus

The app is three pieces that are hosted separately:

| Piece | What it is | Suggested host |
|---|---|---|
| Frontend | `index.html`, `js/`, `css/` — no build step | Netlify / Cloudflare Pages / GitHub Pages |
| Backend | Spring Boot 2.7 on Java 11 | Render (Docker) |
| Database | PostgreSQL | Neon |

Everything below is already in the repo. What's left is creating the accounts and
pasting values in.

---

## 1. Database — Neon

1. Sign up at [neon.tech](https://neon.tech) and create a project.
2. Copy the connection string. It looks like:

   ```
   postgresql://neondb_owner:PASSWORD@ep-cool-name-12345.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```

3. It has to be reshaped for JDBC — the driver takes the user and password
   separately, and the prefix differs:

   | Env var | Value |
   |---|---|
   | `DB_URL` | `jdbc:postgresql://ep-cool-name-12345.eu-central-1.aws.neon.tech/neondb?sslmode=require` |
   | `DB_USER` | `neondb_owner` |
   | `DB_PASSWORD` | the password from the string |

   `sslmode=require` is not optional — Neon refuses plaintext connections.

**Why Neon:** free tier with no expiry that scales to zero. Supabase's free tier
pauses a project after about a week of inactivity and needs a manual click to
wake; Render's free Postgres is deleted after 30 days.

**Migrating existing data** (optional — `DataSeeder` will populate a fresh
database on its own, so this only matters if you want to keep what you have):

```bash
pg_dump -h localhost -U postgres -d conexus_db --no-owner --no-privileges -f conexus.sql
psql "postgresql://USER:PASSWORD@HOST/DB?sslmode=require" -f conexus.sql
```

---

## 2. Backend — Render

1. New → **Web Service**, connect the GitHub repo.
2. **Root Directory:** `backend`
3. **Runtime:** Docker (it will find `backend/Dockerfile`)
4. **Health Check Path:** `/api/health`
5. Environment variables:

   | Variable | Value |
   |---|---|
   | `DB_URL` | from step 1 |
   | `DB_USER` | from step 1 |
   | `DB_PASSWORD` | from step 1 |
   | `CORS_ALLOWED_ORIGINS` | your frontend URL, e.g. `https://conexus.netlify.app` |

   `PORT` is supplied by Render automatically. Do not set it.

`CORS_ALLOWED_ORIGINS` has to be exact — scheme included, no trailing slash.
Without it the page loads but every API call is blocked by the browser.

**Free tier caveat:** the service sleeps after 15 minutes idle and takes roughly
50 seconds to wake. Fine for a portfolio link, painful for a live demo. The
paid tier removes it.

---

## 3. Frontend — Netlify

1. New site from Git, same repo.
2. **Build command:** leave empty. **Publish directory:** `.` (the repo root).
   There is no build step; the files you edit are the files served.
3. Set the backend URL in [`js/config.js`](js/config.js) and push:

   ```js
   window.CONEXUS_API_BASE = "https://your-backend.onrender.com";
   ```

   It must be `https`. A browser on an HTTPS page blocks calls to an HTTP API.

Left empty, the app assumes the API is on port 8080 of whatever host served the
page — right for local development, wrong once the two are on separate domains.

---

## Order

The URLs depend on each other, so:

1. Create the Neon database.
2. Deploy the backend with the database variables. `CORS_ALLOWED_ORIGINS` can
   wait — you do not know the frontend URL yet.
3. Deploy the frontend, which gives you its URL.
4. Set `CORS_ALLOWED_ORIGINS` on Render to that URL.
5. Set `CONEXUS_API_BASE` in `js/config.js` to the Render URL and push.

---

## Checking it worked

```bash
curl https://your-backend.onrender.com/api/health
```

`{"status":"up","database":"up"}` means the app started **and** reached the
database. A `503` with `"database":"unreachable"` means the app is running but
the `DB_*` variables are wrong — a much clearer signal than a blank page.

Then open the frontend and sign in as `alex_creates` / `test123`.

---

## Known gaps

- **The Dockerfile has not been built locally** — Docker is not installed on the
  dev machine. The jar it packages builds and runs correctly, and the image is a
  standard two-stage JDK 11 build, but Render will be the first real test of it.
  A failure there shows up as a build-log error.
- **Passwords are hashed but there is no rate limiting** on the login endpoint.
- **Tokens live in `localStorage`**, so a cross-site scripting hole would expose
  them. Rendered output is escaped, which is the defence that matters.
- **`ddl-auto=update`** creates and alters tables automatically. It cannot add a
  `NOT NULL` column to a table that already has rows — it logs a warning and
  carries on, leaving the column missing. Schema changes of that kind need a
  script in `backend/db/`.
