-- ============================================================================
--  Move likes from a single global flag to one row per (post, account).
--
--  posts.liked was one boolean shared by everyone: if any user liked a post,
--  every other account — including brand new ones — saw it as already liked.
--  Likes now live in post_likes, created by Hibernate on startup, and
--  posts.liked is computed per request.
--
--  The old column stays in place (unused) so nothing is lost, but it needs a
--  default now that inserts no longer mention it.
--
--  Run once, AFTER starting the backend so post_likes exists:
--    psql -h localhost -U postgres -d conexus_db -f db/migrate-likes-to-per-user.sql
-- ============================================================================

BEGIN;

ALTER TABLE posts ALTER COLUMN liked SET DEFAULT FALSE;

-- The old flag recorded that *somebody* liked the post, but not who, so there
-- is no honest way to attribute those likes to an account. Clear it rather than
-- leaving a value that no longer means anything.
UPDATE posts SET liked = FALSE WHERE liked = TRUE;

-- posts.likes_count keeps its seeded demo values (14 / 32 / 48) until the first
-- real like on that post, at which point it is recomputed from post_likes.
-- To start every post from a truthful zero instead, uncomment:
-- UPDATE posts SET likes_count = 0;

COMMIT;
