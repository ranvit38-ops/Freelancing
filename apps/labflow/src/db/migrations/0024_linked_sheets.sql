-- A file copied from a Google Sheet remembers which Sheet, so it can be
-- refreshed from it: the run's data then follows the Sheet the lab keeps
-- editing, instead of freezing at the moment it was linked. Only the Drive
-- file id is kept; the access token that reads it never is.
ALTER TABLE files ADD COLUMN IF NOT EXISTS drive_file_id text;
ALTER TABLE files ADD COLUMN IF NOT EXISTS drive_synced_at timestamptz;
