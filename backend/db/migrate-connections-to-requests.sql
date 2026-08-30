-- ============================================================================
--  Connections become requests that can be accepted.
--
--  A connection used to be a single row with no state and no target account,
--  so pressing Connect wrote a row, changed a label, and reached nobody.
--
--  Run once, AFTER starting the backend so the new columns exist:
--    psql -h localhost -U postgres -d conexus_db -f db/migrate-connections-to-requests.sql
-- ============================================================================

BEGIN;

-- ddl-auto=update cannot add a NOT NULL column to a table that already has
-- rows: it logs a warning and carries on, leaving the column missing. Add it
-- here with a default so existing rows are valid.
ALTER TABLE connections ADD COLUMN IF NOT EXISTS status VARCHAR(255);
UPDATE connections SET status = 'ACCEPTED' WHERE status IS NULL;
ALTER TABLE connections ALTER COLUMN status SET DEFAULT 'PENDING';
ALTER TABLE connections ALTER COLUMN status SET NOT NULL;

-- Point each connection at the account behind the creator card, where there is one.
UPDATE connections c
   SET target_user_id = cr.user_id
  FROM creators cr
 WHERE c.target_user_id IS NULL
   AND cr.id = c.target_creator_id
   AND cr.user_id IS NOT NULL;

COMMIT;
