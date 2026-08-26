-- ============================================================================
--  One-off repair: attach pre-multi-user rows to their owner.
--
--  Early versions of the app saved the profile, social links and chat threads
--  without a user_id. Once the API started filtering by ?userId=... those rows
--  became invisible — they were in the database, but no account could read them
--  back, which looked exactly like "the data did not save".
--
--  Run once:
--    psql -h localhost -U postgres -d conexus_db -f db/repair-orphaned-rows.sql
-- ============================================================================

BEGIN;

-- User 1 (laurswar / "Laur") is the only account with no profile row, and every
-- orphaned row carries their handle.
UPDATE profile_info    SET user_id = 1 WHERE user_id IS NULL;
UPDATE social_accounts SET user_id = 1 WHERE user_id IS NULL;
UPDATE chat_threads    SET user_id = 1 WHERE user_id IS NULL;

-- This account predates the onboarding flow and already has a full profile,
-- so stop sending it back through onboarding on every sign-in.
UPDATE users SET onboarding_complete = TRUE, account_type = COALESCE(account_type, 'creator')
WHERE id = 1 AND onboarding_complete = FALSE;

-- Existing one-sided threads: record who is on the other end where the thread
-- name matches exactly one account, so replies can be mirrored to them.
UPDATE chat_threads t
   SET partner_user_id = u.id
  FROM users u
 WHERE t.partner_user_id IS NULL
   AND t.user_id IS NOT NULL
   AND u.id <> t.user_id
   AND lower(u.display_name) = lower(t.name)
   AND (SELECT count(*) FROM users u2 WHERE lower(u2.display_name) = lower(t.name)) = 1;

COMMIT;
