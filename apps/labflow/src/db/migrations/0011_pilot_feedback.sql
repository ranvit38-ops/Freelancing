-- What a pilot lab says about paying for this.
--
-- One row per person rather than per workspace, because the PI and the
-- postdoc who actually used it rarely give the same answer, and the gap
-- between them is the interesting part. Idempotent: safe to re-run.
CREATE TABLE IF NOT EXISTS pilot_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- yes, maybe or no. Text rather than an enum so a later question can add an
  -- option without a migration that locks the table.
  would_pay text NOT NULL,
  -- What they said the lab would pay per month, in whole dollars. Null means
  -- they left it blank, which is not the same as zero.
  monthly_value integer,
  blocker text,
  decision_maker text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One answer per person. Changing your mind updates the row you already left,
-- so the dashboard shows what each person currently thinks rather than a pile
-- of drafts.
CREATE UNIQUE INDEX IF NOT EXISTS pilot_feedback_user_key
  ON pilot_feedback (workspace_id, user_id);
CREATE INDEX IF NOT EXISTS pilot_feedback_created_idx
  ON pilot_feedback (created_at DESC);
