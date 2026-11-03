-- Direct messages, and files shared with chosen people.
--
-- A direct message is a discussion row with dm_key set: the participants'
-- user ids, sorted and joined with '.'. Two people always get the same key,
-- so their conversation is one thread however it was started, and a group of
-- three is its own thread. The lab channel is "attached to nothing and not a
-- DM", so every DM stays out of it.
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS dm_key text;
CREATE INDEX IF NOT EXISTS discussions_dm_idx
  ON discussions (workspace_id, dm_key, created_at) WHERE dm_key IS NOT NULL;

-- A private file can be opened by its uploader and by anyone listed here.
CREATE TABLE IF NOT EXISTS file_shares (
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (file_id, user_id)
);
CREATE INDEX IF NOT EXISTS file_shares_user_idx ON file_shares (user_id);

-- When each person last looked at each conversation, so an unread direct
-- message can say so instead of sitting unseen.
CREATE TABLE IF NOT EXISTS chat_reads (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel text NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, workspace_id, channel)
);
