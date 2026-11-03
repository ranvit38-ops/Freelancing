-- Private files, whole-lab tasks, and a lab calendar. Idempotent.

-- A file only its uploader can see: the half-written draft, the CV, the
-- thing not ready to show. Everything else stays lab-wide by default, which is
-- the point of a shared workspace. Enforced in every query that reads files,
-- not just on the page that lists them.
ALTER TABLE files ADD COLUMN IF NOT EXISTS private boolean NOT NULL DEFAULT false;

-- "Everyone read the paper before Thursday" is a task for the whole lab, not
-- one person. A flag rather than an assignee list: it is the case labs
-- actually have, and it keeps a task a single row.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS for_everyone boolean NOT NULL DEFAULT false;

-- Things that happen on a day: group meeting, instrument booking, a
-- conference deadline. Task deadlines are shown on the calendar too, but they
-- live on the task; this is for everything that is not a piece of work.
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  on_date date NOT NULL,
  -- Null means all day. Stored as text "HH:MM" in the lab's own local time,
  -- because a lab meeting "at 2pm" means 2pm wherever the lab is, and every
  -- member sees it the way it was written.
  at_time text,
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_workspace_date_idx ON events (workspace_id, on_date);
