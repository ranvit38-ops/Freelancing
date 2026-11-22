-- Notifications: things that need one person's attention (a task given to
-- them, a direct message, an @mention, a reply, a comment on their work).
-- Read in the app; unread ones go out as one batched email at a pace each
-- person chooses, never one email per event.
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  href text NOT NULL,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_pending_idx ON notifications (user_id) WHERE read_at IS NULL AND emailed_at IS NULL;

-- Per person, across their labs: how often email may come, which kinds, and
-- when the last one went (the batch window counts from it).
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_email text NOT NULL DEFAULT 'hourly';
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_kinds text NOT NULL DEFAULT 'task,message,mention,reply,comment';
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_emailed_at timestamptz;
