-- ============================================================================
--  Attach posts and comments to the account that wrote them.
--
--  authorId was not recorded when these rows were created, so the UI cannot
--  offer their author's profile — clicking the name does nothing. Links only
--  where exactly one account matches the stored display name, leaving demo
--  content by people who never had an account (Ioana R., Andrei D.) unlinked.
--
--  Safe to re-run.
--    psql -h localhost -U postgres -d conexus_db -f db/link-authors-to-accounts.sql
-- ============================================================================

BEGIN;

UPDATE posts p
   SET author_id = pi.user_id
  FROM profile_info pi
 WHERE p.author_id IS NULL
   AND pi.user_id IS NOT NULL
   AND lower(pi.display_name) = lower(p.author_name)
   AND (SELECT count(*) FROM profile_info x
         WHERE lower(x.display_name) = lower(p.author_name)) = 1;

UPDATE comments c
   SET author_id = pi.user_id
  FROM profile_info pi
 WHERE c.author_id IS NULL
   AND pi.user_id IS NOT NULL
   AND lower(pi.display_name) = lower(c.author_name)
   AND (SELECT count(*) FROM profile_info x
         WHERE lower(x.display_name) = lower(c.author_name)) = 1;

-- Clear author references pointing at accounts that do not exist — a leftover
-- from when a failed registration invented a client-side id. The content stays;
-- it just is not offered as a link to a profile that cannot load.
UPDATE posts    SET author_id = NULL
 WHERE author_id IS NOT NULL AND author_id NOT IN (SELECT id FROM users);

UPDATE comments SET author_id = NULL
 WHERE author_id IS NOT NULL AND author_id NOT IN (SELECT id FROM users);

-- Conversation headers were named from users.display_name while profiles show
-- profile_info.display_name, so a chat could disagree with the profile it links
-- to. Align existing threads with the name the rest of the app shows.
UPDATE chat_threads t
   SET name = pi.display_name
  FROM profile_info pi
 WHERE t.partner_user_id IS NOT NULL
   AND pi.user_id = t.partner_user_id
   AND pi.display_name IS NOT NULL
   AND pi.display_name <> ''
   AND t.name <> pi.display_name;

-- Comment bylines were captured from users.display_name while profiles show
-- profile_info.display_name, so a byline could disagree with the profile it
-- links to. Align existing comments with the name shown everywhere else.
UPDATE comments c
   SET author_name = pi.display_name
  FROM profile_info pi
 WHERE c.author_id IS NOT NULL
   AND pi.user_id = c.author_id
   AND pi.display_name IS NOT NULL
   AND pi.display_name <> ''
   AND c.author_name <> pi.display_name;

COMMIT;
