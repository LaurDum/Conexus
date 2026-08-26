# 🚀 Conexus Platform — Services & Developer Guide

This document contains step-by-step instructions on how to start, manage, and troubleshoot all services for the **Conexus Creator Platform** (Angular Frontend + Spring Boot Backend + PostgreSQL Database).

---

## 📑 Table of Contents
1. [System Architecture & Port Map](#1-system-architecture--port-map)
2. [Prerequisites](#2-prerequisites)
3. [Quick Start (One-Click / 2-Minute Setup)](#3-quick-start)
4. [Step-by-Step Manual Startup](#4-step-by-step-manual-startup)
   - [Step 1: PostgreSQL Database](#step-1-postgresql-database)
   - [Step 2: Spring Boot Backend](#step-2-spring-boot-backend)
   - [Step 3: Angular Frontend](#step-3-angular-frontend)
5. [Useful Daily Commands & Scripts](#5-useful-daily-commands--scripts)
6. [Database Management & Resetting Data](#6-database-management--resetting-data)
7. [Troubleshooting & Common Fixes](#7-troubleshooting--common-fixes)
   - [Port Already in Use (8080, 4200, 5432)](#issue-port-already-in-use-8080-or-4200)
   - [PostgreSQL Connection Refused / Auth Failed](#issue-postgresql-connection-error)
   - [Node / Angular compilation issues](#issue-node-or-angular-issues)
8. [API Endpoints Reference](#8-api-endpoints-reference)

---

## 1. System Architecture & Port Map

| Component | Technology | Default URL / Port | Config File |
|---|---|---|---|
| **Frontend** | Angular 17 + TypeScript | [http://localhost:4200](http://localhost:4200) | `angular.json`, `package.json` |
| **Backend API** | Spring Boot 3 + Java 11+ | [http://localhost:8080](http://localhost:8080) | `backend/src/main/resources/application.properties` |
| **Database** | PostgreSQL 12+ | `localhost:5432` (`conexus_db`) | `backend/src/main/resources/application.properties` |

---

## 2. Prerequisites

Ensure you have the following installed on your machine:
- **Node.js**: `v18.x` or `v20.x` (check with `node -v`)
- **Java JDK**: `11` or higher (check with `java -version`)
- **PostgreSQL**: `12+` installed and running on Windows
- *(Maven is NOT required separately — the project includes the `mvnw.cmd` wrapper).*

---

## 3. Quick Start

If PostgreSQL is already running and the database is configured, you can launch both services using **two terminals**:

### Terminal 1 — Backend:
```powershell
cd "c:\Users\Laur\Desktop\Website project\backend"
.\mvnw.cmd spring-boot:run
```

### Terminal 2 — Frontend:
```powershell
cd "c:\Users\Laur\Desktop\Website project"
npm start
```

👉 Then open **[http://localhost:4200](http://localhost:4200)** in your browser.

---

## 4. Step-by-Step Manual Startup

### Step 1: PostgreSQL Database

1. **Verify PostgreSQL Service is running**:
   - Press `Win + R`, type `services.msc`, press Enter.
   - Look for **postgresql-x64-XX** (where XX is your version). Ensure Status is **Running**.
   - *Or in an Admin PowerShell*:
     ```powershell
     Get-Service -Name postgresql* | Start-Service
     ```

2. **Create the Database** (if first time):
   - Open PowerShell or CMD:
     ```powershell
     psql -U postgres -c "CREATE DATABASE conexus_db;"
     ```
   - Enter your PostgreSQL password when prompted.

3. **Verify credentials in backend configuration**:
   - Check `backend/src/main/resources/application.properties`:
     ```properties
     spring.datasource.url=jdbc:postgresql://localhost:5432/conexus_db
     spring.datasource.username=postgres
     spring.datasource.password=YOUR_POSTGRES_PASSWORD
     ```

---

### Step 2: Spring Boot Backend

1. Open PowerShell and navigate to the backend folder:
   ```powershell
   cd "c:\Users\Laur\Desktop\Website project\backend"
   ```

2. Start the Spring Boot application:
   ```powershell
   .\mvnw.cmd spring-boot:run
   ```

3. **How to know it is working**:
   - You will see logs in the console.
   - Look for the final log line:
     ```text
     Started ConexusApplication in X.XXX seconds (process running for ...)
     ```
4. **Quick Health Check**:
   - Open [http://localhost:8080/api/creators](http://localhost:8080/api/creators) in your browser.
   - You should see a JSON array of creators.

---

### Step 3: Angular Frontend

1. Open a new PowerShell terminal and navigate to the project root:
   ```powershell
   cd "c:\Users\Laur\Desktop\Website project"
   ```

2. Install dependencies (only needed on initial setup or after pulling new packages):
   ```powershell
   npm install
   ```

3. Launch development server:
   ```powershell
   npm start
   ```
   *(or `npx ng serve`)*

4. **Access the application**:
   - Open **[http://localhost:4200](http://localhost:4200)**
   - The UI should load with the Discover, Inspo Feed, Messages, and Profile features fully functional and connected to the backend.

---

## 5. Useful Daily Commands & Scripts

### Start Backend in Debug Mode (or Skip Tests)
```powershell
cd backend
.\mvnw.cmd clean spring-boot:run
```

### Build Frontend for Production
```powershell
npm run build
```
*(Build artifacts will be generated in `./dist/conexus`)*

### Package Backend into a Standalone JAR
```powershell
cd backend
.\mvnw.cmd clean package -DskipTests
```
*(JAR file created in `backend/target/backend-0.0.1-SNAPSHOT.jar`)*

### Run Backend from Pre-built JAR
```powershell
java -jar backend/target/backend-0.0.1-SNAPSHOT.jar
```

---

## 6. Database Management & Resetting Data

### Connect to the Database via Command Line
```powershell
psql -U postgres -d conexus_db
```

Useful `psql` commands:
- `\dt` — List all tables
- `SELECT * FROM creators;` — View all creators
- `SELECT * FROM posts;` — View all posts
- `SELECT * FROM chat_threads;` — View all chat threads
- `\q` — Exit `psql`

### Re-seed / Reset the Database
If you want to clear and re-populate the initial mock data:
1. Stop the backend (`Ctrl + C` in backend terminal).
2. Drop and recreate the database:
   ```powershell
   psql -U postgres -c "DROP DATABASE conexus_db;"
   psql -U postgres -c "CREATE DATABASE conexus_db;"
   ```
3. Restart the backend:
   ```powershell
   cd backend
   .\mvnw.cmd spring-boot:run
   ```
   *(Hibernate will automatically re-create tables and apply initial seed data).*

---

## 7. Troubleshooting & Common Fixes

### Issue: Port Already in Use (8080 or 4200)
If you get `Web server failed to start. Port 8080 was already in use` or `Port 4200 is already in use`:

1. Find the Process ID (PID) occupying the port:
   ```powershell
   # For port 8080:
   netstat -ano | findstr :8080
   
   # For port 4200:
   netstat -ano | findstr :4200
   ```
2. Terminate the process (replace `12345` with the PID from the last column):
   ```powershell
   taskkill /PID 12345 /F
   ```
3. Or kill all java / node processes:
   ```powershell
   Stop-Process -Name "java" -Force -ErrorAction SilentlyContinue
   Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
   ```

---

### Issue: PostgreSQL Connection Error
- **Error**: `Connection to localhost:5432 refused`
  - **Fix**: PostgreSQL service is not started. Start it via `services.msc` or `Start-Service postgresql*`.
- **Error**: `password authentication failed for user "postgres"`
  - **Fix**: Check `spring.datasource.password` in `backend/src/main/resources/application.properties`. Ensure it matches your PostgreSQL superuser password.
- **Error**: `database "conexus_db" does not exist`
  - **Fix**: Run `psql -U postgres -c "CREATE DATABASE conexus_db;"`

---

### Issue: Node or Angular Issues
- If Angular fails with caching or module errors:
  ```powershell
  Remove-Item -Recurse -Force .angular, node_modules
  npm install
  npm start
  ```

---

## 8. API Endpoints Reference

The backend exposes the following REST endpoints on `http://localhost:8080`:

### Creators (`/api/creators`)
- `GET /api/creators` — List all creators (supports query params: `?category=Tech&search=Elena`)
- `GET /api/creators/{id}` — Get single creator details
- `POST /api/creators` — Create a new creator
- `PUT /api/creators/{id}` — Update creator
- `DELETE /api/creators/{id}` — Delete creator

### Inspo Posts (`/api/posts`)
- `GET /api/posts?userId={userId}` — Get all posts (newest first). Each post's `liked` is resolved for that viewer; omit `userId` and nothing comes back liked
- `POST /api/posts` — Create a new post (`{ authorId, authorName, niche, content, avatarClass }`)
- `PUT /api/posts/{id}/like?userId={userId}` — Toggle **this account's** like (**`userId` is required**)
- `DELETE /api/posts/{id}` — Delete post

> **Likes are per account.** They live in `post_likes`, one row per
> (post, user), with a unique constraint so a double-like is impossible.
> `likesCount` is recomputed from those rows on every toggle and `liked` is
> computed per request — it is not stored on the post. The old global
> `posts.liked` boolean is why a brand new account used to see posts as already
> liked.

### Social Accounts (`/api/socials`)
- `GET /api/socials?userId={userId}` — List a user's connected social accounts (omit `userId` for all)
- `POST /api/socials?userId={userId}` — Connect a new social account (**`userId` is required**)
- `DELETE /api/socials/{id}` — Remove a social account

### Profile (`/api/profile`)
- `GET /api/profile?userId={userId}` — Get a user's profile info
- `PUT /api/profile?userId={userId}` — Update a user's profile (**`userId` is required**)

### Messaging & Chats (`/api/chats`)
- `GET /api/chats?userId={userId}` — List a user's chat threads (omit `userId` for all)
- `GET /api/chats/{id}` — Get specific thread and full message history
- `POST /api/chats/with-creator?userId={userId}&creatorId={creatorId}` — Open (or reuse) a conversation with a creator card; the server derives the thread id so both participants agree on it
- `POST /api/chats` — Create a thread directly (`{ id, userId, name, avatar, bgClass, status }`); returns the existing thread if the id is already taken
- `PUT /api/chats/{id}/read` — Mark thread as read
- `POST /api/chats/{id}/messages` — Send a message in thread (`{ text, sender, senderName, senderId }`, `sender` is `"me"` or `"them"`)

### Comments (`/api/comments`)
- `GET /api/comments?postId={postId}` — List a post's comments, oldest first
- `POST /api/comments` — Add a comment (`{ postId, authorId, authorName, avatar, bgClass, text }`); also keeps the post's `commentsCount` in sync

### Connections (`/api/connections`)
- `GET /api/connections?requesterId={userId}` — Creator IDs this user has connected with (used to restore "Requested" buttons after a reload)
- `POST /api/connections/toggle` — Connect / disconnect (`{ requesterId, targetCreatorId }`)

> **How conversations are stored:** each participant owns their own thread row,
> `chat_u{ownerId}_u{partnerId}`, so unread state is per-user. Sending a message
> mirrors it into the recipient's row (as `sender: "them"`) and flags it unread.
> A thread whose `partnerUserId` is null has no account on the other end — a
> demo creator card — and nothing is delivered.

> **Note on `userId`:** endpoints that store per-user data reject requests without a
> `userId` with `400`. Writing a row with no owner would make it unreadable by
> `GET ...?userId=...` afterwards — data that is saved but can never be loaded back.

---

## 💡 Pro Tips
- **Live Reloading**: The Angular frontend updates automatically when you modify frontend files.
- **CORS Config**: The backend allows any `localhost`, `127.0.0.1`, `192.168.x.x` and `10.x.x.x` origin on any port, so both the Live Server frontend (`:5500`) and Angular (`:4200`) work without cross-origin blocks.
- **Postman / REST Testing**: You can test any backend endpoint directly using browser, curl, or Postman against `http://localhost:8080/api/...`.
