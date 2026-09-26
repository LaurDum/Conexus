# Conexus

A place for creators to find each other. Connect with people in your niche, share posts and photos, apply to paid gigs, and keep an eye on how your channels are growing.

## What's in it

- **Home**: your reach, how the last week or month went, and one thing to do next. Switch to Feed to see what your friends posted.
- **Discover**: find creators, jobs and brand deals.
- **Messages**: chat with the people you connect with.
- **Profile**: your channels, stats and posts in one place.

## Run it

You need Java 11, Node and PostgreSQL.

1. Copy `backend/application-local.properties.example` to `backend/application-local.properties` and put your Postgres password in it.
2. Double-click `start-all.bat`, or run `cd backend && mvnw.cmd spring-boot:run` and `npm start` in two terminals.
3. Open http://localhost:5500 and log in as `alex_creates` / `test123`.

The first start fills the database with demo people, posts and jobs.

## Built with

Plain HTML, CSS and JavaScript, with Spring Boot and PostgreSQL behind it. No build step.
