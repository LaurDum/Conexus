-- ============================================================================
--  Migrate one-sided chat threads to the two-sided (paired) scheme.
--
--  Threads used to be a single row owned by the sender, with the other party
--  stored only as a display name. Nothing linked that name to an account, so a
--  message never reached the recipient's inbox.
--
--  Now each participant owns their own copy of a conversation, identified as
--  chat_u{ownerId}_u{partnerId}, and messages are mirrored between the pair.
--
--  This script:
--    1. fills in partner_user_id where the thread name matches exactly one account
--    2. renames those threads to the canonical id, carrying their messages over
--
--  Safe to re-run. Run once:
--    psql -h localhost -U postgres -d conexus_db -f db/migrate-chat-threads-to-pairs.sql
-- ============================================================================

BEGIN;

-- 1. Who is on the other end?
UPDATE chat_threads t
   SET partner_user_id = u.id
  FROM users u
 WHERE t.partner_user_id IS NULL
   AND t.user_id IS NOT NULL
   AND u.id <> t.user_id
   AND lower(u.display_name) = lower(t.name)
   AND (SELECT count(*) FROM users u2 WHERE lower(u2.display_name) = lower(t.name)) = 1;

-- 2. Move each linked thread onto its canonical id.
--    Insert the renamed row, repoint its messages, drop the old row — this keeps
--    the chat_messages foreign key valid at every step.
CREATE TEMP TABLE thread_renames ON COMMIT DROP AS
SELECT id AS old_id,
       'chat_u' || user_id || '_u' || partner_user_id AS new_id
  FROM chat_threads
 WHERE partner_user_id IS NOT NULL
   AND id <> 'chat_u' || user_id || '_u' || partner_user_id;

-- Skip any rename whose target already exists, to avoid merging two histories.
DELETE FROM thread_renames r
 WHERE EXISTS (SELECT 1 FROM chat_threads t WHERE t.id = r.new_id);

INSERT INTO chat_threads (id, user_id, partner_user_id, partner_creator_id,
                          name, avatar, bg_class, status, snippet, time, unread)
SELECT r.new_id, t.user_id, t.partner_user_id, t.partner_creator_id,
       t.name, t.avatar, t.bg_class, t.status, t.snippet, t.time, t.unread
  FROM chat_threads t
  JOIN thread_renames r ON r.old_id = t.id;

UPDATE chat_messages m
   SET thread_id = r.new_id
  FROM thread_renames r
 WHERE m.thread_id = r.old_id;

DELETE FROM chat_threads t
 USING thread_renames r
 WHERE t.id = r.old_id;

COMMIT;
