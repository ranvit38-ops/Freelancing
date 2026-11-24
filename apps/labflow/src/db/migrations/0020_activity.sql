-- The lab's record of who put in or changed what, and when.
--
-- Written at the moment of each change, in the same code path as the change,
-- so it reads as a ledger rather than a reconstruction. Rows are never edited
-- by people; label and detail keep what a thing was called at the time, so an
-- entry still reads correctly after the record is renamed or deleted.
CREATE TABLE IF NOT EXISTS activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid,
  label text NOT NULL,
  detail text,
  href text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_workspace_created_idx ON activity (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_actor_idx ON activity (workspace_id, actor_id, created_at DESC);
