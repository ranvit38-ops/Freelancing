-- Who is doing what, and how it is going.
--
-- The gap this fills is the one that makes joining a lab slow: the work is
-- agreed in a meeting, lives in one person's head, and the new student finds
-- out three weeks later that somebody else already ran it. A task names the
-- thing, names the person, and keeps the back-and-forth attached to it.
--
-- Deliberately thin. No priorities, no dependencies, no sprints. A lab of six
-- does not need a project management tool, it needs to know who is doing the
-- extraction this week.
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- Most work belongs to a project. Some genuinely does not ("order more
  -- pipette tips"), so this stays optional rather than forcing a fake project.
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  detail text,
  -- Null means nobody has picked it up. An unassigned task is a real and
  -- useful state: it is the list a new student is pointed at on day one.
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  -- open, doing or done. Text rather than an enum so a fourth state costs no
  -- table lock, same reasoning as pilot_feedback.would_pay.
  status text NOT NULL DEFAULT 'open',
  due_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- "What am I meant to be doing" is the query this table exists to answer, and
-- it is asked on every dashboard load.
CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON tasks (workspace_id, assigned_to, status);
CREATE INDEX IF NOT EXISTS tasks_project_idx ON tasks (project_id, status);

-- Progress and feedback reuse the discussion thread rather than growing a
-- second comment table beside it: same rendering, same attachments, same
-- one-level-deep replies. A task thread is where the assignee says what they
-- got and everyone else answers.
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES tasks(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS discussions_task_idx ON discussions (task_id, created_at);
