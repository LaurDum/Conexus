# Putting Conexus online

Three free services, one for each part:

- **Database**: Neon
- **Backend**: Render
- **Website**: Netlify

## 1. Database

Make a project on [neon.tech](https://neon.tech) and copy the connection string. It looks like `postgresql://USER:PASSWORD@HOST/neondb?sslmode=require`. Split it into:

- `DB_URL`: `jdbc:postgresql://HOST/neondb?sslmode=require`
- `DB_USER`: the user
- `DB_PASSWORD`: the password

## 2. Backend

On [Render](https://render.com), make a Web Service from this repo:

- Root directory: `backend`
- Runtime: Docker
- Health check path: `/api/health`
- Environment variables: the three `DB_` values from above

The free plan sleeps after 15 minutes, so the first visit after a break takes about a minute.

## 3. Website

On [Netlify](https://netlify.com), make a site from this repo with no build command and `.` as the publish directory.

## 4. Connect them

- On Render, add `CORS_ALLOWED_ORIGINS` with your Netlify address, like `https://conexus.netlify.app` (no slash at the end).
- In `js/config.js`, set `window.CONEXUS_API_BASE` to your Render address and push.

## Check it works

Open `https://your-backend.onrender.com/api/health`. You should see `{"status":"up","database":"up"}`. Then open the site and log in as `alex_creates` / `test123`.
