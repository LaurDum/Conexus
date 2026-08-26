# Conexus Backend — Spring Boot + PostgreSQL

REST API backend for the Conexus Creator Platform.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Java JDK | **11+** | You have IBM Semeru 11 ✓ |
| PostgreSQL | **12+** | Install from [postgresql.org](https://www.postgresql.org/download/windows/) |

> **No Maven installation needed** — the `mvnw.cmd` wrapper downloads Maven automatically.

---

## 1 — PostgreSQL Setup

After installing PostgreSQL:

```sql
-- Open psql as the postgres user and run:
CREATE DATABASE conexus_db;
```

Or using the command line:
```powershell
psql -U postgres -c "CREATE DATABASE conexus_db;"
```

---

## 2 — Configure Database Password

Open [`src/main/resources/application.properties`](src/main/resources/application.properties) and update:

```properties
spring.datasource.password=YOUR_POSTGRES_PASSWORD
```

---

## 3 — Build & Run

Open a terminal in the `backend/` directory:

```powershell
# First run (downloads Maven ~15 MB):
.\mvnw.cmd spring-boot:run

# Subsequent runs:
.\mvnw.cmd spring-boot:run
```

The API will be available at **http://localhost:8080**

---

## 4 — API Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/creators` | All creators (filter: `?category=Tech&search=Elena`) |
| GET | `/api/creators/{id}` | Single creator |
| POST | `/api/creators` | Create creator |
| PUT | `/api/creators/{id}` | Update creator |
| DELETE | `/api/creators/{id}` | Delete creator |
| GET | `/api/posts` | All posts (newest first) |
| POST | `/api/posts` | Create post |
| PUT | `/api/posts/{id}/like` | Toggle like |
| DELETE | `/api/posts/{id}` | Delete post |
| GET | `/api/socials` | All social accounts |
| POST | `/api/socials` | Add social account |
| DELETE | `/api/socials/{id}` | Remove social account |
| GET | `/api/profile` | Get profile |
| PUT | `/api/profile` | Update profile |
| GET | `/api/chats` | All chat threads |
| GET | `/api/chats/{id}` | Single thread with messages |
| PUT | `/api/chats/{id}/read` | Mark thread read |
| POST | `/api/chats/{id}/messages` | Send a message |

---

## 5 — Running the Full Stack

```powershell
# Terminal 1 — Backend (from backend/)
.\mvnw.cmd spring-boot:run

# Terminal 2 — Frontend (from project root)
npm start
```

Then open **http://localhost:4200** in your browser.

---

## Database Schema

Tables are auto-created by Hibernate (`ddl-auto=update`) and seeded with sample data on first run.

| Table | Description |
|-------|-------------|
| `creators` | Creator profiles for the Discover tab |
| `posts` | Inspo feed posts |
| `social_accounts` | Linked social media accounts |
| `profile_info` | Logged-in user's profile (single row) |
| `chat_threads` | Messaging threads |
| `chat_messages` | Individual messages in threads |
